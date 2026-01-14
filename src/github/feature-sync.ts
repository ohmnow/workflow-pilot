/**
 * Feature List Sync on Merge
 *
 * Automatically updates feature_list.json when worker PRs are merged.
 * Parses 'Fixes #N' syntax to identify which feature was completed.
 */

import { spawn } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Information about a merged PR
 */
export interface MergedPRInfo {
  /** PR number */
  number: number;
  /** PR title */
  title: string;
  /** PR body */
  body: string;
  /** Merge commit SHA */
  mergeCommit: string;
  /** Branch that was merged */
  headBranch: string;
  /** When the PR was merged */
  mergedAt: string;
  /** Issue numbers referenced with 'Fixes #N' */
  fixedIssues: number[];
}

/**
 * Result of a feature sync operation
 */
export interface FeatureSyncResult {
  /** Whether the operation succeeded */
  success: boolean;
  /** Features that were updated */
  updatedFeatures: string[];
  /** Human-readable message */
  message: string;
  /** Error if any */
  error?: string;
}

/**
 * Feature list file structure
 */
export interface FeatureListFile {
  project?: string;
  version?: string;
  sprints?: Sprint[];
  features?: Feature[];
  [key: string]: unknown;
}

export interface Sprint {
  id: string;
  name: string;
  features: Feature[];
  [key: string]: unknown;
}

export interface Feature {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'complete' | string;
  issueNumber?: number;
  [key: string]: unknown;
}

/**
 * Parse 'Fixes #N' references from PR body
 */
export function parseFixesReferences(text: string): number[] {
  if (!text) return [];

  const issues: number[] = [];

  // Match various fix syntaxes:
  // - Fixes #123
  // - Fixed #123
  // - Fix #123
  // - Closes #123
  // - Closed #123
  // - Close #123
  // - Resolves #123
  // - Resolved #123
  // - Resolve #123
  const pattern = /(?:fix(?:es|ed)?|clos(?:es|ed?)|resolv(?:es|ed?))\s*#(\d+)/gi;

  let match;
  while ((match = pattern.exec(text)) !== null) {
    const issueNum = parseInt(match[1], 10);
    if (!issues.includes(issueNum)) {
      issues.push(issueNum);
    }
  }

  return issues;
}

/**
 * Get recently merged PRs
 */
