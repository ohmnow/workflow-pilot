/**
 * GitHub Client
 *
 * Wrapper around the `gh` CLI for GitHub operations.
 * Uses the user's existing gh authentication - zero config required.
 */

import { spawn } from 'child_process';

export interface GitHubClientResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface GitHubRepo {
  owner: string;
  name: string;
  url: string;
  private: boolean;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  labels: string[];
  url: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  url: string;
  headBranch: string;
  baseBranch: string;
}

export interface GitHubRelease {
  tagName: string;
  name: string;
  url: string;
  draft: boolean;
  prerelease: boolean;
}

/**
 * Check if gh CLI is available and authenticated
 */
export async function isGitHubAvailable(): Promise<boolean> {
  const result = await runGhCommand(['auth', 'status']);
  return result.success;
}

/**
 * Get the current repository info from git remote
 */
export async function getCurrentRepo(): Promise<GitHubClientResult<GitHubRepo>> {
  const result = await runGhCommand<GitHubRepo>(
    ['repo', 'view', '--json', 'owner,name,url,isPrivate'],
    { parseJson: true }
  );

  if (result.success && result.data) {
    // gh returns isPrivate, we want private
    const data = result.data as unknown as { owner: { login: string }; name: string; url: string; isPrivate: boolean };
    return {
      success: true,
      data: {
        owner: data.owner.login,
        name: data.name,
        url: data.url,
        private: data.isPrivate,
      },
    };
  }

  return result;
}

/**
 * Create a new GitHub repository
 */
export async function createRepo(
  name: string,
  options: {
    private?: boolean;
    description?: string;
    pushSource?: boolean;
  } = {}
): Promise<GitHubClientResult<GitHubRepo>> {
  const args = ['repo', 'create', name];

  if (options.private !== false) {
    args.push('--private');
  } else {
    args.push('--public');
  }

  if (options.description) {
    args.push('--description', options.description);
  }

  if (options.pushSource) {
    args.push('--source', '.', '--push');
  }

  args.push('--json', 'owner,name,url,isPrivate');

  const result = await runGhCommand<GitHubRepo>(args, { parseJson: true });

  if (result.success && result.data) {
    const data = result.data as unknown as { owner: { login: string }; name: string; url: string; isPrivate: boolean };
    return {
      success: true,
      data: {
        owner: data.owner.login,
        name: data.name,
        url: data.url,
        private: data.isPrivate,
      },
    };
  }

  return result;
}

/**
 * Create a GitHub issue
 */
export async function createIssue(
  title: string,
  body: string,
  options: {
    labels?: string[];
    assignee?: string;
  } = {}
): Promise<GitHubClientResult<GitHubIssue>> {
  const args = ['issue', 'create', '--title', title, '--body', body];

  if (options.labels && options.labels.length > 0) {
    args.push('--label', options.labels.join(','));
  }

  if (options.assignee) {
    args.push('--assignee', options.assignee);
  }

  args.push('--json', 'number,title,body,state,labels,url');

  const result = await runGhCommand<GitHubIssue>(args, { parseJson: true });

  if (result.success && result.data) {
    const data = result.data as unknown as {
      number: number;
      title: string;
      body: string;
      state: string;
      labels: Array<{ name: string }>;
      url: string;
    };
    return {
      success: true,
      data: {
        number: data.number,
        title: data.title,
        body: data.body,
        state: data.state as 'open' | 'closed',
        labels: data.labels.map((l) => l.name),
        url: data.url,
      },
    };
  }

  return result;
}

/**
 * Update a GitHub issue
 */
export async function updateIssue(
  issueNumber: number,
  options: {
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
  }
): Promise<GitHubClientResult<void>> {
  const args = ['issue', 'edit', String(issueNumber)];

  if (options.title) {
    args.push('--title', options.title);
  }

  if (options.body) {
    args.push('--body', options.body);
  }

  if (options.labels) {
    args.push('--add-label', options.labels.join(','));
  }

  const result = await runGhCommand(args);

  if (options.state === 'closed' && result.success) {
    return runGhCommand(['issue', 'close', String(issueNumber)]);
  }

  return result;
}

/**
 * Close a GitHub issue
 */
export async function closeIssue(
  issueNumber: number,
  comment?: string
): Promise<GitHubClientResult<void>> {
  if (comment) {
    await runGhCommand(['issue', 'comment', String(issueNumber), '--body', comment]);
  }
  return runGhCommand(['issue', 'close', String(issueNumber)]);
}

/**
 * List open issues
 */
export async function listOpenIssues(
  options: {
    labels?: string[];
    limit?: number;
  } = {}
): Promise<GitHubClientResult<GitHubIssue[]>> {
  const args = ['issue', 'list', '--state', 'open', '--json', 'number,title,body,state,labels,url'];

  if (options.labels && options.labels.length > 0) {
    args.push('--label', options.labels.join(','));
  }

  if (options.limit) {
    args.push('--limit', String(options.limit));
  }

  const result = await runGhCommand<GitHubIssue[]>(args, { parseJson: true });

  if (result.success && result.data) {
    const items = result.data as unknown as Array<{
      number: number;
      title: string;
      body: string;
      state: string;
      labels: Array<{ name: string }>;
      url: string;
    }>;
    return {
      success: true,
      data: items.map((item) => ({
        number: item.number,
        title: item.title,
        body: item.body,
        state: item.state as 'open' | 'closed',
        labels: item.labels.map((l) => l.name),
        url: item.url,
      })),
    };
  }

  return result as GitHubClientResult<GitHubIssue[]>;
}

