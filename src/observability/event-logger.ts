/**
 * Event Logger for Claude Hero
 *
 * Captures and stores events to a JSON file for observability.
 * Foundation for notifications, dashboards, and analytics.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  WorkflowEvent,
  EventLog,
  EventFilter,
  EventType,
  EventData,
  createEvent,
} from './event-types.js';

const EVENT_LOG_FILENAME = '.claude-hero-events.json';
const CURRENT_VERSION = '1.0.0';
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Event Logger class
 *
 * Provides methods to log events and query the event log.
 */
export class EventLogger {
  private projectDir: string;
  private logPath: string;
  private retentionDays: number;

  constructor(options: {
    projectDir?: string;
    retentionDays?: number;
  } = {}) {
    this.projectDir = options.projectDir || process.cwd();
    this.logPath = path.join(this.projectDir, EVENT_LOG_FILENAME);
    this.retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  }

  /**
   * Log an event
   */
  log(
    type: EventType,
    data: EventData,
    metadata?: WorkflowEvent['metadata']
  ): WorkflowEvent {
    const event = createEvent(type, data, metadata);
    this.appendEvent(event);
    return event;
  }

  /**
   * Log a worker start event
   */
  logWorkerStart(
    issueNumber: number,
    options: { featureId?: string; branchName?: string } = {}
  ): WorkflowEvent {
    return this.log('worker.start', {
      issueNumber,
      featureId: options.featureId,
      branchName: options.branchName,
    });
  }

  /**
   * Log a worker complete event
   */
  logWorkerComplete(
    issueNumber: number,
    durationMs: number,
    options: { featureId?: string; branchName?: string } = {}
  ): WorkflowEvent {
    return this.log('worker.complete', {
      issueNumber,
      durationMs,
      featureId: options.featureId,
      branchName: options.branchName,
    });
  }

  /**
   * Log a worker fail event
   */
  logWorkerFail(
    issueNumber: number,
    error: string,
    options: { featureId?: string; branchName?: string; durationMs?: number } = {}
  ): WorkflowEvent {
    return this.log('worker.fail', {
      issueNumber,
      error,
      featureId: options.featureId,
      branchName: options.branchName,
      durationMs: options.durationMs,
    });
  }

  /**
   * Log a worker timeout event
   */
  logWorkerTimeout(
    issueNumber: number,
    durationMs: number,
    options: { featureId?: string; branchName?: string } = {}
  ): WorkflowEvent {
    return this.log('worker.timeout', {
      issueNumber,
      durationMs,
      featureId: options.featureId,
      branchName: options.branchName,
    });
  }

  /**
   * Log a PR created event
   */
  logPRCreated(
    prNumber: number,
    options: { issueNumber?: number; title?: string; branchName?: string } = {}
  ): WorkflowEvent {
    return this.log('pr.created', {
      prNumber,
      issueNumber: options.issueNumber,
      title: options.title,
      branchName: options.branchName,
    });
  }

  /**
   * Log a PR CI pass event
   */
  logPRCIPass(
    prNumber: number,
    checks: string[] = []
  ): WorkflowEvent {
    return this.log('pr.ci_pass', {
      prNumber,
      checks,
    });
  }

  /**
   * Log a PR CI fail event
   */
  logPRCIFail(
    prNumber: number,
    checks: string[] = []
  ): WorkflowEvent {
    return this.log('pr.ci_fail', {
      prNumber,
      checks,
    });
  }

  /**
   * Log a PR merged event
   */
  logPRMerged(
    prNumber: number,
    options: { issueNumber?: number; mergeMethod?: 'merge' | 'squash' | 'rebase' } = {}
  ): WorkflowEvent {
    return this.log('pr.merged', {
      prNumber,
      issueNumber: options.issueNumber,
      mergeMethod: options.mergeMethod,
    });
  }

  /**
   * Log a feature completed event
   */
  logFeatureCompleted(
    featureId: string,
    featureName?: string
  ): WorkflowEvent {
    return this.log('feature.completed', {
      featureId,
      featureName,
    });
  }

  /**
   * Log a sprint completed event
   */
  logSprintCompleted(
    sprintNumber: number
  ): WorkflowEvent {
    return this.log('sprint.completed', {
      featureId: `sprint-${sprintNumber}`,
      sprintNumber,
    });
  }

