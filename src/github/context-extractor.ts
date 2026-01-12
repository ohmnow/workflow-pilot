/**
 * Issue Context Extractor
 *
 * Extracts actionable context from GitHub issues for Claude workers.
 * Parses issue body to find requirements, acceptance criteria, and related files.
 */

import { GitHubIssue } from './client.js';
import { Feature } from '../orchestrator/feature-schema.js';
import { GitHubFeature } from './issue-manager.js';
import { AutopilotConfig, DEFAULT_AUTOPILOT_CONFIG } from '../orchestrator/autopilot-config.js';

/**
 * Structured context for Claude worker
 */
export interface ExtractedContext {
  /** Issue number */
  issueNumber: number;
  /** Issue title */
  title: string;
  /** Feature ID if linked */
  featureId?: string;
  /** Main description/goal */
  description: string;
  /** List of requirements extracted from issue */
  requirements: string[];
  /** Acceptance criteria as checklist items */
  acceptanceCriteria: string[];
  /** Files mentioned or likely related */
  relatedFiles: string[];
  /** Dependencies on other features/issues */
  dependencies: string[];
  /** Branch name to use */
  branchName: string;
  /** Scope limitations for the worker */
  scopeInstructions: string;
  /** Any additional notes from issue */
  notes: string[];
}

/**
 * Extract worker context from a GitHub issue
 */
export function extractWorkerContext(
  issue: GitHubIssue,
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG
): ExtractedContext {
  const body = issue.body || '';

  // Extract feature ID from issue body or title
  const featureId = extractFeatureId(issue.title, body);

  // Generate branch name
  const branchName = generateBranchName(issue.number, featureId, config);

  // Parse sections from issue body
  const sections = parseIssueSections(body);

  // Helper to use fallback when section is undefined or empty
  const useOrFallback = <T>(sectionValue: T[] | undefined, fallback: T[]): T[] =>
    sectionValue && sectionValue.length > 0 ? sectionValue : fallback;

  return {
    issueNumber: issue.number,
    title: issue.title,
    featureId,
    description: sections.description || extractDescription(body),
    requirements: useOrFallback(sections.requirements, extractRequirements(body)),
    acceptanceCriteria: useOrFallback(sections.acceptanceCriteria, extractAcceptanceCriteria(body)),
    relatedFiles: useOrFallback(sections.relatedFiles, extractRelatedFiles(body)),
    dependencies: useOrFallback(sections.dependencies, extractDependencies(body)),
    branchName,
    scopeInstructions: generateScopeInstructions(featureId, sections.scope),
    notes: sections.notes || [],
  };
}

/**
 * Extract context from a Feature object (for when we have local feature data)
 */
export function extractContextFromFeature(
  feature: GitHubFeature,
  config: AutopilotConfig = DEFAULT_AUTOPILOT_CONFIG
): ExtractedContext {
  const branchPattern = config.branchPattern || 'claude-worker/{feature-id}';
  const branchName = branchPattern.replace(
    '{feature-id}',
    feature.id.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  );

  return {
    issueNumber: feature.githubIssue || 0,
    title: feature.name,
    featureId: feature.id,
    description: feature.description,
    requirements: feature.steps.map(s => s.description),
    acceptanceCriteria: feature.acceptanceCriteria.map(c => c.description),
    relatedFiles: [], // Would need codebase analysis
    dependencies: feature.dependsOn,
    branchName,
    scopeInstructions: generateScopeInstructions(feature.id),
    notes: feature.notes ? [feature.notes] : [],
  };
}

/**
 * Generate a Claude prompt from extracted context
 */
