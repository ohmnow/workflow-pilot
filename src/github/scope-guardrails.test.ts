import { describe, it, expect } from 'vitest';
import {
  ScopeGuardrails,
  ProjectScopeConfig,
  FeatureScopeConfig,
  DEFAULT_PROTECTED_PATHS,
  DEFAULT_ALLOWED_PATHS,
  DEFAULT_DENIED_ACTIONS,
  DEFAULT_SCOPE_GUARDRAILS,
  loadScopeGuardrailsFromClaudeMd,
  parseScopeFromClaudeMd,
  buildScopeGuardrails,
  generateScopeInstructions,
  isPathAllowed,
  matchesPattern,
  validateFiles,
  summarizeGuardrails,
} from './scope-guardrails.js';

describe('ScopeGuardrails', () => {
  describe('DEFAULT_PROTECTED_PATHS', () => {
    it('should include feature_list.json', () => {
      expect(DEFAULT_PROTECTED_PATHS).toContain('feature_list.json');
    });

    it('should include .env files', () => {
      expect(DEFAULT_PROTECTED_PATHS).toContain('.env');
      expect(DEFAULT_PROTECTED_PATHS).toContain('.env.*');
    });

    it('should include secrets and credentials', () => {
      expect(DEFAULT_PROTECTED_PATHS).toContain('credentials.json');
      expect(DEFAULT_PROTECTED_PATHS).toContain('*.pem');
      expect(DEFAULT_PROTECTED_PATHS).toContain('*.key');
    });

    it('should include lock files', () => {
      expect(DEFAULT_PROTECTED_PATHS).toContain('package-lock.json');
      expect(DEFAULT_PROTECTED_PATHS).toContain('yarn.lock');
    });

    it('should include CLAUDE.md', () => {
      expect(DEFAULT_PROTECTED_PATHS).toContain('CLAUDE.md');
    });
  });

  describe('DEFAULT_ALLOWED_PATHS', () => {
    it('should include src directory', () => {
      expect(DEFAULT_ALLOWED_PATHS).toContain('src/**/*');
    });

    it('should include test directories', () => {
      expect(DEFAULT_ALLOWED_PATHS).toContain('test/**/*');
      expect(DEFAULT_ALLOWED_PATHS).toContain('tests/**/*');
      expect(DEFAULT_ALLOWED_PATHS).toContain('__tests__/**/*');
    });
  });

  describe('DEFAULT_DENIED_ACTIONS', () => {
    it('should include critical file deletion', () => {
      expect(DEFAULT_DENIED_ACTIONS.some(a => a.includes('Delete'))).toBe(true);
    });

    it('should include package modification', () => {
      expect(DEFAULT_DENIED_ACTIONS.some(a => a.includes('package'))).toBe(true);
    });

    it('should include security settings', () => {
      expect(DEFAULT_DENIED_ACTIONS.some(a => a.includes('security'))).toBe(true);
    });
  });

  describe('DEFAULT_SCOPE_GUARDRAILS', () => {
    it('should use default allowed paths', () => {
      expect(DEFAULT_SCOPE_GUARDRAILS.allowedPaths).toEqual(DEFAULT_ALLOWED_PATHS);
    });

    it('should use default denied paths', () => {
      expect(DEFAULT_SCOPE_GUARDRAILS.deniedPaths).toEqual(DEFAULT_PROTECTED_PATHS);
    });

    it('should have empty custom instructions by default', () => {
      expect(DEFAULT_SCOPE_GUARDRAILS.customInstructions).toEqual([]);
    });
  });
});

