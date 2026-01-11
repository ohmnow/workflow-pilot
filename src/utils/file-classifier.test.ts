/**
 * File Classifier Tests
 */

import { describe, it, expect } from 'vitest';
import {
  classifyFile,
  isTestFile,
  isSensitiveFile,
  shouldTriggerTestReminder,
  hasCodeFiles,
} from './file-classifier.js';

describe('File Classifier', () => {
  describe('classifyFile', () => {
    describe('code files', () => {
      it('classifies TypeScript files as code', () => {
        expect(classifyFile('src/index.ts').type).toBe('code');
        expect(classifyFile('components/Button.tsx').type).toBe('code');
      });

      it('classifies JavaScript files as code', () => {
        expect(classifyFile('src/utils.js').type).toBe('code');
        expect(classifyFile('components/Card.jsx').type).toBe('code');
        expect(classifyFile('lib/module.mjs').type).toBe('code');
      });

      it('classifies Python files as code', () => {
        expect(classifyFile('app.py').type).toBe('code');
        expect(classifyFile('models/user.py').type).toBe('code');
      });

      it('classifies Go files as code', () => {
        expect(classifyFile('main.go').type).toBe('code');
        expect(classifyFile('handlers/api.go').type).toBe('code');
      });

      it('classifies Rust files as code', () => {
        expect(classifyFile('src/main.rs').type).toBe('code');
        expect(classifyFile('lib.rs').type).toBe('code');
      });

      it('classifies Java files as code', () => {
        expect(classifyFile('Main.java').type).toBe('code');
        expect(classifyFile('com/example/App.java').type).toBe('code');
      });

      it('classifies C/C++ files as code', () => {
        expect(classifyFile('main.c').type).toBe('code');
        expect(classifyFile('utils.cpp').type).toBe('code');
        expect(classifyFile('header.h').type).toBe('code');
      });

      it('includes language information', () => {
        expect(classifyFile('index.ts').language).toBe('typescript');
        expect(classifyFile('app.py').language).toBe('python');
        expect(classifyFile('main.go').language).toBe('go');
      });
    });

    describe('test files', () => {
      it('classifies .test.ts files as test', () => {
        expect(classifyFile('index.test.ts').type).toBe('test');
        expect(classifyFile('src/utils.test.ts').type).toBe('test');
      });

      it('classifies .spec.ts files as test', () => {
        expect(classifyFile('index.spec.ts').type).toBe('test');
        expect(classifyFile('Button.spec.tsx').type).toBe('test');
      });

      it('classifies Python test files as test', () => {
        expect(classifyFile('test_app.py').type).toBe('test');
        expect(classifyFile('app_test.py').type).toBe('test');
      });

      it('classifies Go test files as test', () => {
        expect(classifyFile('main_test.go').type).toBe('test');
        expect(classifyFile('handlers_test.go').type).toBe('test');
      });

      it('classifies files in __tests__ directory as test', () => {
        expect(classifyFile('__tests__/Button.ts').type).toBe('test');
        expect(classifyFile('src/__tests__/utils.js').type).toBe('test');
      });

      it('marks test files with isTest flag', () => {
        expect(classifyFile('index.test.ts').isTest).toBe(true);
        expect(classifyFile('index.ts').isTest).toBe(false);
      });
    });

    describe('config files', () => {
      it('classifies JSON files as config', () => {
        expect(classifyFile('package.json').type).toBe('config');
        expect(classifyFile('tsconfig.json').type).toBe('config');
      });

      it('classifies YAML files as config', () => {
        expect(classifyFile('config.yaml').type).toBe('config');
        expect(classifyFile('docker-compose.yml').type).toBe('config');
      });

      it('classifies TOML files as config', () => {
        expect(classifyFile('pyproject.toml').type).toBe('config');
        expect(classifyFile('Cargo.toml').type).toBe('config');
      });

      it('classifies dotfiles as config', () => {
        expect(classifyFile('.gitignore').type).toBe('config');
        expect(classifyFile('.eslintrc').type).toBe('config');
        expect(classifyFile('.prettierrc').type).toBe('config');
      });
    });

    describe('documentation files', () => {
      it('classifies markdown files as docs', () => {
        expect(classifyFile('README.md').type).toBe('docs');
        expect(classifyFile('docs/guide.md').type).toBe('docs');
      });

      it('classifies text files as docs', () => {
        expect(classifyFile('notes.txt').type).toBe('docs');
        expect(classifyFile('CHANGELOG.txt').type).toBe('docs');
      });

      it('classifies LICENSE file as docs', () => {
        expect(classifyFile('LICENSE').type).toBe('docs');
        expect(classifyFile('LICENSE.md').type).toBe('docs');
      });
    });

    describe('style files', () => {
      it('classifies CSS files as style', () => {
        expect(classifyFile('styles.css').type).toBe('style');
        expect(classifyFile('theme.scss').type).toBe('style');
      });
    });

    describe('sensitive files', () => {
      it('marks .env files as sensitive', () => {
        expect(classifyFile('.env').isSensitive).toBe(true);
        expect(classifyFile('.env.local').isSensitive).toBe(true);
        expect(classifyFile('.env.production').isSensitive).toBe(true);
      });

      it('marks key files as sensitive', () => {
        expect(classifyFile('id_rsa').isSensitive).toBe(true);
        expect(classifyFile('server.pem').isSensitive).toBe(true);
        expect(classifyFile('private.key').isSensitive).toBe(true);
      });

      it('marks credentials files as sensitive', () => {
        expect(classifyFile('credentials.json').isSensitive).toBe(true);
        expect(classifyFile('secrets.yaml').isSensitive).toBe(true);
      });
    });
  });

  describe('isTestFile', () => {
    it('returns true for test files', () => {
      expect(isTestFile('index.test.ts')).toBe(true);
      expect(isTestFile('Button.spec.tsx')).toBe(true);
      expect(isTestFile('test_app.py')).toBe(true);
      expect(isTestFile('__tests__/utils.ts')).toBe(true);
    });

    it('returns false for non-test files', () => {
      expect(isTestFile('index.ts')).toBe(false);
      expect(isTestFile('utils.js')).toBe(false);
      expect(isTestFile('app.py')).toBe(false);
    });
  });

  describe('isSensitiveFile', () => {
    it('returns true for sensitive files', () => {
      expect(isSensitiveFile('.env')).toBe(true);
      expect(isSensitiveFile('.env.local')).toBe(true);
      expect(isSensitiveFile('id_rsa')).toBe(true);
    });

    it('returns false for non-sensitive files', () => {
      expect(isSensitiveFile('index.ts')).toBe(false);
      expect(isSensitiveFile('package.json')).toBe(false);
      expect(isSensitiveFile('.env.example')).toBe(false);
    });
  });

  describe('shouldTriggerTestReminder', () => {
    it('returns true for code files', () => {
      expect(shouldTriggerTestReminder('src/index.ts')).toBe(true);
      expect(shouldTriggerTestReminder('app.py')).toBe(true);
    });

    it('returns true for test files', () => {
      expect(shouldTriggerTestReminder('index.test.ts')).toBe(true);
    });

    it('returns false for config files', () => {
      expect(shouldTriggerTestReminder('package.json')).toBe(false);
      expect(shouldTriggerTestReminder('.gitignore')).toBe(false);
    });

    it('returns false for docs files', () => {
      expect(shouldTriggerTestReminder('README.md')).toBe(false);
      expect(shouldTriggerTestReminder('CHANGELOG.md')).toBe(false);
    });

    it('returns false for style files', () => {
      expect(shouldTriggerTestReminder('styles.css')).toBe(false);
    });
  });

  describe('hasCodeFiles', () => {
    it('returns true when array contains code files', () => {
      expect(hasCodeFiles(['README.md', 'src/index.ts'])).toBe(true);
      expect(hasCodeFiles(['app.py'])).toBe(true);
    });

    it('returns true when array contains test files', () => {
      expect(hasCodeFiles(['README.md', 'index.test.ts'])).toBe(true);
    });

    it('returns false when array contains only config/docs', () => {
      expect(hasCodeFiles(['README.md', '.gitignore'])).toBe(false);
      expect(hasCodeFiles(['package.json', 'tsconfig.json'])).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(hasCodeFiles([])).toBe(false);
    });
  });
});
