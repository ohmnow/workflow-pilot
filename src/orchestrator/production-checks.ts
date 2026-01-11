/**
 * Production Readiness Checks
 *
 * Comprehensive checklist for ensuring an app is production-ready.
 * Covers security, testing, infrastructure, performance, UX, and UI.
 *
 * Some checks are automated (can run code to verify),
 * others are manual prompts for human verification.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Check category types
 */
export type CheckCategory =
  | 'security'
  | 'testing'
  | 'infrastructure'
  | 'performance'
  | 'ux'
  | 'ui';

/**
 * Check result status
 */
export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip' | 'manual';

/**
 * Individual check result
 */
export interface CheckResult {
  id: string;
  name: string;
  category: CheckCategory;
  status: CheckStatus;
  message: string;
  details?: string;
  fixSuggestion?: string;
}

/**
 * Production check definition
 */
interface ProductionCheck {
  id: string;
  name: string;
  category: CheckCategory;
  description: string;
  automated: boolean;
  check?: (projectDir: string) => Promise<CheckResult>;
  manualPrompt?: string;
  fixSuggestion?: string;
}

/**
 * All production readiness checks
 */
const productionChecks: ProductionCheck[] = [
  // ============================================
  // SECURITY CHECKS
  // ============================================
  {
    id: 'sec-no-hardcoded-secrets',
    name: 'No Hardcoded Secrets',
    category: 'security',
    description: 'Ensure no API keys, passwords, or tokens in source code',
    automated: true,
    check: async (projectDir) => {
      const secretPatterns = [
        /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}['"]/gi,
        /password\s*[:=]\s*['"][^'"]+['"]/gi,
        /secret\s*[:=]\s*['"][^'"]+['"]/gi,
        /sk[-_]live[-_][a-zA-Z0-9]+/g,
        /ghp_[a-zA-Z0-9]{36}/g,
        /xox[baprs]-[a-zA-Z0-9-]+/g,
      ];

      const filesToCheck = findSourceFiles(projectDir);
      const issues: string[] = [];

      for (const file of filesToCheck.slice(0, 100)) { // Limit for performance
        try {
          const content = fs.readFileSync(file, 'utf-8');
          for (const pattern of secretPatterns) {
            if (pattern.test(content)) {
              issues.push(path.relative(projectDir, file));
              break;
            }
          }
        } catch {
          // Skip unreadable files
        }
      }

      return {
        id: 'sec-no-hardcoded-secrets',
        name: 'No Hardcoded Secrets',
        category: 'security',
        status: issues.length === 0 ? 'pass' : 'fail',
        message: issues.length === 0
          ? 'No hardcoded secrets detected'
          : `Potential secrets found in ${issues.length} file(s)`,
        details: issues.length > 0 ? `Files: ${issues.slice(0, 5).join(', ')}` : undefined,
        fixSuggestion: 'Move secrets to environment variables and add to .gitignore',
      };
    },
  },
  {
    id: 'sec-env-example',
    name: 'Environment Template Exists',
    category: 'security',
    description: 'Check for .env.example documenting required variables',
    automated: true,
    check: async (projectDir) => {
      const envExample = path.join(projectDir, '.env.example');
      const envTemplate = path.join(projectDir, '.env.template');
      const exists = fs.existsSync(envExample) || fs.existsSync(envTemplate);

      return {
        id: 'sec-env-example',
        name: 'Environment Template Exists',
        category: 'security',
        status: exists ? 'pass' : 'warn',
        message: exists
          ? 'Environment template found'
          : 'No .env.example found - document required environment variables',
        fixSuggestion: 'Create .env.example with placeholder values for required variables',
      };
    },
  },
  {
    id: 'sec-gitignore-env',
    name: '.env in .gitignore',
    category: 'security',
    description: 'Ensure .env files are not committed',
    automated: true,
    check: async (projectDir) => {
      const gitignorePath = path.join(projectDir, '.gitignore');

      if (!fs.existsSync(gitignorePath)) {
        return {
          id: 'sec-gitignore-env',
          name: '.env in .gitignore',
          category: 'security',
          status: 'warn',
          message: 'No .gitignore file found',
          fixSuggestion: 'Create .gitignore and add .env to it',
        };
      }

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const hasEnvIgnore = /^\.env$/m.test(content) || /^\.env\.\*$/m.test(content);

      return {
        id: 'sec-gitignore-env',
        name: '.env in .gitignore',
        category: 'security',
        status: hasEnvIgnore ? 'pass' : 'fail',
        message: hasEnvIgnore
          ? '.env is properly gitignored'
          : '.env files may be committed to git',
        fixSuggestion: 'Add ".env" and ".env.*" to .gitignore',
      };
    },
  },
  {
    id: 'sec-dependency-audit',
    name: 'Dependency Security Audit',
    category: 'security',
    description: 'Check for known vulnerabilities in dependencies',
    automated: false,
    manualPrompt: 'Run `npm audit` or `yarn audit` and review any vulnerabilities. Fix critical and high severity issues.',
    fixSuggestion: 'npm audit fix --force (use with caution) or manually update vulnerable packages',
  },
  {
    id: 'sec-https-config',
    name: 'HTTPS Configuration',
    category: 'security',
    description: 'Verify HTTPS is enforced in production',
    automated: false,
    manualPrompt: 'Verify that your production deployment enforces HTTPS and redirects HTTP to HTTPS.',
  },

  // ============================================
  // TESTING CHECKS
  // ============================================
  {
    id: 'test-suite-exists',
    name: 'Test Suite Exists',
    category: 'testing',
    description: 'Verify project has tests',
    automated: true,
    check: async (projectDir) => {
      const testDirs = ['test', 'tests', '__tests__', 'spec'];
      const testFiles = ['*.test.ts', '*.test.js', '*.spec.ts', '*.spec.js'];

      let hasTests = false;

      // Check for test directories
      for (const dir of testDirs) {
        if (fs.existsSync(path.join(projectDir, dir))) {
          hasTests = true;
          break;
        }
      }

      // Check for test files in src
      if (!hasTests) {
        const srcDir = path.join(projectDir, 'src');
        if (fs.existsSync(srcDir)) {
          const files = findFilesRecursive(srcDir, /\.(test|spec)\.(ts|js|tsx|jsx)$/);
          hasTests = files.length > 0;
        }
      }

      return {
        id: 'test-suite-exists',
        name: 'Test Suite Exists',
        category: 'testing',
        status: hasTests ? 'pass' : 'fail',
        message: hasTests ? 'Test suite found' : 'No tests found',
        fixSuggestion: 'Add tests using Jest, Vitest, or your preferred testing framework',
      };
    },
  },
  {
    id: 'test-all-pass',
    name: 'All Tests Pass',
    category: 'testing',
    description: 'Run test suite and verify all tests pass',
    automated: false,
    manualPrompt: 'Run your test suite (`npm test`) and ensure all tests pass before deploying.',
  },
  {
    id: 'test-coverage',
    name: 'Test Coverage Check',
    category: 'testing',
    description: 'Verify adequate test coverage',
    automated: false,
    manualPrompt: 'Run tests with coverage (`npm test -- --coverage`) and review coverage report. Aim for >80% on critical paths.',
  },

  // ============================================
  // INFRASTRUCTURE CHECKS
  // ============================================
  {
    id: 'infra-build-succeeds',
    name: 'Build Succeeds',
    category: 'infrastructure',
    description: 'Verify production build completes without errors',
    automated: false,
    manualPrompt: 'Run `npm run build` and ensure it completes without errors.',
  },
  {
    id: 'infra-package-lock',
    name: 'Lock File Exists',
    category: 'infrastructure',
    description: 'Ensure package-lock.json or yarn.lock exists',
    automated: true,
    check: async (projectDir) => {
      const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'];
      const exists = lockFiles.some(f => fs.existsSync(path.join(projectDir, f)));

      return {
        id: 'infra-package-lock',
        name: 'Lock File Exists',
        category: 'infrastructure',
        status: exists ? 'pass' : 'warn',
        message: exists ? 'Dependency lock file found' : 'No lock file found',
        fixSuggestion: 'Run npm install to generate package-lock.json',
      };
    },
  },
  {
    id: 'infra-node-version',
    name: 'Node Version Specified',
    category: 'infrastructure',
    description: 'Check for .nvmrc or engines in package.json',
    automated: true,
    check: async (projectDir) => {
      const nvmrcPath = path.join(projectDir, '.nvmrc');
      const nodeVersionPath = path.join(projectDir, '.node-version');
      const pkgPath = path.join(projectDir, 'package.json');

      let specified = false;

      if (fs.existsSync(nvmrcPath) || fs.existsSync(nodeVersionPath)) {
        specified = true;
      }

      if (!specified && fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.engines?.node) {
            specified = true;
          }
        } catch {
          // Invalid JSON
        }
      }

      return {
        id: 'infra-node-version',
        name: 'Node Version Specified',
        category: 'infrastructure',
        status: specified ? 'pass' : 'warn',
        message: specified
          ? 'Node version is specified'
          : 'No Node version specified',
        fixSuggestion: 'Add .nvmrc or "engines" field in package.json',
      };
    },
  },

  // ============================================
  // PERFORMANCE CHECKS
  // ============================================
  {
    id: 'perf-bundle-size',
    name: 'Bundle Size Review',
    category: 'performance',
    description: 'Review production bundle size',
    automated: false,
    manualPrompt: 'Build the project and review bundle size. Use tools like `npm run build -- --analyze` or webpack-bundle-analyzer. Aim for <250KB initial JS.',
  },
  {
    id: 'perf-image-optimization',
    name: 'Image Optimization',
    category: 'performance',
    description: 'Verify images are optimized',
    automated: false,
    manualPrompt: 'Check that images use modern formats (WebP, AVIF), are properly sized, and use lazy loading where appropriate.',
  },
  {
    id: 'perf-code-splitting',
    name: 'Code Splitting',
    category: 'performance',
    description: 'Verify route-based code splitting is implemented',
    automated: false,
    manualPrompt: 'For SPAs, verify dynamic imports are used for route components to enable code splitting.',
  },

  // ============================================
  // UX CHECKS
  // ============================================
  {
    id: 'ux-error-handling',
    name: 'Error Handling',
    category: 'ux',
    description: 'Verify user-friendly error messages',
    automated: false,
    manualPrompt: 'Test error scenarios: network failures, invalid inputs, 404s, 500s. Verify users see helpful error messages, not technical errors or blank screens.',
  },
  {
    id: 'ux-loading-states',
    name: 'Loading States',
    category: 'ux',
    description: 'Check for loading indicators',
    automated: false,
    manualPrompt: 'Verify loading indicators appear during async operations. Use skeleton screens or spinners. Prevent user interaction during loads where appropriate.',
  },
  {
    id: 'ux-empty-states',
    name: 'Empty States',
    category: 'ux',
    description: 'Handle empty data gracefully',
    automated: false,
    manualPrompt: 'Test views with no data. Verify helpful empty states with guidance (not blank screens or confusing "No data" messages).',
  },
  {
    id: 'ux-mobile-responsive',
    name: 'Mobile Responsive',
    category: 'ux',
    description: 'Verify mobile-friendly design',
    automated: false,
    manualPrompt: 'Test on mobile viewport sizes. Verify touch targets are adequate (44x44px), text is readable without zooming, and horizontal scrolling is avoided.',
  },
  {
    id: 'ux-form-validation',
    name: 'Form Validation',
    category: 'ux',
    description: 'Check client-side validation',
    automated: false,
    manualPrompt: 'Test all forms. Verify inline validation, clear error messages, and that submit is disabled until valid. Check keyboard navigation.',
  },

  // ============================================
  // UI CHECKS
  // ============================================
  {
    id: 'ui-visual-consistency',
    name: 'Visual Consistency',
    category: 'ui',
    description: 'Verify consistent styling throughout',
    automated: false,
    manualPrompt: 'Review all pages for consistent colors, spacing, typography, and component styles. Check for orphaned or inconsistent UI elements.',
  },
  {
    id: 'ui-accessibility',
    name: 'Accessibility (a11y)',
    category: 'ui',
    description: 'Check basic accessibility compliance',
    automated: false,
    manualPrompt: 'Run Lighthouse accessibility audit. Verify: color contrast, alt text on images, keyboard navigation, proper heading hierarchy, ARIA labels.',
  },
  {
    id: 'ui-favicon',
    name: 'Favicon & Meta Tags',
    category: 'ui',
    description: 'Verify favicon and social meta tags',
    automated: true,
    check: async (projectDir) => {
      const publicDir = path.join(projectDir, 'public');
      const faviconLocations = [
        path.join(publicDir, 'favicon.ico'),
        path.join(publicDir, 'favicon.png'),
        path.join(projectDir, 'favicon.ico'),
      ];

      const hasFavicon = faviconLocations.some(f => fs.existsSync(f));

      return {
        id: 'ui-favicon',
        name: 'Favicon & Meta Tags',
        category: 'ui',
        status: hasFavicon ? 'pass' : 'warn',
        message: hasFavicon ? 'Favicon found' : 'No favicon found',
        fixSuggestion: 'Add favicon.ico to public directory and include og:image, og:title meta tags',
      };
    },
  },
  {
    id: 'ui-404-page',
    name: '404 Page',
    category: 'ui',
    description: 'Verify custom 404 page exists',
    automated: false,
    manualPrompt: 'Navigate to a non-existent URL. Verify a helpful 404 page appears with navigation back to the main app.',
  },
];

