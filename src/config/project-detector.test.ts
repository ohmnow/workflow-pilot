/**
 * Project Detector Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import {
  detectProjectType,
  getPresetName,
  clearProjectCache,
  ProjectType,
} from './project-detector.js';

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
}));

describe('Project Detector', () => {
  beforeEach(() => {
    clearProjectCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('detectProjectType', () => {
    it('detects React project from package.json', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { react: '^18.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('react');
    });

    it('detects Next.js project (prioritizes over React)', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { react: '^18.0.0', next: '^14.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('nextjs');
    });

    it('detects Express project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { express: '^4.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('node-express');
    });

    it('detects Fastify project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { fastify: '^4.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('node-fastify');
    });

    it('detects pure Node.js project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        name: 'my-node-app',
        dependencies: {},
      }));

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('node');
    });

    it('detects Vue project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { vue: '^3.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('vue');
    });

    it('detects Angular project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { '@angular/core': '^17.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('angular');
    });

    it('detects TypeScript from tsconfig.json', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        if (path.includes('tsconfig.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { react: '^18.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.typescript).toBe(true);
    });

    it('detects Python Flask project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('requirements.txt')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue('flask==2.0.0\nrequests==2.28.0');

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('python-flask');
    });

    it('detects Python Django project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('requirements.txt')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue('django==4.0.0\ncelery==5.0.0');

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('python-django');
    });

    it('detects Python FastAPI project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('pyproject.toml')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(`
[tool.poetry.dependencies]
python = "^3.9"
fastapi = "^0.100.0"
      `);

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('python-fastapi');
    });

    it('detects Go project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('go.mod')) return true;
        return false;
      });

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('go');
    });

    it('detects Rust project', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('Cargo.toml')) return true;
        return false;
      });

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('rust');
    });

    it('detects monorepo from workspaces', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        name: 'my-monorepo',
        workspaces: ['packages/*'],
      }));

      const result = detectProjectType('/test/project');
      expect(result.monorepo).toBe(true);
    });

    it('detects monorepo from apps directory', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        if (path.endsWith('apps')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        name: 'my-monorepo',
      }));

      const result = detectProjectType('/test/project');
      expect(result.monorepo).toBe(true);
    });

    it('detects test framework - vitest', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        devDependencies: { vitest: '^1.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.testFramework).toBe('vitest');
    });

    it('detects test framework - jest', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        devDependencies: { jest: '^29.0.0' },
      }));

      const result = detectProjectType('/test/project');
      expect(result.testFramework).toBe('jest');
    });

    it('detects package manager - pnpm', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('pnpm-lock.yaml')) return true;
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));

      const result = detectProjectType('/test/project');
      expect(result.packageManager).toBe('pnpm');
    });

    it('detects package manager - yarn', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('yarn.lock')) return true;
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({}));

      const result = detectProjectType('/test/project');
      expect(result.packageManager).toBe('yarn');
    });

    it('returns unknown for unrecognized projects', () => {
      vi.mocked(existsSync).mockReturnValue(false);

      const result = detectProjectType('/test/project');
      expect(result.type).toBe('unknown');
    });

    it('caches results for same directory', () => {
      vi.mocked(existsSync).mockImplementation((path: string) => {
        if (path.includes('package.json')) return true;
        return false;
      });

      vi.mocked(readFileSync).mockReturnValue(JSON.stringify({
        dependencies: { react: '^18.0.0' },
      }));

      // First call
      detectProjectType('/test/project');
      // Second call should use cache
      detectProjectType('/test/project');

      // readFileSync should only be called once due to caching
      expect(readFileSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('getPresetName', () => {
    it('returns frontend for React projects', () => {
      expect(getPresetName('react')).toBe('frontend');
      expect(getPresetName('nextjs')).toBe('frontend');
      expect(getPresetName('vue')).toBe('frontend');
      expect(getPresetName('angular')).toBe('frontend');
    });

    it('returns node for Node.js projects', () => {
      expect(getPresetName('node')).toBe('node');
      expect(getPresetName('node-express')).toBe('node');
      expect(getPresetName('node-fastify')).toBe('node');
    });

    it('returns python for Python projects', () => {
      expect(getPresetName('python')).toBe('python');
      expect(getPresetName('python-django')).toBe('python');
      expect(getPresetName('python-flask')).toBe('python');
    });

    it('returns base for unknown projects', () => {
      expect(getPresetName('unknown')).toBe('base');
    });
  });
});
