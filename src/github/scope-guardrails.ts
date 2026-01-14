/**
 * Worker Scope Guardrails
 *
 * Defines and enforces file/action limitations for Claude workers.
 * Prevents workers from modifying files outside their assigned scope.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Scope configuration for a worker
 */
export interface ScopeGuardrails {
  /** Paths the worker IS allowed to modify (glob patterns) */
  allowedPaths: string[];
  /** Paths the worker is NOT allowed to modify (glob patterns) */
  deniedPaths: string[];
  /** Actions the worker cannot perform */
  deniedActions: string[];
  /** Custom instructions to include in prompt */
  customInstructions: string[];
}

/**
 * Feature-specific scope overrides
 */
export interface FeatureScopeConfig {
  /** Feature ID this config applies to */
  featureId: string;
  /** Additional allowed paths for this feature */
  allowedPaths?: string[];
  /** Additional denied paths for this feature */
  deniedPaths?: string[];
  /** Feature-specific notes */
  notes?: string;
}

/**
 * Project-wide scope configuration (read from CLAUDE.md)
 */
export interface ProjectScopeConfig {
  /** Default allowed paths for all workers */
  defaultAllowedPaths: string[];
  /** Always-denied paths (protected files) */
  protectedPaths: string[];
  /** Feature-specific overrides */
  featureOverrides: FeatureScopeConfig[];
}

/**
 * Files that should NEVER be modified by workers
 */
export const DEFAULT_PROTECTED_PATHS: string[] = [
  // Orchestrator state
  'feature_list.json',
  'tier2-features.json',
  '.claude-hero.json',

  // Environment and secrets
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  'credentials.json',
  'secrets.*',

  // Git and CI configuration (usually)
  '.github/workflows/claude-worker.yml', // Workers shouldn't modify their own workflow
  '.gitignore',

  // Package lock files (can cause merge conflicts)
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',

  // Core config files
  'tsconfig.json',
  'package.json', // Usually shouldn't modify dependencies

  // CLAUDE.md itself
  'CLAUDE.md',
];

/**
 * Default allowed paths when none specified
 */
export const DEFAULT_ALLOWED_PATHS: string[] = [
  'src/**/*',
  'lib/**/*',
  'test/**/*',
  'tests/**/*',
  'spec/**/*',
  '__tests__/**/*',
];

/**
 * Actions workers should not perform
 */
export const DEFAULT_DENIED_ACTIONS: string[] = [
  'Delete critical files',
  'Modify package dependencies without explicit requirement',
  'Change CI/CD configuration',
  'Modify authentication or security settings',
  'Access or modify environment variables',
  'Execute arbitrary shell commands not related to the task',
  'Make network requests to external services',
  'Modify git history or force push',
];

/**
 * Default scope guardrails
 */
export const DEFAULT_SCOPE_GUARDRAILS: ScopeGuardrails = {
  allowedPaths: DEFAULT_ALLOWED_PATHS,
  deniedPaths: DEFAULT_PROTECTED_PATHS,
  deniedActions: DEFAULT_DENIED_ACTIONS,
  customInstructions: [],
};

/**
 * Load scope guardrails from CLAUDE.md
 *
 * Parses CLAUDE.md for a ## Worker Scope section that can define:
 * - Allowed paths
 * - Protected/denied paths
 * - Feature-specific overrides
 */
