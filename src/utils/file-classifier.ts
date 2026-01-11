/**
 * File Classifier
 *
 * Classifies files by type to enable smart test reminders
 * and other context-aware behavior.
 */

import { basename, extname } from 'path';

/**
 * File type categories
 */
export type FileType = 'code' | 'test' | 'config' | 'docs' | 'style' | 'build' | 'other';

/**
 * Detailed file classification result
 */
export interface FileClassification {
  type: FileType;
  /** Is this a test file? */
  isTest: boolean;
  /** Is this a sensitive file (secrets, credentials)? */
  isSensitive: boolean;
  /** Detected programming language (if code file) */
  language?: string;
}

/**
 * Code file extensions by language
 */
const CODE_EXTENSIONS: Record<string, string> = {
  // JavaScript/TypeScript
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',

  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',

  // Go
  '.go': 'go',

  // Rust
  '.rs': 'rust',

  // Java/Kotlin
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',

  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',

  // C#
  '.cs': 'csharp',

  // Ruby
  '.rb': 'ruby',

  // PHP
  '.php': 'php',

  // Swift
  '.swift': 'swift',

  // Scala
  '.scala': 'scala',

  // Elixir/Erlang
  '.ex': 'elixir',
  '.exs': 'elixir',
  '.erl': 'erlang',

  // Haskell
  '.hs': 'haskell',

  // Lua
  '.lua': 'lua',

  // R
  '.r': 'r',
  '.R': 'r',

  // Shell scripts (treated as code for test purposes)
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
};

/**
 * Config file extensions
 */
const CONFIG_EXTENSIONS = new Set([
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.cfg',
  '.conf',
  '.config',
  '.xml',
  '.properties',
]);

/**
 * Documentation file extensions
 */
const DOCS_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.rst',
  '.adoc',
  '.asciidoc',
  '.org',
  '.tex',
]);

/**
 * Style file extensions
 */
const STYLE_EXTENSIONS = new Set([
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.styl',
  '.stylus',
]);

/**
 * Build/infrastructure files
 */
const BUILD_FILES = new Set([
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Makefile',
  'Rakefile',
  'Gemfile',
  'Podfile',
  'CMakeLists.txt',
  'build.gradle',
  'pom.xml',
  'Vagrantfile',
  'Jenkinsfile',
  '.gitlab-ci.yml',
  '.github',
]);

/**
 * Dotfile config files (filename-based)
 */
const DOTFILE_CONFIGS = new Set([
  '.gitignore',
  '.gitattributes',
  '.npmrc',
  '.nvmrc',
  '.prettierrc',
  '.eslintrc',
  '.eslintignore',
  '.prettierignore',
  '.editorconfig',
  '.babelrc',
  '.browserslistrc',
  '.dockerignore',
  '.env.example',
  '.env.sample',
]);

/**
 * Sensitive file patterns
 */
/**
 * Safe env file patterns (templates, examples)
 */
const SAFE_ENV_PATTERNS = [
  /\.env\.example$/i,
  /\.env\.sample$/i,
  /\.env\.template$/i,
  /\.env\.defaults$/i,
];

const SENSITIVE_PATTERNS = [
  /^\.env$/,
  /^\.env\.(local|development|production|staging|test)$/i,
  /^\.env\.[^.]+$/,  // .env.anything except safe patterns
  /secrets?\./i,
  /credentials?\./i,
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /id_rsa/,
  /id_dsa/,
  /id_ecdsa/,
  /id_ed25519/,
];

/**
 * Test file patterns
 */
const TEST_PATTERNS = [
  // JavaScript/TypeScript test patterns
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  /_test\.[jt]sx?$/,
  /\.e2e\.[jt]sx?$/,

  // Python test patterns
  /^test_.*\.py$/,
  /.*_test\.py$/,

  // Go test patterns
  /_test\.go$/,

  // Rust test patterns (tests in same file, but also test modules)
  /tests?\.rs$/,

  // Generic patterns
  /__tests__\//,
  /\/tests?\//,
  /\/spec\//,
];

/**
 * Check if a file is a test file
 */
