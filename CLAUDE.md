# Claude Code Workflow Pilot

## Project Overview
An AI-powered Claude Code plugin that monitors conversation context and provides intelligent workflow guidance to help solo developers ship production-grade apps using professional development practices and agentic coding techniques.

## Architecture
- **Hook-based**: Uses Claude Code hooks (UserPromptSubmit, PostToolUse) to monitor conversation
- **AI-first**: Claude API integration for deep context analysis
- **Rule engine**: Pattern matching for common workflow triggers
- **Knowledge base**: Embedded best practices for guidance

## Key Files
- `src/index.ts` - Hook entry point
- `src/analyzer/ai-analyzer.ts` - Claude API integration
- `src/analyzer/transcript-parser.ts` - Parse JSONL transcripts
- `src/rules/*.ts` - Rule implementations
- `src/knowledge/*.md` - Best practices documentation
- `hooks/hooks.json` - Hook configuration
- `config/default.json` - Default plugin configuration

## Development Commands
```bash
npm run build      # Compile TypeScript
npm run watch      # Watch mode
npm run test       # Run tests
npm run lint       # Lint code
```

## Hook Testing
To test hooks locally:
1. Build the project: `npm run build`
2. Configure Claude Code to use hooks from this directory
3. Run Claude Code and observe hook behavior

## Rule Categories
1. Testing workflow
2. Git workflow
3. Refactoring suggestions
4. Security checks
5. Production readiness
6. Claude Code best practices

## AI Integration
- Uses `ANTHROPIC_API_KEY` environment variable
- Falls back to `claude` CLI subprocess if no API key
- Graceful degradation to rule-based only
