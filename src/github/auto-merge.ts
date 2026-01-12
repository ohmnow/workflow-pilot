/**
 * Configurable Auto-Merge
 *
 * Automatically merges or labels PRs based on project configuration.
 * Supports three strategies: auto, review, and manual.
 */

import { spawn } from 'child_process';
import { AutopilotConfig, DEFAULT_AUTOPILOT_CONFIG, PRStrategy } from '../orchestrator/autopilot-config.js';
import { checkPRStatus, isPRReadyToMerge, PRStatus } from './ci-gate-checker.js';

/**
 * Result of an auto-merge operation
 */
export interface AutoMergeResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Action taken */
  action: 'merged' | 'labeled' | 'skipped' | 'pending' | 'failed';
  /** Human-readable message */
  message: string;
  /** PR number */
  prNumber: number;
  /** Strategy used */
  strategy: PRStrategy;
  /** PR status at time of check */
  status?: PRStatus;
  /** Error if any */
  error?: string;
}

/**
 * Options for auto-merge
 */
export interface AutoMergeOptions {
  /** Autopilot configuration */
  config?: AutopilotConfig;
  /** Merge method to use */
  mergeMethod?: 'merge' | 'squash' | 'rebase';
  /** Delete branch after merge */
  deleteBranch?: boolean;
  /** Dry run - don't actually merge/label */
  dryRun?: boolean;
}

/**
 * Process a PR according to the configured strategy
 */
export async function processAutoMerge(
  prNumber: number,
  options: AutoMergeOptions = {}
): Promise<AutoMergeResult> {
  const config = options.config || DEFAULT_AUTOPILOT_CONFIG;
  const strategy = config.prStrategy;

  // Check PR status
  const status = await checkPRStatus(prNumber, { config });

  // Handle based on strategy
  switch (strategy) {
    case 'auto':
      return handleAutoStrategy(prNumber, status, options);

    case 'review':
      return handleReviewStrategy(prNumber, status, config, options);

    case 'manual':
      return {
        success: true,
        action: 'skipped',
        message: 'Manual strategy - no automatic action taken',
        prNumber,
        strategy,
        status,
      };

    default:
      return {
        success: false,
        action: 'failed',
        message: `Unknown strategy: ${strategy}`,
        prNumber,
        strategy,
        error: `Invalid prStrategy: ${strategy}`,
      };
  }
}

/**
 * Handle 'auto' strategy - merge when CI passes
 */
async function handleAutoStrategy(
  prNumber: number,
  status: PRStatus,
  options: AutoMergeOptions
): Promise<AutoMergeResult> {
  // Check if PR is ready to merge
  const readyCheck = await isPRReadyToMerge(prNumber, { config: options.config });

  if (!readyCheck.ready) {
    if (status.result === 'pending') {
      // Enable auto-merge to merge when checks pass
      if (!options.dryRun) {
        const autoResult = await enableAutoMerge(prNumber, options);
        if (autoResult.success) {
          return {
            success: true,
            action: 'pending',
            message: `Auto-merge enabled - will merge when CI passes`,
            prNumber,
            strategy: 'auto',
            status,
          };
        }
      }
      return {
        success: true,
        action: 'pending',
        message: `CI pending: ${status.pendingChecks.join(', ')}`,
        prNumber,
        strategy: 'auto',
        status,
      };
    }

    return {
      success: false,
      action: 'failed',
      message: readyCheck.reason,
      prNumber,
      strategy: 'auto',
      status,
      error: readyCheck.reason,
    };
  }

  // PR is ready - merge it
  if (options.dryRun) {
    return {
      success: true,
      action: 'merged',
      message: `[DRY RUN] Would merge PR #${prNumber}`,
      prNumber,
      strategy: 'auto',
      status,
    };
  }

  const mergeResult = await mergePR(prNumber, options);

  if (mergeResult.success) {
    return {
      success: true,
      action: 'merged',
      message: `Successfully merged PR #${prNumber}`,
      prNumber,
      strategy: 'auto',
      status,
    };
  }

  return {
    success: false,
    action: 'failed',
    message: `Failed to merge: ${mergeResult.error}`,
    prNumber,
    strategy: 'auto',
    status,
    error: mergeResult.error,
  };
}

/**
 * Handle 'review' strategy - add label when CI passes
 */
