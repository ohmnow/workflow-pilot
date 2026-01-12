import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import {
  AutoMergeResult,
  AutoMergeOptions,
  processAutoMerge,
  processMultiplePRs,
  summarizeAutoMergeResults,
  isAutoMergeSupported,
} from './auto-merge.js';
import { AutopilotConfig, DEFAULT_AUTOPILOT_CONFIG } from '../orchestrator/autopilot-config.js';

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
    if (stdout) {
      process.stdout.emit('data', Buffer.from(stdout));
    }
    process.emit('close', code);
  }, 0);

  return process;
}

describe('AutoMerge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('processAutoMerge with auto strategy', () => {
    it('should merge when CI passes', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      // Mock PR status check - PR details
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'MERGEABLE',
      })));

      // Mock PR checks
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      // Mock isPRReadyToMerge - PR details again
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'MERGEABLE',
      })));

      // Mock isPRReadyToMerge - checks again
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      // Mock merge command
      mockSpawn.mockReturnValueOnce(createMockProcess('', 0));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'auto',
      };

      const result = await processAutoMerge(123, { config });

      expect(result.success).toBe(true);
      expect(result.action).toBe('merged');
      expect(result.strategy).toBe('auto');
    });

    it('should return pending when CI is still running', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      // Mock PR status check
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'IN_PROGRESS', conclusion: null },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      // Mock isPRReadyToMerge calls
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'IN_PROGRESS', conclusion: null },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      // Mock auto-merge enable
      mockSpawn.mockReturnValueOnce(createMockProcess('', 0));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'auto',
      };

      const result = await processAutoMerge(123, { config });

      expect(result.success).toBe(true);
      expect(result.action).toBe('pending');
      expect(result.message).toContain('Auto-merge enabled');
    });

    it('should fail when CI fails', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'FAILURE' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      // Mock isPRReadyToMerge calls
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'FAILURE' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'auto',
      };

      const result = await processAutoMerge(123, { config });

      expect(result.success).toBe(false);
      expect(result.action).toBe('failed');
    });

    it('should support dry run', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'MERGEABLE',
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      // isPRReadyToMerge
      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
        mergeable: 'MERGEABLE',
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'auto',
      };

      const result = await processAutoMerge(123, { config, dryRun: true });

      expect(result.success).toBe(true);
      expect(result.action).toBe('merged');
      expect(result.message).toContain('DRY RUN');
    });
  });

  describe('processAutoMerge with review strategy', () => {
    it('should add label when CI passes', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      // Mock label command
      mockSpawn.mockReturnValueOnce(createMockProcess('', 0));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'review',
        reviewLabel: 'ready-for-review',
      };

      const result = await processAutoMerge(123, { config });

      expect(result.success).toBe(true);
      expect(result.action).toBe('labeled');
      expect(result.message).toContain('ready-for-review');
    });

    it('should return pending when CI is running', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'IN_PROGRESS', conclusion: null },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'review',
      };

      const result = await processAutoMerge(123, { config });

      expect(result.success).toBe(true);
      expect(result.action).toBe('pending');
    });

    it('should fail when CI fails', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'FAILURE' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'review',
      };

      const result = await processAutoMerge(123, { config });

      expect(result.success).toBe(false);
      expect(result.action).toBe('failed');
    });

    it('should support dry run', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        state: 'OPEN',
        isDraft: false,
      })));

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify([
        { name: 'test', state: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'build', state: 'COMPLETED', conclusion: 'SUCCESS' },
      ])));

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'review',
      };

      const result = await processAutoMerge(123, { config, dryRun: true });

      expect(result.success).toBe(true);
      expect(result.action).toBe('labeled');
      expect(result.message).toContain('DRY RUN');
    });
  });

  describe('processAutoMerge with manual strategy', () => {
    it('should skip action', async () => {
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
        prStrategy: 'manual',
      };

      const result = await processAutoMerge(123, { config });

      expect(result.success).toBe(true);
      expect(result.action).toBe('skipped');
      expect(result.message).toContain('Manual strategy');
    });
  });

  describe('summarizeAutoMergeResults', () => {
    it('should summarize merged PRs', () => {
      const results = new Map<number, AutoMergeResult>([
        [1, { success: true, action: 'merged', message: '', prNumber: 1, strategy: 'auto' }],
        [2, { success: true, action: 'merged', message: '', prNumber: 2, strategy: 'auto' }],
      ]);

      const summary = summarizeAutoMergeResults(results);

      expect(summary).toContain('Merged');
      expect(summary).toContain('#1');
      expect(summary).toContain('#2');
    });

    it('should summarize labeled PRs', () => {
      const results = new Map<number, AutoMergeResult>([
        [1, { success: true, action: 'labeled', message: '', prNumber: 1, strategy: 'review' }],
      ]);

      const summary = summarizeAutoMergeResults(results);

      expect(summary).toContain('Labeled');
      expect(summary).toContain('#1');
    });

    it('should summarize pending PRs', () => {
      const results = new Map<number, AutoMergeResult>([
        [1, { success: true, action: 'pending', message: '', prNumber: 1, strategy: 'auto' }],
      ]);

      const summary = summarizeAutoMergeResults(results);

      expect(summary).toContain('Pending');
    });

    it('should summarize failed PRs', () => {
      const results = new Map<number, AutoMergeResult>([
        [1, { success: false, action: 'failed', message: '', prNumber: 1, strategy: 'auto' }],
      ]);

      const summary = summarizeAutoMergeResults(results);

      expect(summary).toContain('Failed');
    });

    it('should summarize skipped PRs', () => {
      const results = new Map<number, AutoMergeResult>([
        [1, { success: true, action: 'skipped', message: '', prNumber: 1, strategy: 'manual' }],
      ]);

      const summary = summarizeAutoMergeResults(results);

      expect(summary).toContain('Skipped');
    });

    it('should handle empty results', () => {
      const results = new Map<number, AutoMergeResult>();

      const summary = summarizeAutoMergeResults(results);

      expect(summary).toContain('No PRs processed');
    });

    it('should summarize mixed results', () => {
      const results = new Map<number, AutoMergeResult>([
        [1, { success: true, action: 'merged', message: '', prNumber: 1, strategy: 'auto' }],
        [2, { success: true, action: 'labeled', message: '', prNumber: 2, strategy: 'review' }],
        [3, { success: true, action: 'pending', message: '', prNumber: 3, strategy: 'auto' }],
        [4, { success: false, action: 'failed', message: '', prNumber: 4, strategy: 'auto' }],
      ]);

      const summary = summarizeAutoMergeResults(results);

      expect(summary).toContain('Merged');
      expect(summary).toContain('Labeled');
      expect(summary).toContain('Pending');
      expect(summary).toContain('Failed');
    });
  });

  describe('processMultiplePRs', () => {
    it('should process multiple PRs sequentially', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      // All PRs will use manual strategy for simplicity
      mockSpawn.mockImplementation(() => {
        return createMockProcess(JSON.stringify({
          state: 'OPEN',
          isDraft: false,
        }));
      });

      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        prStrategy: 'manual',
      };

      const results = await processMultiplePRs([1, 2, 3], { config });

      expect(results.size).toBe(3);
      expect(results.has(1)).toBe(true);
      expect(results.has(2)).toBe(true);
      expect(results.has(3)).toBe(true);
    });
  });

  describe('isAutoMergeSupported', () => {
    it('should return true when auto-merge is allowed', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        autoMergeAllowed: true,
      })));

      const result = await isAutoMergeSupported();

      expect(result).toBe(true);
    });

    it('should return false when auto-merge is not allowed', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess(JSON.stringify({
        autoMergeAllowed: false,
      })));

      const result = await isAutoMergeSupported();

      expect(result).toBe(false);
    });

    it('should handle errors gracefully', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess('', 1));

      const result = await isAutoMergeSupported();

      // Default to true if we can't check
      expect(result).toBe(true);
    });
  });

  describe('AutoMergeResult interface', () => {
    it('should have correct action values', () => {
      const actions: AutoMergeResult['action'][] = ['merged', 'labeled', 'skipped', 'pending', 'failed'];

      expect(actions).toContain('merged');
      expect(actions).toContain('labeled');
      expect(actions).toContain('skipped');
      expect(actions).toContain('pending');
      expect(actions).toContain('failed');
    });
  });

  describe('AutoMergeOptions', () => {
    it('should support merge method options', () => {
      const options: AutoMergeOptions = {
        mergeMethod: 'squash',
        deleteBranch: true,
        dryRun: false,
      };

      expect(options.mergeMethod).toBe('squash');
      expect(options.deleteBranch).toBe(true);
    });
  });
});
