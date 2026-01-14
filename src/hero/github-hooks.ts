/**
 * GitHub Integration Hooks for Orchestrator Mode
 *
 * Extends orchestrator hooks with GitHub-specific functionality:
 * - Inject GitHub context (open issues, PRs) into prompts
 * - Create issues when features are defined
 * - Create PRs when features are implemented
 * - Create releases when sprints complete
 */

import { OrchestratorState, GitHubState, loadState, updateState } from './state.js';
import { Feature, FeatureList } from './feature-schema.js';
import {
  getGitHubStatus,
  getGitHubContext,
  isGitHubAvailable,
  getRepoStatus,
  initializeGitHubRepo,
  createIssueFromFeature,
  createPRForFeature,
  closeFeatureIssue,
  createSprintRelease,
  isSprintReadyForRelease,
  GitHubFeature,
} from '../github/index.js';

/**
 * Result from GitHub hook processing
 */
export interface GitHubHookResult {
  /** Context to inject about GitHub state */
  contextInjection?: string;
  /** Message about GitHub operations */
  message?: string;
  /** Whether GitHub features are available */
  available: boolean;
}

/**
 * Check GitHub status and provide context for UserPromptSubmit
 */
export async function getGitHubHookContext(
  projectDir: string = process.cwd()
): Promise<GitHubHookResult> {
  const state = loadState(projectDir);

  // If GitHub not initialized in state, check availability
  if (!state?.github?.initialized) {
    const available = await isGitHubAvailable();

    if (!available) {
      return {
        available: false,
        message: 'GitHub CLI not available. Run `gh auth login` to enable GitHub integration.',
      };
    }

    // Check repo status
    const repoStatus = await getRepoStatus(projectDir);

    if (!repoStatus.isGitRepo) {
      return {
        available: true,
        contextInjection: `
### GitHub Integration Available
This project is not yet a git repository. When ready, I can help:
1. Initialize a git repository
2. Create a GitHub repo
3. Link features to GitHub issues
`,
      };
    }

    if (!repoStatus.isGitHubRepo) {
      return {
        available: true,
        contextInjection: `
### GitHub Integration Available
This is a git repository but not connected to GitHub. When ready, I can help:
1. Create a GitHub repository
2. Link features to GitHub issues
`,
      };
    }

    // Has GitHub repo but not initialized in state
    return {
      available: true,
      contextInjection: `
### GitHub Repository Connected
**${repoStatus.repo?.owner}/${repoStatus.repo?.name}**

GitHub integration is available. I can:
- Create issues for features
- Create PRs when features are complete
- Create releases when sprints are done
`,
    };
  }

  // GitHub is initialized - get full context
  const context = await getGitHubContext(projectDir);

  if (!context) {
    return {
      available: true,
      contextInjection: `
### GitHub: ${state.github.repoOwner}/${state.github.repoName}
No open issues or PRs.
`,
    };
  }

  return {
    available: true,
    contextInjection: context,
  };
}

/**
 * Initialize GitHub for a project
 */
export async function initializeGitHub(
  projectName: string,
  options: {
    description?: string;
    private?: boolean;
    projectDir?: string;
  } = {}
): Promise<{ success: boolean; message: string; state?: GitHubState }> {
  const projectDir = options.projectDir || process.cwd();

  // Check if already initialized
  const state = loadState(projectDir);
  if (state?.github?.initialized) {
    return {
      success: true,
      message: `Already connected to ${state.github.repoOwner}/${state.github.repoName}`,
      state: state.github,
    };
  }

  // Check existing repo first
  const repoStatus = await getRepoStatus(projectDir);
  if (repoStatus.isGitHubRepo && repoStatus.repo) {
    const github: GitHubState = {
      repoOwner: repoStatus.repo.owner,
      repoName: repoStatus.repo.name,
      initialized: true,
      issuesCreated: false,
    };

    updateState({ github }, projectDir);

    return {
      success: true,
      message: `Connected to existing repo: ${github.repoOwner}/${github.repoName}`,
      state: github,
    };
  }

  // Create new repo
  const result = await initializeGitHubRepo(projectName, {
    description: options.description,
    private: options.private,
    projectDir,
  });

  if (!result.success || !result.data) {
    return {
      success: false,
      message: result.error || 'Failed to create GitHub repository',
    };
  }

  const github: GitHubState = {
    repoOwner: result.data.owner,
    repoName: result.data.name,
    initialized: true,
    issuesCreated: false,
  };

  updateState({ github }, projectDir);

  return {
    success: true,
    message: `Created and connected to ${github.repoOwner}/${github.repoName}`,
    state: github,
  };
}

/**
 * Create GitHub issues for all features in the feature list
 */
