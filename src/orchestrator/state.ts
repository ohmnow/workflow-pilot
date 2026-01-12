/**
 * Orchestrator State Management
 *
 * Handles persistent state for orchestrator mode, including:
 * - Current development phase
 * - Active sprint tracking
 * - Feature list file location
 * - Session progress
 */

import * as fs from 'fs';
import * as path from 'path';
import { DevelopmentPhase } from './phases.js';
import { FeatureList } from './feature-schema.js';

/**
 * GitHub integration state
 */
export interface GitHubState {
  /** Repository owner (username or org) */
  repoOwner: string;
  /** Repository name */
  repoName: string;
  /** GitHub integration is initialized */
  initialized: boolean;
  /** Whether issues have been created for features */
  issuesCreated: boolean;
  /** Last sync timestamp */
  lastSync?: string;
}

/**
 * Orchestrator state persisted to .workflow-pilot-orchestrator.json
 */
export interface OrchestratorState {
  /** Orchestrator is actively managing this project */
  enabled: boolean;

  /** Current development phase */
  currentPhase: DevelopmentPhase;

  /** Current sprint number (1-based) */
  currentSprint: number;

  /** Feature ID currently being worked on */
  currentFeatureId?: string;

  /** Path to feature_list.json */
  featureListPath: string;

  /** Path to progress file */
  progressPath: string;

  /** Session tracking */
  sessions: {
    count: number;
    lastSessionAt: string;
  };

  /** GitHub integration (optional) */
  github?: GitHubState;

  /** Timestamps */
  createdAt: string;
  updatedAt: string;
}

const STATE_FILENAME = '.workflow-pilot-orchestrator.json';

/**
 * Default state for new orchestrator projects
 */
export function createDefaultState(): OrchestratorState {
  const now = new Date().toISOString();
  return {
    enabled: true,
    currentPhase: 'onboarding',
    currentSprint: 1,
    featureListPath: 'feature_list.json',
    progressPath: 'claude-progress.txt',
    sessions: {
      count: 1,
      lastSessionAt: now,
    },
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get the state file path for a project directory
 */
export function getStateFilePath(projectDir: string = process.cwd()): string {
  return path.join(projectDir, STATE_FILENAME);
}

/**
 * Load orchestrator state from disk
 */
export function loadState(projectDir: string = process.cwd()): OrchestratorState | null {
  const statePath = getStateFilePath(projectDir);

  try {
    if (!fs.existsSync(statePath)) {
      return null;
    }

    const content = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content) as OrchestratorState;

    // Update session tracking on load
    state.sessions.count += 1;
    state.sessions.lastSessionAt = new Date().toISOString();
    state.updatedAt = new Date().toISOString();

    return state;
  } catch {
    return null;
  }
}

/**
 * Save orchestrator state to disk
 */
export function saveState(
  state: OrchestratorState,
  projectDir: string = process.cwd()
): boolean {
  const statePath = getStateFilePath(projectDir);

  try {
    state.updatedAt = new Date().toISOString();
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize orchestrator state for a new project
 */
export function initializeState(projectDir: string = process.cwd()): OrchestratorState {
  const existingState = loadState(projectDir);

  if (existingState) {
    return existingState;
  }

  const newState = createDefaultState();
  saveState(newState, projectDir);
  return newState;
}

/**
 * Update specific fields in state
 */
export function updateState(
  updates: Partial<OrchestratorState>,
  projectDir: string = process.cwd()
): OrchestratorState | null {
  const state = loadState(projectDir);

  if (!state) {
    return null;
  }

  const updatedState = {
    ...state,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveState(updatedState, projectDir);
  return updatedState;
}

/**
 * Check if orchestrator state exists for a project
 */
export function hasOrchestratorState(projectDir: string = process.cwd()): boolean {
  const statePath = getStateFilePath(projectDir);
  return fs.existsSync(statePath);
}

/**
 * Load feature list from disk
 */
export function loadFeatureList(
  state: OrchestratorState,
  projectDir: string = process.cwd()
): FeatureList | null {
  const featureListPath = path.join(projectDir, state.featureListPath);

  try {
    if (!fs.existsSync(featureListPath)) {
      return null;
    }

    const content = fs.readFileSync(featureListPath, 'utf-8');
    return JSON.parse(content) as FeatureList;
  } catch {
    return null;
  }
}

/**
 * Save feature list to disk
 */
export function saveFeatureList(
  featureList: FeatureList,
  state: OrchestratorState,
  projectDir: string = process.cwd()
): boolean {
  const featureListPath = path.join(projectDir, state.featureListPath);

  try {
    // Update metadata
    if (featureList.metadata) {
      featureList.metadata.lastUpdated = new Date().toISOString();
    }

    fs.writeFileSync(featureListPath, JSON.stringify(featureList, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Write session progress file (for session continuity)
 */
export function writeProgressFile(
  content: string,
  state: OrchestratorState,
  projectDir: string = process.cwd()
): boolean {
  const progressPath = path.join(projectDir, state.progressPath);

  try {
    fs.writeFileSync(progressPath, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Read session progress file
 */
export function readProgressFile(
  state: OrchestratorState,
  projectDir: string = process.cwd()
): string | null {
  const progressPath = path.join(projectDir, state.progressPath);

  try {
    if (!fs.existsSync(progressPath)) {
      return null;
    }

    return fs.readFileSync(progressPath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Transition to a new phase
 */
export function transitionPhase(
  newPhase: DevelopmentPhase,
  projectDir: string = process.cwd()
): OrchestratorState | null {
  return updateState({ currentPhase: newPhase }, projectDir);
}

/**
 * Set current feature being worked on
 */
export function setCurrentFeature(
  featureId: string | undefined,
  projectDir: string = process.cwd()
): OrchestratorState | null {
  return updateState({ currentFeatureId: featureId }, projectDir);
}

/**
 * Advance to next sprint
 */
export function advanceSprint(
  projectDir: string = process.cwd()
): OrchestratorState | null {
  const state = loadState(projectDir);
  if (!state) return null;

  return updateState({ currentSprint: state.currentSprint + 1 }, projectDir);
}