/**
 * Run all automated checks
 */
export async function runAutomatedChecks(
  projectDir: string = process.cwd()
): Promise<CheckResult[]> {
  const results: CheckResult[] = [];

  for (const check of productionChecks) {
    if (check.automated && check.check) {
      try {
        const result = await check.check(projectDir);
        results.push(result);
      } catch (error) {
        results.push({
          id: check.id,
          name: check.name,
          category: check.category,
          status: 'skip',
          message: `Check failed: ${error}`,
        });
      }
    }
  }

  return results;
}

/**
 * Get all manual checks for a category
 */
export function getManualChecks(category?: CheckCategory): ProductionCheck[] {
  return productionChecks.filter(check => {
    if (category && check.category !== category) return false;
    return !check.automated;
  });
}

/**
 * Get all checks for a category
 */
export function getChecksByCategory(category: CheckCategory): ProductionCheck[] {
  return productionChecks.filter(check => check.category === category);
}

/**
 * Get summary of check results
 */
export function getCheckSummary(results: CheckResult[]): {
  total: number;
  passed: number;
  failed: number;
  warnings: number;
  manual: number;
} {
  return {
    total: results.length,
    passed: results.filter(r => r.status === 'pass').length,
    failed: results.filter(r => r.status === 'fail').length,
    warnings: results.filter(r => r.status === 'warn').length,
    manual: results.filter(r => r.status === 'manual').length,
  };
}

