/**
 * PRD (Product Requirements Document) Parser
 *
 * Parses markdown PRD files to extract requirements, features,
 * and user stories for tracking and guidance.
 */

/**
 * Requirement category types
 */
export type RequirementCategory = 'requirement' | 'feature' | 'user-story' | 'acceptance-criteria';

/**
 * A single requirement extracted from a PRD
 */
export interface PRDRequirement {
  /** Unique ID within the PRD */
  id: string;
  /** The requirement text */
  text: string;
  /** Category of the requirement */
  category: RequirementCategory;
  /** Is this a checklist item? */
  isChecklist: boolean;
  /** Is this completed? (from [x] syntax) */
  completed: boolean;
  /** Parent requirement ID (for acceptance criteria) */
  parentId?: string;
  /** Section heading this came from */
  section?: string;
  /** Original line number in the file */
  lineNumber?: number;
}

/**
 * Parsed PRD structure
 */
export interface ParsedPRD {
  /** Title of the PRD (from first H1) */
  title?: string;
  /** All extracted requirements */
  requirements: PRDRequirement[];
  /** Sections found in the document */
  sections: string[];
  /** Raw content for reference */
  rawContent: string;
}

/**
 * Section headers that contain requirements
 */
const REQUIREMENT_SECTIONS = [
  'requirements',
  'functional requirements',
  'non-functional requirements',
  'features',
  'user stories',
  'acceptance criteria',
  'specs',
  'specifications',
  'scope',
  'deliverables',
  'goals',
  'objectives',
];

/**
 * Parse a markdown PRD file content
 *
 * @param content - Raw markdown content
 * @returns Parsed PRD structure
 */
export function parsePRD(content: string): ParsedPRD {
  const lines = content.split('\n');
  const requirements: PRDRequirement[] = [];
  const sections: string[] = [];

  let title: string | undefined;
  let currentSection: string | undefined;
  let currentParentId: string | undefined;
  let requirementCounter = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Extract title from first H1
    if (!title && trimmedLine.startsWith('# ')) {
      title = trimmedLine.slice(2).trim();
      continue;
    }

    // Track sections (H2 headers)
    if (trimmedLine.startsWith('## ')) {
      currentSection = trimmedLine.slice(3).trim();
      sections.push(currentSection);

      // Reset parent ID when entering new section
      currentParentId = undefined;
      continue;
    }

    // Track sub-sections (H3 headers) - might be acceptance criteria
    if (trimmedLine.startsWith('### ')) {
      const subSection = trimmedLine.slice(4).trim().toLowerCase();
      if (subSection.includes('acceptance criteria') || subSection.includes('acceptance')) {
        // Next items are acceptance criteria for the last requirement
        continue;
      }
    }

    // Parse checklist items: - [ ] or - [x]
    const checklistMatch = trimmedLine.match(/^-\s*\[([ xX])\]\s*(.+)$/);
    if (checklistMatch) {
      const completed = checklistMatch[1].toLowerCase() === 'x';
      const text = checklistMatch[2].trim();

      requirementCounter++;
      const req: PRDRequirement = {
        id: `req-${requirementCounter}`,
        text,
        category: determineCategory(currentSection, text),
        isChecklist: true,
        completed,
        section: currentSection,
        lineNumber: i + 1,
      };

      // If we're in an acceptance criteria section, link to parent
      if (currentSection?.toLowerCase().includes('acceptance')) {
        req.category = 'acceptance-criteria';
        req.parentId = currentParentId;
      }

      requirements.push(req);
      currentParentId = req.id;
      continue;
    }

    // Parse bullet points: - or * followed by text
    const bulletMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
    if (bulletMatch && isRequirementSection(currentSection)) {
      const text = bulletMatch[1].trim();

      // Skip if it looks like a sub-bullet or note
      if (text.startsWith('-') || text.startsWith('*')) {
        continue;
      }

      requirementCounter++;
      const req: PRDRequirement = {
        id: `req-${requirementCounter}`,
        text,
        category: determineCategory(currentSection, text),
        isChecklist: false,
        completed: false,
        section: currentSection,
        lineNumber: i + 1,
      };

      requirements.push(req);
      currentParentId = req.id;
      continue;
    }

    // Parse numbered lists: 1. or 1) followed by text
    const numberedMatch = trimmedLine.match(/^\d+[.)]\s+(.+)$/);
    if (numberedMatch && isRequirementSection(currentSection)) {
      const text = numberedMatch[1].trim();

      requirementCounter++;
      const req: PRDRequirement = {
        id: `req-${requirementCounter}`,
        text,
        category: determineCategory(currentSection, text),
        isChecklist: false,
        completed: false,
        section: currentSection,
        lineNumber: i + 1,
      };

      requirements.push(req);
      currentParentId = req.id;
    }
  }

  return {
    title,
    requirements,
    sections,
    rawContent: content,
  };
}

/**
 * Check if a section likely contains requirements
 */
function isRequirementSection(section: string | undefined): boolean {
  if (!section) return false;

  const lowerSection = section.toLowerCase();
  return REQUIREMENT_SECTIONS.some(rs => lowerSection.includes(rs));
}

/**
 * Determine the category of a requirement based on section and text
 */
function determineCategory(section: string | undefined, text: string): RequirementCategory {
  const lowerSection = section?.toLowerCase() || '';
  const lowerText = text.toLowerCase();

  if (lowerSection.includes('user stor') || lowerText.startsWith('as a ')) {
    return 'user-story';
  }

  if (lowerSection.includes('feature')) {
    return 'feature';
  }

  if (lowerSection.includes('acceptance')) {
    return 'acceptance-criteria';
  }

  return 'requirement';
}

/**
 * Get requirements by category
 */
export function getRequirementsByCategory(
  prd: ParsedPRD,
  category: RequirementCategory
): PRDRequirement[] {
  return prd.requirements.filter(r => r.category === category);
}

/**
 * Get incomplete requirements
 */
export function getIncompleteRequirements(prd: ParsedPRD): PRDRequirement[] {
  return prd.requirements.filter(r => !r.completed);
}

/**
 * Get completion statistics
 */
export function getCompletionStats(prd: ParsedPRD): {
  total: number;
  completed: number;
  percentage: number;
} {
  const total = prd.requirements.length;
  const completed = prd.requirements.filter(r => r.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, percentage };
}

/**
 * Get the next requirement to work on
 */
export function getNextRequirement(prd: ParsedPRD): PRDRequirement | undefined {
  // Find first incomplete requirement
  return prd.requirements.find(r => !r.completed);
}

/**
 * Update a requirement's completion status in the raw content
 * Returns the modified content
 */
export function updateRequirementStatus(
  content: string,
  requirementId: string,
  completed: boolean,
  prd: ParsedPRD
): string {
  const requirement = prd.requirements.find(r => r.id === requirementId);
  if (!requirement || !requirement.isChecklist || requirement.lineNumber === undefined) {
    return content;
  }

  const lines = content.split('\n');
  const lineIndex = requirement.lineNumber - 1;

  if (lineIndex >= 0 && lineIndex < lines.length) {
    const line = lines[lineIndex];
    // Replace [ ] with [x] or vice versa
    if (completed) {
      lines[lineIndex] = line.replace(/\[\s\]/, '[x]');
    } else {
      lines[lineIndex] = line.replace(/\[[xX]\]/, '[ ]');
    }
  }

  return lines.join('\n');
}
