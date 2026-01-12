import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  DEFAULT_AUTOPILOT_CONFIG,
  validateAutopilotConfig,
  mergeAutopilotConfig,
  parseTimeout,
  loadAutopilotConfig,
  saveAutopilotConfig,
  hasAutopilotConfig,
  generateWorkerBranch,
  describePRStrategy,
  AutopilotConfig,
} from './autopilot-config.js';

describe('AutopilotConfig', () => {
  describe('DEFAULT_AUTOPILOT_CONFIG', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_AUTOPILOT_CONFIG.prStrategy).toBe('review');
      expect(DEFAULT_AUTOPILOT_CONFIG.maxConcurrentWorkers).toBe(3);
      expect(DEFAULT_AUTOPILOT_CONFIG.autoLabelNonBlocking).toBe(false);
      expect(DEFAULT_AUTOPILOT_CONFIG.workerTimeout).toBe('30m');
      expect(DEFAULT_AUTOPILOT_CONFIG.requiredChecks).toEqual(['test', 'build']);
      expect(DEFAULT_AUTOPILOT_CONFIG.workerLabel).toBe('ready-for-claude');
      expect(DEFAULT_AUTOPILOT_CONFIG.reviewLabel).toBe('ready-for-review');
    });
  });

  describe('validateAutopilotConfig', () => {
    it('should accept valid config', () => {
      const result = validateAutopilotConfig({
        prStrategy: 'auto',
        maxConcurrentWorkers: 5,
        workerTimeout: '1h',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid prStrategy', () => {
      const result = validateAutopilotConfig({
        prStrategy: 'invalid' as any,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('prStrategy');
    });

    it('should reject maxConcurrentWorkers out of range', () => {
      const result1 = validateAutopilotConfig({ maxConcurrentWorkers: 0 });
      expect(result1.valid).toBe(false);
      expect(result1.errors[0]).toContain('maxConcurrentWorkers');

      const result2 = validateAutopilotConfig({ maxConcurrentWorkers: 11 });
      expect(result2.valid).toBe(false);
    });

    it('should reject invalid timeout format', () => {
      const result = validateAutopilotConfig({ workerTimeout: '30' });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('workerTimeout');
    });

    it('should accept valid timeout formats', () => {
      expect(validateAutopilotConfig({ workerTimeout: '30m' }).valid).toBe(true);
      expect(validateAutopilotConfig({ workerTimeout: '1h' }).valid).toBe(true);
      expect(validateAutopilotConfig({ workerTimeout: '2h' }).valid).toBe(true);
    });
  });

  describe('mergeAutopilotConfig', () => {
    it('should merge partial config with defaults', () => {
      const result = mergeAutopilotConfig({ prStrategy: 'auto' });
      expect(result.prStrategy).toBe('auto');
      expect(result.maxConcurrentWorkers).toBe(3); // default
    });

    it('should return defaults for empty partial', () => {
      const result = mergeAutopilotConfig({});
      expect(result).toEqual(DEFAULT_AUTOPILOT_CONFIG);
    });
  });

  describe('parseTimeout', () => {
    it('should parse minutes', () => {
      expect(parseTimeout('30m')).toBe(30 * 60 * 1000);
      expect(parseTimeout('5m')).toBe(5 * 60 * 1000);
    });

    it('should parse hours', () => {
      expect(parseTimeout('1h')).toBe(60 * 60 * 1000);
      expect(parseTimeout('2h')).toBe(2 * 60 * 60 * 1000);
    });

    it('should return default for invalid format', () => {
      expect(parseTimeout('invalid')).toBe(30 * 60 * 1000);
      expect(parseTimeout('30')).toBe(30 * 60 * 1000);
    });
  });

  describe('generateWorkerBranch', () => {
    it('should generate branch name from feature ID', () => {
      expect(generateWorkerBranch('T2-001')).toBe('claude-worker/t2-001');
      expect(generateWorkerBranch('feature-auth')).toBe('claude-worker/feature-auth');
    });

    it('should sanitize special characters', () => {
      expect(generateWorkerBranch('My Feature!')).toBe('claude-worker/my-feature-');
    });

    it('should use custom pattern', () => {
      expect(generateWorkerBranch('T2-001', 'worker/{feature-id}')).toBe('worker/t2-001');
    });
  });

  describe('describePRStrategy', () => {
    it('should describe auto strategy', () => {
      expect(describePRStrategy('auto')).toContain('Automatically merge');
    });

    it('should describe review strategy', () => {
      expect(describePRStrategy('review')).toContain('review');
    });

    it('should describe manual strategy', () => {
      expect(describePRStrategy('manual')).toContain('no automatic');
    });
  });

  describe('file operations', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autopilot-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('loadAutopilotConfig', () => {
      it('should return defaults if no config files exist', () => {
        const result = loadAutopilotConfig(tempDir);
        expect(result).toEqual(DEFAULT_AUTOPILOT_CONFIG);
      });

      it('should load from .workflow-pilot.json', () => {
        const config = { autopilot: { prStrategy: 'auto' } };
        fs.writeFileSync(
          path.join(tempDir, '.workflow-pilot.json'),
          JSON.stringify(config)
        );

        const result = loadAutopilotConfig(tempDir);
        expect(result.prStrategy).toBe('auto');
        expect(result.maxConcurrentWorkers).toBe(3); // default
      });

      it('should load from feature_list.json config section', () => {
        const featureList = {
          config: { autopilot: { maxConcurrentWorkers: 5 } },
        };
        fs.writeFileSync(
          path.join(tempDir, 'feature_list.json'),
          JSON.stringify(featureList)
        );

        const result = loadAutopilotConfig(tempDir);
        expect(result.maxConcurrentWorkers).toBe(5);
      });

      it('should merge configs from multiple files', () => {
        // .workflow-pilot.json first
        fs.writeFileSync(
          path.join(tempDir, '.workflow-pilot.json'),
          JSON.stringify({ autopilot: { prStrategy: 'auto' } })
        );
        // feature_list.json second (overrides)
        fs.writeFileSync(
          path.join(tempDir, 'feature_list.json'),
          JSON.stringify({ config: { autopilot: { maxConcurrentWorkers: 7 } } })
        );

        const result = loadAutopilotConfig(tempDir);
        expect(result.prStrategy).toBe('auto'); // from first file
        expect(result.maxConcurrentWorkers).toBe(7); // from second file
      });
    });

    describe('saveAutopilotConfig', () => {
      it('should save config to .workflow-pilot.json', () => {
        const config: AutopilotConfig = {
          ...DEFAULT_AUTOPILOT_CONFIG,
          prStrategy: 'auto',
        };

        const success = saveAutopilotConfig(config, tempDir);
        expect(success).toBe(true);

        const saved = JSON.parse(
          fs.readFileSync(path.join(tempDir, '.workflow-pilot.json'), 'utf-8')
        );
        expect(saved.autopilot.prStrategy).toBe('auto');
      });

      it('should preserve existing config file content', () => {
        const existing = { otherSetting: true };
        fs.writeFileSync(
          path.join(tempDir, '.workflow-pilot.json'),
          JSON.stringify(existing)
        );

        saveAutopilotConfig(DEFAULT_AUTOPILOT_CONFIG, tempDir);

        const saved = JSON.parse(
          fs.readFileSync(path.join(tempDir, '.workflow-pilot.json'), 'utf-8')
        );
        expect(saved.otherSetting).toBe(true);
        expect(saved.autopilot).toBeDefined();
      });
    });

    describe('hasAutopilotConfig', () => {
      it('should return false if no config exists', () => {
        expect(hasAutopilotConfig(tempDir)).toBe(false);
      });

      it('should return true if .workflow-pilot.json has autopilot', () => {
        fs.writeFileSync(
          path.join(tempDir, '.workflow-pilot.json'),
          JSON.stringify({ autopilot: {} })
        );
        expect(hasAutopilotConfig(tempDir)).toBe(true);
      });

      it('should return true if feature_list.json has config.autopilot', () => {
        fs.writeFileSync(
          path.join(tempDir, 'feature_list.json'),
          JSON.stringify({ config: { autopilot: {} } })
        );
        expect(hasAutopilotConfig(tempDir)).toBe(true);
      });
    });
  });
});
