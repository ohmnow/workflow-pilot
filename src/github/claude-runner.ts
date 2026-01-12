/**
 * Claude Runner - Programmatic interface for headless Claude execution
 *
 * Provides TypeScript APIs to run Claude Code in non-interactive mode,
 * suitable for CI/CD pipelines and automated workflows.
 */

import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { ExtractedContext, generateWorkerPrompt, generateCompactPrompt } from './context-extractor.js';

/**
 * Options for running Claude
 */
export interface ClaudeRunnerOptions {
  /** Working directory for Claude */
  cwd?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Use compact prompt (fewer tokens) */
  compactPrompt?: boolean;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Callback for stdout data */
  onStdout?: (data: string) => void;
  /** Callback for stderr data */
  onStderr?: (data: string) => void;
}

/**
 * Result of Claude execution
 */
export interface ClaudeRunResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Default runner options
 */
export const DEFAULT_RUNNER_OPTIONS: Required<Omit<ClaudeRunnerOptions, 'onStdout' | 'onStderr'>> = {
  cwd: process.cwd(),
  timeout: 30 * 60 * 1000, // 30 minutes
  compactPrompt: false,
  env: {},
};

/**
 * Run Claude Code with a prompt
 */
export async function runClaude(
  prompt: string,
  options: ClaudeRunnerOptions = {}
): Promise<ClaudeRunResult> {
  const opts = { ...DEFAULT_RUNNER_OPTIONS, ...options };
  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    // Spawn Claude with --print flag for non-interactive mode
    const child = spawn('claude', ['--print'], {
      cwd: opts.cwd,
      env: {
        ...process.env,
        ...opts.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Send prompt to stdin
    child.stdin?.write(prompt);
    child.stdin?.end();

    // Collect stdout
    child.stdout?.on('data', (data) => {
      const chunk = data.toString();
      stdout += chunk;
      opts.onStdout?.(chunk);
    });

    // Collect stderr
    child.stderr?.on('data', (data) => {
      const chunk = data.toString();
      stderr += chunk;
      opts.onStderr?.(chunk);
    });

    // Handle completion
    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      resolve({
        success: code === 0 && !timedOut,
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        durationMs,
      });
    });

    // Handle errors
    child.on('error', (error) => {
      const durationMs = Date.now() - startTime;
      resolve({
        success: false,
        exitCode: null,
        stdout,
        stderr: stderr + '\n' + error.message,
        timedOut: false,
        durationMs,
      });
    });

    // Set timeout
    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      // Give it a moment to cleanup, then force kill
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, opts.timeout);

    child.on('close', () => clearTimeout(timeoutId));
  });
}

/**
 * Run Claude with extracted context
 */
export async function runClaudeWithContext(
  context: ExtractedContext,
  options: ClaudeRunnerOptions = {}
): Promise<ClaudeRunResult> {
  const prompt = options.compactPrompt
    ? generateCompactPrompt(context)
    : generateWorkerPrompt(context);

  return runClaude(prompt, options);
}

/**
 * Check if Claude CLI is available
 */
export async function isClaudeAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.on('close', (code) => {
      resolve(code === 0);
    });

    child.on('error', () => {
      resolve(false);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}

/**
 * Get Claude CLI version
 */
export async function getClaudeVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    let output = '';

    const child = spawn('claude', ['--version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data) => {
      output += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0 && output.trim()) {
        resolve(output.trim());
      } else {
        resolve(null);
      }
    });

    child.on('error', () => {
      resolve(null);
    });
  });
}

/**
 * Get path to the worker shell script
 */
export function getWorkerScriptPath(): string {
  // Try multiple locations
  const possiblePaths = [
    path.join(__dirname, '../../scripts/claude-worker.sh'),
    path.join(process.cwd(), 'scripts/claude-worker.sh'),
    path.join(process.cwd(), 'node_modules/workflow-pilot/scripts/claude-worker.sh'),
  ];

  for (const scriptPath of possiblePaths) {
    if (fs.existsSync(scriptPath)) {
      return scriptPath;
    }
  }

  // Return default path even if it doesn't exist
  return possiblePaths[0];
}

/**
 * Run the worker shell script
 */
export async function runWorkerScript(
  issueNumber: number,
  options: {
    dryRun?: boolean;
    branch?: string;
    noCommit?: boolean;
    noPR?: boolean;
    timeout?: number;
    cwd?: string;
  } = {}
): Promise<ClaudeRunResult> {
  const scriptPath = getWorkerScriptPath();
  const args: string[] = [String(issueNumber)];

  if (options.dryRun) {
    args.push('--dry-run');
  }
  if (options.branch) {
    args.push('--branch', options.branch);
  }
  if (options.noCommit) {
    args.push('--no-commit');
  }
  if (options.noPR) {
    args.push('--no-pr');
  }
  if (options.timeout) {
    args.push('--timeout', String(options.timeout));
  }

  const startTime = Date.now();

  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';

    const child = spawn('bash', [scriptPath, ...args], {
      cwd: options.cwd || process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
        timedOut: false,
        durationMs: Date.now() - startTime,
      });
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        exitCode: null,
        stdout,
        stderr: error.message,
        timedOut: false,
        durationMs: Date.now() - startTime,
      });
    });
  });
}

/**
 * Parse exit code to human-readable message
 */
export function getExitCodeMessage(exitCode: number | null): string {
  switch (exitCode) {
    case 0:
      return 'Success';
    case 1:
      return 'Invalid arguments';
    case 2:
      return 'Missing dependencies';
    case 3:
      return 'GitHub API error';
    case 4:
      return 'Claude execution error';
    case 5:
      return 'Git operation error';
    case null:
      return 'Process terminated abnormally';
    default:
      return `Unknown error (exit code ${exitCode})`;
  }
}
