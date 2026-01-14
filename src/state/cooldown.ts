/**
 * Cooldown State Management
 *
 * Tracks when rules/suggestions were last triggered to prevent alert fatigue.
 * State is persisted to disk for cross-invocation consistency.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { getCooldownMinutes } from '../config/loader.js';
import { classifyFile, FileType, hasCodeFiles } from '../utils/file-classifier.js';

const STATE_FILE = '/tmp/claude-hero-state.json';

/**
 * Record of a file change in the session
 */
interface FileChange {
  path: string;
  type: FileType;
  timestamp: number;
}

interface CooldownState {
  /** Rule ID -> last triggered timestamp (ms) */
  lastTriggered: Record<string, number>;
  /** Session start time */
  sessionStarted?: number;
  /** Total suggestions shown this session */
  suggestionsShown: number;
  /** Files changed this session */
  fileChanges?: FileChange[];
}

let state: CooldownState | null = null;

/**
 * Load state from disk
 */
function loadState(): CooldownState {
  if (state) {
    return state;
  }

  if (existsSync(STATE_FILE)) {
    try {
      const content = readFileSync(STATE_FILE, 'utf-8');
      state = JSON.parse(content);
      return state!;
    } catch {
      // Corrupted state, start fresh
    }
  }

  state = {
    lastTriggered: {},
    sessionStarted: Date.now(),
    suggestionsShown: 0,
  };

  return state;
}

/**
 * Save state to disk
 */
function saveState(): void {
  if (!state) return;

  try {
    writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    if (process.env.CLAUDE_HERO_DEBUG === '1') {
      console.error('[Claude Hero] Failed to save state:', error);
    }
  }
}

/**
 * Check if a rule should trigger based on cooldown
 *
 * @param ruleId - The rule identifier
 * @returns true if the rule can trigger, false if still in cooldown
 */
export function canTrigger(ruleId: string): boolean {
  const currentState = loadState();
  const lastTriggered = currentState.lastTriggered[ruleId];

  if (!lastTriggered) {
    return true;
  }

  const cooldownMs = getCooldownMinutes(ruleId) * 60 * 1000;
  const elapsed = Date.now() - lastTriggered;

  return elapsed >= cooldownMs;
}

/**
 * Record that a rule was triggered
 *
 * @param ruleId - The rule identifier
 */
export function recordTrigger(ruleId: string): void {
  const currentState = loadState();
  currentState.lastTriggered[ruleId] = Date.now();
  currentState.suggestionsShown++;
  saveState();
}

/**
 * Check cooldown and record trigger in one call
 * Returns true if rule triggered (was not in cooldown)
 */
export function tryTrigger(ruleId: string): boolean {
  if (!canTrigger(ruleId)) {
    return false;
  }

  recordTrigger(ruleId);
  return true;
}

/**
 * Get time remaining in cooldown for a rule (in minutes)
 * Returns 0 if not in cooldown
 */
export function getCooldownRemaining(ruleId: string): number {
  const currentState = loadState();
  const lastTriggered = currentState.lastTriggered[ruleId];

  if (!lastTriggered) {
    return 0;
  }

  const cooldownMs = getCooldownMinutes(ruleId) * 60 * 1000;
  const elapsed = Date.now() - lastTriggered;
  const remaining = cooldownMs - elapsed;

  return remaining > 0 ? Math.ceil(remaining / 60000) : 0;
}

/**
 * Get session duration in minutes
 */
export function getSessionDurationMinutes(): number {
  const currentState = loadState();
  if (!currentState.sessionStarted) {
    return 0;
  }

  return Math.floor((Date.now() - currentState.sessionStarted) / 60000);
}

/**
 * Get total suggestions shown this session
 */
export function getTotalSuggestionsShown(): number {
  return loadState().suggestionsShown;
}

/**
 * Reset all cooldowns (useful for testing or mode changes)
 */
export function resetCooldowns(): void {
  state = {
    lastTriggered: {},
    sessionStarted: Date.now(),
    suggestionsShown: 0,
  };
  saveState();
}

/**
 * Reset cooldown for a specific rule
 */
export function resetRuleCooldown(ruleId: string): void {
  const currentState = loadState();
  delete currentState.lastTriggered[ruleId];
  saveState();
}

/**
 * Record a file change in the session
 *
 * @param filePath - Path to the file that was changed
 */
export function recordFileChange(filePath: string): void {
  const currentState = loadState();

  if (!currentState.fileChanges) {
    currentState.fileChanges = [];
  }

  // Classify the file
  const classification = classifyFile(filePath);

  // Add to changes (avoid duplicates by checking path)
  const existingIndex = currentState.fileChanges.findIndex(fc => fc.path === filePath);
  if (existingIndex >= 0) {
    // Update timestamp for existing file
    currentState.fileChanges[existingIndex].timestamp = Date.now();
  } else {
    currentState.fileChanges.push({
      path: filePath,
      type: classification.type,
      timestamp: Date.now(),
    });
  }

  saveState();
}

/**
 * Get all file changes in the current session
 */
export function getSessionFileChanges(): FileChange[] {
  const currentState = loadState();
  return currentState.fileChanges || [];
}

/**
 * Check if any code files have been changed this session
 * Used for smart test reminder filtering
 */
export function hasCodeChangesThisSession(): boolean {
  const changes = getSessionFileChanges();
  return changes.some(fc => fc.type === 'code' || fc.type === 'test');
}

/**
 * Get file changes by type
 */
export function getFileChangesByType(type: FileType): FileChange[] {
  const changes = getSessionFileChanges();
  return changes.filter(fc => fc.type === type);
}

/**
 * Get count of each file type changed
 */
export function getFileChangeStats(): Record<FileType, number> {
  const changes = getSessionFileChanges();
  const stats: Record<FileType, number> = {
    code: 0,
    test: 0,
    config: 0,
    docs: 0,
    style: 0,
    build: 0,
    other: 0,
  };

  for (const change of changes) {
    stats[change.type]++;
  }

  return stats;
}

/**
 * Clear file changes (called when tests are run)
 */
export function clearFileChanges(): void {
  const currentState = loadState();
  currentState.fileChanges = [];
  saveState();
}
