import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import {
  CICheck,
  PRStatus,
  PRStatusResult,
  checkPRStatus,
  isPRReadyToMerge,
  checkMultiplePRStatus,
  formatCheckList,
} from './ci-gate-checker.js';
import { AutopilotConfig, DEFAULT_AUTOPILOT_CONFIG } from '../hero/autopilot-config.js';

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Helper to create mock spawn process
function createMockProcess(stdout: string, code: number = 0): any {
  const process = new EventEmitter() as any;
  process.stdout = new EventEmitter();
  process.stderr = new EventEmitter();

  setTimeout(() => {
    process.stdout.emit('data', Buffer.from(stdout));
    process.emit('close', code);
  }, 0);

  return process;
}

describe('CIGateChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkPRStatus', () => {
    it('should return pass when all checks succeed', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      // First call: PR details
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'MERGEABLE',
        reviewDecision: 'APPROVED',
      })));

      // Second call: PR checks
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const status = await checkPRStatus(123);

      expect(status.result).toBe('pass');
      expect(status.passedChecks).toContain('test');
      expect(status.passedChecks).toContain('build');
      expect(status.failedChecks).toHaveLength(0);
      expect(status.pendingChecks).toHaveLength(0);
    });

    it('should return fail when required check fails', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'MERGEABLE',
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'FAILURE' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        requiredChecks: ['test', 'build'],
      };

      const status = await checkPRStatus(123, { config });

      expect(status.result).toBe('fail');
      expect(status.failedChecks).toContain('test');
      expect(status.passedChecks).toContain('build');
    });

    it('should return pending when checks are in progress', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'IN_PROGRESS', conclusion: null },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const status = await checkPRStatus(123);

      expect(status.result).toBe('pending');
      expect(status.pendingChecks).toContain('test');
      expect(status.passedChecks).toContain('build');
    });

    it('should return pending for draft PRs', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: true,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const status = await checkPRStatus(123);

      expect(status.result).toBe('pending');
      expect(status.draft).toBe(true);
    });

    it('should handle neutral and skipped as passing', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'lint', state: 'COMPLETED', conclusion: 'NEUTRAL' },
        { name: 'optional', state: 'COMPLETED', conclusion: 'SKIPPED' },
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      // Use default config which requires 'test' and 'build'
      const status = await checkPRStatus(123);

      expect(status.result).toBe('pass');
      expect(status.passedChecks).toContain('lint');
      expect(status.passedChecks).toContain('optional');
      expect(status.passedChecks).toContain('test');
    });

    it('should match required checks flexibly', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'Run tests', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'npm build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        requiredChecks: ['test', 'build'],
      };

      const status = await checkPRStatus(123, { config });

      expect(status.result).toBe('pass');
    });

    it('should handle empty checks list with no required checks', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess('[]'));

      // Explicitly set no required checks
      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        requiredChecks: [],
      };

      const status = await checkPRStatus(123, { config });

      expect(status.result).toBe('pass');
      expect(status.checks).toHaveLength(0);
    });

    it('should handle gh CLI errors gracefully', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess('', 1));
      mockSpawn.mockReturnValueOnce(createMockProcess('', 1));

      const status = await checkPRStatus(123);

      expect(status.state).toBe('unknown');
      expect(status.checks).toHaveLength(0);
    });

    it('should include mergeable status', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'CONFLICTING',
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess('[]'));

      const status = await checkPRStatus(123);

      expect(status.mergeable).toBe(false);
    });

    it('should include review decision', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        reviewDecision: 'CHANGES_REQUESTED',
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess('[]'));

      const status = await checkPRStatus(123);

      expect(status.reviewDecision).toBe('CHANGES_REQUESTED');
    });
  });

  describe('isPRReadyToMerge', () => {
    it('should return ready when all checks pass', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'MERGEABLE',
        reviewDecision: 'APPROVED',
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const result = await isPRReadyToMerge(123);

      expect(result.ready).toBe(true);
      expect(result.reason).toContain('mergeable');
    });

    it('should return not ready for draft PRs', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: true,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess('[]'));

      const result = await isPRReadyToMerge(123);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('draft');
    });

    it('should return not ready when checks fail', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'FAILURE' },
      ])));

      const result = await isPRReadyToMerge(123);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('failed');
    });

    it('should return not ready when changes requested', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        reviewDecision: 'CHANGES_REQUESTED',
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const result = await isPRReadyToMerge(123);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('Changes');
    });

    it('should return not ready for closed PRs', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'CLOSED',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess('[]'));

      const result = await isPRReadyToMerge(123);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('closed');
    });

    it('should return not ready when merge conflicts exist', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'CONFLICTING',
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const result = await isPRReadyToMerge(123);

      expect(result.ready).toBe(false);
      expect(result.reason).toContain('conflicts');
    });
  });

  describe('checkMultiplePRStatus', () => {
    it('should check multiple PRs and return results map', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      // Mock implementation that returns consistent data regardless of call order
      mockSpawn.mockImplementation(() => {
        return createMockProcess(JSON.stringify({
          state: 'OPEN',
          isDraft: false,
        }));
      });

      const results = await checkMultiplePRStatus([1, 2, 3]);

      // Should return results for all PRs
      expect(results.size).toBe(3);
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(true);
      expect(results.has(3)).toBe(true);

      // Each result should have required properties
      for (const [prNum, status] of results) {
        expect(status.prNumber).toBe(prNum);
        expect(['pass', 'fail', 'pending']).toContain(status.result);
      }
    });
  });

  describe('formatCheckList', () => {
    it('should format check list with emojis', () => {
      const status: PRStatus = {
        prNumber: 123,
        result: 'pass',
        checks: [
          { name: 'test', status: 'completed', conclusion: 'success' },
          { name: 'build', status: 'completed', conclusion: 'success' },
        ],
        requiredChecks: ['test', 'build'],
        passedChecks: ['test', 'build'],
        failedChecks: [],
        pendingChecks: [],
        mergeable: true,
        state: 'open',
        draft: false,
        reviewDecision: null,
        summary: 'All checks pass',
      };

      const output = formatCheckList(status);

      expect(output).toContain('PR #123');
      expect(output).toContain('✅');
      expect(output).toContain('test');
      expect(output).toContain('build');
    });

    it('should show pending checks', () => {
      const status: PRStatus = {
        prNumber: 456,
        result: 'pending',
        checks: [
          { name: 'test', status: 'in_progress', conclusion: null },
        ],
        requiredChecks: ['test'],
        passedChecks: [],
        failedChecks: [],
        pendingChecks: ['test'],
        mergeable: null,
        state: 'open',
        draft: false,
        reviewDecision: null,
        summary: 'Checks pending',
      };

      const output = formatCheckList(status);

      expect(output).toContain('⏳');
      expect(output).toContain('test');
    });

    it('should show failed checks', () => {
      const status: PRStatus = {
        prNumber: 789,
        result: 'fail',
        checks: [
          { name: 'test', status: 'completed', conclusion: 'failure' },
        ],
        requiredChecks: ['test'],
        passedChecks: [],
        failedChecks: ['test'],
        pendingChecks: [],
        mergeable: true,
        state: 'open',
        draft: false,
        reviewDecision: null,
        summary: 'Checks failed',
      };

      const output = formatCheckList(status);

      expect(output).toContain('❌');
      expect(output).toContain('test');
    });

    it('should handle empty checks', () => {
      const status: PRStatus = {
        prNumber: 100,
        result: 'pass',
        checks: [],
        requiredChecks: [],
        passedChecks: [],
        failedChecks: [],
        pendingChecks: [],
        mergeable: true,
        state: 'open',
        draft: false,
        reviewDecision: null,
        summary: 'No checks',
      };

      const output = formatCheckList(status);

      expect(output).toContain('No CI checks found');
    });
  });

  describe('CICheck interface', () => {
    it('should have correct status values', () => {
      const check: CICheck = {
        name: 'test',
        status: 'completed',
        conclusion: 'success',
      };

      expect(['queued', 'in_progress', 'completed']).toContain(check.status);
      expect(['success', 'failure', 'neutral', 'cancelled', 'skipped', 'timed_out', 'action_required', 'pending', null]).toContain(check.conclusion);
    });
  });

  describe('PRStatusResult type', () => {
    it('should have correct values', () => {
      const results: PRStatusResult[] = ['pass', 'fail', 'pending'];

      expect(results).toContain('pass');
      expect(results).toContain('fail');
      expect(results).toContain('pending');
    });
  });

  describe('required checks matching', () => {
    it('should match exact check names', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        requiredChecks: ['test'],
      };

      const status = await checkPRStatus(123, { config });
      expect(status.result).toBe('pass');
    });

    it('should match partial check names', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'CI / test (18.x)', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'CI / build (18.x)', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        requiredChecks: ['test', 'build'],
      };

      const status = await checkPRStatus(123, { config });
      expect(status.result).toBe('pass');
    });

    it('should fail when required check is missing', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'lint', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        requiredChecks: ['test'],
      };

      const status = await checkPRStatus(123, { config });
      expect(status.result).toBe('pending'); // pending because required check not found
    });
  });
});