  /**
   * Query events with filters
   */
  query(filter: EventFilter = {}): WorkflowEvent[] {
    const log = this.readLog();
    let events = [...log.events];

    // Filter by types
    if (filter.types && filter.types.length > 0) {
      events = events.filter(e => filter.types!.includes(e.type));
    }

    // Filter by time range
    if (filter.since) {
      const sinceDate = new Date(filter.since);
      events = events.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    if (filter.until) {
      const untilDate = new Date(filter.until);
      events = events.filter(e => new Date(e.timestamp) <= untilDate);
    }

    // Filter by data fields
    if (filter.issueNumber !== undefined) {
      events = events.filter(e => {
        const data = e.data as any;
        return data.issueNumber === filter.issueNumber;
      });
    }

    if (filter.prNumber !== undefined) {
      events = events.filter(e => {
        const data = e.data as any;
        return data.prNumber === filter.prNumber;
      });
    }

    if (filter.featureId !== undefined) {
      events = events.filter(e => {
        const data = e.data as any;
        return data.featureId === filter.featureId;
      });
    }

    // Sort
    const order = filter.order || 'desc';
    events.sort((a, b) => {
      const diff = new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      return order === 'asc' ? diff : -diff;
    });

    // Limit
    if (filter.limit && filter.limit > 0) {
      events = events.slice(0, filter.limit);
    }

    return events;
  }

  /**
   * Get the most recent events
   */
  getRecentEvents(limit: number = 10): WorkflowEvent[] {
    return this.query({ limit, order: 'desc' });
  }

  /**
   * Get events for a specific issue
   */
  getIssueEvents(issueNumber: number): WorkflowEvent[] {
    return this.query({ issueNumber, order: 'asc' });
  }

  /**
   * Get events for a specific PR
   */
  getPREvents(prNumber: number): WorkflowEvent[] {
    return this.query({ prNumber, order: 'asc' });
  }

  /**
   * Get active workers (started but not completed/failed/timed out)
   */
  getActiveWorkers(): WorkflowEvent[] {
    const log = this.readLog();

    // Group events by issue number
    const issueEvents = new Map<number, WorkflowEvent[]>();

    for (const event of log.events) {
      const data = event.data as any;
      if (data.issueNumber !== undefined && event.type.startsWith('worker.')) {
        if (!issueEvents.has(data.issueNumber)) {
          issueEvents.set(data.issueNumber, []);
        }
        issueEvents.get(data.issueNumber)!.push(event);
      }
    }

    // Terminal worker states
    const terminalTypes = ['worker.complete', 'worker.fail', 'worker.timeout'];

    // Find issues with start but no terminal event
    const activeWorkers: WorkflowEvent[] = [];

    for (const [, events] of issueEvents) {
      const hasStart = events.some(e => e.type === 'worker.start');
      const hasTerminal = events.some(e => terminalTypes.includes(e.type));

      if (hasStart && !hasTerminal) {
        const startEvent = events.find(e => e.type === 'worker.start');
        if (startEvent) {
          activeWorkers.push(startEvent);
        }
      }
    }

    return activeWorkers;
  }

  /**
   * Get pending PRs (created but not merged/closed)
   */
  getPendingPRs(): WorkflowEvent[] {
    const log = this.readLog();

    // Group events by PR number
    const prEvents = new Map<number, WorkflowEvent[]>();

    for (const event of log.events) {
      const data = event.data as any;
      if (data.prNumber !== undefined && event.type.startsWith('pr.')) {
        if (!prEvents.has(data.prNumber)) {
          prEvents.set(data.prNumber, []);
        }
        prEvents.get(data.prNumber)!.push(event);
      }
    }

    // Terminal PR states
    const terminalTypes = ['pr.merged', 'pr.closed'];

    // Find PRs with created but no terminal event
    const pendingPRs: WorkflowEvent[] = [];

    for (const [, events] of prEvents) {
      const hasCreated = events.some(e => e.type === 'pr.created');
      const hasTerminal = events.some(e => terminalTypes.includes(e.type));

      if (hasCreated && !hasTerminal) {
        const createdEvent = events.find(e => e.type === 'pr.created');
        if (createdEvent) {
          pendingPRs.push(createdEvent);
        }
      }
    }

    return pendingPRs;
  }

  /**
   * Clear all events (for testing)
   */
  clear(): void {
    const log = this.createEmptyLog();
    this.writeLog(log);
  }

  /**
   * Rotate old events
   */
  rotate(): number {
    const log = this.readLog();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.retentionDays);

    const originalCount = log.events.length;
    log.events = log.events.filter(
      e => new Date(e.timestamp) >= cutoffDate
    );

    const removedCount = originalCount - log.events.length;

    if (removedCount > 0) {
      this.writeLog(log);
    }

    return removedCount;
  }

  /**
   * Get event statistics
   */
  getStats(): {
    totalEvents: number;
    activeWorkers: number;
    pendingPRs: number;
    eventsByType: Record<string, number>;
    oldestEvent?: string;
    newestEvent?: string;
  } {
    const log = this.readLog();

    const eventsByType: Record<string, number> = {};
    for (const event of log.events) {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    }

    const sorted = [...log.events].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return {
      totalEvents: log.events.length,
      activeWorkers: this.getActiveWorkers().length,
      pendingPRs: this.getPendingPRs().length,
      eventsByType,
      oldestEvent: sorted[0]?.timestamp,
      newestEvent: sorted[sorted.length - 1]?.timestamp,
    };
  }

  // Private methods

  private readLog(): EventLog {
    try {
      if (!fs.existsSync(this.logPath)) {
        return this.createEmptyLog();
      }

      const content = fs.readFileSync(this.logPath, 'utf-8');
      return JSON.parse(content) as EventLog;
    } catch {
      return this.createEmptyLog();
    }
  }

  private writeLog(log: EventLog): void {
    log.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this.logPath, JSON.stringify(log, null, 2), 'utf-8');
  }

  private appendEvent(event: WorkflowEvent): void {
    const log = this.readLog();
    log.events.push(event);
    this.writeLog(log);
  }

  private createEmptyLog(): EventLog {
    return {
      version: CURRENT_VERSION,
      lastUpdated: new Date().toISOString(),
      events: [],
    };
  }
}

/**
 * Create an event logger for the current project
 */
export function createEventLogger(
  projectDir?: string,
  retentionDays?: number
): EventLogger {
  return new EventLogger({ projectDir, retentionDays });
}

/**
 * Get the event log file path
 */
export function getEventLogPath(projectDir: string = process.cwd()): string {
  return path.join(projectDir, EVENT_LOG_FILENAME);
}