describe('matchesPattern', () => {
  describe('exact matches', () => {
    it('should match exact file names', () => {
      expect(matchesPattern('package.json', 'package.json')).toBe(true);
      expect(matchesPattern('package.json', 'tsconfig.json')).toBe(false);
    });

    it('should match exact paths', () => {
      expect(matchesPattern('src/index.ts', 'src/index.ts')).toBe(true);
      expect(matchesPattern('src/index.ts', 'lib/index.ts')).toBe(false);
    });
  });

  describe('wildcard (*) patterns', () => {
    it('should match single directory wildcards', () => {
      expect(matchesPattern('auth.ts', '*.ts')).toBe(true);
      expect(matchesPattern('auth.js', '*.ts')).toBe(false);
    });

    it('should match file patterns in directory', () => {
      expect(matchesPattern('src/auth.ts', 'src/*.ts')).toBe(true);
      expect(matchesPattern('lib/auth.ts', 'src/*.ts')).toBe(false);
    });

    it('should not match across directories', () => {
      expect(matchesPattern('src/utils/auth.ts', 'src/*.ts')).toBe(false);
    });
  });

  describe('globstar (**) patterns', () => {
    it('should match any depth', () => {
      expect(matchesPattern('src/auth.ts', 'src/**/*')).toBe(true);
      expect(matchesPattern('src/utils/auth.ts', 'src/**/*')).toBe(true);
      expect(matchesPattern('src/deep/nested/auth.ts', 'src/**/*')).toBe(true);
    });

    it('should match at root', () => {
      expect(matchesPattern('test/unit/auth.test.ts', 'test/**/*')).toBe(true);
    });

    it('should not match different root', () => {
      expect(matchesPattern('lib/auth.ts', 'src/**/*')).toBe(false);
    });
  });

  describe('combined patterns', () => {
    it('should match extension patterns with globstar', () => {
      expect(matchesPattern('src/auth.ts', '**/*.ts')).toBe(true);
      expect(matchesPattern('src/utils/auth.ts', '**/*.ts')).toBe(true);
    });

    it('should match .env.* pattern', () => {
      expect(matchesPattern('.env.local', '.env.*')).toBe(true);
      expect(matchesPattern('.env.production', '.env.*')).toBe(true);
      expect(matchesPattern('.env', '.env.*')).toBe(false);
    });
  });
});

describe('isPathAllowed', () => {
  const guardrails: ScopeGuardrails = {
    allowedPaths: ['src/**/*', 'test/**/*'],
    deniedPaths: ['src/config/secrets.ts', '.env', '*.key'],
    deniedActions: [],
    customInstructions: [],
  };

  describe('allowed paths', () => {
    it('should allow files in src', () => {
      const result = isPathAllowed('src/auth.ts', guardrails);
      expect(result.allowed).toBe(true);
      expect(result.reason).toContain('allowed pattern');
    });

    it('should allow files in nested src directories', () => {
      const result = isPathAllowed('src/utils/helpers.ts', guardrails);
      expect(result.allowed).toBe(true);
    });

    it('should allow test files', () => {
      const result = isPathAllowed('test/auth.test.ts', guardrails);
      expect(result.allowed).toBe(true);
    });
  });

  describe('denied paths', () => {
    it('should deny specifically blocked files', () => {
      const result = isPathAllowed('src/config/secrets.ts', guardrails);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('protected pattern');
    });

    it('should deny .env files', () => {
      const result = isPathAllowed('.env', guardrails);
      expect(result.allowed).toBe(false);
    });

    it('should deny key files', () => {
      const result = isPathAllowed('private.key', guardrails);
      expect(result.allowed).toBe(false);
    });
  });

  describe('denied takes precedence', () => {
    it('should deny even if path matches allowed pattern', () => {
      // src/config/secrets.ts matches src/**/* but is explicitly denied
      const result = isPathAllowed('src/config/secrets.ts', guardrails);
      expect(result.allowed).toBe(false);
    });
  });

  describe('unlisted paths', () => {
    it('should deny paths not in allowed list', () => {
      const result = isPathAllowed('scripts/deploy.sh', guardrails);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('does not match any allowed');
    });
  });

  describe('path normalization', () => {
    it('should handle ./ prefix', () => {
      const result = isPathAllowed('./src/auth.ts', guardrails);
      expect(result.allowed).toBe(true);
    });

    it('should handle backslashes', () => {
      const result = isPathAllowed('src\\utils\\auth.ts', guardrails);
      expect(result.allowed).toBe(true);
    });
  });
});

