/**
 * GitHub Repository Manager
 *
 * Handles repository initialization and detection for projects.
 * Works with gh CLI for zero-config GitHub integration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import {
  isGitHubAvailable,
  getCurrentRepo,
  createRepo,
  GitHubRepo,
  GitHubClientResult,
} from './client.js';

export interface RepoStatus {
  /** gh CLI is available and authenticated */
  ghAvailable: boolean;
  /** Directory is a git repository */
  isGitRepo: boolean;
  /** Has a remote origin configured */
  hasRemote: boolean;
  /** Remote is a GitHub repository */
  isGitHubRepo: boolean;
  /** Repository info (if available) */
  repo?: GitHubRepo;
}

/**
 * Check the current repository status
 */
export async function getRepoStatus(projectDir: string = process.cwd()): Promise<RepoStatus> {
  const status: RepoStatus = {
    ghAvailable: false,
    isGitRepo: false,
    hasRemote: false,
    isGitHubRepo: false,
  };

  // Check gh CLI
  status.ghAvailable = await isGitHubAvailable();

  // Check if git repo
  const gitDir = path.join(projectDir, '.git');
  status.isGitRepo = fs.existsSync(gitDir);

  if (!status.isGitRepo) {
    return status;
  }

  // Check for remote
  const remoteResult = await runGitCommand(['remote', 'get-url', 'origin'], projectDir);
  status.hasRemote = remoteResult.success;

  if (!status.hasRemote || !status.ghAvailable) {
    return status;
  }

  // Check if it's a GitHub repo
  const repoResult = await getCurrentRepo();
  if (repoResult.success && repoResult.data) {
    status.isGitHubRepo = true;
    status.repo = repoResult.data;
  }

  return status;
}

/**
 * Initialize a git repository if needed
 */
export async function initGitRepo(projectDir: string = process.cwd()): Promise<GitHubClientResult<void>> {
  const gitDir = path.join(projectDir, '.git');

  if (fs.existsSync(gitDir)) {
    return { success: true };
  }

  const result = await runGitCommand(['init'], projectDir);
  return { success: result.success, error: result.error };
}

/**
 * Create initial commit if repo is empty
 */
export async function createInitialCommit(
  projectDir: string = process.cwd(),
  message: string = 'Initial commit'
): Promise<GitHubClientResult<void>> {
  // Check if there are any commits
  const logResult = await runGitCommand(['log', '--oneline', '-1'], projectDir);

  if (logResult.success) {
    // Already has commits
    return { success: true };
  }

  // Stage all files
  const addResult = await runGitCommand(['add', '-A'], projectDir);
  if (!addResult.success) {
    return { success: false, error: addResult.error };
  }

  // Create commit
  const commitResult = await runGitCommand(['commit', '-m', message], projectDir);
  return { success: commitResult.success, error: commitResult.error };
}

/**
 * Initialize a new GitHub repository for the project
 */
export async function initializeGitHubRepo(
  projectName: string,
  options: {
    description?: string;
    private?: boolean;
    projectDir?: string;
  } = {}
): Promise<GitHubClientResult<GitHubRepo>> {
  const projectDir = options.projectDir || process.cwd();

  // 1. Check gh CLI
  const ghAvailable = await isGitHubAvailable();
  if (!ghAvailable) {
    return {
      success: false,
      error: 'GitHub CLI (gh) is not available or not authenticated. Run: gh auth login',
    };
  }

  // 2. Initialize git if needed
  const initResult = await initGitRepo(projectDir);
  if (!initResult.success) {
    return {
      success: false,
      error: `Failed to initialize git: ${initResult.error}`,
    };
  }

  // 3. Create initial commit if needed
  const commitResult = await createInitialCommit(projectDir, 'Initial commit - project setup');
  if (!commitResult.success) {
    // If commit fails, might be because there's nothing to commit (empty dir)
    // That's okay, we'll continue
    if (process.env.CLAUDE_HERO_DEBUG === '1') {
      console.error('[WP Debug] Initial commit skipped:', commitResult.error);
    }
  }

  // 4. Create GitHub repo
  const repoResult = await createRepo(projectName, {
    private: options.private !== false,
    description: options.description,
    pushSource: true,
  });

  return repoResult;
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(projectDir: string = process.cwd()): Promise<string | null> {
  const result = await runGitCommand(['branch', '--show-current'], projectDir);
  if (result.success && result.data) {
    return result.data.trim();
  }
  return null;
}

/**
 * Create a feature branch
 */
export async function createFeatureBranch(
  featureId: string,
  projectDir: string = process.cwd()
): Promise<GitHubClientResult<string>> {
  const branchName = `feature/${featureId}`;

  // Check if branch already exists
  const existsResult = await runGitCommand(['rev-parse', '--verify', branchName], projectDir);
  if (existsResult.success) {
    // Branch exists, switch to it
    const checkoutResult = await runGitCommand(['checkout', branchName], projectDir);
    if (checkoutResult.success) {
      return { success: true, data: branchName };
    }
    return { success: false, error: `Failed to switch to branch ${branchName}` };
  }

  // Create and switch to new branch
  const createResult = await runGitCommand(['checkout', '-b', branchName], projectDir);
  if (createResult.success) {
    return { success: true, data: branchName };
  }

  return { success: false, error: `Failed to create branch ${branchName}: ${createResult.error}` };
}

/**
 * Push current branch to origin
 */
export async function pushBranch(
  projectDir: string = process.cwd(),
  options: { setUpstream?: boolean } = {}
): Promise<GitHubClientResult<void>> {
  const args = ['push'];

  if (options.setUpstream) {
    const branch = await getCurrentBranch(projectDir);
    if (branch) {
      args.push('-u', 'origin', branch);
    }
  }

  const result = await runGitCommand(args, projectDir);
  return { success: result.success, error: result.error };
}

/**
 * Check if there are uncommitted changes
 */
export async function hasUncommittedChanges(projectDir: string = process.cwd()): Promise<boolean> {
  const result = await runGitCommand(['status', '--porcelain'], projectDir);
  return result.success && !!result.data?.trim();
}

/**
 * Run a git command
 */
async function runGitCommand(
  args: string[],
  projectDir: string
): Promise<GitHubClientResult<string>> {
  return new Promise((resolve) => {
    if (process.env.CLAUDE_HERO_DEBUG === '1') {
      console.error(`[WP Debug] Running: git ${args.join(' ')}`);
    }

    const child = spawn('git', args, {
      cwd: projectDir,
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
      if (code === 0) {
        resolve({ success: true, data: stdout });
      } else {
        resolve({ success: false, error: stderr.trim() || `git command failed with code ${code}` });
      }
    });

    child.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });
  });
}
