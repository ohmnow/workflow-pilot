/**
 * CI Gate Checker
 *
 * Checks if a PR passes all required CI checks and is ready for merge.
 * Supports both polling and event-driven usage patterns.
 */

import { spawn } from 'child_process';
import { AutopilotConfig, DEFAULT_AUTOPILOT_CONFIG } from '../orchestrator/autopilot-config.js';

/**
 * Status of an individual CI check
 */
export interface CICheck {
  name: string;
  status: 'queued' | 'in_progress' | 'completed';
  conclusion: 'success' | 'failure' | 'neutral' | 'cancelled' | 'skipped' | 'timed_out' | 'action_required' | 'pending' | null;
  url?: string;
}

/**
 * Overall PR status
 */
export type PRStatusResult = 'pass' | 'fail' | 'pending';

/**
 * Detailed PR status information
 */
export interface PRStatus {
  /** PR number */
  prNumber: number;
  /** Overall result */
  result: PRStatusResult;
  /** Individual check statuses */
  checks: CICheck[];
  /** Checks that are required (from config or branch protection) */
  requiredChecks: string[];
  /** Checks that passed */
  passedChecks: string[];
  /** Checks that failed */
  failedChecks: string[];
  /** Checks still pending */
  pendingChecks: string[];
  /** Whether PR is mergeable according to GitHub */
  mergeable: boolean | null;
  /** PR state (open, closed, merged) */
  state: string;
  /** Whether PR is a draft */
  draft: boolean;
  /** Review status */
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
  /** Human-readable summary */
  summary: string;
}

/**
 * Options for checking PR status
 */
export interface CheckPRStatusOptions {
  /** Autopilot config with required checks */
  config?: AutopilotConfig;
  /** Whether to include non-required checks in evaluation */
  includeNonRequired?: boolean;
}

/**
 * Check the CI status of a pull request
 */
export async function checkPRStatus(
  prNumber: number,
  options: CheckPRStatusOptions = {}
): Promise<PRStatus> {
  const config = options.config || DEFAULT_AUTOPILOT_CONFIG;
  const includeNonRequired = options.includeNonRequired ?? false;

  // Get PR details
  const prDetails = await getPRDetails(prNumber);

  // Get CI checks
  const checks = await getPRChecks(prNumber);

  // Determine required checks
  const requiredChecks = config.requiredChecks || [];

  // Categorize checks
  const passedChecks: string[] = [];
  const failedChecks: string[] = [];
  const pendingChecks: string[] = [];

  for (const check of checks) {
    if (check.status === 'completed') {
      if (check.conclusion === 'success' || check.conclusion === 'neutral' || check.conclusion === 'skipped') {
        passedChecks.push(check.name);
      } else {
        failedChecks.push(check.name);
      }
    } else {
      pendingChecks.push(check.name);
    }
  }

  // Determine overall result
  let result: PRStatusResult;

  if (prDetails.draft) {
    // Draft PRs are always pending
    result = 'pending';
  } else if (requiredChecks.length > 0) {
    // Check if all required checks pass
    const requiredPassed = requiredChecks.every(name =>
      passedChecks.some(passed => matchesCheckName(passed, name))
    );
    const requiredFailed = requiredChecks.some(name =>
      failedChecks.some(failed => matchesCheckName(failed, name))
    );
    const requiredPending = requiredChecks.some(name =>
      pendingChecks.some(pending => matchesCheckName(pending, name)) ||
      !checks.some(check => matchesCheckName(check.name, name))
    );

    if (requiredFailed) {
      result = 'fail';
    } else if (requiredPending) {
      result = 'pending';
    } else if (requiredPassed) {
      result = includeNonRequired && failedChecks.length > 0 ? 'fail' : 'pass';
    } else {
      result = 'pending';
    }
  } else {
    // No required checks specified - use all checks
    if (failedChecks.length > 0) {
      result = 'fail';
    } else if (pendingChecks.length > 0) {
      result = 'pending';
    } else if (passedChecks.length > 0) {
      result = 'pass';
    } else {
      // No checks at all - consider passing
      result = 'pass';
    }
  }

  // Generate summary
  const summary = generateStatusSummary(result, {
    passed: passedChecks.length,
    failed: failedChecks.length,
    pending: pendingChecks.length,
    draft: prDetails.draft,
    reviewDecision: prDetails.reviewDecision,
  });

  return {
    prNumber,
    result,
    checks,
    requiredChecks,
    passedChecks,
    failedChecks,
    pendingChecks,
    mergeable: prDetails.mergeable,
    state: prDetails.state,
    draft: prDetails.draft,
    reviewDecision: prDetails.reviewDecision,
    summary,
  };
}

