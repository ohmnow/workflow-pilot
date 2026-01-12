/**
 * GitHub Integration Module
 *
 * Provides GitHub integration for Workflow Pilot orchestrator mode.
 * Uses gh CLI for zero-config authentication.
 */

// Re-export all GitHub functionality
export * from './client.js';
export * from './repo-manager.js';
export * from './issue-manager.js';
export * from './pr-manager.js';
export * from './release-manager.js';
export * from './worker-labeler.js';
export * from './workflow-generator.js';

// Convenience function to check GitHub availability
import { isGitHubAvailable } from './client.js';
import { getRepoStatus, RepoStatus } from './repo-manager.js';
import { getOpenFeatureIssues } from './issue-manager.js';
import { getPRContext } from './pr-manager.js';

/**
 * Full GitHub status check
 */
export async function getGitHubStatus(projectDir?: string): Promise<{
  available: boolean;
  repoStatus: RepoStatus;
  message: string;
}> {
  const ghAvailable = await isGitHubAvailable();

  if (!ghAvailable) {
    return {
      available: false,
      repoStatus: {
        ghAvailable: false,
        isGitRepo: false,
        hasRemote: false,
        isGitHubRepo: false,
      },
      message: 'GitHub CLI not available. Install from https://cli.github.com/ and run: gh auth login',
    };
  }

  const repoStatus = await getRepoStatus(projectDir);

  let message = '';
  if (!repoStatus.isGitRepo) {
    message = 'Not a git repository. Would you like to initialize one?';
  } else if (!repoStatus.hasRemote) {
    message = 'No remote origin. Would you like to create a GitHub repository?';
  } else if (!repoStatus.isGitHubRepo) {
    message = 'Remote is not a GitHub repository.';
  } else if (repoStatus.repo) {
    message = `Connected to ${repoStatus.repo.owner}/${repoStatus.repo.name}`;
  }

  return {
    available: ghAvailable && repoStatus.isGitHubRepo,
    repoStatus,
    message,
  };
}

/**
 * Get context for prompt injection
 */
export async function getGitHubContext(projectDir?: string): Promise<string | null> {
  const status = await getGitHubStatus(projectDir);

  if (!status.available) {
    return null;
  }

  const sections: string[] = [];

  // Repo info
  if (status.repoStatus.repo) {
    sections.push(`## GitHub Repository`);
    sections.push(`**${status.repoStatus.repo.owner}/${status.repoStatus.repo.name}**`);
    sections.push('');
  }

  // Open issues
  const issuesResult = await getOpenFeatureIssues();
  if (issuesResult.success && issuesResult.data && issuesResult.data.length > 0) {
    sections.push('### Open Issues');
    for (const issue of issuesResult.data.slice(0, 5)) {
      const labels = issue.labels.length > 0 ? ` [${issue.labels.join(', ')}]` : '';
      sections.push(`- #${issue.number}: ${issue.title}${labels}`);
    }
    if (issuesResult.data.length > 5) {
      sections.push(`  ...and ${issuesResult.data.length - 5} more`);
    }
    sections.push('');
  }

  // Open PRs
  const prContext = await getPRContext();
  if (prContext) {
    sections.push(prContext);
  }

  if (sections.length === 0) {
    return null;
  }

  return sections.join('\n');
}
