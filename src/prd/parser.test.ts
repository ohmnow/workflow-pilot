/**
 * PRD Parser Tests
 */

import { describe, it, expect } from 'vitest';
import {
  parsePRD,
  getRequirementsByCategory,
  getIncompleteRequirements,
  getCompletionStats,
  getNextRequirement,
  updateRequirementStatus,
} from './parser.js';

describe('PRD Parser', () => {
  describe('parsePRD', () => {
    it('extracts title from H1', () => {
      const content = `# My Product PRD

## Requirements
- Feature 1
`;
      const result = parsePRD(content);
      expect(result.title).toBe('My Product PRD');
    });

    it('extracts sections from H2 headers', () => {
      const content = `# PRD

## Requirements
- Req 1

## Features
- Feature 1

## User Stories
- As a user...
`;
      const result = parsePRD(content);
      expect(result.sections).toContain('Requirements');
      expect(result.sections).toContain('Features');
      expect(result.sections).toContain('User Stories');
    });

    it('extracts checklist items with status', () => {
      const content = `# PRD

## Requirements
- [ ] Incomplete item
- [x] Completed item
- [X] Also completed
`;
      const result = parsePRD(content);

      const incomplete = result.requirements.find(r => r.text === 'Incomplete item');
      const completed = result.requirements.find(r => r.text === 'Completed item');

      expect(incomplete?.completed).toBe(false);
      expect(incomplete?.isChecklist).toBe(true);
      expect(completed?.completed).toBe(true);
      expect(completed?.isChecklist).toBe(true);
    });

    it('extracts bullet points as requirements', () => {
      const content = `# PRD

## Requirements
- First requirement
- Second requirement
* Third requirement
`;
      const result = parsePRD(content);
      expect(result.requirements.length).toBe(3);
      expect(result.requirements[0].text).toBe('First requirement');
      expect(result.requirements[1].text).toBe('Second requirement');
      expect(result.requirements[2].text).toBe('Third requirement');
    });

    it('extracts numbered lists as requirements', () => {
      const content = `# PRD

## Features
1. First feature
2. Second feature
3) Third feature
`;
      const result = parsePRD(content);
      expect(result.requirements.length).toBe(3);
    });

    it('categorizes user stories correctly', () => {
      const content = `# PRD

## User Stories
- As a user, I want to login
- As an admin, I want to manage users
`;
      const result = parsePRD(content);
      expect(result.requirements[0].category).toBe('user-story');
      expect(result.requirements[1].category).toBe('user-story');
    });

    it('categorizes features correctly', () => {
      const content = `# PRD

## Features
- Dark mode toggle
- Export to PDF
`;
      const result = parsePRD(content);
      expect(result.requirements[0].category).toBe('feature');
      expect(result.requirements[1].category).toBe('feature');
    });

    it('assigns unique IDs to requirements', () => {
      const content = `# PRD

## Requirements
- Req 1
- Req 2
- Req 3
`;
      const result = parsePRD(content);
      const ids = result.requirements.map(r => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('includes line numbers', () => {
      const content = `# PRD

## Requirements
- First requirement
- Second requirement
`;
      const result = parsePRD(content);
      expect(result.requirements[0].lineNumber).toBe(4);
      expect(result.requirements[1].lineNumber).toBe(5);
    });

    it('preserves section association', () => {
      const content = `# PRD

## Requirements
- Req 1

## Features
- Feature 1
`;
      const result = parsePRD(content);
      expect(result.requirements[0].section).toBe('Requirements');
      expect(result.requirements[1].section).toBe('Features');
    });

    it('handles empty PRD', () => {
      const result = parsePRD('');
      expect(result.requirements).toHaveLength(0);
      expect(result.sections).toHaveLength(0);
      expect(result.title).toBeUndefined();
    });

    it('handles PRD with no requirements sections', () => {
      const content = `# PRD

## Overview
This is an overview.

## Background
Some background info.
`;
      const result = parsePRD(content);
      expect(result.requirements).toHaveLength(0);
    });
  });

  describe('getRequirementsByCategory', () => {
    it('filters requirements by category', () => {
      const content = `# PRD

## Features
- Feature 1
- Feature 2

## User Stories
- As a user...
`;
      const prd = parsePRD(content);
      const features = getRequirementsByCategory(prd, 'feature');
      const userStories = getRequirementsByCategory(prd, 'user-story');

      expect(features.length).toBe(2);
      expect(userStories.length).toBe(1);
    });
  });

  describe('getIncompleteRequirements', () => {
    it('returns only incomplete requirements', () => {
      const content = `# PRD

## Requirements
- [ ] Not done
- [x] Done
- [ ] Also not done
`;
      const prd = parsePRD(content);
      const incomplete = getIncompleteRequirements(prd);

      expect(incomplete.length).toBe(2);
      expect(incomplete.every(r => !r.completed)).toBe(true);
    });
  });

  describe('getCompletionStats', () => {
    it('calculates completion statistics', () => {
      const content = `# PRD

## Requirements
- [ ] Not done
- [x] Done
- [x] Also done
- [ ] Not done either
`;
      const prd = parsePRD(content);
      const stats = getCompletionStats(prd);

      expect(stats.total).toBe(4);
      expect(stats.completed).toBe(2);
      expect(stats.percentage).toBe(50);
    });

    it('handles empty PRD', () => {
      const prd = parsePRD('');
      const stats = getCompletionStats(prd);

      expect(stats.total).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.percentage).toBe(0);
    });
  });

  describe('getNextRequirement', () => {
    it('returns first incomplete requirement', () => {
      const content = `# PRD

## Requirements
- [x] Done
- [ ] Next one
- [ ] After that
`;
      const prd = parsePRD(content);
      const next = getNextRequirement(prd);

      expect(next?.text).toBe('Next one');
    });

    it('returns undefined when all complete', () => {
      const content = `# PRD

## Requirements
- [x] Done
- [x] Also done
`;
      const prd = parsePRD(content);
      const next = getNextRequirement(prd);

      expect(next).toBeUndefined();
    });
  });

  describe('updateRequirementStatus', () => {
    it('marks requirement as completed', () => {
      const content = `# PRD

## Requirements
- [ ] First item
- [ ] Second item
`;
      const prd = parsePRD(content);
      const reqId = prd.requirements[0].id;

      const updated = updateRequirementStatus(content, reqId, true, prd);
      expect(updated).toContain('- [x] First item');
      expect(updated).toContain('- [ ] Second item');
    });

    it('marks requirement as incomplete', () => {
      const content = `# PRD

## Requirements
- [x] First item
- [ ] Second item
`;
      const prd = parsePRD(content);
      const reqId = prd.requirements[0].id;

      const updated = updateRequirementStatus(content, reqId, false, prd);
      expect(updated).toContain('- [ ] First item');
    });

    it('handles uppercase X', () => {
      const content = `# PRD

## Requirements
- [X] First item
`;
      const prd = parsePRD(content);
      const reqId = prd.requirements[0].id;

      const updated = updateRequirementStatus(content, reqId, false, prd);
      expect(updated).toContain('- [ ] First item');
    });

    it('returns unchanged content for non-checklist items', () => {
      const content = `# PRD

## Requirements
- First item
`;
      const prd = parsePRD(content);
      const reqId = prd.requirements[0].id;

      const updated = updateRequirementStatus(content, reqId, true, prd);
      expect(updated).toBe(content);
    });
  });
});
