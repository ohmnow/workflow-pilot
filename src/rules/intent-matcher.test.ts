/**
 * Intent Matcher Tests
 *
 * Verifies fuzzy matching works with varied phrasings
 */

import { describe, it, expect, test } from 'vitest';
import { matchIntent, matchIntentMultiple, hasSensitiveMention, hasGitAction } from './intent-matcher.js';

describe('Intent Matcher', () => {
  describe('committing-secrets detection', () => {
    // These should ALL trigger the committing-secrets intent
    const shouldMatch = [
      'git commit .env',
      'git add .env',
      'add the env file to git',
      'commit the environment file',
      'push the .env to the repo',
      'stage credentials.json',
      'git add credentials',
      'commit my api key file',
      'add the secrets file',
      'check in the .pem file',
      'git commit private key',
      'upload the token file',
      'git add config.json',  // Often contains secrets
      'commit the password file',
      'push my aws credentials',
    ];

    it.each(shouldMatch)('should detect: "%s"', (phrase) => {
      const result = matchIntent(phrase, { hasGitContext: true });
      expect(result).not.toBeNull();
      expect(result?.type).toBe('committing-secrets');
      expect(result?.confidence).toBeGreaterThanOrEqual(0.7);
    });

    // These should NOT trigger (no combination of action + sensitive target)
    const shouldNotMatch = [
      'git commit',                    // No sensitive target
      'add some files',                // No sensitive target
      '.env file exists',              // No git action
      'read the credentials',          // Not committing
      'check the api key',             // Not committing
      'delete the .env file',          // Not git
      'git add .env.example',          // Template file is safe
      'git add .env.sample',           // Template file is safe
      'git add .env.template',         // Template file is safe
      'commit .env.example',           // Template file is safe
      'git add config.example.json',   // Template file is safe
      'Co-Authored-By: Claude',        // "auth" in "Author" should not trigger
      'git commit by author',          // "auth" substring in "author"
    ];

    it.each(shouldNotMatch)('should NOT detect: "%s"', (phrase) => {
      const result = matchIntent(phrase);
      // Either null or not committing-secrets with high confidence
      if (result?.type === 'committing-secrets') {
        expect(result.confidence).toBeLessThan(0.7);
      }
    });
  });

  describe('destructive-operation detection', () => {
    const shouldMatch = [
      'git push --force',
      'git push -f',
      'force push to main',
      'git reset --hard',
      'reset hard to origin',
      'rm -rf /',
      'wipe the server',
      'drop database production',
      'truncate the table',
    ];

    it.each(shouldMatch)('should detect: "%s"', (phrase) => {
      const result = matchIntent(phrase);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('destructive-operation');
    });

    // These should NOT trigger (false positive prevention - substring issues)
    const shouldNotMatch = [
      'swipe from left to right',        // "swipe" contains "wipe" - word boundary prevents match
      'swipe navigation not working',    // UI discussion
      'implement swipe to delete',       // Feature request mentioning swipe
      'the swipe gesture is buggy',      // Bug report about UI
      'add swipe support',               // Feature request
    ];

    it.each(shouldNotMatch)('should NOT detect: "%s"', (phrase) => {
      const result = matchIntent(phrase);
      // Should not match destructive-operation
      expect(result?.type).not.toBe('destructive-operation');
    });
  });

  describe('helper functions', () => {
    it('hasSensitiveMention detects sensitive words', () => {
      expect(hasSensitiveMention('.env file')).toBe(true);
      expect(hasSensitiveMention('api key')).toBe(true);
      expect(hasSensitiveMention('password')).toBe(true);
      expect(hasSensitiveMention('some random text')).toBe(false);
    });

    it('hasGitAction detects git actions', () => {
      expect(hasGitAction('git commit')).toBe(true);
      expect(hasGitAction('add to staging')).toBe(true);
      expect(hasGitAction('push the changes')).toBe(true);
      expect(hasGitAction('read the file')).toBe(false);
    });
  });

  describe('matchIntentMultiple', () => {
    it('picks highest confidence match', () => {
      const result = matchIntentMultiple([
        { text: 'some text', context: {} },
        { text: 'git add .env', context: { isCommand: true } },
      ]);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('committing-secrets');
    });
  });

  describe('substring false positive prevention', () => {
    // Words that appear as substrings in common words should NOT trigger
    // This tests that word boundary matching works correctly
    const substringFalsePositives = [
      // "token" in "tokenize"
      { phrase: 'tokenize the input', word: 'token' },
      { phrase: 'add tokenization logic', word: 'token' },
      { phrase: 'the tokenizer is broken', word: 'token' },
      // "secret" in "secretary"
      { phrase: 'contact the secretary', word: 'secret' },
      { phrase: 'secretarial work', word: 'secret' },
      // "cert" in "uncertain", "concert"
      { phrase: 'I am uncertain about this', word: 'cert' },
      { phrase: 'going to a concert', word: 'cert' },
      { phrase: 'certify the document', word: 'cert' },
      // "inline" in "deadline", "guideline"
      { phrase: 'check the deadline', word: 'inline' },
      { phrase: 'follow the guideline', word: 'inline' },
      { phrase: 'book an airline ticket', word: 'inline' },
      { phrase: 'mainline branch', word: 'inline' },
      // "stage" in "backstage"
      { phrase: 'backstage pass', word: 'stage' },
      { phrase: 'multistage process', word: 'stage' },
      // "track" in "backtrack", "soundtrack"
      { phrase: 'lets backtrack on this', word: 'track' },
      { phrase: 'play the soundtrack', word: 'track' },
      { phrase: 'sidetrack the discussion', word: 'track' },
      // "store" in "restore"
      { phrase: 'restore from backup', word: 'store' },
      { phrase: 'restoring the database', word: 'store' },
      // "commit" in "committee"
      { phrase: 'committee meeting notes', word: 'commit' },
      { phrase: 'commitment to quality', word: 'commit' },
    ];

    it.each(substringFalsePositives)(
      'should NOT match "$word" in: "$phrase"',
      ({ phrase }) => {
        const result = matchIntent(phrase);
        // Should be null (no match) for these false positive cases
        expect(result).toBeNull();
      }
    );

    // But standalone words SHOULD still match when appropriate
    const shouldStillMatch = [
      { phrase: 'git add the token file', type: 'committing-secrets' },
      { phrase: 'commit the secret key', type: 'committing-secrets' },
      { phrase: 'upload the cert file', type: 'committing-secrets' },
      { phrase: 'stage the credentials', type: 'committing-secrets' },
    ];

    it.each(shouldStillMatch)(
      'should STILL match standalone word: "$phrase"',
      ({ phrase, type }) => {
        const result = matchIntent(phrase, { hasGitContext: true });
        expect(result).not.toBeNull();
        expect(result?.type).toBe(type);
      }
    );
  });

  describe('commit message filtering (false positive prevention)', () => {
    // Commands with -m messages mentioning .env should NOT trigger
    const shouldNotMatchWithMessage = [
      'git commit -m "Fix .env handling"',
      'git commit -m "Update .env documentation"',
      "git commit -m 'Add .env to gitignore'",
      'git commit -m "Handle credentials properly"',
      'git commit -m "Fix api key rotation"',
      'git commit -m "Update secrets management"',
      'git commit -am "Fix .env parsing"',
    ];

    it.each(shouldNotMatchWithMessage)(
      'should NOT trigger on commit message: "%s"',
      (command) => {
        const result = matchIntent(command, { isCommand: true });
        // Should not match committing-secrets (message content should be ignored)
        if (result?.type === 'committing-secrets') {
          expect(result.confidence).toBeLessThan(0.7);
        }
      }
    );

    // These SHOULD still trigger (actual files being added/committed)
    const shouldStillMatch = [
      'git add .env',
      'git add .env.local',
      'git commit .env -m "add env"',  // File before -m
      'git stage credentials.json',
      'git add config.json && git commit -m "update"',
    ];

    it.each(shouldStillMatch)(
      'should STILL trigger on actual file: "%s"',
      (command) => {
        const result = matchIntent(command, { isCommand: true });
        expect(result).not.toBeNull();
        expect(result?.type).toBe('committing-secrets');
        expect(result?.confidence).toBeGreaterThanOrEqual(0.7);
      }
    );
  });
});
