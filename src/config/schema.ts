/**
 * Configuration Schema for Workflow Pilot
 *
 * Defines the structure for user-configurable settings.
 */

export type OperatingMode = 'minimal' | 'training' | 'guidance' | 'orchestrator';

export interface WorkflowPilotConfig {
  /**
   * Operating mode determines overall behavior:
   * - minimal: Safety only (critical alerts), no context injection
   * - training: Learning assistant with explanations and guidance
   * - guidance: "Claude guiding Claude" with senior dev oversight
   * - orchestrator: 10X pair programmer guiding from idea to production
   */
  mode: OperatingMode;

  /**
   * Enable/disable visual feedback tiers
   */
  tiers: {
    critical: { enabled: boolean };  // Red alerts - security/safety
    warning: { enabled: boolean };   // Gold alerts - workflow suggestions
    info: { enabled: boolean };      // Blue tips - educational content
  };

  /**
   * Enable/disable rule categories
   */
  categories: {
    testing: boolean;
    git: boolean;
    security: boolean;
    claudeCode: boolean;
    refactoring: boolean;
  };

  /**
   * Frequency controls to prevent alert fatigue
   */
  frequency: {
    /** Default cooldown between same suggestion type (minutes) */
    defaultCooldownMinutes: number;
    /** Cooldown for info tips - typically longer (minutes) */
    infoCooldownMinutes: number;
    /** Per-rule cooldown overrides */
    perRuleCooldowns?: Record<string, number>;
  };

  /**
   * AI analyzer settings
   */
  ai: {
    enabled: boolean;
    model: string;
    /** Fall back to rule-based only if AI unavailable */
    fallbackToRules: boolean;
  };

  /**
   * Training mode specific settings
   */
  training: {
    /** Ask user what they're trying to accomplish */
    askIntent: boolean;
    /** Include explanations with suggestions */
    explainSuggestions: boolean;
    /** Show examples of best practices */
    showExamples: boolean;
  };

  /**
   * Hook enable/disable
   */
  hooks: {
    userPromptSubmit: boolean;
    preToolUse: boolean;
    postToolUse: boolean;
  };

  /**
   * Orchestrator mode settings (10X pair programmer)
   */
  orchestrator: {
    /** Path to feature list file */
    featureListPath: string;
    /** Path to session progress file */
    progressPath: string;
    /** Enable parallel subagent work */
    parallelEnabled: boolean;
    /** Max concurrent subagents */
    maxParallelAgents: number;
    /** Auto-run production checks before deploy */
    autoProductionChecks: boolean;
  };
}

/**
 * Default configuration values
 */
export const DEFAULT_CONFIG: WorkflowPilotConfig = {
  mode: 'guidance',

  tiers: {
    critical: { enabled: true },
    warning: { enabled: true },
    info: { enabled: true },
  },

  categories: {
    testing: true,
    git: true,
    security: true,
    claudeCode: true,
    refactoring: true,
  },

  frequency: {
    defaultCooldownMinutes: 10,
    infoCooldownMinutes: 30,
  },

  ai: {
    enabled: true,
    model: 'claude-sonnet-4-20250514',
    fallbackToRules: true,
  },

  training: {
    askIntent: true,
    explainSuggestions: true,
    showExamples: true,
  },

  hooks: {
    userPromptSubmit: true,
    preToolUse: true,
    postToolUse: true,
  },

  orchestrator: {
    featureListPath: 'feature_list.json',
    progressPath: 'claude-progress.txt',
    parallelEnabled: false,
    maxParallelAgents: 2,
    autoProductionChecks: true,
  },
};

/**
 * Mode presets - apply settings based on mode selection
 */
export const MODE_PRESETS: Record<OperatingMode, Partial<WorkflowPilotConfig>> = {
  minimal: {
    tiers: {
      critical: { enabled: true },
      warning: { enabled: false },
      info: { enabled: false },
    },
    ai: {
      enabled: false,
      model: 'claude-sonnet-4-20250514',
      fallbackToRules: true,
    },
  },

  training: {
    tiers: {
      critical: { enabled: true },
      warning: { enabled: true },
      info: { enabled: true },
    },
    frequency: {
      defaultCooldownMinutes: 5,
      infoCooldownMinutes: 15,  // More frequent tips in training
    },
    training: {
      askIntent: true,
      explainSuggestions: true,
      showExamples: true,
    },
  },

  guidance: {
    tiers: {
      critical: { enabled: true },
      warning: { enabled: true },
      info: { enabled: true },
    },
    frequency: {
      defaultCooldownMinutes: 10,
      infoCooldownMinutes: 30,  // Less frequent in guidance
    },
    training: {
      askIntent: false,
      explainSuggestions: false,
      showExamples: false,
    },
  },

  orchestrator: {
    tiers: {
      critical: { enabled: true },
      warning: { enabled: true },
      info: { enabled: true },
    },
    frequency: {
      defaultCooldownMinutes: 5,   // More active guidance
      infoCooldownMinutes: 10,
    },
    training: {
      askIntent: true,             // Ask what they're building
      explainSuggestions: true,    // Explain the process
      showExamples: false,
    },
  },
};
