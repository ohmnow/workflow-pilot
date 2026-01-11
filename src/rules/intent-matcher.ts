/**
 * Intent Matcher
 *
 * Fuzzy matching engine for detecting user intent regardless of exact phrasing.
 * Uses word combinations to detect security-sensitive operations.
 *
 * Balanced approach: requires action + target combination to trigger.
 */

// Action words that indicate doing something with version control or files
const GIT_ACTION_WORDS = [
  'git',
  'add',
  'commit',
  'stage',
  'push',
  'include',
  'track',
  'upload',
  'save',
  'check in',
  'checkin',
  'check-in',
  'put',
  'store',
  'submit',
  'publish',
];

// Sensitive file/content targets
const SENSITIVE_TARGETS = [
  // Environment files
  '.env',
  'env file',
  'environment',
  'dotenv',
  // Credentials
  'secret',
  'secrets',
  'credential',
  'credentials',
  'password',
  'passwords',
  'api key',
  'apikey',
  'api-key',
  'token',
  'tokens',
  'auth',
  'authentication',
  // Keys and certificates
  'private key',
  'privatekey',
  'private-key',
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  'certificate',
  'cert',
  // Config files that often contain secrets
  'config.json',
  'settings.json',
  'credentials.json',
  '.npmrc',
  '.pypirc',
  // AWS
  'aws_access',
  'aws_secret',
  'aws credentials',
  // Database
  'database url',
  'db password',
  'connection string',
];

// Dangerous/destructive action words
const DESTRUCTIVE_ACTIONS = [
  'force push',
  'force-push',
  '--force',
  'push -f',      // git push -f
  'push  -f',     // with extra space
  'reset --hard',
  'reset hard',
  'clean -f',
  'clean -fd',
  'delete all',
  'remove all',
  'rm -rf',
  'drop database',
  'drop table',
  'truncate',
  'wipe',
];

// Words that indicate code content (for detecting secrets in code)
const CODE_CONTENT_INDICATORS = [
  'hardcode',
  'hard-code',
  'hard code',
  'inline',
  'embed',
  'write',
  'put in',
  'add to',
  'set to',
  'equals',
  '=',
];

export type IntentType =
  | 'committing-secrets'      // Adding sensitive files to git
  | 'hardcoding-secrets'      // Writing secrets directly in code
  | 'destructive-operation'   // Force push, reset hard, etc.
  | 'exposing-credentials';   // Discussing credentials in a risky context

export interface IntentMatch {
  type: IntentType;
  confidence: number;  // 0-1, higher = more certain
  matchedAction: string;
  matchedTarget: string;
  reasoning: string;
}

/**
 * Normalize text for matching
 * - Lowercase
 * - Normalize whitespace
 * - Keep special characters for file extensions
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if text contains a word/phrase (word boundary aware for short terms)
 */
function containsWord(text: string, word: string): boolean {
  const normalizedText = normalize(text);
  const normalizedWord = normalize(word);

  // For short words (<=3 chars), use word boundary matching
  if (normalizedWord.length <= 3) {
    const regex = new RegExp(`\\b${escapeRegex(normalizedWord)}\\b`, 'i');
    return regex.test(normalizedText);
  }

  // For longer words/phrases, simple includes is fine
  return normalizedText.includes(normalizedWord);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find the first matching word from a list
 */
function findMatchingWord(text: string, words: string[]): string | null {
  for (const word of words) {
    if (containsWord(text, word)) {
      return word;
    }
  }
  return null;
}

/**
 * Check if text matches an intent pattern
 *
 * Balanced approach:
 * - Requires BOTH action word AND target word
 * - Returns confidence based on specificity of match
 */
export function matchIntent(text: string, context?: {
  isCommand?: boolean;      // Is this a bash command?
  isCodeContent?: boolean;  // Is this code being written?
  hasGitContext?: boolean;  // Is there recent git activity?
}): IntentMatch | null {
  const normalizedText = normalize(text);

  // 1. Check for destructive operations (these are action-only, no target needed)
  const destructiveAction = findMatchingWord(normalizedText, DESTRUCTIVE_ACTIONS);
  if (destructiveAction) {
    return {
      type: 'destructive-operation',
      confidence: 0.9,
      matchedAction: destructiveAction,
      matchedTarget: '',
      reasoning: `Detected destructive action: "${destructiveAction}"`,
    };
  }

  // 2. Check for committing secrets (action + sensitive target)
  const gitAction = findMatchingWord(normalizedText, GIT_ACTION_WORDS);
  const sensitiveTarget = findMatchingWord(normalizedText, SENSITIVE_TARGETS);

  if (gitAction && sensitiveTarget) {
    // High confidence if both are present
    let confidence = 0.8;

    // Boost confidence for specific file extensions
    if (sensitiveTarget.startsWith('.')) {
      confidence = 0.95;
    }

    // Boost confidence if it's actually a command
    if (context?.isCommand) {
      confidence = Math.min(confidence + 0.1, 1.0);
    }

    return {
      type: 'committing-secrets',
      confidence,
      matchedAction: gitAction,
      matchedTarget: sensitiveTarget,
      reasoning: `Detected attempt to ${gitAction} ${sensitiveTarget} - this may expose secrets`,
    };
  }

  // 3. Check for hardcoding secrets in code
  if (context?.isCodeContent) {
    const codeAction = findMatchingWord(normalizedText, CODE_CONTENT_INDICATORS);
    if (codeAction && sensitiveTarget) {
      return {
        type: 'hardcoding-secrets',
        confidence: 0.75,
        matchedAction: codeAction,
        matchedTarget: sensitiveTarget,
        reasoning: `Detected hardcoding of ${sensitiveTarget} - use environment variables instead`,
      };
    }
  }

  // 4. If only sensitive target is mentioned (lower confidence)
  if (sensitiveTarget && context?.hasGitContext) {
    return {
      type: 'exposing-credentials',
      confidence: 0.5,
      matchedAction: 'discussing',
      matchedTarget: sensitiveTarget,
      reasoning: `Discussing ${sensitiveTarget} in git context - ensure these aren't committed`,
    };
  }

  return null;
}

/**
 * Check multiple text sources for intent
 * Useful for checking both user prompt and tool command
 */
export function matchIntentMultiple(texts: Array<{
  text: string;
  context?: {
    isCommand?: boolean;
    isCodeContent?: boolean;
    hasGitContext?: boolean;
  };
}>): IntentMatch | null {
  let bestMatch: IntentMatch | null = null;

  for (const { text, context } of texts) {
    const match = matchIntent(text, context);
    if (match && (!bestMatch || match.confidence > bestMatch.confidence)) {
      bestMatch = match;
    }
  }

  return bestMatch;
}

/**
 * Quick check if text mentions anything sensitive (for pre-filtering)
 */
export function hasSensitiveMention(text: string): boolean {
  return findMatchingWord(text, SENSITIVE_TARGETS) !== null;
}

/**
 * Quick check if text mentions git actions (for pre-filtering)
 */
export function hasGitAction(text: string): boolean {
  return findMatchingWord(text, GIT_ACTION_WORDS) !== null;
}