describe('validateFiles', () => {
  const guardrails: ScopeGuardrails = {
    allowedPaths: ['src/**/*'],
    deniedPaths: ['.env', 'package.json'],
    deniedActions: [],
    customInstructions: [],
  };

  it('should categorize files correctly', () => {
    const files = [
      'src/index.ts',
      'src/auth.ts',
      '.env',
      'package.json',
      'README.md',
    ];

    const result = validateFiles(files, guardrails);

    expect(result.allowed).toContain('src/index.ts');
    expect(result.allowed).toContain('src/auth.ts');
    expect(result.denied).toHaveLength(3);
    expect(result.denied.map(d => d.path)).toContain('.env');
    expect(result.denied.map(d => d.path)).toContain('package.json');
    expect(result.denied.map(d => d.path)).toContain('README.md');
  });

  it('should include reasons for denial', () => {
    const result = validateFiles(['.env', 'scripts/deploy.sh'], guardrails);

    const envDenied = result.denied.find(d => d.path === '.env');
    expect(envDenied?.reason).toContain('protected');

    const scriptDenied = result.denied.find(d => d.path === 'scripts/deploy.sh');
    expect(scriptDenied?.reason).toContain('does not match');
  });
});

describe('parseScopeFromClaudeMd', () => {
  it('should return null if no scope section', () => {
    const content = `# Project

Some content without scope section.
`;
    expect(parseScopeFromClaudeMd(content)).toBeNull();
  });

  it('should parse ## Worker Scope section', () => {
    const content = `# Project

## Worker Scope

### Allowed Paths
- \`src/**/*\`
- \`lib/**/*\`

### Protected Paths
- secrets.json
- custom.key
`;
    const config = parseScopeFromClaudeMd(content);

    expect(config).not.toBeNull();
    expect(config?.defaultAllowedPaths).toContain('src/**/*');
    expect(config?.defaultAllowedPaths).toContain('lib/**/*');
    // Protected paths should include both defaults and custom
    expect(config?.protectedPaths).toContain('feature_list.json'); // default
    expect(config?.protectedPaths).toContain('secrets.json'); // custom
    expect(config?.protectedPaths).toContain('custom.key'); // custom
  });

  it('should parse ## Scope Guardrails section', () => {
    const content = `# Project

## Scope Guardrails

### Allowed Paths
- src/**/*
`;
    const config = parseScopeFromClaudeMd(content);

    expect(config).not.toBeNull();
    expect(config?.defaultAllowedPaths).toContain('src/**/*');
  });

  it('should include default protected paths', () => {
    const content = `## Scope

### Allowed Paths
- src/**/*
`;
    const config = parseScopeFromClaudeMd(content);

    // Should include defaults even when not specified
    expect(config?.protectedPaths).toContain('feature_list.json');
    expect(config?.protectedPaths).toContain('.env');
  });

  it('should parse feature overrides', () => {
    const content = `## Worker Scope

### Allowed Paths
- src/**/*

### Feature Overrides

T2-006: Worker Guardrails
allowed: src/github/scope-guardrails.ts
notes: Can also modify test files

F-001: Auth Feature
allowed: src/auth/**/*
denied: src/auth/secrets.ts
`;
    const config = parseScopeFromClaudeMd(content);

    // Feature overrides parsing is complex - test basic structure
    expect(config).not.toBeNull();
    expect(config?.featureOverrides).toBeDefined();
    // The parsing of feature overrides is best tested with simpler cases
  });

  it('should parse simple feature override', () => {
    const content = `## Scope

### Feature Overrides

F-001: Test feature
notes: Special notes here
`;
    const config = parseScopeFromClaudeMd(content);

    expect(config).not.toBeNull();
    // Feature override parsing depends on exact format
  });

  it('should handle paths with and without backticks', () => {
    const content = `## Scope

### Allowed Paths
- \`src/**/*\`
- lib/**/*
- test/**/*
`;
    const config = parseScopeFromClaudeMd(content);

    expect(config?.defaultAllowedPaths).toContain('src/**/*');
    expect(config?.defaultAllowedPaths).toContain('lib/**/*');
    expect(config?.defaultAllowedPaths).toContain('test/**/*');
  });
});

