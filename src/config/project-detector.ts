/**
 * Project Type Detector
 *
 * Detects the type of project based on configuration files
 * to apply appropriate rule presets.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Supported project types
 */
export type ProjectType =
  | 'react'
  | 'nextjs'
  | 'vue'
  | 'angular'
  | 'svelte'
  | 'node'
  | 'node-express'
  | 'node-fastify'
  | 'python'
  | 'python-django'
  | 'python-flask'
  | 'python-fastapi'
  | 'go'
  | 'rust'
  | 'unknown';

/**
 * Project information including type and flags
 */
export interface ProjectInfo {
  /** Primary project type */
  type: ProjectType;
  /** Is this a TypeScript project? */
  typescript: boolean;
  /** Is this a monorepo? */
  monorepo: boolean;
  /** Sub-projects in monorepo (if applicable) */
  subProjects?: { path: string; type: ProjectType }[];
  /** Detected test framework */
  testFramework?: 'jest' | 'vitest' | 'mocha' | 'pytest' | 'unittest' | 'go-test';
  /** Detected package manager */
  packageManager?: 'npm' | 'yarn' | 'pnpm' | 'pip' | 'poetry' | 'cargo' | 'go-mod';
}

// Cache for project detection
let cachedProjectInfo: ProjectInfo | null = null;
let cachedCwd: string | null = null;

/**
 * Read and parse package.json
 */
function readPackageJson(cwd: string): Record<string, unknown> | null {
  const packageJsonPath = join(cwd, 'package.json');
  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const content = readFileSync(packageJsonPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Check if a dependency exists in package.json
 */
function hasDependency(packageJson: Record<string, unknown>, dep: string): boolean {
  const deps = packageJson.dependencies as Record<string, string> | undefined;
  const devDeps = packageJson.devDependencies as Record<string, string> | undefined;

  return !!(deps?.[dep] || devDeps?.[dep]);
}

/**
 * Detect JavaScript/TypeScript project type from package.json
 */
function detectJsProjectType(packageJson: Record<string, unknown>): ProjectType {
  // Check for frameworks in priority order
  if (hasDependency(packageJson, 'next')) {
    return 'nextjs';
  }
  if (hasDependency(packageJson, 'react')) {
    return 'react';
  }
  if (hasDependency(packageJson, 'vue')) {
    return 'vue';
  }
  if (hasDependency(packageJson, '@angular/core')) {
    return 'angular';
  }
  if (hasDependency(packageJson, 'svelte')) {
    return 'svelte';
  }
  if (hasDependency(packageJson, 'fastify')) {
    return 'node-fastify';
  }
  if (hasDependency(packageJson, 'express')) {
    return 'node-express';
  }

  return 'node';
}

/**
 * Detect Python project type
 */
function detectPythonProjectType(cwd: string): ProjectType {
  // Check requirements.txt
  const requirementsPath = join(cwd, 'requirements.txt');
  if (existsSync(requirementsPath)) {
    try {
      const content = readFileSync(requirementsPath, 'utf-8').toLowerCase();
      if (content.includes('django')) return 'python-django';
      if (content.includes('flask')) return 'python-flask';
      if (content.includes('fastapi')) return 'python-fastapi';
    } catch {
      // Ignore read errors
    }
  }

  // Check pyproject.toml
  const pyprojectPath = join(cwd, 'pyproject.toml');
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, 'utf-8').toLowerCase();
      if (content.includes('django')) return 'python-django';
      if (content.includes('flask')) return 'python-flask';
      if (content.includes('fastapi')) return 'python-fastapi';
    } catch {
      // Ignore read errors
    }
  }

  // Check for any Python indicators
  if (existsSync(requirementsPath) || existsSync(pyprojectPath) || existsSync(join(cwd, 'setup.py'))) {
    return 'python';
  }

  return 'unknown';
}

/**
 * Detect test framework
 */
function detectTestFramework(cwd: string, packageJson: Record<string, unknown> | null): ProjectInfo['testFramework'] {
  if (packageJson) {
    if (hasDependency(packageJson, 'vitest')) return 'vitest';
    if (hasDependency(packageJson, 'jest')) return 'jest';
    if (hasDependency(packageJson, 'mocha')) return 'mocha';
  }

  // Python test frameworks
  if (existsSync(join(cwd, 'pytest.ini')) || existsSync(join(cwd, 'conftest.py'))) {
    return 'pytest';
  }

  // Go test (built-in)
  if (existsSync(join(cwd, 'go.mod'))) {
    return 'go-test';
  }

  return undefined;
}