export async function createIssuesForAllFeatures(
  featureList: FeatureList,
  projectDir: string = process.cwd()
): Promise<{ success: boolean; created: number; message: string }> {
  const state = loadState(projectDir);

  if (!state?.github?.initialized) {
    return {
      success: false,
      created: 0,
      message: 'GitHub not initialized. Run GitHub setup first.',
    };
  }

  let created = 0;
  const errors: string[] = [];

  for (const feature of featureList.features) {
    // Skip if already has an issue
    if (feature.githubIssue) {
      continue;
    }

    const result = await createIssueFromFeature(feature);

    if (result.success && result.data) {
      feature.githubIssue = result.data.number;
      created++;
    } else {
      errors.push(`${feature.name}: ${result.error}`);
    }
  }

  // Update state to mark issues as created
  if (created > 0) {
    updateState({
      github: {
        ...state.github,
        issuesCreated: true,
        lastSync: new Date().toISOString(),
      },
    }, projectDir);
  }

  if (errors.length > 0) {
    return {
      success: created > 0,
      created,
      message: `Created ${created} issues. Errors: ${errors.join('; ')}`,
    };
  }

  return {
    success: true,
    created,
    message: `Created ${created} GitHub issues for features`,
  };
}

/**
 * Create a PR for a completed feature
 */
export async function createPRForCompletedFeature(
  feature: Feature,
  projectDir: string = process.cwd()
): Promise<{ success: boolean; prNumber?: number; message: string }> {
  const state = loadState(projectDir);

  if (!state?.github?.initialized) {
    return {
      success: false,
      message: 'GitHub not initialized',
    };
  }

  // Check if feature is ready
  if (feature.status !== 'implemented' && feature.status !== 'verified') {
    return {
      success: false,
      message: `Feature must be implemented or verified. Current status: ${feature.status}`,
    };
  }

  // Already has a PR
  if (feature.githubPR) {
    return {
      success: true,
      prNumber: feature.githubPR,
      message: `PR #${feature.githubPR} already exists`,
    };
  }

  const result = await createPRForFeature(feature as GitHubFeature, {
    projectDir,
  });

  if (result.success && result.data) {
    return {
      success: true,
      prNumber: result.data.number,
      message: `Created PR #${result.data.number}: ${result.data.url}`,
    };
  }

  return {
    success: false,
    message: result.error || 'Failed to create PR',
  };
}

/**
 * Create a release for a completed sprint
 */
export async function createReleaseForSprint(
  featureList: FeatureList,
  sprintNumber: number,
  projectDir: string = process.cwd()
): Promise<{ success: boolean; tag?: string; message: string }> {
  const state = loadState(projectDir);

  if (!state?.github?.initialized) {
    return {
      success: false,
      message: 'GitHub not initialized',
    };
  }

  // Check if sprint is ready
  const readiness = isSprintReadyForRelease(featureList, sprintNumber);
  if (!readiness.ready) {
    return {
      success: false,
      message: readiness.reason || 'Sprint not ready for release',
    };
  }

  const result = await createSprintRelease(featureList, sprintNumber);

  if (result.success && result.data) {
    return {
      success: true,
      tag: result.data.tagName,
      message: `Created release ${result.data.tagName}: ${result.data.url}`,
    };
  }

  return {
    success: false,
    message: result.error || 'Failed to create release',
  };
}

/**
 * Close issue when feature is verified
 */
export async function closeIssueForVerifiedFeature(
  feature: Feature,
  projectDir: string = process.cwd()
): Promise<{ success: boolean; message: string }> {
  if (!feature.githubIssue) {
    return {
      success: false,
      message: 'Feature has no linked GitHub issue',
    };
  }

  if (!feature.passes) {
    return {
      success: false,
      message: 'Feature has not passed verification',
    };
  }

  const result = await closeFeatureIssue(feature as GitHubFeature);

  if (result.success) {
    return {
      success: true,
      message: `Closed issue #${feature.githubIssue}`,
    };
  }

  return {
    success: false,
    message: result.error || 'Failed to close issue',
  };
}

/**
 * Get GitHub setup prompt for new projects
 */
export function getGitHubSetupPrompt(projectName: string): string {
  return `
### GitHub Integration

Would you like to set up GitHub integration for "${projectName}"?

This will:
1. Create a private GitHub repository
2. Push your code
3. Link features to GitHub issues as you develop

Benefits:
- **Professional workflow**: Learn industry-standard development practices
- **Visible progress**: Track progress on GitHub, not just in chat
- **Audit trail**: All decisions documented in issues and PRs
- **Collaboration-ready**: Others can join your project anytime

To enable, just say "yes, set up GitHub" or "initialize GitHub".
`;
}