async function handleReviewStrategy(
  prNumber: number,
  status: PRStatus,
  config: AutopilotConfig,
  options: AutoMergeOptions
): Promise<AutoMergeResult> {
  const reviewLabel = config.reviewLabel || 'ready-for-review';

  if (status.result === 'pending') {
    return {
      success: true,
      action: 'pending',
      message: `CI pending: ${status.pendingChecks.join(', ')}`,
      prNumber,
      strategy: 'review',
      status,
    };
  }

  if (status.result === 'fail') {
    return {
      success: false,
      action: 'failed',
      message: `CI failed: ${status.failedChecks.join(', ')}`,
      prNumber,
      strategy: 'review',
      status,
      error: `CI checks failed`,
    };
  }

  // CI passed - add review label
  if (options.dryRun) {
    return {
      success: true,
      action: 'labeled',
      message: `[DRY RUN] Would add '${reviewLabel}' label to PR #${prNumber}`,
      prNumber,
      strategy: 'review',
      status,
    };
  }

  const labelResult = await addLabelToPR(prNumber, reviewLabel);

  if (labelResult.success) {
    return {
      success: true,
      action: 'labeled',
      message: `Added '${reviewLabel}' label to PR #${prNumber}`,
      prNumber,
      strategy: 'review',
      status,
    };
  }

  return {
    success: false,
    action: 'failed',
    message: `Failed to add label: ${labelResult.error}`,
    prNumber,
    strategy: 'review',
    status,
    error: labelResult.error,
  };
}

/**
 * Merge a PR using gh CLI
 */
async function mergePR(
  prNumber: number,
  options: AutoMergeOptions
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = ['pr', 'merge', String(prNumber)];

    // Add merge method
    const method = options.mergeMethod || 'squash';
    args.push(`--${method}`);

    // Delete branch after merge
    if (options.deleteBranch !== false) {
      args.push('--delete-branch');
    }

    const child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Enable auto-merge on a PR
 */
async function enableAutoMerge(
  prNumber: number,
  options: AutoMergeOptions
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = ['pr', 'merge', String(prNumber), '--auto'];

    // Add merge method
    const method = options.mergeMethod || 'squash';
    args.push(`--${method}`);

    // Delete branch after merge
    if (options.deleteBranch !== false) {
      args.push('--delete-branch');
    }

    const child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Add a label to a PR
 */
async function addLabelToPR(
  prNumber: number,
  label: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const args = ['pr', 'edit', String(prNumber), '--add-label', label];

    const child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr.trim() || `Exit code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Process multiple PRs with auto-merge
 */
export async function processMultiplePRs(
  prNumbers: number[],
  options: AutoMergeOptions = {}
): Promise<Map<number, AutoMergeResult>> {
  const results = new Map<number, AutoMergeResult>();

  // Process sequentially to avoid rate limiting
  for (const prNumber of prNumbers) {
    const result = await processAutoMerge(prNumber, options);
    results.set(prNumber, result);
  }

  return results;
}

/**
 * Get summary of auto-merge results
 */
export function summarizeAutoMergeResults(
  results: Map<number, AutoMergeResult>
): string {
  const merged: number[] = [];
  const labeled: number[] = [];
  const pending: number[] = [];
  const failed: number[] = [];
  const skipped: number[] = [];

  for (const [prNumber, result] of results) {
    switch (result.action) {
      case 'merged':
        merged.push(prNumber);
        break;
      case 'labeled':
        labeled.push(prNumber);
        break;
      case 'pending':
        pending.push(prNumber);
        break;
      case 'failed':
        failed.push(prNumber);
        break;
      case 'skipped':
        skipped.push(prNumber);
        break;
    }
  }

  const lines: string[] = [];

  if (merged.length > 0) {
    lines.push(`✅ Merged: ${merged.map(n => `#${n}`).join(', ')}`);
  }
  if (labeled.length > 0) {
    lines.push(`🏷️ Labeled: ${labeled.map(n => `#${n}`).join(', ')}`);
  }
  if (pending.length > 0) {
    lines.push(`⏳ Pending: ${pending.map(n => `#${n}`).join(', ')}`);
  }
  if (failed.length > 0) {
    lines.push(`❌ Failed: ${failed.map(n => `#${n}`).join(', ')}`);
  }
  if (skipped.length > 0) {
    lines.push(`⏭️ Skipped: ${skipped.map(n => `#${n}`).join(', ')}`);
  }

  return lines.join('\n') || 'No PRs processed';
}

/**
 * Check if auto-merge is supported for the repository
 */
export async function isAutoMergeSupported(): Promise<boolean> {
  return new Promise((resolve) => {
    // Check if auto-merge is enabled in repo settings
    // This is a heuristic - we try to get repo settings
    const child = spawn('gh', ['repo', 'view', '--json', 'autoMergeAllowed'], {
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
          resolve(data.autoMergeAllowed === true);
        } catch {
          resolve(false);
        }
      } else {
        // If we can't check, assume it might be supported
        resolve(true);
      }
    });

    child.on('error', () => {
      resolve(true);
    });
  });
}