/**
 * Wait for PR checks to complete (polling)
 */
export async function waitForPRChecks(
  prNumber: number,
  options: {
    config?: AutopilotConfig;
    pollInterval?: number; // milliseconds
    timeout?: number; // milliseconds
    onStatusUpdate?: (status: PRStatus) => void;
  } = {}
): Promise<PRStatus> {
  const pollInterval = options.pollInterval || 30000; // 30 seconds
  const timeout = options.timeout || 30 * 60 * 1000; // 30 minutes
  const startTime = Date.now();

  while (true) {
    const status = await checkPRStatus(prNumber, { config: options.config });

    options.onStatusUpdate?.(status);

    if (status.result !== 'pending') {
      return status;
    }

    if (Date.now() - startTime > timeout) {
      return {
        ...status,
        result: 'pending',
        summary: `Timed out waiting for CI checks after ${Math.round(timeout / 60000)} minutes`,
      };
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
}

/**
 * Check if PR is ready to merge (passes CI and reviews)
 */
export async function isPRReadyToMerge(
  prNumber: number,
  options: CheckPRStatusOptions = {}
): Promise<{ ready: boolean; reason: string }> {
  const status = await checkPRStatus(prNumber, options);

  if (status.state !== 'open') {
    return { ready: false, reason: `PR is ${status.state}` };
  }

  if (status.draft) {
    return { ready: false, reason: 'PR is still a draft' };
  }

  if (status.result === 'fail') {
    return { ready: false, reason: `CI checks failed: ${status.failedChecks.join(', ')}` };
  }

  if (status.result === 'pending') {
    return { ready: false, reason: `CI checks pending: ${status.pendingChecks.join(', ')}` };
  }

  if (status.reviewDecision === 'CHANGES_REQUESTED') {
    return { ready: false, reason: 'Changes have been requested in review' };
  }

  if (status.mergeable === false) {
    return { ready: false, reason: 'PR has merge conflicts' };
  }

  return { ready: true, reason: 'All checks pass and PR is mergeable' };
}

/**
 * Get summary of multiple PRs' CI status
 */
export async function checkMultiplePRStatus(
  prNumbers: number[],
  options: CheckPRStatusOptions = {}
): Promise<Map<number, PRStatus>> {
  const results = new Map<number, PRStatus>();

  // Check in parallel with concurrency limit
  const concurrency = 3;
  for (let i = 0; i < prNumbers.length; i += concurrency) {
    const batch = prNumbers.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(pr => checkPRStatus(pr, options))
    );

    for (let j = 0; j < batch.length; j++) {
      results.set(batch[j], batchResults[j]);
    }
  }

  return results;
}

// ============ Internal Functions ============

interface PRDetails {
  state: string;
  draft: boolean;
  mergeable: boolean | null;
  reviewDecision: 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED' | null;
}

/**
 * Get PR details using gh CLI
 */
async function getPRDetails(prNumber: number): Promise<PRDetails> {
  return new Promise((resolve) => {
    const args = [
      'pr', 'view', String(prNumber),
      '--json', 'state,isDraft,mergeable,reviewDecision',
    ];

    const child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const data = JSON.parse(stdout.trim());
          resolve({
            state: data.state?.toLowerCase() || 'unknown',
            draft: data.isDraft || false,
            mergeable: data.mergeable === 'MERGEABLE' ? true :
                       data.mergeable === 'CONFLICTING' ? false : null,
            reviewDecision: data.reviewDecision || null,
          });
        } catch {
          resolve({
            state: 'unknown',
            draft: false,
            mergeable: null,
            reviewDecision: null,
          });
        }
      } else {
        resolve({
          state: 'unknown',
          draft: false,
          mergeable: null,
          reviewDecision: null,
        });
      }
    });

    child.on('error', () => {
      resolve({
        state: 'unknown',
        draft: false,
        mergeable: null,
        reviewDecision: null,
      });
    });
  });
}

/**
 * Get CI checks for a PR using gh CLI
 */
