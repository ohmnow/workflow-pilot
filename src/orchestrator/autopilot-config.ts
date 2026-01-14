/**
 * Autopilot Configuration Schema
 *
 * Defines configuration for distributed Claude workers:
 * - PR merge strategy (auto, review, manual)
 * - Worker limits and timeouts
 * - Auto-labeling behavior
 * - Required CI checks
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * PR merge strategy for worker-created PRs
 */
export type PRStrategy = 'auto' | 'review' | 'manual';

/**
 * Autopilot configuration for distributed Claude workers
 */
export interface AutopilotConfig {
  /** How to handle PRs created by workers */
  prStrategy: PRStrategy;

  /** Maximum concurrent worker sessions (1-10) */
  maxConcurrentWorkers: number;

  /** Automatically label non-blocking features for workers */
  autoLabelNonBlocking: boolean;

  /** Worker session timeout (e.g., '30m', '1h') */
  workerTimeout: string;

  /** CI checks that must pass before merge */
  requiredChecks: string[];

  /** Branch name pattern for worker branches */
  branchPattern: string;

  /** Label to trigger worker sessions */
  workerLabel: string;

  /** Label added when PR is ready for review */
  reviewLabel: string;
}

/**
 * Default autopilot configuration
 */
export const DEFAULT_AUTOPILOT_CONFIG: AutopilotConfig = {
  prStrategy: 'review',
  maxConcurrentWorkers: 3,
  autoLabelNonBlocking: false,
  workerTimeout: '30m',
  requiredChecks: ['test', 'build'],
  branchPattern: 'claude-worker/{feature-id}',
  workerLabel: 'ready-for-claude',
  reviewLabel: 'ready-for-review',
};

/**
 * Validate autopilot configuration
 */
export function validateAutopilotConfig(
  config: Partial<AutopilotConfig>
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.prStrategy && !['auto', 'review', 'manual'].includes(config.prStrategy)) {
    errors.push(`Invalid prStrategy: ${config.prStrategy}. Must be 'auto', 'review', or 'manual'`);
  }

  if (config.maxConcurrentWorkers !== undefined) {
    if (config.maxConcurrentWorkers < 1 || config.maxConcurrentWorkers > 10) {
      errors.push(`maxConcurrentWorkers must be between 1 and 10, got ${config.maxConcurrentWorkers}`);
    }
  }

  if (config.workerTimeout) {
    const timeoutPattern = /^\d+[mh]$/;
    if (!timeoutPattern.test(config.workerTimeout)) {
      errors.push(`Invalid workerTimeout format: ${config.workerTimeout}. Use format like '30m' or '1h'`);
    }
  }

  if (config.requiredChecks && !Array.isArray(config.requiredChecks)) {
    errors.push('requiredChecks must be an array of strings');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Merge partial config with defaults
 */
export function mergeAutopilotConfig(
  partial: Partial<AutopilotConfig>
): AutopilotConfig {
  return {
    ...DEFAULT_AUTOPILOT_CONFIG,
    ...partial,
  };
}

/**
 * Parse timeout string to milliseconds
 */
export function parseTimeout(timeout: string): number {
  const match = timeout.match(/^(\d+)([mh])$/);
  if (!match) {
    return 30 * 60 * 1000; // Default 30 minutes
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  if (unit === 'h') {
    return value * 60 * 60 * 1000;
  }
  return value * 60 * 1000; // minutes
}

/**
 * Configuration file names to search for
 */
const CONFIG_FILES = [
  '.claude-hero.json',
  'feature_list.json',
];

/**
 * Load autopilot config from project directory
 *
 * Searches for config in:
 * 1. .claude-hero.json (project-level config)
 * 2. feature_list.json (embedded in config section)
 *
 * Later sources override earlier ones.
 */
export function loadAutopilotConfig(
  projectDir: string = process.cwd()
): AutopilotConfig {
  let config: Partial<AutopilotConfig> = {};

  for (const configFile of CONFIG_FILES) {
    const configPath = path.join(projectDir, configFile);

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);

        // Check for autopilot config in different locations
        if (parsed.autopilot) {
          config = { ...config, ...parsed.autopilot };
        } else if (parsed.config?.autopilot) {
          config = { ...config, ...parsed.config.autopilot };
        }
      }
    } catch {
      // Ignore parse errors, continue with defaults
    }
  }

  return mergeAutopilotConfig(config);
}

/**
 * Save autopilot config to .claude-hero.json
 */
export function saveAutopilotConfig(
  config: AutopilotConfig,
  projectDir: string = process.cwd()
): boolean {
  const configPath = path.join(projectDir, '.claude-hero.json');

  try {
    let existing: Record<string, unknown> = {};

    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf-8');
      existing = JSON.parse(content);
    }

    existing.autopilot = config;
    fs.writeFileSync(configPath, JSON.stringify(existing, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if autopilot is configured for a project
 */
export function hasAutopilotConfig(projectDir: string = process.cwd()): boolean {
  for (const configFile of CONFIG_FILES) {
    const configPath = path.join(projectDir, configFile);

    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);

        if (parsed.autopilot || parsed.config?.autopilot) {
          return true;
        }
      }
    } catch {
      continue;
    }
  }

  return false;
}

/**
 * Generate branch name for a feature
 */
export function generateWorkerBranch(
  featureId: string,
  pattern: string = DEFAULT_AUTOPILOT_CONFIG.branchPattern
): string {
  return pattern.replace('{feature-id}', featureId.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
}

/**
 * Get human-readable description of PR strategy
 */
export function describePRStrategy(strategy: PRStrategy): string {
  switch (strategy) {
    case 'auto':
      return 'Automatically merge when CI passes';
    case 'review':
      return 'Add review label when CI passes, wait for human approval';
    case 'manual':
      return 'Create PR only, no automatic actions';
    default:
      return 'Unknown strategy';
  }
}
