/**
 * Tests for the install.js script
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { install, getHookConfig, PLUGIN_DIR, CLAUDE_SETTINGS_PATH } = require('./install.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Install Script', () => {
  const testPluginDir = '/test/plugin';
  const testSettingsPath = '/test/.claude/settings.json';
  const testDistPath = path.join(testPluginDir, 'dist', 'index.js');

  let mockFs;
  let mockExecSync;
  let consoleLogs;
  let consoleErrors;
  let originalConsoleLog;
  let originalConsoleError;

  beforeEach(() => {
    consoleLogs = [];
    consoleErrors = [];
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = (msg) => consoleLogs.push(msg);
    console.error = (msg) => consoleErrors.push(msg);

    mockFs = {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      mkdirSync: vi.fn(),
    };

    mockExecSync = vi.fn();
  });

  afterEach(() => {
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
  });

  describe('getHookConfig', () => {
    it('generates correct UserPromptSubmit config without matcher', () => {
      const config = getHookConfig(testPluginDir);

      expect(config.UserPromptSubmit).toBeDefined();
      expect(config.UserPromptSubmit[0].matcher).toBeUndefined();
      expect(config.UserPromptSubmit[0].hooks[0].type).toBe('command');
      expect(config.UserPromptSubmit[0].hooks[0].command).toContain(testPluginDir);
    });

    it('generates correct PostToolUse config with .* matcher', () => {
      const config = getHookConfig(testPluginDir);

      expect(config.PostToolUse).toBeDefined();
      expect(config.PostToolUse[0].matcher).toBe('.*');
      expect(config.PostToolUse[0].hooks[0].type).toBe('command');
    });

    it('includes correct command path', () => {
      const config = getHookConfig(testPluginDir);
      const expectedPath = path.join(testPluginDir, 'dist', 'index.js');

      expect(config.UserPromptSubmit[0].hooks[0].command).toBe(`node "${expectedPath}"`);
      expect(config.PostToolUse[0].hooks[0].command).toBe(`node "${expectedPath}"`);
    });
  });

  describe('Build Check', () => {
    it('builds project when dist/index.js does not exist', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return false;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{}');

      await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(mockExecSync).toHaveBeenCalledWith(
        'npm run build',
        expect.objectContaining({ cwd: testPluginDir })
      );
    });

    it('skips build when dist/index.js exists', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{}');

      await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(mockExecSync).not.toHaveBeenCalled();
      expect(consoleLogs.some(msg => msg.includes('already built'))).toBe(true);
    });
  });

  describe('Settings File Handling', () => {
    it('creates .claude directory when it does not exist', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return false;
        if (p === path.dirname(testSettingsPath)) return false;
        return false;
      });

      await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        path.dirname(testSettingsPath),
        { recursive: true }
      );
    });

    it('reads existing settings when file exists', async () => {
      const existingSettings = { existingKey: 'value' };
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingSettings));

      await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(mockFs.readFileSync).toHaveBeenCalledWith(testSettingsPath, 'utf-8');
    });

    it('preserves existing settings when merging hooks', async () => {
      const existingSettings = {
        existingKey: 'value',
        hooks: { OtherHook: [{ foo: 'bar' }] },
      };

      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingSettings));

      const result = await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(result.existingKey).toBe('value');
      expect(result.hooks.OtherHook).toEqual([{ foo: 'bar' }]);
    });
  });

  describe('Hook Configuration', () => {
    it('adds UserPromptSubmit hook without matcher', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{}');

      const result = await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(result.hooks.UserPromptSubmit).toBeDefined();
      expect(result.hooks.UserPromptSubmit[0].matcher).toBeUndefined();
      expect(result.hooks.UserPromptSubmit[0].hooks[0].type).toBe('command');
    });

    it('adds PostToolUse hook with .* matcher', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{}');

      const result = await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(result.hooks.PostToolUse).toBeDefined();
      expect(result.hooks.PostToolUse[0].matcher).toBe('.*');
      expect(result.hooks.PostToolUse[0].hooks[0].type).toBe('command');
    });

    it('writes settings to correct path', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{}');

      await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        testSettingsPath,
        expect.any(String),
        'utf-8'
      );

      const writtenContent = JSON.parse(mockFs.writeFileSync.mock.calls[0][1]);
      expect(writtenContent.hooks.UserPromptSubmit).toBeDefined();
      expect(writtenContent.hooks.PostToolUse).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('throws error on fs.existsSync failure', async () => {
      mockFs.existsSync.mockImplementation(() => {
        throw new Error('Test error');
      });

      await expect(install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      })).rejects.toThrow('Test error');
    });

    it('throws error on JSON parse failure', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('invalid json');

      await expect(install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      })).rejects.toThrow();
    });
  });

  describe('Success Output', () => {
    it('logs success message on completion', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{}');

      await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(consoleLogs.some(msg => msg.includes('Installation complete'))).toBe(true);
    });

    it('mentions uninstall instructions', async () => {
      mockFs.existsSync.mockImplementation((p) => {
        if (p === testDistPath) return true;
        if (p === testSettingsPath) return true;
        return false;
      });
      mockFs.readFileSync.mockReturnValue('{}');

      await install({
        fs: mockFs,
        execSync: mockExecSync,
        pluginDir: testPluginDir,
        settingsPath: testSettingsPath,
      });

      expect(consoleLogs.some(msg => msg.includes('uninstall.js'))).toBe(true);
    });
  });

  describe('Exported Constants', () => {
    it('exports PLUGIN_DIR as absolute path', () => {
      expect(path.isAbsolute(PLUGIN_DIR)).toBe(true);
    });

    it('exports CLAUDE_SETTINGS_PATH pointing to .claude/settings.json', () => {
      expect(CLAUDE_SETTINGS_PATH).toContain('.claude');
      expect(CLAUDE_SETTINGS_PATH).toContain('settings.json');
    });
  });
});