async function getPRChecks(prNumber: number): Promise<CICheck[]> {
  return new Promise((resolve) => {
    const args = [
      'pr', 'checks', String(prNumber),
      '--json', 'name,state,conclusion,detailsUrl',
    ];

    const child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const data = JSON.parse(stdout.trim());
          const checks: CICheck[] = Array.isArray(data) ? data.map((check: any) => ({
            name: check.name || 'unknown',
            status: mapCheckState(check.state),
            conclusion: mapCheckConclusion(check.conclusion),
            url: check.detailsUrl,
          })) : [];
          resolve(checks);
        } catch {
          resolve([]);
        }
      } else {
        resolve([]);
      }
    });

    child.on('error', () => {
      resolve([]);
    });
  });
}

/**
 * Map gh check state to our status
 */
function mapCheckState(state: string): CICheck['status'] {
  switch (state?.toUpperCase()) {
    case 'PENDING':
    case 'QUEUED':
      return 'queued';
    case 'IN_PROGRESS':
      return 'in_progress';
    case 'COMPLETED':
    case 'SUCCESS':
    case 'FAILURE':
    case 'NEUTRAL':
    case 'CANCELLED':
    case 'SKIPPED':
    case 'TIMED_OUT':
    case 'ACTION_REQUIRED':
      return 'completed';
    default:
      return 'queued';
  }
}

/**
 * Map gh check conclusion to our conclusion
 */
function mapCheckConclusion(conclusion: string | null): CICheck['conclusion'] {
  if (!conclusion) return 'pending';

  switch (conclusion.toUpperCase()) {
    case 'SUCCESS':
      return 'success';
    case 'FAILURE':
      return 'failure';
    case 'NEUTRAL':
      return 'neutral';
    case 'CANCELLED':
      return 'cancelled';
    case 'SKIPPED':
      return 'skipped';
    case 'TIMED_OUT':
      return 'timed_out';
    case 'ACTION_REQUIRED':
      return 'action_required';
    default:
      return 'pending';
  }
}

/**
 * Check if a check name matches a required check pattern
 * Supports partial matching for flexibility
 */
function matchesCheckName(checkName: string, pattern: string): boolean {
  const normalizedCheck = checkName.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Exact match
  if (normalizedCheck === normalizedPattern) {
    return true;
  }

  // Pattern is contained in check name
  if (normalizedCheck.includes(normalizedPattern)) {
    return true;
  }

  // Common variations
  // e.g., "test" matches "Test", "tests", "npm test", "Run tests", etc.
  const variations = [
    normalizedPattern,
    `${normalizedPattern}s`,
    `run ${normalizedPattern}`,
    `npm ${normalizedPattern}`,
    `${normalizedPattern} /`,
  ];

  return variations.some(v => normalizedCheck.includes(v));
}

/**
 * Generate human-readable status summary
 */
function generateStatusSummary(
  result: PRStatusResult,
  counts: {
    passed: number;
    failed: number;
    pending: number;
    draft: boolean;
    reviewDecision: string | null;
  }
): string {
  const parts: string[] = [];

  if (counts.draft) {
    parts.push('Draft PR');
  }

  if (result === 'pass') {
    parts.push(`✅ All ${counts.passed} checks passed`);
  } else if (result === 'fail') {
    parts.push(`❌ ${counts.failed} check(s) failed`);
    if (counts.passed > 0) {
      parts.push(`${counts.passed} passed`);
    }
  } else {
    parts.push(`⏳ ${counts.pending} check(s) pending`);
    if (counts.passed > 0) {
      parts.push(`${counts.passed} passed`);
    }
    if (counts.failed > 0) {
      parts.push(`${counts.failed} failed`);
    }
  }

  if (counts.reviewDecision) {
    const reviewEmoji = counts.reviewDecision === 'APPROVED' ? '✅' :
                        counts.reviewDecision === 'CHANGES_REQUESTED' ? '🔄' : '👀';
    parts.push(`${reviewEmoji} Review: ${counts.reviewDecision.toLowerCase().replace('_', ' ')}`);
  }

  return parts.join(' | ');
}

/**
 * Format check list for display
 */
export function formatCheckList(status: PRStatus): string {
  const lines: string[] = [];

  lines.push(`PR #${status.prNumber}: ${status.summary}`);
  lines.push('');

  if (status.checks.length === 0) {
    lines.push('No CI checks found');
  } else {
    for (const check of status.checks) {
      const emoji = check.status !== 'completed' ? '⏳' :
                    check.conclusion === 'success' ? '✅' :
                    check.conclusion === 'failure' ? '❌' :
                    check.conclusion === 'skipped' ? '⏭️' : '⚠️';
      lines.push(`${emoji} ${check.name}`);
    }
  }

  return lines.join('\n');
}