/**
 * Detect package manager
 */
function detectPackageManager(cwd: string): ProjectInfo['packageManager'] {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(cwd, 'yarn.lock'))) return 'yarn';
  if (existsSync(join(cwd, 'package-lock.json'))) return 'npm';
  if (existsSync(join(cwd, 'poetry.lock'))) return 'poetry';
  if (existsSync(join(cwd, 'requirements.txt')) || existsSync(join(cwd, 'setup.py'))) return 'pip';
  if (existsSync(join(cwd, 'Cargo.lock'))) return 'cargo';
  if (existsSync(join(cwd, 'go.sum'))) return 'go-mod';

  return undefined;
}

/**
 * Check for monorepo indicators
 */
function detectMonorepo(cwd: string, packageJson: Record<string, unknown> | null): boolean {
  // Check for workspaces in package.json
  if (packageJson?.workspaces) {
    return true;
  }

  // Check for common monorepo directories
  const monorepoIndicators = [
    join(cwd, 'apps'),
    join(cwd, 'packages'),
    join(cwd, 'libs'),
    join(cwd, 'pnpm-workspace.yaml'),
    join(cwd, 'lerna.json'),
    join(cwd, 'nx.json'),
    join(cwd, 'turbo.json'),
  ];

  return monorepoIndicators.some((path) => existsSync(path));
}

/**
 * Detect project type and metadata
 *
 * @param cwd - Current working directory (defaults to process.cwd())
 * @param forceReload - Skip cache and re-detect
 */
export function detectProjectType(cwd?: string, forceReload = false): ProjectInfo {
  const workingDir = cwd || process.cwd();

  // Return cached if same directory and not forcing reload
  if (!forceReload && cachedProjectInfo && cachedCwd === workingDir) {
    return cachedProjectInfo;
  }

  const packageJson = readPackageJson(workingDir);
  const hasTypeScript = existsSync(join(workingDir, 'tsconfig.json'));
  const isMonorepo = detectMonorepo(workingDir, packageJson);

  let projectType: ProjectType = 'unknown';

  // Try JavaScript/TypeScript detection first
  if (packageJson) {
    projectType = detectJsProjectType(packageJson);
  }

  // If still unknown, try Python
  if (projectType === 'unknown') {
    projectType = detectPythonProjectType(workingDir);
  }

  // If still unknown, check for other languages
  if (projectType === 'unknown') {
    if (existsSync(join(workingDir, 'go.mod'))) {
      projectType = 'go';
    } else if (existsSync(join(workingDir, 'Cargo.toml'))) {
      projectType = 'rust';
    }
  }

  const projectInfo: ProjectInfo = {
    type: projectType,
    typescript: hasTypeScript,
    monorepo: isMonorepo,
    testFramework: detectTestFramework(workingDir, packageJson),
    packageManager: detectPackageManager(workingDir),
  };

  // Cache results
  cachedProjectInfo = projectInfo;
  cachedCwd = workingDir;

  if (process.env.CLAUDE_HERO_DEBUG === '1') {
    console.error(`[Claude Hero] Detected project type: ${projectType}`);
    console.error(`[Claude Hero] TypeScript: ${hasTypeScript}, Monorepo: ${isMonorepo}`);
  }

  return projectInfo;
}

/**
 * Clear cached project info
 */
export function clearProjectCache(): void {
  cachedProjectInfo = null;
  cachedCwd = null;
}

/**
 * Get the preset name for a project type
 */
export function getPresetName(projectType: ProjectType): string {
  switch (projectType) {
    case 'react':
    case 'nextjs':
    case 'vue':
    case 'angular':
    case 'svelte':
      return 'frontend';
    case 'node':
    case 'node-express':
    case 'node-fastify':
      return 'node';
    case 'python':
    case 'python-django':
    case 'python-flask':
    case 'python-fastapi':
      return 'python';
    case 'go':
      return 'go';
    case 'rust':
      return 'rust';
    default:
      return 'base';
  }
}