/**
 * Format check results for display
 */
export function formatCheckResults(results: CheckResult[]): string {
  const lines: string[] = [];
  const byCategory = new Map<CheckCategory, CheckResult[]>();

  for (const result of results) {
    const category = result.category;
    if (!byCategory.has(category)) {
      byCategory.set(category, []);
    }
    byCategory.get(category)!.push(result);
  }

  const statusEmoji: Record<CheckStatus, string> = {
    pass: '✅',
    fail: '❌',
    warn: '⚠️',
    skip: '⏭️',
    manual: '👤',
  };

  for (const [category, categoryResults] of byCategory) {
    lines.push(`\n## ${category.toUpperCase()}`);
    for (const result of categoryResults) {
      lines.push(`${statusEmoji[result.status]} ${result.name}: ${result.message}`);
      if (result.fixSuggestion && result.status !== 'pass') {
        lines.push(`   → ${result.fixSuggestion}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Generate production readiness report
 */
export async function generateProductionReport(
  projectDir: string = process.cwd()
): Promise<string> {
  const automatedResults = await runAutomatedChecks(projectDir);
  const summary = getCheckSummary(automatedResults);

  const lines: string[] = [
    '# Production Readiness Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Automated checks: ${summary.total}`,
    `- Passed: ${summary.passed}`,
    `- Failed: ${summary.failed}`,
    `- Warnings: ${summary.warnings}`,
    '',
    '## Automated Check Results',
    formatCheckResults(automatedResults),
    '',
    '## Manual Checks Required',
    '',
  ];

  const manualChecks = getManualChecks();
  for (const check of manualChecks) {
    lines.push(`### ${check.name}`);
    lines.push(`Category: ${check.category}`);
    lines.push(`${check.manualPrompt || check.description}`);
    if (check.fixSuggestion) {
      lines.push(`Fix: ${check.fixSuggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Find source files in a project (js, ts, jsx, tsx)
 */
function findSourceFiles(projectDir: string): string[] {
  const extensions = ['.js', '.ts', '.jsx', '.tsx'];
  const ignoreDirs = ['node_modules', 'dist', 'build', '.git', 'coverage'];

  return findFilesRecursive(
    projectDir,
    new RegExp(`\\.(${extensions.map(e => e.slice(1)).join('|')})$`),
    ignoreDirs
  );
}

/**
 * Recursively find files matching a pattern
 */
function findFilesRecursive(
  dir: string,
  pattern: RegExp,
  ignoreDirs: string[] = ['node_modules', '.git']
): string[] {
  const results: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.includes(entry.name)) {
          results.push(...findFilesRecursive(fullPath, pattern, ignoreDirs));
        }
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip unreadable directories
  }

  return results;
}
