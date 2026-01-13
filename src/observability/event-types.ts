/**
 * Event Types for Workflow Pilot Observability
 *
 * Defines all event types captured by the event logger.
 */

/**
 * Worker lifecycle events
 */
export type WorkerEventType =
  | 'worker.start'
  | 'worker.complete'
  | 'worker.fail'
  | 'worker.timeout';

/**
 * PR lifecycle events
 */
export type PREventType =
  | 'pr.created'
  | 'pr.ci_pass'
  | 'pr.ci_fail'
  | 'pr.merged'
  | 'pr.closed';

/**
 * Feature lifecycle events
 */
export type FeatureEventType =
  | 'feature.started'
  | 'feature.completed'
  | 'sprint.completed';

/**
 * System events
 */
export type SystemEventType =
  | 'system.start'
  | 'system.error'
  | 'notification.sent';

/**
 * All event types
 */
export type EventType =
  | WorkerEventType
  | PREventType
  | FeatureEventType
  | SystemEventType;

/**
 * Worker event data
 */
export interface WorkerEventData {
  /** Issue number the worker is processing */
  issueNumber: number;
  /** Feature ID being worked on */
  featureId?: string;
  /** Branch name */
  branchName?: string;
  /** Error message (for fail events) */
  error?: string;
  /** Duration in milliseconds (for complete/fail events) */
  durationMs?: number;
}

/**
 * PR event data
 */
export interface PREventData {
  /** PR number */
  prNumber: number;
  /** Issue number the PR fixes */
  issueNumber?: number;
  /** PR title */
  title?: string;
  /** Branch name */
  branchName?: string;
  /** CI check names that passed/failed */
  checks?: string[];
  /** Merge method used (for merged events) */
  mergeMethod?: 'merge' | 'squash' | 'rebase';
}

/**
 * Feature event data
 */
export interface FeatureEventData {
  /** Feature ID */
  featureId: string;
  /** Feature name */
  featureName?: string;
  /** Sprint number */
  sprintNumber?: number;
}

/**
 * System event data
 */
export interface SystemEventData {
  /** Error message */
  error?: string;
  /** Component that generated the event */
  component?: string;
  /** Notification target (for notification events) */
  notificationTarget?: string;
}

/**
 * Event data union type
 */
export type EventData =
  | WorkerEventData
  | PREventData
  | FeatureEventData
  | SystemEventData
  | Record<string, unknown>;

/**
 * Base event structure
 */
export interface WorkflowEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: EventType;
  /** ISO timestamp */
  timestamp: string;
  /** Event-specific data */
  data: EventData;
  /** Optional metadata */
  metadata?: {
    /** Session ID for correlation */
    sessionId?: string;
    /** Project directory */
    projectDir?: string;
    /** User or actor */
    actor?: string;
  };
}

/**
 * Event filter for querying
 */
export interface EventFilter {
  /** Filter by event types */
  types?: EventType[];
  /** Filter by time range (ISO timestamps) */
  since?: string;
  until?: string;
  /** Filter by data fields */
  issueNumber?: number;
  prNumber?: number;
  featureId?: string;
  /** Limit number of results */
  limit?: number;
  /** Sort order */
  order?: 'asc' | 'desc';
}

/**
 * Event log file structure
 */
export interface EventLog {
  /** Schema version for migrations */
  version: string;
  /** When the log was last updated */
  lastUpdated: string;
  /** Array of events */
  events: WorkflowEvent[];
}

/**
 * Generate a unique event ID
 */
export function generateEventId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `evt_${timestamp}_${random}`;
}

/**
 * Create an event with defaults
 */
export function createEvent(
  type: EventType,
  data: EventData,
  metadata?: WorkflowEvent['metadata']
): WorkflowEvent {
  return {
    id: generateEventId(),
    type,
    timestamp: new Date().toISOString(),
    data,
    metadata,
  };
}
