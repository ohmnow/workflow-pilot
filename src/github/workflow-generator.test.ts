import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  generateWorkerWorkflow,
  generateCIWorkflow,
  getWorkflowPath,
  saveWorkerWorkflow,
  workflowExists,
  getRequiredSecrets,
  generateSetupInstructions,
  DEFAULT_WORKFLOW_OPTIONS,
} from './workflow-generator.js';
import { DEFAULT_AUTOPILOT_CONFIG, AutopilotConfig } from '../orchestrator/autopilot-config.js';

describe('WorkflowGenerator', () => {
  describe('generateWorkerWorkflow', () => {
    it('should generate valid YAML structure', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('name: Claude Worker');
      expect(workflow).toContain('on:');
      expect(workflow).toContain('issues:');
      expect(workflow).toContain('types: [labeled]');
      expect(workflow).toContain('jobs:');
      expect(workflow).toContain('claude-worker:');
    });

    it('should trigger on correct label', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain("if: github.event.label.name == 'ready-for-claude'");
    });

    it('should use custom label from config', () => {
      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        workerLabel: 'claude-ready',
      };
      const workflow = generateWorkerWorkflow(config);

      expect(workflow).toContain("if: github.event.label.name == 'claude-ready'");
      expect(workflow).toContain('--remove-label "claude-ready"');
    });

    it('should use ubuntu-latest runner', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('runs-on: ubuntu-latest');
    });

    it('should setup Node.js', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('uses: actions/setup-node@v4');
      expect(workflow).toContain("node-version: '20'");
    });

    it('should use custom Node.js version', () => {
      const workflow = generateWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {
        nodeVersion: '18',
      });

      expect(workflow).toContain("node-version: '18'");
    });

    it('should include ANTHROPIC_API_KEY secret', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}');
    });

    it('should install Claude Code CLI', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('npm install -g @anthropic-ai/claude-code@latest');
    });

    it('should use custom Claude version', () => {
      const workflow = generateWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {
        claudeVersion: '1.0.0',
      });

      expect(workflow).toContain('npm install -g @anthropic-ai/claude-code@1.0.0');
    });

    it('should include test step by default', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('name: Run tests');
      expect(workflow).toContain('npm test');
    });

    it('should include build step by default', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('name: Run build');
      expect(workflow).toContain('npm run build');
    });

    it('should skip tests when disabled', () => {
      const workflow = generateWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {
        runTests: false,
      });

      expect(workflow).not.toContain('name: Run tests');
    });

    it('should skip build when disabled', () => {
      const workflow = generateWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {
        runBuild: false,
      });

      expect(workflow).not.toContain('name: Run build');
    });

    it('should set timeout from config', () => {
      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        workerTimeout: '1h',
      };
      const workflow = generateWorkerWorkflow(config);

      expect(workflow).toContain('timeout-minutes: 60');
    });

    it('should create feature branch', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('git checkout -b "$BRANCH_NAME"');
      expect(workflow).toContain('claude-worker/issue-');
    });

    it('should create PR with Fixes reference', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('gh pr create');
      expect(workflow).toContain('Fixes #${{ steps.issue.outputs.number }}');
    });

    it('should comment on issue', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('gh issue comment');
    });

    it('should remove worker label after processing', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('gh issue edit');
      expect(workflow).toContain('--remove-label');
    });

    it('should have correct permissions', () => {
      const workflow = generateWorkerWorkflow();

      expect(workflow).toContain('permissions:');
      expect(workflow).toContain('contents: write');
      expect(workflow).toContain('issues: write');
      expect(workflow).toContain('pull-requests: write');
    });

    it('should include custom env vars', () => {
      const workflow = generateWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {
        envVars: {
          MY_VAR: 'my-value',
        },
      });

      expect(workflow).toContain('MY_VAR: my-value');
    });

    it('should use custom workflow name', () => {
      const workflow = generateWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {
        name: 'My Custom Worker',
      });

      expect(workflow).toContain('name: My Custom Worker');
    });
  });

  describe('generateCIWorkflow', () => {
    it('should generate basic CI workflow', () => {
      const workflow = generateCIWorkflow();

      expect(workflow).toContain('name: CI');
      expect(workflow).toContain('push:');
      expect(workflow).toContain('pull_request:');
      expect(workflow).toContain('npm test');
      expect(workflow).toContain('npm run build');
    });

    it('should use custom commands', () => {
      const workflow = generateCIWorkflow({
        testCommand: 'yarn test',
        buildCommand: 'yarn build',
      });

      expect(workflow).toContain('yarn test');
      expect(workflow).toContain('yarn build');
    });
  });

  describe('getWorkflowPath', () => {
    it('should return correct default path', () => {
      const result = getWorkflowPath('/project');

      expect(result).toBe('/project/.github/workflows/claude-worker.yml');
    });

    it('should use custom filename', () => {
      const result = getWorkflowPath('/project', 'custom.yml');

      expect(result).toBe('/project/.github/workflows/custom.yml');
    });
  });

  describe('file operations', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    describe('saveWorkerWorkflow', () => {
      it('should create .github/workflows directory', () => {
        const result = saveWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {}, tempDir);

        expect(result.success).toBe(true);
        expect(fs.existsSync(path.join(tempDir, '.github', 'workflows'))).toBe(true);
      });

      it('should write workflow file', () => {
        const result = saveWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {}, tempDir);

        expect(result.success).toBe(true);
        expect(fs.existsSync(result.path)).toBe(true);

        const content = fs.readFileSync(result.path, 'utf-8');
        expect(content).toContain('name: Claude Worker');
      });

      it('should return path on success', () => {
        const result = saveWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {}, tempDir);

        expect(result.path).toContain('claude-worker.yml');
      });
    });

    describe('workflowExists', () => {
      it('should return false when workflow does not exist', () => {
        expect(workflowExists(tempDir)).toBe(false);
      });

      it('should return true when workflow exists', () => {
        saveWorkerWorkflow(DEFAULT_AUTOPILOT_CONFIG, {}, tempDir);

        expect(workflowExists(tempDir)).toBe(true);
      });
    });
  });

  describe('getRequiredSecrets', () => {
    it('should include ANTHROPIC_API_KEY as required', () => {
      const secrets = getRequiredSecrets();

      const apiKey = secrets.find(s => s.name === 'ANTHROPIC_API_KEY');
      expect(apiKey).toBeDefined();
      expect(apiKey?.required).toBe(true);
    });

    it('should include GITHUB_TOKEN as not required', () => {
      const secrets = getRequiredSecrets();

      const githubToken = secrets.find(s => s.name === 'GITHUB_TOKEN');
      expect(githubToken).toBeDefined();
      expect(githubToken?.required).toBe(false);
    });
  });

  describe('generateSetupInstructions', () => {
    it('should include secret setup instructions', () => {
      const instructions = generateSetupInstructions();

      expect(instructions).toContain('ANTHROPIC_API_KEY');
      expect(instructions).toContain('Secrets');
    });

    it('should include label creation instructions', () => {
      const instructions = generateSetupInstructions();

      expect(instructions).toContain('ready-for-claude');
      expect(instructions).toContain('Create the Worker Label');
    });

    it('should use custom label from config', () => {
      const config: AutopilotConfig = {
        ...DEFAULT_AUTOPILOT_CONFIG,
        workerLabel: 'my-custom-label',
      };
      const instructions = generateSetupInstructions(config);

      expect(instructions).toContain('my-custom-label');
    });

    it('should include troubleshooting section', () => {
      const instructions = generateSetupInstructions();

      expect(instructions).toContain('Troubleshooting');
    });
  });

  describe('DEFAULT_WORKFLOW_OPTIONS', () => {
    it('should have sensible defaults', () => {
      expect(DEFAULT_WORKFLOW_OPTIONS.name).toBe('Claude Worker');
      expect(DEFAULT_WORKFLOW_OPTIONS.nodeVersion).toBe('20');
      expect(DEFAULT_WORKFLOW_OPTIONS.claudeVersion).toBe('latest');
      expect(DEFAULT_WORKFLOW_OPTIONS.runTests).toBe(true);
      expect(DEFAULT_WORKFLOW_OPTIONS.runBuild).toBe(true);
    });
  });
});
