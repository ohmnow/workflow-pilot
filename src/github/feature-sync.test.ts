import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as childProcess from 'child_process';
import { EventEmitter } from 'events';
import {
  parseFixesReferences,
  findFeatureByIssue,
  updateFeatureStatus,
  syncFeatureFromMergedPR,
  getRecentlyMergedPRs,
  MergedPRInfo,
  FeatureListFile,
} from './feature-sync.js';

// Mock child_process.spawn
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

// Mock fs
vi.mock('fs', async () => {
  const actual = await vi.importActual('fs');
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

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

describe('Feature Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseFixesReferences', () => {
    it('should parse "Fixes #123"', () => {
      const result = parseFixesReferences('This PR Fixes #123');
      expect(result).toEqual([123]);
    });

    it('should parse "Fixed #123"', () => {
      const result = parseFixesReferences('Fixed #456 in this commit');
      expect(result).toEqual([456]);
    });

    it('should parse "Fix #123"', () => {
      const result = parseFixesReferences('Fix #789');
      expect(result).toEqual([789]);
    });

    it('should parse "Closes #123"', () => {
      const result = parseFixesReferences('Closes #100');
      expect(result).toEqual([100]);
    });

    it('should parse "Closed #123"', () => {
      const result = parseFixesReferences('Closed #200');
      expect(result).toEqual([200]);
    });

    it('should parse "Close #123"', () => {
      const result = parseFixesReferences('Close #300');
      expect(result).toEqual([300]);
    });

    it('should parse "Resolves #123"', () => {
      const result = parseFixesReferences('Resolves #400');
      expect(result).toEqual([400]);
    });

    it('should parse "Resolved #123"', () => {
      const result = parseFixesReferences('Resolved #500');
      expect(result).toEqual([500]);
    });

    it('should parse "Resolve #123"', () => {
      const result = parseFixesReferences('Resolve #600');
      expect(result).toEqual([600]);
    });

    it('should parse multiple references', () => {
      const result = parseFixesReferences('Fixes #1, fixes #2, and closes #3');
      expect(result).toEqual([1, 2, 3]);
    });

    it('should handle case insensitivity', () => {
      const result = parseFixesReferences('FIXES #123 and fixes #456');
      expect(result).toEqual([123, 456]);
    });

    it('should deduplicate references', () => {
      const result = parseFixesReferences('Fixes #123, also fixes #123');
      expect(result).toEqual([123]);
    });

    it('should return empty array for no references', () => {
      const result = parseFixesReferences('Just a regular PR description');
      expect(result).toEqual([]);
    });

    it('should return empty array for empty string', () => {
      const result = parseFixesReferences('');
      expect(result).toEqual([]);
    });

    it('should return empty array for null/undefined', () => {
      expect(parseFixesReferences(null as any)).toEqual([]);
      expect(parseFixesReferences(undefined as any)).toEqual([]);
    });

    it('should handle reference at start of line', () => {
      const result = parseFixesReferences('Fixes #123\nSome other text');
      expect(result).toEqual([123]);
    });

    it('should handle reference without space', () => {
      const result = parseFixesReferences('Fixes#123');
      expect(result).toEqual([123]);
    });
  });

  describe('findFeatureByIssue', () => {
    it('should find feature in sprints format', () => {
      const featureList: FeatureListFile = {
        sprints: [
          {
            id: 'sprint-1',
            name: 'Sprint 1',
            features: [
              { id: 'F-001', name: 'Feature 1', status: 'pending', issueNumber: 10 },
              { id: 'F-002', name: 'Feature 2', status: 'pending', issueNumber: 20 },
            ],
          },
        ],
      };

      const result = findFeatureByIssue(featureList, 10);

      expect(result).not.toBeNull();
      expect(result?.feature.id).toBe('F-001');
      expect(result?.sprintId).toBe('sprint-1');
    });

    it('should find feature in flat features array', () => {
      const featureList: FeatureListFile = {
        features: [
          { id: 'F-001', name: 'Feature 1', status: 'pending', issueNumber: 10 },
          { id: 'F-002', name: 'Feature 2', status: 'pending', issueNumber: 20 },
        ],
      };

      const result = findFeatureByIssue(featureList, 20);

      expect(result).not.toBeNull();
      expect(result?.feature.id).toBe('F-002');
      expect(result?.sprintId).toBeUndefined();
    });

    it('should return null when feature not found', () => {
      const featureList: FeatureListFile = {
        features: [
          { id: 'F-001', name: 'Feature 1', status: 'pending', issueNumber: 10 },
        ],
      };

      const result = findFeatureByIssue(featureList, 999);

      expect(result).toBeNull();
    });

    it('should search across multiple sprints', () => {
      const featureList: FeatureListFile = {
        sprints: [
          {
            id: 'sprint-1',
            name: 'Sprint 1',
            features: [
              { id: 'F-001', name: 'Feature 1', status: 'pending', issueNumber: 10 },
            ],
          },
          {
            id: 'sprint-2',
            name: 'Sprint 2',
            features: [
              { id: 'F-002', name: 'Feature 2', status: 'pending', issueNumber: 20 },
            ],
          },
        ],
      };

      const result = findFeatureByIssue(featureList, 20);

      expect(result).not.toBeNull();
      expect(result?.feature.id).toBe('F-002');
      expect(result?.sprintId).toBe('sprint-2');
    });
  });

  describe('updateFeatureStatus', () => {
    it('should update feature status in sprints format', () => {
      const featureList: FeatureListFile = {
        sprints: [
          {
            id: 'sprint-1',
            name: 'Sprint 1',
            features: [
              { id: 'F-001', name: 'Feature 1', status: 'pending', issueNumber: 10 },
            ],
          },
        ],
      };

      const result = updateFeatureStatus(featureList, 10, 'complete');

      expect(result).toBe(true);
      expect(featureList.sprints![0].features[0].status).toBe('complete');
    });

    it('should update feature status in flat format', () => {
      const featureList: FeatureListFile = {
        features: [
          { id: 'F-001', name: 'Feature 1', status: 'pending', issueNumber: 10 },
        ],
      };

      const result = updateFeatureStatus(featureList, 10, 'complete');

      expect(result).toBe(true);
      expect(featureList.features![0].status).toBe('complete');
    });

    it('should return false when feature not found', () => {
      const featureList: FeatureListFile = {
        features: [
          { id: 'F-001', name: 'Feature 1', status: 'pending', issueNumber: 10 },
        ],
      };

      const result = updateFeatureStatus(featureList, 999, 'complete');

      expect(result).toBe(false);
    });
  });

  describe('getRecentlyMergedPRs', () => {
    it('should fetch merged PRs', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(
        createMockProcess(
          JSON.stringify([
            {
              number: 1,
              title: 'Fix bug',
              body: 'Fixes #10',
              mergeCommit: { oid: 'abc123' },
              headRefName: 'fix-bug',
              mergedAt: '2024-01-01T00:00:00Z',
            },
          ])
        )
      );

      const result = await getRecentlyMergedPRs();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].number).toBe(1);
      expect(result.data![0].fixedIssues).toEqual([10]);
    });

    it('should parse fixes references from PR body', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(
        createMockProcess(
          JSON.stringify([
            {
              number: 2,
              title: 'Multi-fix',
              body: 'Fixes #1, closes #2, resolves #3',
              mergeCommit: { oid: 'def456' },
              headRefName: 'multi-fix',
              mergedAt: '2024-01-02T00:00:00Z',
            },
          ])
        )
      );

      const result = await getRecentlyMergedPRs();

      expect(result.success).toBe(true);
      expect(result.data![0].fixedIssues).toEqual([1, 2, 3]);
    });

    it('should handle errors', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(createMockProcess('', 1));

      const result = await getRecentlyMergedPRs();

      expect(result.success).toBe(false);
    });

    it('should filter by since date', async () => {
      const mockSpawn = vi.mocked(childProcess.spawn);

      mockSpawn.mockReturnValueOnce(
        createMockProcess(
          JSON.stringify([
            {
              number: 1,
              title: 'Old PR',
              body: 'Fixes #10',
              mergeCommit: { oid: 'old123' },
              headRefName: 'old-pr',
              mergedAt: '2023-01-01T00:00:00Z',
            },
            {
              number: 2,
              title: 'New PR',
              body: 'Fixes #20',
              mergeCommit: { oid: 'new456' },
              headRefName: 'new-pr',
              mergedAt: '2024-06-01T00:00:00Z',
            },
          ])
        )
      );

      const result = await getRecentlyMergedPRs({ since: '2024-01-01T00:00:00Z' });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].number).toBe(2);
    });
  });

  describe('syncFeatureFromMergedPR', () => {
    it('should return early when PR has no fixes references', async () => {
      const pr: MergedPRInfo = {
        number: 1,
        title: 'Some PR',
        body: 'No issue references',
        mergeCommit: 'abc123',
        headBranch: 'feature',
        mergedAt: '2024-01-01T00:00:00Z',
        fixedIssues: [],
      };

      const result = await syncFeatureFromMergedPR(pr);

      expect(result.success).toBe(true);
      expect(result.updatedFeatures).toHaveLength(0);
      expect(result.message).toContain('no');
    });

    it('should handle dry run mode', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          features: [
            { id: 'F-001', name: 'Feature 1', status: 'pending', issueNumber: 10 },
          ],
        })
      );

      const pr: MergedPRInfo = {
        number: 1,
        title: 'Fix feature',
        body: 'Fixes #10',
        mergeCommit: 'abc123',
        headBranch: 'feature',
        mergedAt: '2024-01-01T00:00:00Z',
        fixedIssues: [10],
      };

      const result = await syncFeatureFromMergedPR(pr, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.updatedFeatures).toContain('F-001');
      expect(result.message).toContain('DRY RUN');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should skip already complete features', async () => {
      const fs = await import('fs');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          features: [
            { id: 'F-001', name: 'Feature 1', status: 'complete', issueNumber: 10 },
          ],
        })
      );

      const pr: MergedPRInfo = {
        number: 1,
        title: 'Fix feature',
        body: 'Fixes #10',
        mergeCommit: 'abc123',
        headBranch: 'feature',
        mergedAt: '2024-01-01T00:00:00Z',
        fixedIssues: [10],
      };

      const result = await syncFeatureFromMergedPR(pr);

      expect(result.success).toBe(true);
      expect(result.updatedFeatures).toHaveLength(0);
    });
  });

  describe('MergedPRInfo interface', () => {
    it('should have correct structure', () => {
      const pr: MergedPRInfo = {
        number: 1,
        title: 'Test PR',
        body: 'Test body',
        mergeCommit: 'abc123',
        headBranch: 'feature',
        mergedAt: '2024-01-01T00:00:00Z',
        fixedIssues: [1, 2, 3],
      };

      expect(pr.number).toBe(1);
      expect(pr.title).toBe('Test PR');
      expect(pr.fixedIssues).toHaveLength(3);
    });
  });

  describe('FeatureSyncResult interface', () => {
    it('should have correct structure', () => {
      const result = {
        success: true,
        updatedFeatures: ['F-001', 'F-002'],
        message: 'Updated features',
      };

      expect(result.success).toBe(true);
      expect(result.updatedFeatures).toHaveLength(2);
    });
  });
});