export function isTestFile(filePath: string): boolean {
  const fileName = basename(filePath);
  const lowerPath = filePath.toLowerCase();

  // Check against test patterns
  for (const pattern of TEST_PATTERNS) {
    if (pattern.test(fileName) || pattern.test(lowerPath)) {
      return true;
    }
  }

  // Check if in test directory
  if (lowerPath.includes('__tests__/') || lowerPath.includes('/tests/') || lowerPath.includes('/test/')) {
    return true;
  }

  return false;
}

/**
 * Check if a file is sensitive
 */
export function isSensitiveFile(filePath: string): boolean {
  const fileName = basename(filePath);

  // Check if it's a safe env file first (example, template, etc.)
  for (const pattern of SAFE_ENV_PATTERNS) {
    if (pattern.test(fileName)) {
      return false;
    }
  }

  // Check against sensitive patterns
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(fileName)) {
      return true;
    }
  }

  return false;
}

/**
 * Classify a file by its path
 *
 * @param filePath - Full or relative file path
 * @returns FileClassification with type and metadata
 */
export function classifyFile(filePath: string): FileClassification {
  const fileName = basename(filePath);
  const ext = extname(filePath).toLowerCase();
  const isTest = isTestFile(filePath);
  const isSensitive = isSensitiveFile(filePath);

  // Test files (special case - still code but flagged)
  if (isTest) {
    const language = CODE_EXTENSIONS[ext];
    return {
      type: 'test',
      isTest: true,
      isSensitive,
      language,
    };
  }

  // Code files
  if (CODE_EXTENSIONS[ext]) {
    return {
      type: 'code',
      isTest: false,
      isSensitive,
      language: CODE_EXTENSIONS[ext],
    };
  }

  // Config files (by extension)
  if (CONFIG_EXTENSIONS.has(ext)) {
    return {
      type: 'config',
      isTest: false,
      isSensitive,
    };
  }

  // Dotfile configs
  if (DOTFILE_CONFIGS.has(fileName) || fileName.startsWith('.') && !ext) {
    return {
      type: 'config',
      isTest: false,
      isSensitive,
    };
  }

  // Documentation files
  if (DOCS_EXTENSIONS.has(ext)) {
    return {
      type: 'docs',
      isTest: false,
      isSensitive,
    };
  }

  // Special doc files by name
  if (['LICENSE', 'CHANGELOG', 'CONTRIBUTING', 'AUTHORS', 'README'].some(n =>
    fileName.toUpperCase().startsWith(n)
  )) {
    return {
      type: 'docs',
      isTest: false,
      isSensitive,
    };
  }

  // Style files
  if (STYLE_EXTENSIONS.has(ext)) {
    return {
      type: 'style',
      isTest: false,
      isSensitive,
    };
  }

  // Build/infrastructure files
  if (BUILD_FILES.has(fileName)) {
    return {
      type: 'build',
      isTest: false,
      isSensitive,
    };
  }

  // Default
  return {
    type: 'other',
    isTest: false,
    isSensitive,
  };
}

/**
 * Check if a file change should trigger test reminders
 *
 * @param filePath - The file that was changed
 * @returns true if test reminder should be triggered
 */
export function shouldTriggerTestReminder(filePath: string): boolean {
  const classification = classifyFile(filePath);

  // Trigger for code and test files
  // Don't trigger for config, docs, style, build, other
  return classification.type === 'code' || classification.type === 'test';
}

/**
 * Batch classify multiple files
 *
 * @param filePaths - Array of file paths
 * @returns Map of file path to classification
 */
export function classifyFiles(filePaths: string[]): Map<string, FileClassification> {
  const results = new Map<string, FileClassification>();

  for (const filePath of filePaths) {
    results.set(filePath, classifyFile(filePath));
  }

  return results;
}

/**
 * Check if any file in a list is a code file
 *
 * @param filePaths - Array of file paths
 * @returns true if at least one code file is present
 */
export function hasCodeFiles(filePaths: string[]): boolean {
  return filePaths.some(fp => {
    const classification = classifyFile(fp);
    return classification.type === 'code' || classification.type === 'test';
  });
}
