/**
 * GitHub Client Tests
 *
 * Note: These tests mock the gh CLI since we can't run actual GitHub commands in tests.
 * For integration testing, use manual testing with a real GitHub account.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as child_process from 'child_process';

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Import after mocking
import {
  isGitHubAvailable,
  getCurrentRepo,
  createIssue,
  listOpenIssues,
} from './client.js';

describe('GitHub Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isGitHubAvailable', () => {
    it('returns true when gh auth status succeeds', async () => {
      const mockSpawn = vi.mocked(child_process.spawn);
      const mockProcess = createMockProcess(0, 'Logged in to github.com');
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await isGitHubAvailable();

      expect(result).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith('gh', ['auth', 'status'], expect.any(Object));
    });

    it('returns false when gh auth status fails', async () => {
      const mockSpawn = vi.mocked(child_process.spawn);
      const mockProcess = createMockProcess(1, '', 'not logged in');
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await isGitHubAvailable();

      expect(result).toBe(false);
    });

    it('returns false when gh is not installed', async () => {
      const mockSpawn = vi.mocked(child_process.spawn);
      const mockProcess = createMockProcess(null, '', '', new Error('spawn gh ENOENT'));
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await isGitHubAvailable();

      expect(result).toBe(false);
    });
  });

  describe('getCurrentRepo', () => {
    it('returns repo info when in a GitHub repo', async () => {
      const mockSpawn = vi.mocked(child_process.spawn);
      const repoData = JSON.stringify({
        owner: { login: 'testuser' },
        name: 'testrepo',
        url: 'https://github.com/testuser/testrepo',
        isPrivate: true,
      });
      const mockProcess = createMockProcess(0, repoData);
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await getCurrentRepo();

      expect(result.success).toBe(true);
      expect(result.data).toEqual({
        owner: 'testuser',
        name: 'testrepo',
        url: 'https://github.com/testuser/testrepo',
        private: true,
      });
    });

    it('returns error when not in a GitHub repo', async () => {
      const mockSpawn = vi.mocked(child_process.spawn);
      const mockProcess = createMockProcess(1, '', 'not a git repository');
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await getCurrentRepo();

      expect(result.success).toBe(false);
      expect(result.error).toContain('not a git repository');
    });
  });

  describe('createIssue', () => {
    it('creates an issue with title and body', async () => {
      const mockSpawn = vi.mocked(child_process.spawn);
      const issueData = JSON.stringify({
        number: 42,
        title: 'Test Issue',
        body: 'Test body',
        state: 'open',
        labels: [{ name: 'feature' }],
        url: 'https://github.com/test/repo/issues/42',
      });
      const mockProcess = createMockProcess(0, issueData);
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await createIssue('Test Issue', 'Test body', {
        labels: ['feature'],
      });

      expect(result.success).toBe(true);
      expect(result.data?.number).toBe(42);
      expect(result.data?.labels).toEqual(['feature']);
    });
  });

  describe('listOpenIssues', () => {
    it('returns list of open issues', async () => {
      const mockSpawn = vi.mocked(child_process.spawn);
      const issuesData = JSON.stringify([
        {
          number: 1,
          title: 'Issue 1',
          body: 'Body 1',
          state: 'open',
          labels: [{ name: 'bug' }],
          url: 'https://github.com/test/repo/issues/1',
        },
        {
          number: 2,
          title: 'Issue 2',
          body: 'Body 2',
          state: 'open',
          labels: [],
          url: 'https://github.com/test/repo/issues/2',
        },
      ]);
      const mockProcess = createMockProcess(0, issuesData);
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await listOpenIssues();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].number).toBe(1);
      expect(result.data?.[0].labels).toEqual(['bug']);
    });

    it('returns empty array when no issues', async () => {
      const mockSpawn = vi.mocked(child_process.spawn);
      const mockProcess = createMockProcess(0, '[]');
      mockSpawn.mockReturnValue(mockProcess as any);

      const result = await listOpenIssues();

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });
});

/**
 * Helper to create a mock child process
 */
function createMockProcess(
  exitCode: number | null,
  stdout: string = '',
  stderr: string = '',
  error?: Error
) {
  const stdoutListeners: ((data: Buffer) => void)[] = [];
  const stderrListeners: ((data: Buffer) => void)[] = [];
  const closeListeners: ((code: number | null) => void)[] = [];
  const errorListeners: ((err: Error) => void)[] = [];

  const mockProcess = {
    stdout: {
      on: (event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') stdoutListeners.push(cb);
      },
    },
    stderr: {
      on: (event: string, cb: (data: Buffer) => void) => {
        if (event === 'data') stderrListeners.push(cb);
      },
    },
    on: (event: string, cb: any) => {
      if (event === 'close') closeListeners.push(cb);
      if (event === 'error') errorListeners.push(cb);
    },
    kill: vi.fn(),
  };

  // Simulate async event emission
  setTimeout(() => {
    if (error) {
      errorListeners.forEach(cb => cb(error));
    } else {
      if (stdout) stdoutListeners.forEach(cb => cb(Buffer.from(stdout)));
      if (stderr) stderrListeners.forEach(cb => cb(Buffer.from(stderr)));
      closeListeners.forEach(cb => cb(exitCode));
    }
  }, 0);

  return mockProcess;
}
