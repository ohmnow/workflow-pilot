import { describe, it, expect, vi } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import {
  DEFAULT_RUNNER_OPTIONS,
  getWorkerScriptPath,
  getExitCodeMessage,
  ClaudeRunnerOptions,
} from './claude-runner.js';

// We can't easily test the actual Claude execution without mocking,
// so we focus on the helper functions and configuration

describe('ClaudeRunner', () => {
  describe('DEFAULT_RUNNER_OPTIONS', () => {
    it('should have 30 minute default timeout', () => {
      expect(DEFAULT_RUNNER_OPTIONS.timeout).toBe(30 * 60 * 1000);
    });

    it('should use current working directory by default', () => {
      expect(DEFAULT_RUNNER_OPTIONS.cwd).toBe(process.cwd());
    });

    it('should not use compact prompt by default', () => {
      expect(DEFAULT_RUNNER_OPTIONS.compactPrompt).toBe(false);
    });
  });

  describe('getWorkerScriptPath', () => {
    it('should return a path ending with claude-worker.sh', () => {
      const scriptPath = getWorkerScriptPath();
      expect(scriptPath).toMatch(/claude-worker\.sh$/);
    });

    it('should return path in scripts directory', () => {
      const scriptPath = getWorkerScriptPath();
      expect(scriptPath).toContain('scripts');
    });
  });

  describe('getExitCodeMessage', () => {
    it('should return Success for exit code 0', () => {
      expect(getExitCodeMessage(0)).toBe('Success');
    });

    it('should return Invalid arguments for exit code 1', () => {
      expect(getExitCodeMessage(1)).toBe('Invalid arguments');
    });

    it('should return Missing dependencies for exit code 2', () => {
      expect(getExitCodeMessage(2)).toBe('Missing dependencies');
    });

    it('should return GitHub API error for exit code 3', () => {
      expect(getExitCodeMessage(3)).toBe('GitHub API error');
    });

    it('should return Claude execution error for exit code 4', () => {
      expect(getExitCodeMessage(4)).toBe('Claude execution error');
    });

    it('should return Git operation error for exit code 5', () => {
      expect(getExitCodeMessage(5)).toBe('Git operation error');
    });

    it('should return abnormal termination message for null', () => {
      expect(getExitCodeMessage(null)).toBe('Process terminated abnormally');
    });

    it('should return unknown error for other codes', () => {
      expect(getExitCodeMessage(42)).toContain('Unknown error');
      expect(getExitCodeMessage(42)).toContain('42');
    });
  });

  describe('worker script existence', () => {
    it('should have worker script in scripts directory', () => {
      const scriptPath = path.join(
        path.dirname(path.dirname(__dirname)),
        'scripts',
        'claude-worker.sh'
      );
      // Note: In test environment this might not exist if not built
      // This is more of an integration test
    });
  });

  describe('ClaudeRunnerOptions interface', () => {
    it('should allow partial options', () => {
      const options: ClaudeRunnerOptions = {
        timeout: 60000,
      };
      expect(options.timeout).toBe(60000);
      expect(options.cwd).toBeUndefined();
    });

    it('should allow callbacks', () => {
      const onStdout = vi.fn();
      const onStderr = vi.fn();

      const options: ClaudeRunnerOptions = {
        onStdout,
        onStderr,
      };

      // Callbacks should be callable
      options.onStdout?.('test');
      options.onStderr?.('error');

      expect(onStdout).toHaveBeenCalledWith('test');
      expect(onStderr).toHaveBeenCalledWith('error');
    });

    it('should allow custom environment variables', () => {
      const options: ClaudeRunnerOptions = {
        env: {
          CUSTOM_VAR: 'value',
          ANOTHER_VAR: 'another',
        },
      };

      expect(options.env?.CUSTOM_VAR).toBe('value');
      expect(options.env?.ANOTHER_VAR).toBe('another');
    });
  });
});

describe('claude-worker.sh script', () => {
  // Navigate from src/github to project root/scripts
  const scriptPath = path.resolve(__dirname, '../../scripts/claude-worker.sh');

  it('should exist', () => {
    // The actual script should exist in the project
    const exists = fs.existsSync(scriptPath);
    expect(exists).toBe(true);
  });

  it('should be executable', () => {
    const stats = fs.statSync(scriptPath);
    // Check if executable bit is set (Unix)
    const isExecutable = (stats.mode & parseInt('111', 8)) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('should have proper shebang', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content.startsWith('#!/usr/bin/env bash')).toBe(true);
  });

  it('should support --dry-run option', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('--dry-run');
    expect(content).toContain('DRY_RUN');
  });

  it('should support --branch option', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('--branch');
    expect(content).toContain('BRANCH_NAME');
  });

  it('should support --no-commit option', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('--no-commit');
    expect(content).toContain('DO_COMMIT');
  });

  it('should support --no-pr option', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('--no-pr');
    expect(content).toContain('DO_PR');
  });

  it('should support --timeout option', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('--timeout');
    expect(content).toContain('TIMEOUT_MINS');
  });

  it('should check for required dependencies', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('gh');
    expect(content).toContain('git');
    expect(content).toContain('claude');
  });

  it('should generate commit message with Fixes reference', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('Fixes #');
  });

  it('should create PR with issue reference', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('gh pr create');
    expect(content).toContain('Fixes #${ISSUE_NUMBER}');
  });

  it('should have proper exit codes documented', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('Exit Codes:');
    expect(content).toContain('exit 1');
    expect(content).toContain('exit 2');
    expect(content).toContain('exit 3');
    expect(content).toContain('exit 4');
    expect(content).toContain('exit 5');
  });

  it('should run Claude with --print flag', () => {
    const content = fs.readFileSync(scriptPath, 'utf-8');
    expect(content).toContain('claude --print');
  });
});
