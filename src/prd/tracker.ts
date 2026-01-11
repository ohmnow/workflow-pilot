/**
 * PRD Progress Tracker
 *
 * Tracks completion status of PRD requirements across sessions.
 * Persists progress to .workflow-pilot-progress.json in project root.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { ParsedPRD, PRDRequirement, parsePRD, getCompletionStats } from './parser.js';

const PROGRESS_FILE = '.workflow-pilot-progress.json';

/**
 * Progress state persisted to disk
 */
interface ProgressState {
  /** PRD file path (for validation) */
  prdPath: string;
  /** PRD content hash (to detect changes) */
  contentHash: string;
  /** Map of requirement ID to completion status */
  completions: Record<string, boolean>;
  /** Last updated timestamp */
  lastUpdated: number;
  /** Custom notes per requirement */
  notes?: Record<string, string>;
}

/**
 * Progress summary for display
 */
export interface ProgressSummary {
  total: number;
  completed: number;
  percentage: number;
  nextRequirement?: PRDRequirement;
  recentlyCompleted?: PRDRequirement[];
}

// Cache for progress state
let cachedProgress: ProgressState | null = null;
let cachedCwd: string | null = null;

/**
 * Simple hash function for content comparison
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/**
 * Get the progress file path for the current directory
 */
function getProgressFilePath(cwd?: string): string {
  return join(cwd || process.cwd(), PROGRESS_FILE);
}

/**
 * Load progress state from disk
 */
function loadProgressState(cwd?: string): ProgressState | null {
  const workingDir = cwd || process.cwd();

  // Use cache if same directory
  if (cachedProgress && cachedCwd === workingDir) {
    return cachedProgress;
  }

  const progressPath = getProgressFilePath(workingDir);

  if (!existsSync(progressPath)) {
    return null;
  }

  try {
    const content = readFileSync(progressPath, 'utf-8');
    const state = JSON.parse(content) as ProgressState;
    cachedProgress = state;
    cachedCwd = workingDir;
    return state;
  } catch {
    return null;
  }
}

/**
 * Save progress state to disk
 */
function saveProgressState(state: ProgressState, cwd?: string): void {
  const progressPath = getProgressFilePath(cwd);

  try {
    writeFileSync(progressPath, JSON.stringify(state, null, 2));
    cachedProgress = state;
    cachedCwd = cwd || process.cwd();
  } catch (error) {
    console.error('[Workflow Pilot] Failed to save progress:', error);
  }
}

/**
 * Initialize or update progress tracking for a PRD
 *
 * @param prdPath - Path to the PRD file
 * @param prdContent - Content of the PRD file
 * @param cwd - Working directory (optional)
 */
export function initializeProgress(
  prdPath: string,
  prdContent: string,
  cwd?: string
): ProgressState {
  const contentHash = hashContent(prdContent);
  const existingState = loadProgressState(cwd);

  // If PRD hasn't changed, keep existing progress
  if (existingState && existingState.contentHash === contentHash) {
    return existingState;
  }

  // If PRD changed, we need to migrate or reset
  const prd = parsePRD(prdContent);
  const completions: Record<string, boolean> = {};

  // Initialize all requirements as not completed
  for (const req of prd.requirements) {
    // Preserve existing completion status if requirement still exists
    if (existingState?.completions[req.id] !== undefined) {
      completions[req.id] = existingState.completions[req.id];
    } else {
      // Use the checklist status from the PRD itself
      completions[req.id] = req.completed;
    }
  }

  const newState: ProgressState = {
    prdPath,
    contentHash,
    completions,
    lastUpdated: Date.now(),
    notes: existingState?.notes,
  };

  saveProgressState(newState, cwd);
  return newState;
}

/**
 * Mark a requirement as completed
 */
export function markCompleted(requirementId: string, cwd?: string): boolean {
  const state = loadProgressState(cwd);
  if (!state) {
    return false;
  }

  state.completions[requirementId] = true;
  state.lastUpdated = Date.now();
  saveProgressState(state, cwd);
  return true;
}

/**
 * Mark a requirement as not completed
 */
export function markIncomplete(requirementId: string, cwd?: string): boolean {
  const state = loadProgressState(cwd);
  if (!state) {
    return false;
  }

  state.completions[requirementId] = false;
  state.lastUpdated = Date.now();
  saveProgressState(state, cwd);
  return true;
}

/**
 * Add a note to a requirement
 */
export function addNote(requirementId: string, note: string, cwd?: string): boolean {
  const state = loadProgressState(cwd);
  if (!state) {
    return false;
  }

  if (!state.notes) {
    state.notes = {};
  }

  state.notes[requirementId] = note;
  state.lastUpdated = Date.now();
  saveProgressState(state, cwd);
  return true;
}

/**
 * Get progress summary for a PRD
 */
export function getProgressSummary(prd: ParsedPRD, cwd?: string): ProgressSummary {
  const state = loadProgressState(cwd);

  // Apply progress state to PRD requirements
  if (state) {
    for (const req of prd.requirements) {
      if (state.completions[req.id] !== undefined) {
        req.completed = state.completions[req.id];
      }
    }
  }

  const stats = getCompletionStats(prd);

  // Find next incomplete requirement
  const nextRequirement = prd.requirements.find(r => !r.completed);

  // Find recently completed (last 5)
  const recentlyCompleted = prd.requirements
    .filter(r => r.completed)
    .slice(-5);

  return {
    total: stats.total,
    completed: stats.completed,
    percentage: stats.percentage,
    nextRequirement,
    recentlyCompleted,
  };
}

/**
 * Check if a requirement is completed
 */
export function isCompleted(requirementId: string, cwd?: string): boolean {
  const state = loadProgressState(cwd);
  return state?.completions[requirementId] ?? false;
}

/**
 * Get all completed requirement IDs
 */
export function getCompletedIds(cwd?: string): string[] {
  const state = loadProgressState(cwd);
  if (!state) {
    return [];
  }

  return Object.entries(state.completions)
    .filter(([_, completed]) => completed)
    .map(([id]) => id);
}

/**
 * Clear all progress (reset)
 */
export function clearProgress(cwd?: string): void {
  const progressPath = getProgressFilePath(cwd);

  try {
    if (existsSync(progressPath)) {
      const { unlinkSync } = require('fs');
      unlinkSync(progressPath);
    }
    cachedProgress = null;
    cachedCwd = null;
  } catch {
    // Ignore errors
  }
}

/**
 * Clear the cache (useful for testing)
 */
export function clearCache(): void {
  cachedProgress = null;
  cachedCwd = null;
}