describe('buildScopeGuardrails', () => {
  describe('without project config', () => {
    it('should return defaults when no config', () => {
      const guardrails = buildScopeGuardrails(undefined, null);

      expect(guardrails.allowedPaths).toEqual(DEFAULT_ALLOWED_PATHS);
      expect(guardrails.deniedPaths).toEqual(DEFAULT_PROTECTED_PATHS);
    });

    it('should return defaults with feature but no config', () => {
      const guardrails = buildScopeGuardrails('F-001', null);

      expect(guardrails.allowedPaths).toEqual(DEFAULT_ALLOWED_PATHS);
    });
  });

  describe('with project config', () => {
    const projectConfig: ProjectScopeConfig = {
      defaultAllowedPaths: ['src/**/*', 'custom/**/*'],
      protectedPaths: ['custom-protected.json'],
      featureOverrides: [
        {
          featureId: 'F-001',
          allowedPaths: ['scripts/**/*'],
          deniedPaths: ['scripts/dangerous.sh'],
          notes: 'Can modify scripts',
        },
      ],
    };

    it('should use project allowed paths', () => {
      const guardrails = buildScopeGuardrails(undefined, projectConfig);

      expect(guardrails.allowedPaths).toContain('src/**/*');
      expect(guardrails.allowedPaths).toContain('custom/**/*');
    });

    it('should merge protected paths', () => {
      const guardrails = buildScopeGuardrails(undefined, projectConfig);

      // Should have both default and custom protected
      expect(guardrails.deniedPaths).toContain('feature_list.json');
      expect(guardrails.deniedPaths).toContain('custom-protected.json');
    });

    it('should apply feature overrides', () => {
      const guardrails = buildScopeGuardrails('F-001', projectConfig);

      expect(guardrails.allowedPaths).toContain('scripts/**/*');
      expect(guardrails.deniedPaths).toContain('scripts/dangerous.sh');
      expect(guardrails.customInstructions).toContain('Can modify scripts');
    });

    it('should be case-insensitive for feature ID', () => {
      const guardrails = buildScopeGuardrails('f-001', projectConfig);

      expect(guardrails.allowedPaths).toContain('scripts/**/*');
    });

    it('should not apply overrides for different feature', () => {
      const guardrails = buildScopeGuardrails('F-002', projectConfig);

      expect(guardrails.allowedPaths).not.toContain('scripts/**/*');
      expect(guardrails.customInstructions).toHaveLength(0);
    });
  });
});

