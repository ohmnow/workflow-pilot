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
      'wipe the database',
      'drop database production',
    ];

    it.each(shouldMatch)('should detect: "%s"', (phrase) => {
      const result = matchIntent(phrase);
      expect(result).not.toBeNull();
      expect(result?.type).toBe('destructive-operation');
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
});
