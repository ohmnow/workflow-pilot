/**
 * Configuration Loader
 *
 * Loads and validates configuration from file or environment.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  WorkflowPilotConfig,
  DEFAULT_CONFIG,
  MODE_PRESETS,
  OperatingMode,
} from './schema.js';

// Cache the loaded config
let cachedConfig: WorkflowPilotConfig | null = null;

/**
 * Find config files in priority order
 * Returns an array of paths to merge (later paths override earlier)
 *
 * Priority (lowest to highest):
 * 1. Built-in defaults
 * 2. User global config (~/.config/workflow-pilot/config.json)
 * 3. Project config (./config/workflow-pilot.json)
 * 4. Project root config (./.workflow-pilot.json) - NEW
 * 5. WORKFLOW_PILOT_CONFIG env var (highest priority)
 */
function findConfigPaths(): string[] {
  const paths: string[] = [];

  // 1. Built-in default (lowest priority)
  const possibleDefaults = [
    join(process.cwd(), 'config', 'default.json'),
    '/Users/chris/cc-projects/claude code terminal plugin/config/default.json',
  ];
  for (const path of possibleDefaults) {
    if (existsSync(path)) {
      paths.push(path);
      break;
    }
  }

  // 2. User global config
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const userConfig = join(homeDir, '.config', 'workflow-pilot', 'config.json');
  if (existsSync(userConfig)) {
    paths.push(userConfig);
  }

  // 3. Project config directory
  const projectConfig = join(process.cwd(), 'config', 'workflow-pilot.json');
  if (existsSync(projectConfig)) {
    paths.push(projectConfig);
  }

  // 4. Project root .workflow-pilot.json (NEW - user-specific project config)
  const projectRootConfig = join(process.cwd(), '.workflow-pilot.json');
  if (existsSync(projectRootConfig)) {
    paths.push(projectRootConfig);
  }

  // 5. Environment variable (highest priority)
  if (process.env.WORKFLOW_PILOT_CONFIG) {
    const envPath = process.env.WORKFLOW_PILOT_CONFIG;
    if (existsSync(envPath)) {
      paths.push(envPath);
    }
  }

  return paths;
}

/**
 * @deprecated Use findConfigPaths() instead
 */
function findConfigPath(): string | null {
  const paths = findConfigPaths();
  return paths.length > 0 ? paths[paths.length - 1] : null;
}

/**
 * Deep merge two config objects
 */
function deepMerge(
  base: WorkflowPilotConfig,
  override: Partial<WorkflowPilotConfig>
): WorkflowPilotConfig {
  const result = JSON.parse(JSON.stringify(base)) as WorkflowPilotConfig;

  // Merge top-level properties
  if (override.mode !== undefined) result.mode = override.mode;

  // Merge tiers
  if (override.tiers) {
    if (override.tiers.critical) result.tiers.critical = { ...result.tiers.critical, ...override.tiers.critical };
    if (override.tiers.warning) result.tiers.warning = { ...result.tiers.warning, ...override.tiers.warning };
    if (override.tiers.info) result.tiers.info = { ...result.tiers.info, ...override.tiers.info };
  }

  // Merge categories
  if (override.categories) {
    result.categories = { ...result.categories, ...override.categories };
  }

  // Merge frequency
  if (override.frequency) {
    result.frequency = { ...result.frequency, ...override.frequency };
  }

  // Merge ai
  if (override.ai) {
    result.ai = { ...result.ai, ...override.ai };
  }

  // Merge training
  if (override.training) {
    result.training = { ...result.training, ...override.training };
  }

  // Merge hooks
  if (override.hooks) {
    result.hooks = { ...result.hooks, ...override.hooks };
  }

  return result;
}

/**
 * Apply mode preset to config
 */
function applyModePreset(config: WorkflowPilotConfig): WorkflowPilotConfig {
  const preset = MODE_PRESETS[config.mode];
  if (!preset) {
    return config;
  }

  // Mode preset is the base, user config overrides it
  return deepMerge(deepMerge(DEFAULT_CONFIG, preset as Partial<WorkflowPilotConfig>), config);
}

/**
 * Validate configuration
 */
function validateConfig(config: unknown): config is Partial<WorkflowPilotConfig> {
  if (typeof config !== 'object' || config === null) {
    return false;
  }

  const c = config as Record<string, unknown>;

  // Validate mode if present
  if (c.mode !== undefined) {
    if (!['minimal', 'training', 'guidance'].includes(c.mode as string)) {
      console.error(`[Workflow Pilot] Invalid mode: ${c.mode}. Using default.`);
      return false;
    }
  }

  return true;
}

/**
 * Load configuration
 *
 * Merges configs in priority order:
 * defaults -> user global -> project config -> project root -> env var
 *
 * @param forceReload - Skip cache and reload from file
 */
export function loadConfig(forceReload = false): WorkflowPilotConfig {
  // Return cached if available
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  // Start with defaults
  let mergedConfig: Partial<WorkflowPilotConfig> = {};

  // Load and merge all config files in priority order
  const configPaths = findConfigPaths();
  for (const configPath of configPaths) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      if (validateConfig(parsed)) {
        mergedConfig = deepMerge(
          deepMerge(DEFAULT_CONFIG, mergedConfig),
          parsed
        );

        if (process.env.WORKFLOW_PILOT_DEBUG === '1') {
          console.error(`[WP Debug] Loaded config from: ${configPath}`);
        }
      }
    } catch (error) {
      console.error(`[Workflow Pilot] Error loading config from ${configPath}:`, error);
    }
  }

  // Check for mode override via environment (highest priority)
  if (process.env.WORKFLOW_PILOT_MODE) {
    const envMode = process.env.WORKFLOW_PILOT_MODE as OperatingMode;
    if (['minimal', 'training', 'guidance'].includes(envMode)) {
      mergedConfig.mode = envMode;
    }
  }

  // Final merge with defaults to ensure all fields present
  let finalConfig = deepMerge(DEFAULT_CONFIG, mergedConfig);

  // Apply mode preset
  finalConfig = applyModePreset(finalConfig);

  // Cache and return
  cachedConfig = finalConfig;
  return finalConfig;
}

/**
 * Get a specific config value
 */
export function getConfigValue<K extends keyof WorkflowPilotConfig>(
  key: K
): WorkflowPilotConfig[K] {
  const config = loadConfig();
  return config[key];
}

/**
 * Check if a specific tier is enabled
 */
export function isTierEnabled(tier: 'critical' | 'warning' | 'info'): boolean {
  const config = loadConfig();
  return config.tiers[tier]?.enabled ?? true;
}

/**
 * Check if a category is enabled
 */
export function isCategoryEnabled(
  category: 'testing' | 'git' | 'security' | 'claudeCode' | 'refactoring'
): boolean {
  const config = loadConfig();
  return config.categories[category] ?? true;
}

/**
 * Get the current operating mode
 */
export function getMode(): OperatingMode {
  const config = loadConfig();
  return config.mode;
}

/**
 * Check if we're in training mode
 */
export function isTrainingMode(): boolean {
  return getMode() === 'training';
}

/**
 * Get cooldown for a rule
 */
export function getCooldownMinutes(ruleId: string): number {
  const config = loadConfig();

  // Check per-rule override first
  if (config.frequency.perRuleCooldowns?.[ruleId]) {
    return config.frequency.perRuleCooldowns[ruleId];
  }

  // Use info cooldown for info rules
  if (ruleId.startsWith('info-')) {
    return config.frequency.infoCooldownMinutes;
  }

  return config.frequency.defaultCooldownMinutes;
}

/**
 * Clear cached config (useful for testing)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}