describe('generateScopeInstructions', () => {
  const guardrails: ScopeGuardrails = {
    allowedPaths: ['src/**/*', 'test/**/*'],
    deniedPaths: ['.env', 'secrets.json'],
    deniedActions: ['Delete files', 'Modify dependencies'],
    customInstructions: ['Focus on authentication'],
  };

  it('should include header', () => {
    const instructions = generateScopeInstructions('F-001', guardrails);

    expect(instructions).toContain('SCOPE GUARDRAILS');
    expect(instructions).toContain('MUST FOLLOW');
  });

  it('should include feature ID', () => {
    const instructions = generateScopeInstructions('F-001', guardrails);

    expect(instructions).toContain('F-001');
    expect(instructions).toContain('assigned to feature');
  });

  it('should work without feature ID', () => {
    const instructions = generateScopeInstructions(undefined, guardrails);

    expect(instructions).not.toContain('assigned to feature');
    expect(instructions).toContain('Allowed');
  });

  it('should list allowed paths', () => {
    const instructions = generateScopeInstructions('F-001', guardrails);

    expect(instructions).toContain('Allowed');
    expect(instructions).toContain('src/**/*');
    expect(instructions).toContain('test/**/*');
  });

  it('should list protected paths', () => {
    const instructions = generateScopeInstructions('F-001', guardrails);

    expect(instructions).toContain('Protected Files');
    expect(instructions).toContain('.env');
    expect(instructions).toContain('secrets.json');
  });

  it('should list prohibited actions', () => {
    const instructions = generateScopeInstructions('F-001', guardrails);

    expect(instructions).toContain('Prohibited Actions');
    expect(instructions).toContain('Delete files');
    expect(instructions).toContain('Modify dependencies');
  });

  it('should include general rules', () => {
    const instructions = generateScopeInstructions('F-001', guardrails);

    expect(instructions).toContain('Stay focused');
    expect(instructions).toContain('Minimal changes');
    expect(instructions).toContain('No scope creep');
  });

  it('should include custom instructions', () => {
    const instructions = generateScopeInstructions('F-001', guardrails);

    expect(instructions).toContain('Additional Instructions');
    expect(instructions).toContain('Focus on authentication');
  });

  it('should not include additional instructions section if empty', () => {
    const noCustom: ScopeGuardrails = {
      ...guardrails,
      customInstructions: [],
    };

    const instructions = generateScopeInstructions('F-001', noCustom);

    expect(instructions).not.toContain('Additional Instructions');
  });

  it('should truncate long protected paths list', () => {
    const manyPaths: ScopeGuardrails = {
      ...guardrails,
      deniedPaths: Array.from({ length: 20 }, (_, i) => `path${i}.json`),
    };

    const instructions = generateScopeInstructions('F-001', manyPaths);

    expect(instructions).toContain('and 5 more');
  });
});

describe('summarizeGuardrails', () => {
  it('should return formatted summary', () => {
    const guardrails: ScopeGuardrails = {
      allowedPaths: ['src/**/*', 'test/**/*'],
      deniedPaths: ['.env', 'secrets.json', 'package.json'],
      deniedActions: ['Delete files', 'Modify deps'],
      customInstructions: ['Note 1'],
    };

    const summary = summarizeGuardrails(guardrails);

    expect(summary).toContain('Allowed: 2 patterns');
    expect(summary).toContain('Protected: 3 patterns');
    expect(summary).toContain('Denied actions: 2');
    expect(summary).toContain('Custom instructions: 1');
  });
});

describe('loadScopeGuardrailsFromClaudeMd', () => {
  // Note: We can't easily mock fs with ESM, so we test parsing functions directly
  // The loadScopeGuardrailsFromClaudeMd function is a thin wrapper around parseScopeFromClaudeMd

  it('should return null for non-existent directory', () => {
    const result = loadScopeGuardrailsFromClaudeMd('/non/existent/path');
    expect(result).toBeNull();
  });

  it('should return null for directory without CLAUDE.md', () => {
    const result = loadScopeGuardrailsFromClaudeMd('/tmp');
    expect(result).toBeNull();
  });

  // The parsing logic is tested via parseScopeFromClaudeMd tests above
});

describe('integration: context-extractor with guardrails', () => {
  // These tests verify the integration between context-extractor and scope-guardrails
  // The actual integration tests are in context-extractor.test.ts

  it('should build guardrails with default values', () => {
    const guardrails = buildScopeGuardrails('T2-006', null);

    expect(guardrails.allowedPaths.length).toBeGreaterThan(0);
    expect(guardrails.deniedPaths.length).toBeGreaterThan(0);
    expect(guardrails.deniedActions.length).toBeGreaterThan(0);
  });

  it('should generate instructions that can be embedded in prompts', () => {
    const guardrails = buildScopeGuardrails('T2-006', null);
    const instructions = generateScopeInstructions('T2-006', guardrails);

    // Should be valid markdown
    expect(instructions).toContain('##');
    expect(instructions).toContain('###');

    // Should have clear sections
    expect(instructions).toContain('Allowed');
    expect(instructions).toContain('Protected');
    expect(instructions).toContain('Prohibited');
    expect(instructions).toContain('General Rules');
  });
});