/**
 * Create a pull request
 */
export async function createPR(
  title: string,
  body: string,
  options: {
    base?: string;
    head?: string;
    draft?: boolean;
  } = {}
): Promise<GitHubClientResult<GitHubPR>> {
  const args = ['pr', 'create', '--title', title, '--body', body];

  if (options.base) {
    args.push('--base', options.base);
  }

  if (options.head) {
    args.push('--head', options.head);
  }

  if (options.draft) {
    args.push('--draft');
  }

  args.push('--json', 'number,title,body,state,isDraft,url,headRefName,baseRefName');

  const result = await runGhCommand<GitHubPR>(args, { parseJson: true });

  if (result.success && result.data) {
    const data = result.data as unknown as {
      number: number;
      title: string;
      body: string;
      state: string;
      isDraft: boolean;
      url: string;
      headRefName: string;
      baseRefName: string;
    };
    return {
      success: true,
      data: {
        number: data.number,
        title: data.title,
        body: data.body,
        state: data.state as 'open' | 'closed' | 'merged',
        draft: data.isDraft,
        url: data.url,
        headBranch: data.headRefName,
        baseBranch: data.baseRefName,
      },
    };
  }

  return result as GitHubClientResult<GitHubPR>;
}

/**
 * List open pull requests
 */
export async function listOpenPRs(
  options: {
    limit?: number;
  } = {}
): Promise<GitHubClientResult<GitHubPR[]>> {
  const args = ['pr', 'list', '--state', 'open', '--json', 'number,title,body,state,isDraft,url,headRefName,baseRefName'];

  if (options.limit) {
    args.push('--limit', String(options.limit));
  }

  const result = await runGhCommand<GitHubPR[]>(args, { parseJson: true });

  if (result.success && result.data) {
    const items = result.data as unknown as Array<{
      number: number;
      title: string;
      body: string;
      state: string;
      isDraft: boolean;
      url: string;
      headRefName: string;
      baseRefName: string;
    }>;
    return {
      success: true,
      data: items.map((item) => ({
        number: item.number,
        title: item.title,
        body: item.body,
        state: item.state as 'open' | 'closed' | 'merged',
        draft: item.isDraft,
        url: item.url,
        headBranch: item.headRefName,
        baseBranch: item.baseRefName,
      })),
    };
  }

  return result as GitHubClientResult<GitHubPR[]>;
}

/**
 * Create a release
 */
export async function createRelease(
  tag: string,
  options: {
    title?: string;
    notes?: string;
    draft?: boolean;
    prerelease?: boolean;
    target?: string;
  } = {}
): Promise<GitHubClientResult<GitHubRelease>> {
  const args = ['release', 'create', tag];

  if (options.title) {
    args.push('--title', options.title);
  }

  if (options.notes) {
    args.push('--notes', options.notes);
  }

  if (options.draft) {
    args.push('--draft');
  }

  if (options.prerelease) {
    args.push('--prerelease');
  }

  if (options.target) {
    args.push('--target', options.target);
  }

  args.push('--json', 'tagName,name,url,isDraft,isPrerelease');

  const result = await runGhCommand<GitHubRelease>(args, { parseJson: true });

  if (result.success && result.data) {
    const data = result.data as unknown as {
      tagName: string;
      name: string;
      url: string;
      isDraft: boolean;
      isPrerelease: boolean;
    };
    return {
      success: true,
      data: {
        tagName: data.tagName,
        name: data.name,
        url: data.url,
        draft: data.isDraft,
        prerelease: data.isPrerelease,
      },
    };
  }

  return result as GitHubClientResult<GitHubRelease>;
}

/**
 * Run a gh CLI command
 */
async function runGhCommand<T = void>(
  args: string[],
  options: { parseJson?: boolean; timeout?: number } = {}
): Promise<GitHubClientResult<T>> {
  const { parseJson = false, timeout = 30000 } = options;

  return new Promise((resolve) => {
    if (process.env.WORKFLOW_PILOT_DEBUG === '1') {
      console.error(`[WP Debug] Running: gh ${args.join(' ')}`);
    }

    const child = spawn('gh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (process.env.WORKFLOW_PILOT_DEBUG === '1') {
        console.error('[WP Debug] gh completed, exit code:', code);
        if (stderr) console.error('[WP Debug] gh stderr:', stderr);
      }

      if (code === 0) {
        if (parseJson && stdout.trim()) {
          try {
            const data = JSON.parse(stdout.trim()) as T;
            resolve({ success: true, data });
          } catch {
            resolve({ success: false, error: 'Failed to parse JSON response' });
          }
        } else {
          resolve({ success: true });
        }
      } else {
        resolve({
          success: false,
          error: stderr.trim() || `gh command failed with exit code ${code}`,
        });
      }
    });

    child.on('error', (err) => {
      if (process.env.WORKFLOW_PILOT_DEBUG === '1') {
        console.error('[WP Debug] gh spawn error:', err);
      }
      resolve({
        success: false,
        error: err.message === 'spawn gh ENOENT'
          ? 'gh CLI not found. Install from https://cli.github.com/'
          : err.message,
      });
    });

    // Timeout
    setTimeout(() => {
      if (process.env.WORKFLOW_PILOT_DEBUG === '1') {
        console.error('[WP Debug] gh timeout, killing process');
      }
      child.kill('SIGTERM');
      resolve({ success: false, error: 'Command timed out' });
    }, timeout);
  });
}