export function loadScopeGuardrailsFromClaudeMd(
  projectDir: string = process.cwd()
): ProjectScopeConfig | null {
  const claudeMdPath = path.join(projectDir, 'CLAUDE.md');

  if (!fs.existsSync(claudeMdPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    return parseScopeFromClaudeMd(content);
  } catch {
    return null;
  }
}

/**
 * Parse scope configuration from CLAUDE.md content
 */
export function parseScopeFromClaudeMd(content: string): ProjectScopeConfig | null {
  // Look for ## Worker Scope or ## Scope Guardrails section
  // Use negative lookahead to stop at ## but not ### (subsection headers)
  const scopeMatch = content.match(
    /##\s*(?:Worker\s+)?Scope(?:\s+Guardrails)?\s*\n([\s\S]*?)(?=\n##(?!#)|$)/i
  );

  if (!scopeMatch) {
    return null;
  }

  const scopeContent = scopeMatch[1];
  const config: ProjectScopeConfig = {
    defaultAllowedPaths: [],
    protectedPaths: [...DEFAULT_PROTECTED_PATHS],
    featureOverrides: [],
  };

  // Parse ### Allowed Paths
  const allowedMatch = scopeContent.match(
    /###?\s*Allowed\s+Paths?\s*\n([\s\S]*?)(?=\n###?|$)/i
  );
  if (allowedMatch) {
    config.defaultAllowedPaths = extractPathList(allowedMatch[1]);
  }

  // Parse ### Protected Paths or ### Denied Paths
  const protectedMatch = scopeContent.match(
    /###?\s*(?:Protected|Denied)\s+Paths?\s*\n([\s\S]*?)(?=\n###?|$)/i
  );
  if (protectedMatch) {
    const additionalProtected = extractPathList(protectedMatch[1]);
    config.protectedPaths = [...new Set([...config.protectedPaths, ...additionalProtected])];
  }

  // Parse ### Feature Overrides
  const overridesMatch = scopeContent.match(
    /###?\s*Feature\s+Overrides?\s*\n([\s\S]*?)(?=\n##[^#]|$)/i
  );
  if (overridesMatch) {
    config.featureOverrides = parseFeatureOverrides(overridesMatch[1]);
  }

  return config;
}

/**
 * Extract a list of paths from markdown list
 */
function extractPathList(content: string): string[] {
  const paths: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match - `path`, - path, * `path`
    const match = line.match(/^\s*[-*]\s*`?([^`\n]+)`?\s*$/);
    if (match) {
      const pathValue = match[1].trim();
      if (pathValue && !pathValue.startsWith('#')) {
        paths.push(pathValue);
      }
    }
  }

  return paths;
}

/**
 * Parse feature-specific overrides from markdown
 */
function parseFeatureOverrides(content: string): FeatureScopeConfig[] {
  const overrides: FeatureScopeConfig[] = [];

  // Match patterns like "F-001:" or "**T2-004**:" followed by list
  const featureBlocks = content.split(/(?=\n(?:\*\*)?[A-Z]+\d*-\d+(?:\*\*)?:)/);

  for (const block of featureBlocks) {
    const headerMatch = block.match(/(?:\*\*)?([A-Z]+\d*-\d+)(?:\*\*)?:\s*(.*)?/);
    if (!headerMatch) continue;

    const featureId = headerMatch[1];
    const override: FeatureScopeConfig = { featureId };

    // Extract allowed paths for this feature
    const allowedMatch = block.match(/allowed:\s*([^\n]+(?:\n\s*[-*][^\n]+)*)/i);
    if (allowedMatch) {
      override.allowedPaths = extractPathList(allowedMatch[1]);
    }

    // Extract denied paths for this feature
    const deniedMatch = block.match(/denied:\s*([^\n]+(?:\n\s*[-*][^\n]+)*)/i);
    if (deniedMatch) {
      override.deniedPaths = extractPathList(deniedMatch[1]);
    }

    // Extract notes
    const notesMatch = block.match(/notes?:\s*(.+)/i);
    if (notesMatch) {
      override.notes = notesMatch[1].trim();
    }

    if (override.allowedPaths || override.deniedPaths || override.notes) {
      overrides.push(override);
    }
  }

  return overrides;
}

/**
 * Build scope guardrails for a specific feature
 */
export function buildScopeGuardrails(
  featureId: string | undefined,
  projectConfig: ProjectScopeConfig | null
): ScopeGuardrails {
  // Start with defaults
  const guardrails: ScopeGuardrails = {
    allowedPaths: [...DEFAULT_ALLOWED_PATHS],
    deniedPaths: [...DEFAULT_PROTECTED_PATHS],
    deniedActions: [...DEFAULT_DENIED_ACTIONS],
    customInstructions: [],
  };

  if (!projectConfig) {
    return guardrails;
  }

  // Apply project-wide config
  if (projectConfig.defaultAllowedPaths.length > 0) {
    guardrails.allowedPaths = projectConfig.defaultAllowedPaths;
  }

  guardrails.deniedPaths = [
    ...new Set([...guardrails.deniedPaths, ...projectConfig.protectedPaths]),
  ];

  // Apply feature-specific overrides
  if (featureId) {
    const featureOverride = projectConfig.featureOverrides.find(
      (o) => o.featureId.toUpperCase() === featureId.toUpperCase()
    );

    if (featureOverride) {
      if (featureOverride.allowedPaths) {
        guardrails.allowedPaths = [
          ...guardrails.allowedPaths,
          ...featureOverride.allowedPaths,
        ];
      }
      if (featureOverride.deniedPaths) {
        guardrails.deniedPaths = [
          ...guardrails.deniedPaths,
          ...featureOverride.deniedPaths,
        ];
      }
      if (featureOverride.notes) {
        guardrails.customInstructions.push(featureOverride.notes);
      }
    }
  }

  return guardrails;
}

/**
 * Generate detailed scope instructions for worker prompt
 */
export function generateScopeInstructions(
  featureId: string | undefined,
  guardrails: ScopeGuardrails
): string {
  const lines: string[] = [];

  lines.push('## ⚠️ SCOPE GUARDRAILS - MUST FOLLOW');
  lines.push('');

  if (featureId) {
    lines.push(`You are a Claude Worker assigned to feature **${featureId}**.`);
    lines.push('');
  }

  lines.push('### ✅ Allowed');
  lines.push('');
  lines.push('You MAY modify files matching these patterns:');
  for (const pattern of guardrails.allowedPaths) {
    lines.push(`- \`${pattern}\``);
  }
  lines.push('');

  lines.push('### ❌ Protected Files - DO NOT MODIFY');
  lines.push('');
  lines.push('These files are protected and must NOT be modified:');
  for (const pattern of guardrails.deniedPaths.slice(0, 15)) {
    lines.push(`- \`${pattern}\``);
  }
  if (guardrails.deniedPaths.length > 15) {
    lines.push(`- *(and ${guardrails.deniedPaths.length - 15} more)*`);
  }
  lines.push('');

  lines.push('### 🚫 Prohibited Actions');
  lines.push('');
  lines.push('You must NOT:');
  for (const action of guardrails.deniedActions) {
    lines.push(`- ${action}`);
  }
  lines.push('');

  lines.push('### 📋 General Rules');
  lines.push('');
  lines.push('1. **Stay focused**: Only modify files directly related to this task');
  lines.push('2. **Minimal changes**: Do not refactor or "improve" unrelated code');
  lines.push('3. **No scope creep**: If you discover related issues, note them but do not fix them');
  lines.push('4. **Preserve structure**: Follow existing code patterns and conventions');
  lines.push('5. **Test your changes**: Ensure all tests pass before completing');
  lines.push('');

  if (guardrails.customInstructions.length > 0) {
    lines.push('### 📝 Additional Instructions');
    lines.push('');
    for (const instruction of guardrails.customInstructions) {
      lines.push(instruction);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Check if a file path is allowed by the guardrails
 *
 * Uses simple glob-like matching:
 * - ** matches any path segments
 * - * matches any characters except /
 */
export function isPathAllowed(
  filePath: string,
  guardrails: ScopeGuardrails
): { allowed: boolean; reason: string } {
  // Normalize path
  const normalizedPath = filePath.replace(/^\.\//, '').replace(/\\/g, '/');

  // Check denied paths first (they take precedence)
  for (const pattern of guardrails.deniedPaths) {
    if (matchesPattern(normalizedPath, pattern)) {
      return {
        allowed: false,
        reason: `Path matches protected pattern: ${pattern}`,
      };
    }
  }

  // Check if explicitly allowed
  for (const pattern of guardrails.allowedPaths) {
    if (matchesPattern(normalizedPath, pattern)) {
      return {
        allowed: true,
        reason: `Path matches allowed pattern: ${pattern}`,
      };
    }
  }

  // Default: not explicitly allowed
  return {
    allowed: false,
    reason: 'Path does not match any allowed patterns',
  };
}

/**
 * Simple glob pattern matching
 */
export function matchesPattern(filePath: string, pattern: string): boolean {
  // Handle special case: **/* at end should match any file at any depth
  // Convert src/**/* to match src/file.ts, src/dir/file.ts, etc.
  let regexStr = pattern
    // Escape regex special chars except * and /
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    // Handle **/* pattern (any path with at least one segment)
    .replace(/\*\*\/\*/g, '(?:.+)')
    // Handle ** (match any path segments including empty)
    .replace(/\*\*/g, '.*')
    // Handle * (match any characters except /)
    .replace(/\*/g, '[^/]*');

  // Anchor the pattern
  regexStr = '^' + regexStr + '$';

  try {
    const regex = new RegExp(regexStr);
    return regex.test(filePath);
  } catch {
    return false;
  }
}

/**
 * Validate a list of files against guardrails
 */
export function validateFiles(
  files: string[],
  guardrails: ScopeGuardrails
): {
  allowed: string[];
  denied: Array<{ path: string; reason: string }>;
} {
  const allowed: string[] = [];
  const denied: Array<{ path: string; reason: string }> = [];

  for (const file of files) {
    const result = isPathAllowed(file, guardrails);
    if (result.allowed) {
      allowed.push(file);
    } else {
      denied.push({ path: file, reason: result.reason });
    }
  }

  return { allowed, denied };
}

/**
 * Get a summary of the guardrails for logging/display
 */
export function summarizeGuardrails(guardrails: ScopeGuardrails): string {
  return [
    `Allowed: ${guardrails.allowedPaths.length} patterns`,
    `Protected: ${guardrails.deniedPaths.length} patterns`,
    `Denied actions: ${guardrails.deniedActions.length}`,
    `Custom instructions: ${guardrails.customInstructions.length}`,
  ].join(', ');
}
