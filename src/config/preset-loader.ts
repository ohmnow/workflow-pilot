/**
 * Preset Loader
 *
 * Loads rule presets based on detected project type.
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { WorkflowPilotConfig } from './schema.js';
import { ProjectType, getPresetName } from './project-detector.js';

/**
 * Preset configuration structure
 */
export interface PresetConfig {
  name: string;
  description: string;
  extends?: string;
  categories?: Partial<WorkflowPilotConfig['categories']>;
  rules?: {
    enabled?: string[];
    disabled?: string[];
  };
  customRules?: Record<string, unknown>;
}

// Cache for loaded presets
const presetCache = new Map<string, PresetConfig>();

/**
 * Get the presets directory path
 */
function getPresetsDir(): string {
  // Try multiple locations for the presets directory
  const possiblePaths = [
    join(process.cwd(), 'config', 'presets'),
    '/Users/chris/cc-projects/claude code terminal plugin/config/presets',
  ];

  for (const path of possiblePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  // Default to cwd-based path
  return join(process.cwd(), 'config', 'presets');
}

/**
 * Load a single preset file
 */
function loadPresetFile(presetName: string): PresetConfig | null {
  // Check cache first
  if (presetCache.has(presetName)) {
    return presetCache.get(presetName)!;
  }

  const presetsDir = getPresetsDir();
  const presetPath = join(presetsDir, `${presetName}.json`);

  if (!existsSync(presetPath)) {
    if (process.env.WORKFLOW_PILOT_DEBUG === '1') {
      console.error(`[WP Debug] Preset not found: ${presetPath}`);
    }
    return null;
  }

  try {
    const content = readFileSync(presetPath, 'utf-8');
    const preset = JSON.parse(content) as PresetConfig;

    // Cache the loaded preset
    presetCache.set(presetName, preset);

    if (process.env.WORKFLOW_PILOT_DEBUG === '1') {
      console.error(`[WP Debug] Loaded preset: ${presetName}`);
    }

    return preset;
  } catch (error) {
    console.error(`[Workflow Pilot] Error loading preset ${presetName}:`, error);
    return null;
  }
}

/**
 * Load preset with inheritance resolution
 * Handles the 'extends' property to merge parent presets
 */
function loadPresetWithInheritance(presetName: string, visited = new Set<string>()): PresetConfig | null {
  // Prevent circular inheritance
  if (visited.has(presetName)) {
    console.error(`[Workflow Pilot] Circular preset inheritance detected: ${presetName}`);
    return null;
  }
  visited.add(presetName);

  const preset = loadPresetFile(presetName);
  if (!preset) {
    return null;
  }

  // If this preset extends another, load and merge parent first
  if (preset.extends) {
    const parentPreset = loadPresetWithInheritance(preset.extends, visited);
    if (parentPreset) {
      return mergePresets(parentPreset, preset);
    }
  }

  return preset;
}

/**
 * Merge two presets (parent and child)
 */
function mergePresets(parent: PresetConfig, child: PresetConfig): PresetConfig {
  return {
    name: child.name,
    description: child.description,
    categories: {
      ...parent.categories,
      ...child.categories,
    },
    rules: {
      enabled: [
        ...(parent.rules?.enabled || []),
        ...(child.rules?.enabled || []),
      ],
      disabled: [
        ...(parent.rules?.disabled || []),
        ...(child.rules?.disabled || []),
      ],
    },
    customRules: {
      ...parent.customRules,
      ...child.customRules,
    },
  };
}

/**
 * Load preset for a given project type
 *
 * @param projectType - The detected project type
 * @returns PresetConfig or null if no preset found
 */
export function loadPreset(projectType: ProjectType): PresetConfig | null {
  const presetName = getPresetName(projectType);
  return loadPresetWithInheritance(presetName);
}

/**
 * Load TypeScript-specific preset (applied on top of other presets)
 */
export function loadTypeScriptPreset(): PresetConfig | null {
  return loadPresetWithInheritance('typescript');
}

/**
 * Apply preset to config
 * The preset provides defaults that can be overridden by user config
 */
export function applyPresetToConfig(
  baseConfig: Partial<WorkflowPilotConfig>,
  preset: PresetConfig
): Partial<WorkflowPilotConfig> {
  const result = { ...baseConfig };

  // Apply category settings from preset if not overridden
  if (preset.categories) {
    result.categories = {
      ...preset.categories,
      ...result.categories,
    } as WorkflowPilotConfig['categories'];
  }

  return result;
}

/**
 * Get all available presets
 */
export function listAvailablePresets(): string[] {
  const presetsDir = getPresetsDir();
  if (!existsSync(presetsDir)) {
    return [];
  }

  try {
    const { readdirSync } = require('fs');
    const files = readdirSync(presetsDir) as string[];
    return files
      .filter((f: string) => f.endsWith('.json'))
      .map((f: string) => f.replace('.json', ''));
  } catch {
    return [];
  }
}

/**
 * Clear preset cache
 */
export function clearPresetCache(): void {
  presetCache.clear();
}