export function generateWorkerPrompt(context: ExtractedContext): string {
  const sections: string[] = [];

  // Header
  sections.push(`# Task: ${context.title}`);
  sections.push('');

  if (context.featureId) {
    sections.push(`**Feature ID:** ${context.featureId}`);
  }
  sections.push(`**Issue:** #${context.issueNumber}`);
  sections.push(`**Branch:** \`${context.branchName}\``);
  sections.push('');

  // Description
  sections.push('## Description');
  sections.push('');
  sections.push(context.description);
  sections.push('');

  // Requirements
  if (context.requirements.length > 0) {
    sections.push('## Requirements');
    sections.push('');
    for (const req of context.requirements) {
      sections.push(`- ${req}`);
    }
    sections.push('');
  }

  // Acceptance Criteria
  if (context.acceptanceCriteria.length > 0) {
    sections.push('## Acceptance Criteria');
    sections.push('');
    sections.push('Your implementation MUST satisfy all of these:');
    sections.push('');
    for (const criterion of context.acceptanceCriteria) {
      sections.push(`- [ ] ${criterion}`);
    }
    sections.push('');
  }

  // Related Files
  if (context.relatedFiles.length > 0) {
    sections.push('## Related Files');
    sections.push('');
    sections.push('Consider these files when implementing:');
    sections.push('');
    for (const file of context.relatedFiles) {
      sections.push(`- \`${file}\``);
    }
    sections.push('');
  }

  // Dependencies
  if (context.dependencies.length > 0) {
    sections.push('## Dependencies');
    sections.push('');
    sections.push('This task depends on:');
    sections.push('');
    for (const dep of context.dependencies) {
      sections.push(`- ${dep}`);
    }
    sections.push('');
  }

  // Scope Instructions
  sections.push('## Scope & Instructions');
  sections.push('');
  sections.push(context.scopeInstructions);
  sections.push('');

  // Standard worker instructions
  sections.push('## Workflow');
  sections.push('');
  sections.push('1. Read and understand the existing codebase');
  sections.push('2. Implement the feature according to the requirements');
  sections.push('3. Write tests for new functionality');
  sections.push('4. Ensure all tests pass');
  sections.push('5. Commit your changes with a clear message');
  sections.push(`6. Reference this issue in your commit: "Fixes #${context.issueNumber}"`);
  sections.push('');

  // Notes
  if (context.notes.length > 0) {
    sections.push('## Notes');
    sections.push('');
    for (const note of context.notes) {
      sections.push(note);
    }
    sections.push('');
  }

  return sections.join('\n');
}

/**
 * Generate a compact prompt for token-constrained contexts
 */
export function generateCompactPrompt(context: ExtractedContext): string {
  const lines: string[] = [];

  lines.push(`Task: ${context.title} (Issue #${context.issueNumber})`);
  lines.push(`Branch: ${context.branchName}`);
  lines.push('');
  lines.push(context.description);
  lines.push('');

  if (context.acceptanceCriteria.length > 0) {
    lines.push('Acceptance Criteria:');
    for (const c of context.acceptanceCriteria) {
      lines.push(`- ${c}`);
    }
    lines.push('');
  }

  lines.push(context.scopeInstructions);
  lines.push('');
  lines.push(`Commit with: Fixes #${context.issueNumber}`);

  return lines.join('\n');
}

// ============ Internal Parsing Functions ============

/**
 * Extract feature ID from title or body
 */
function extractFeatureId(title: string, body: string): string | undefined {
  // Look for patterns like [F-001], (T2-004), Feature: F-001
  const patterns = [
    /\[([A-Z]+\d*-\d+)\]/,           // [F-001] or [T2-004]
    /\(([A-Z]+\d*-\d+)\)/,           // (F-001) or (T2-004)
    /Feature[:\s]+([A-Z]+\d*-\d+)/i, // Feature: F-001
    /ID[:\s]+([A-Z]+\d*-\d+)/i,      // ID: F-001
    /^\s*([A-Z]+\d*-\d+)[:\s]/,      // F-001: at start
    /([A-Z]+\d*-\d+)\s*$/,           // F-001 at end of title
  ];

  for (const pattern of patterns) {
    const titleMatch = title.match(pattern);
    if (titleMatch) return titleMatch[1];

    const bodyMatch = body.match(pattern);
    if (bodyMatch) return bodyMatch[1];
  }

  return undefined;
}