export async function getRecentlyMergedPRs(
  options: { since?: string; limit?: number } = {}
): Promise<{ success: boolean; data?: MergedPRInfo[]; error?: string }> {
  return new Promise((resolve) => {
    const limit = options.limit || 10;
    const args = [
      'pr',
      'list',
      '--state',
      'merged',
      '--limit',
      String(limit),
      '--json',
      'number,title,body,mergeCommit,headRefName,mergedAt',
    ];

    const child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const prs = JSON.parse(stdout.trim());
          const mergedPRs: MergedPRInfo[] = prs.map((pr: any) => ({
            number: pr.number,
            title: pr.title,
            body: pr.body || '',
            mergeCommit: pr.mergeCommit?.oid || '',
            headBranch: pr.headRefName,
            mergedAt: pr.mergedAt,
            fixedIssues: parseFixesReferences(pr.body || ''),
          }));

          // Filter by date if 'since' provided
          if (options.since) {
            const sinceDate = new Date(options.since);
            const filtered = mergedPRs.filter(
              (pr) => new Date(pr.mergedAt) >= sinceDate
            );
            resolve({ success: true, data: filtered });
          } else {
            resolve({ success: true, data: mergedPRs });
          }
        } catch (e) {
          resolve({ success: false, error: `Failed to parse response: ${e}` });
        }
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
 * Find a feature by its associated issue number
 */
export function findFeatureByIssue(
  featureList: FeatureListFile,
  issueNumber: number
): { feature: Feature; sprintId?: string } | null {
  // Check sprints format (tier2-features.json style)
  if (featureList.sprints) {
    for (const sprint of featureList.sprints) {
      for (const feature of sprint.features) {
        if (feature.issueNumber === issueNumber) {
          return { feature, sprintId: sprint.id };
        }
      }
    }
  }

  // Check flat features array
  if (featureList.features) {
    for (const feature of featureList.features) {
      if (feature.issueNumber === issueNumber) {
        return { feature };
      }
    }
  }

  return null;
}

/**
 * Find feature list file in project
 */
export function findFeatureListFile(projectDir: string): string | null {
  const possibleNames = [
    'feature_list.json',
    'feature-list.json',
    'features.json',
    'tier2-features.json',
    '.claude-hero.json',
  ];

  for (const name of possibleNames) {
    const filePath = join(projectDir, name);
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  return null;
}

/**
 * Update feature status in file
 */
export function updateFeatureStatus(
  featureList: FeatureListFile,
  issueNumber: number,
  newStatus: string
): boolean {
  // Check sprints format
  if (featureList.sprints) {
    for (const sprint of featureList.sprints) {
      for (const feature of sprint.features) {
        if (feature.issueNumber === issueNumber) {
          feature.status = newStatus;
          return true;
        }
      }
    }
  }

  // Check flat features array
  if (featureList.features) {
    for (const feature of featureList.features) {
      if (feature.issueNumber === issueNumber) {
        feature.status = newStatus;
        return true;
      }
    }
  }

  return false;
}

/**
 * Commit feature list changes
 */
async function commitFeatureListUpdate(
  filePath: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    // Stage the file
    const addChild = spawn('git', ['add', filePath], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    addChild.on('close', (addCode) => {
      if (addCode !== 0) {
        resolve({ success: false, error: 'Failed to stage file' });
        return;
      }

      // Commit
      const commitChild = spawn('git', ['commit', '-m', message], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stderr = '';

      commitChild.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      commitChild.on('close', (commitCode) => {
        if (commitCode === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: stderr.trim() || `Exit code ${commitCode}` });
        }
      });

      commitChild.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });
    });

    addChild.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Sync feature list based on merged PR
 */
export async function syncFeatureFromMergedPR(
  pr: MergedPRInfo,
  options: {
    projectDir?: string;
    autoCommit?: boolean;
    dryRun?: boolean;
  } = {}
): Promise<FeatureSyncResult> {
  const projectDir = options.projectDir || process.cwd();

  if (pr.fixedIssues.length === 0) {
    return {
      success: true,
      updatedFeatures: [],
      message: `PR #${pr.number} has no 'Fixes #N' references`,
    };
  }

  // Find feature list file
  const featureListPath = findFeatureListFile(projectDir);
  if (!featureListPath) {
    return {
      success: false,
      updatedFeatures: [],
      message: 'No feature list file found',
      error: 'Could not find feature_list.json or similar file',
    };
  }

  // Read feature list
  let featureList: FeatureListFile;
  try {
    const content = readFileSync(featureListPath, 'utf-8');
    featureList = JSON.parse(content);
  } catch (e) {
    return {
      success: false,
      updatedFeatures: [],
      message: 'Failed to read feature list',
      error: `${e}`,
    };
  }

  // Update features for each fixed issue
  const updatedFeatures: string[] = [];

  for (const issueNumber of pr.fixedIssues) {
    const found = findFeatureByIssue(featureList, issueNumber);
    if (found) {
      if (found.feature.status !== 'complete') {
        updateFeatureStatus(featureList, issueNumber, 'complete');
        updatedFeatures.push(found.feature.id || found.feature.name);
      }
    }
  }

  if (updatedFeatures.length === 0) {
    return {
      success: true,
      updatedFeatures: [],
      message: `No features found for issues: ${pr.fixedIssues.map((n) => `#${n}`).join(', ')}`,
    };
  }

  // Write updated file
  if (options.dryRun) {
    return {
      success: true,
      updatedFeatures,
      message: `[DRY RUN] Would mark as complete: ${updatedFeatures.join(', ')}`,
    };
  }

  try {
    writeFileSync(featureListPath, JSON.stringify(featureList, null, 2) + '\n');
  } catch (e) {
    return {
      success: false,
      updatedFeatures: [],
      message: 'Failed to write feature list',
      error: `${e}`,
    };
  }

  // Commit if requested
  if (options.autoCommit) {
    const commitMessage = `chore: mark ${updatedFeatures.join(', ')} as complete\n\nAuto-synced from PR #${pr.number}`;
    const commitResult = await commitFeatureListUpdate(featureListPath, commitMessage);

    if (!commitResult.success) {
      return {
        success: false,
        updatedFeatures,
        message: 'Updated file but failed to commit',
        error: commitResult.error,
      };
    }
  }

  return {
    success: true,
    updatedFeatures,
    message: `Marked as complete: ${updatedFeatures.join(', ')}`,
  };
}

/**
 * Process all recently merged PRs and sync features
 */
export async function syncAllRecentlyMergedPRs(
  options: {
    projectDir?: string;
    autoCommit?: boolean;
    dryRun?: boolean;
    since?: string;
    limit?: number;
  } = {}
): Promise<{
  success: boolean;
  results: Map<number, FeatureSyncResult>;
  summary: string;
}> {
  const prsResult = await getRecentlyMergedPRs({
    since: options.since,
    limit: options.limit,
  });

  if (!prsResult.success || !prsResult.data) {
    return {
      success: false,
      results: new Map(),
      summary: `Failed to fetch merged PRs: ${prsResult.error}`,
    };
  }

  const results = new Map<number, FeatureSyncResult>();

  for (const pr of prsResult.data) {
    const result = await syncFeatureFromMergedPR(pr, {
      projectDir: options.projectDir,
      autoCommit: options.autoCommit,
      dryRun: options.dryRun,
    });
    results.set(pr.number, result);
  }

  // Generate summary
  const updated: string[] = [];
  const skipped: number[] = [];
  const failed: number[] = [];

  for (const [prNumber, result] of results) {
    if (result.updatedFeatures.length > 0) {
      updated.push(...result.updatedFeatures.map((f) => `${f} (PR #${prNumber})`));
    } else if (result.success) {
      skipped.push(prNumber);
    } else {
      failed.push(prNumber);
    }
  }

  const summaryLines: string[] = [];

  if (updated.length > 0) {
    summaryLines.push(`Updated: ${updated.join(', ')}`);
  }
  if (skipped.length > 0) {
    summaryLines.push(`Skipped (no features): PRs ${skipped.map((n) => `#${n}`).join(', ')}`);
  }
  if (failed.length > 0) {
    summaryLines.push(`Failed: PRs ${failed.map((n) => `#${n}`).join(', ')}`);
  }

  return {
    success: failed.length === 0,
    results,
    summary: summaryLines.join('\n') || 'No merged PRs to process',
  };
}

/**
 * Watch for merged PRs (polling-based)
 */
export function createMergeWatcher(
  options: {
    projectDir?: string;
    autoCommit?: boolean;
    intervalMs?: number;
    onSync?: (result: FeatureSyncResult) => void;
  } = {}
): { start: () => void; stop: () => void } {
  const intervalMs = options.intervalMs || 60000; // Default: 1 minute
  let intervalId: NodeJS.Timeout | null = null;
  let lastCheckTime = new Date().toISOString();

  const check = async () => {
    const prsResult = await getRecentlyMergedPRs({ since: lastCheckTime });

    if (prsResult.success && prsResult.data) {
      for (const pr of prsResult.data) {
        const result = await syncFeatureFromMergedPR(pr, {
          projectDir: options.projectDir,
          autoCommit: options.autoCommit,
        });

        if (options.onSync) {
          options.onSync(result);
        }
      }
    }

    lastCheckTime = new Date().toISOString();
  };

  return {
    start: () => {
      if (!intervalId) {
        intervalId = setInterval(check, intervalMs);
        // Also run immediately
        check();
      }
    },
    stop: () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    },
  };
}
