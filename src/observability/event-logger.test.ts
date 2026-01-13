import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { EventLogger, createEventLogger, getEventLogPath } from './event-logger.js';
import { WorkflowEvent, EventType, generateEventId, createEvent } from './event-types.js';

describe('EventLogger', () => {
  let tempDir: string;
  let logger: EventLogger;

  beforeEach(() => {
    // Create temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-logger-test-'));
    logger = new EventLogger({ projectDir: tempDir });
  });

  afterEach(() => {
    // Clean up temp directory
    try {
      fs.rmSync(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('log()', () => {
    it('should log an event with correct structure', () => {
      const event = logger.log('worker.start', { issueNumber: 123 });

      expect(event.id).toMatch(/^evt_/);
      expect(event.type).toBe('worker.start');
      expect(event.timestamp).toBeDefined();
      expect(event.data).toEqual({ issueNumber: 123 });
    });

    it('should persist events to file', () => {
      logger.log('worker.start', { issueNumber: 1 });
      logger.log('worker.complete', { issueNumber: 1, durationMs: 5000 });

      const logPath = path.join(tempDir, '.workflow-pilot-events.json');
      expect(fs.existsSync(logPath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      expect(content.events).toHaveLength(2);
    });

    it('should include metadata when provided', () => {
      const event = logger.log(
        'worker.start',
        { issueNumber: 123 },
        { sessionId: 'session-1', projectDir: '/test' }
      );

      expect(event.metadata?.sessionId).toBe('session-1');
      expect(event.metadata?.projectDir).toBe('/test');
    });
  });

  describe('Worker event helpers', () => {
    it('logWorkerStart should create correct event', () => {
      const event = logger.logWorkerStart(42, { featureId: 'F-001', branchName: 'feature/test' });

      expect(event.type).toBe('worker.start');
      expect((event.data as any).issueNumber).toBe(42);
      expect((event.data as any).featureId).toBe('F-001');
      expect((event.data as any).branchName).toBe('feature/test');
    });

    it('logWorkerComplete should include duration', () => {
      const event = logger.logWorkerComplete(42, 10000);

      expect(event.type).toBe('worker.complete');
      expect((event.data as any).durationMs).toBe(10000);
    });

    it('logWorkerFail should include error', () => {
      const event = logger.logWorkerFail(42, 'Build failed');

      expect(event.type).toBe('worker.fail');
      expect((event.data as any).error).toBe('Build failed');
    });

    it('logWorkerTimeout should include duration', () => {
      const event = logger.logWorkerTimeout(42, 1800000);

      expect(event.type).toBe('worker.timeout');
      expect((event.data as any).durationMs).toBe(1800000);
    });
  });

  describe('PR event helpers', () => {
    it('logPRCreated should create correct event', () => {
      const event = logger.logPRCreated(1, { issueNumber: 42, title: 'Fix bug' });

      expect(event.type).toBe('pr.created');
      expect((event.data as any).prNumber).toBe(1);
      expect((event.data as any).issueNumber).toBe(42);
      expect((event.data as any).title).toBe('Fix bug');
    });

    it('logPRCIPass should include checks', () => {
      const event = logger.logPRCIPass(1, ['test', 'build']);

      expect(event.type).toBe('pr.ci_pass');
      expect((event.data as any).checks).toEqual(['test', 'build']);
    });

    it('logPRCIFail should include checks', () => {
      const event = logger.logPRCIFail(1, ['lint']);

      expect(event.type).toBe('pr.ci_fail');
      expect((event.data as any).checks).toEqual(['lint']);
    });

    it('logPRMerged should include merge method', () => {
      const event = logger.logPRMerged(1, { issueNumber: 42, mergeMethod: 'squash' });

      expect(event.type).toBe('pr.merged');
      expect((event.data as any).mergeMethod).toBe('squash');
    });
  });

  describe('Feature event helpers', () => {
    it('logFeatureCompleted should create correct event', () => {
      const event = logger.logFeatureCompleted('F-001', 'User Authentication');

      expect(event.type).toBe('feature.completed');
      expect((event.data as any).featureId).toBe('F-001');
      expect((event.data as any).featureName).toBe('User Authentication');
    });

    it('logSprintCompleted should create correct event', () => {
      const event = logger.logSprintCompleted(2);

      expect(event.type).toBe('sprint.completed');
      expect((event.data as any).sprintNumber).toBe(2);
    });
  });

  describe('query()', () => {
    beforeEach(() => {
      // Add test events
      logger.logWorkerStart(1);
      logger.logWorkerComplete(1, 5000);
      logger.logWorkerStart(2);
      logger.logWorkerFail(2, 'Error');
      logger.logPRCreated(10, { issueNumber: 1 });
      logger.logPRMerged(10);
    });

    it('should return all events when no filter', () => {
      const events = logger.query();
      expect(events).toHaveLength(6);
    });

    it('should filter by type', () => {
      const events = logger.query({ types: ['worker.start'] });
      expect(events).toHaveLength(2);
      expect(events.every(e => e.type === 'worker.start')).toBe(true);
    });

    it('should filter by multiple types', () => {
      const events = logger.query({ types: ['worker.start', 'worker.complete'] });
      expect(events).toHaveLength(3);
    });

    it('should filter by issueNumber', () => {
      const events = logger.query({ issueNumber: 1 });
      expect(events).toHaveLength(3); // start, complete, PR with issueNumber
    });

    it('should filter by prNumber', () => {
      const events = logger.query({ prNumber: 10 });
      expect(events).toHaveLength(2); // created, merged
    });

    it('should limit results', () => {
      const events = logger.query({ limit: 3 });
      expect(events).toHaveLength(3);
    });

    it('should sort by timestamp descending by default', () => {
      const events = logger.query();
      for (let i = 0; i < events.length - 1; i++) {
        expect(new Date(events[i].timestamp).getTime())
          .toBeGreaterThanOrEqual(new Date(events[i + 1].timestamp).getTime());
      }
    });

    it('should sort ascending when specified', () => {
      const events = logger.query({ order: 'asc' });
      for (let i = 0; i < events.length - 1; i++) {
        expect(new Date(events[i].timestamp).getTime())
          .toBeLessThanOrEqual(new Date(events[i + 1].timestamp).getTime());
      }
    });

    it('should filter by time range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const events = logger.query({ since: oneHourAgo.toISOString() });
      expect(events).toHaveLength(6); // All events are recent

      const future = new Date(now.getTime() + 60 * 60 * 1000);
      const noEvents = logger.query({ since: future.toISOString() });
      expect(noEvents).toHaveLength(0);
    });
  });

  describe('getRecentEvents()', () => {
    it('should return the most recent events', () => {
      logger.logWorkerStart(1);
      logger.logWorkerStart(2);
      logger.logWorkerStart(3);
      logger.logWorkerStart(4);
      logger.logWorkerStart(5);

      const events = logger.getRecentEvents(3);
      expect(events).toHaveLength(3);
    });

    it('should use default limit of 10', () => {
      for (let i = 0; i < 15; i++) {
        logger.logWorkerStart(i);
      }

      const events = logger.getRecentEvents();
      expect(events).toHaveLength(10);
    });
  });

  describe('getIssueEvents()', () => {
    it('should return events for a specific issue', () => {
      logger.logWorkerStart(42);
      logger.logWorkerComplete(42, 5000);
      logger.logWorkerStart(99);

      const events = logger.getIssueEvents(42);
      expect(events).toHaveLength(2);
      expect(events.every(e => (e.data as any).issueNumber === 42)).toBe(true);
    });
  });

  describe('getPREvents()', () => {
    it('should return events for a specific PR', () => {
      logger.logPRCreated(100);
      logger.logPRCIPass(100);
      logger.logPRMerged(100);
      logger.logPRCreated(200);

      const events = logger.getPREvents(100);
      expect(events).toHaveLength(3);
      expect(events.every(e => (e.data as any).prNumber === 100)).toBe(true);
    });
  });

  describe('getActiveWorkers()', () => {
    it('should return workers that started but not completed', () => {
      logger.logWorkerStart(1);
      logger.logWorkerComplete(1, 5000);
      logger.logWorkerStart(2); // Active
      logger.logWorkerStart(3);
      logger.logWorkerFail(3, 'Error');

      const active = logger.getActiveWorkers();
      expect(active).toHaveLength(1);
      expect((active[0].data as any).issueNumber).toBe(2);
    });

    it('should return empty array when no active workers', () => {
      logger.logWorkerStart(1);
      logger.logWorkerComplete(1, 5000);

      const active = logger.getActiveWorkers();
      expect(active).toHaveLength(0);
    });
  });

  describe('getPendingPRs()', () => {
    it('should return PRs that are not merged or closed', () => {
      logger.logPRCreated(1);
      logger.logPRMerged(1);
      logger.logPRCreated(2); // Pending
      logger.logPRCIPass(2);
      logger.logPRCreated(3);
      logger.log('pr.closed', { prNumber: 3 });

      const pending = logger.getPendingPRs();
      expect(pending).toHaveLength(1);
      expect((pending[0].data as any).prNumber).toBe(2);
    });
  });

  describe('clear()', () => {
    it('should remove all events', () => {
      logger.logWorkerStart(1);
      logger.logWorkerStart(2);

      logger.clear();

      const events = logger.query();
      expect(events).toHaveLength(0);
    });
  });

  describe('rotate()', () => {
    it('should remove events older than retention period', () => {
      // Create logger with 1 day retention
      const shortRetentionLogger = new EventLogger({
        projectDir: tempDir,
        retentionDays: 1,
      });

      // Add events manually with old timestamps
      const logPath = path.join(tempDir, '.workflow-pilot-events.json');
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 5); // 5 days ago

      const log = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        events: [
          {
            id: 'old_1',
            type: 'worker.start' as EventType,
            timestamp: oldDate.toISOString(),
            data: { issueNumber: 1 },
          },
          {
            id: 'new_1',
            type: 'worker.start' as EventType,
            timestamp: new Date().toISOString(),
            data: { issueNumber: 2 },
          },
        ],
      };

      fs.writeFileSync(logPath, JSON.stringify(log), 'utf-8');

      const removed = shortRetentionLogger.rotate();
      expect(removed).toBe(1);

      const events = shortRetentionLogger.query();
      expect(events).toHaveLength(1);
      expect((events[0].data as any).issueNumber).toBe(2);
    });
  });

  describe('getStats()', () => {
    it('should return correct statistics', () => {
      logger.logWorkerStart(1);
      logger.logWorkerStart(2);
      logger.logWorkerComplete(1, 5000);
      logger.logPRCreated(10);

      const stats = logger.getStats();

      expect(stats.totalEvents).toBe(4);
      expect(stats.activeWorkers).toBe(1); // Issue 2 still active
      expect(stats.pendingPRs).toBe(1);
      expect(stats.eventsByType['worker.start']).toBe(2);
      expect(stats.eventsByType['worker.complete']).toBe(1);
      expect(stats.eventsByType['pr.created']).toBe(1);
    });

    it('should return empty stats for empty log', () => {
      const stats = logger.getStats();

      expect(stats.totalEvents).toBe(0);
      expect(stats.activeWorkers).toBe(0);
      expect(stats.pendingPRs).toBe(0);
      expect(stats.oldestEvent).toBeUndefined();
      expect(stats.newestEvent).toBeUndefined();
    });
  });
});

describe('Event Types', () => {
  describe('generateEventId()', () => {
    it('should generate unique IDs', () => {
      const id1 = generateEventId();
      const id2 = generateEventId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^evt_/);
      expect(id2).toMatch(/^evt_/);
    });
  });

  describe('createEvent()', () => {
    it('should create event with all fields', () => {
      const event = createEvent('worker.start', { issueNumber: 42 });

      expect(event.id).toMatch(/^evt_/);
      expect(event.type).toBe('worker.start');
      expect(event.timestamp).toBeDefined();
      expect(event.data).toEqual({ issueNumber: 42 });
    });

    it('should include metadata when provided', () => {
      const event = createEvent(
        'worker.start',
        { issueNumber: 42 },
        { sessionId: 'test' }
      );

      expect(event.metadata?.sessionId).toBe('test');
    });
  });
});

describe('Helper Functions', () => {
  describe('createEventLogger()', () => {
    it('should create logger with defaults', () => {
      const logger = createEventLogger();
      expect(logger).toBeInstanceOf(EventLogger);
    });

    it('should accept custom project dir', () => {
      const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-'));
      try {
        const logger = createEventLogger(tempDir);
        logger.logWorkerStart(1);

        const logPath = path.join(tempDir, '.workflow-pilot-events.json');
        expect(fs.existsSync(logPath)).toBe(true);
      } finally {
        fs.rmSync(tempDir, { recursive: true });
      }
    });
  });

  describe('getEventLogPath()', () => {
    it('should return correct path', () => {
      const logPath = getEventLogPath('/test/project');
      expect(logPath).toBe('/test/project/.workflow-pilot-events.json');
    });
  });
});