/**
 * Generate branch name from issue/feature
 */
function generateBranchName(
  issueNumber: number,
  featureId: string | undefined,
  config: AutopilotConfig
): string {
  const pattern = config.branchPattern || 'claude-worker/{feature-id}';

  if (featureId) {
    return pattern.replace(
      '{feature-id}',
      featureId.toLowerCase().replace(/[^a-z0-9-]/g, '-')
    );
  }

  return `claude-worker/issue-${issueNumber}`;
}

/**
 * Parse structured sections from issue body
 */
function parseIssueSections(body: string): {
  description?: string;
  requirements?: string[];
  acceptanceCriteria?: string[];
  relatedFiles?: string[];
  dependencies?: string[];
  scope?: string;
  notes?: string[];
} {
  const result: ReturnType<typeof parseIssueSections> = {};

  // Split by markdown headers
  const sections = body.split(/^##\s+/m);

  for (const section of sections) {
    const lines = section.trim().split('\n');
    const header = lines[0]?.toLowerCase() || '';
    const content = lines.slice(1).join('\n').trim();

    if (header.includes('description')) {
      result.description = content;
    } else if (header.includes('requirement') || header.includes('implementation step')) {
      result.requirements = extractListItems(content);
    } else if (header.includes('acceptance') || header.includes('criteria')) {
      // Strip checkbox markers from acceptance criteria
      result.acceptanceCriteria = extractListItems(content).map(item =>
        item.replace(/^\[[ x]\]\s*/, '')
      );
    } else if (header.includes('related') || header.includes('file')) {
      result.relatedFiles = extractListItems(content).map(f => f.replace(/`/g, ''));
    } else if (header.includes('depend')) {
      result.dependencies = extractListItems(content);
    } else if (header.includes('scope') || header.includes('worker context')) {
      result.scope = content;
    } else if (header.includes('note')) {
      result.notes = extractListItems(content);
    }
  }

  return result;
}

/**
 * Extract list items from markdown content
 * Returns items with checkbox status preserved for later filtering
 */
function extractListItems(content: string): string[] {
  const items: string[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Match - item, * item, 1. item, - [x] item, - [ ] item
    const checkboxMatch = line.match(/^\s*[-*]\s*\[([ x])\]\s*(.+)$/);
    if (checkboxMatch) {
      // Preserve checkbox for later filtering, mark as checkbox item
      items.push(`[${checkboxMatch[1]}] ${checkboxMatch[2].trim()}`);
      continue;
    }

    const listMatch = line.match(/^\s*[-*]\s+(.+)$/) ||
                      line.match(/^\s*\d+\.\s+(.+)$/);
    if (listMatch) {
      const text = listMatch[1];
      if (text && text.trim()) {
        items.push(text.trim());
      }
    }
  }

  return items;
}

/**
 * Extract description from unstructured body
 */
function extractDescription(body: string): string {
  // Get content before first header or list
  const match = body.match(/^([\s\S]*?)(?=^##|\n[-*]\s|\n\d+\.)/m);
  if (match && match[1].trim()) {
    return match[1].trim();
  }

  // Fallback: first paragraph
  const firstPara = body.split(/\n\n/)[0];
  return firstPara?.trim() || body.slice(0, 500).trim();
}

/**
 * Extract requirements from unstructured body
 */
function extractRequirements(body: string): string[] {
  // Look for any list items that look like requirements
  const items = extractListItems(body);
  return items.filter(item =>
    !item.toLowerCase().includes('verified') &&
    !item.toLowerCase().includes('tested') &&
    item.length > 10
  ).slice(0, 10); // Limit to 10
}

/**
 * Extract acceptance criteria from unstructured body
 */
function extractAcceptanceCriteria(body: string): string[] {
  const items = extractListItems(body);

  // Look for checkbox items or items with "should", "must", "can"
  const criteria = items.filter(item =>
    item.match(/^\[[ x]\]/) ||
    item.toLowerCase().includes('should') ||
    item.toLowerCase().includes('must') ||
    item.toLowerCase().includes('can ')
  );

  // Strip checkbox markers from results
  return criteria.map(item => item.replace(/^\[[ x]\]\s*/, ''));
}

/**
 * Extract file references from body
 */
function extractRelatedFiles(body: string): string[] {
  const files: string[] = [];

  // Match inline code with file paths (e.g., `src/auth.ts`, `lib/core.js`)
  const inlineCodeRegex = /`([^`\s]+\.(ts|js|tsx|jsx|json|md|css|html|py|go|rs|yaml|yml|sh))`/g;
  let match;
  while ((match = inlineCodeRegex.exec(body)) !== null) {
    files.push(match[1]);
  }

  // Match paths in the format src/... or ./... (without backticks)
  const pathMatches = body.match(/(?:src|\.\/|lib|test|spec|scripts)\/[\w\-./]+\.\w+/g);
  if (pathMatches) {
    files.push(...pathMatches);
  }

  // Deduplicate
  return [...new Set(files)];
}

/**
 * Extract dependency references
 */
function extractDependencies(body: string): string[] {
  const deps: string[] = [];

  // Match "depends on #123" or "after #456"
  const issueRefs = body.match(/(?:depends on|after|requires|blocked by)\s*#\d+/gi);
  if (issueRefs) {
    deps.push(...issueRefs);
  }

  // Match feature IDs in depends context
  const featureRefs = body.match(/(?:depends on|after|requires)\s+[A-Z]+\d*-\d+/gi);
  if (featureRefs) {
    deps.push(...featureRefs);
  }

  // Also extract from ## Dependencies section - look for list items with #numbers or feature IDs
  const depSectionMatch = body.match(/##\s*Dependenc[ies]+\s*\n([\s\S]*?)(?=\n##|$)/i);
  if (depSectionMatch) {
    const sectionContent = depSectionMatch[1];
    // Extract #123 references
    const hashRefs = sectionContent.match(/#\d+/g);
    if (hashRefs) {
      deps.push(...hashRefs.map(r => `Issue ${r}`));
    }
    // Extract feature IDs
    const featureIds = sectionContent.match(/[A-Z]+\d*-\d+/g);
    if (featureIds) {
      deps.push(...featureIds);
    }
  }

  return [...new Set(deps)]; // Deduplicate
}

/**
 * Generate scope instructions for worker
 */
function generateScopeInstructions(featureId?: string, customScope?: string): string {
  const instructions: string[] = [];

  instructions.push('**IMPORTANT: Worker Scope Limitations**');
  instructions.push('');

  if (featureId) {
    instructions.push(`You are working ONLY on feature ${featureId}.`);
  }

  instructions.push('- Focus exclusively on the task described in this issue');
  instructions.push('- Do NOT modify files unrelated to this feature');
  instructions.push('- Do NOT refactor or "improve" code outside the scope');
  instructions.push('- Do NOT modify configuration files unless required');
  instructions.push('- Do NOT modify feature_list.json or orchestrator state');
  instructions.push('- Keep changes minimal and focused');

  if (customScope) {
    instructions.push('');
    instructions.push('**Additional Scope Notes:**');
    instructions.push(customScope);
  }

  return instructions.join('\n');
}

/**
 * Validate extracted context has minimum required information
 */
export function validateContext(context: ExtractedContext): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  if (!context.description || context.description.length < 20) {
    warnings.push('Description is too short or missing');
  }

  if (context.acceptanceCriteria.length === 0) {
    warnings.push('No acceptance criteria found - worker may not know when task is complete');
  }

  if (!context.branchName) {
    warnings.push('No branch name generated');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}
