/**
 * Transcript Parser
 *
 * Parses Claude Code's JSONL transcript files to extract conversation history.
 */

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export interface TranscriptMessage {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: string;
  timestamp?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolOutput?: string;
}

export interface Transcript {
  messages: TranscriptMessage[];
  sessionId?: string;
  startTime?: string;
}

interface RawTranscriptEntry {
  type: string;
  message?: {
    role?: string;
    content?: string | Array<{ type: string; text?: string; name?: string; input?: unknown }>;
  };
  timestamp?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
}

/**
 * Parse a JSONL transcript file from Claude Code
 */
export async function parseTranscript(transcriptPath: string): Promise<Transcript> {
  if (!existsSync(transcriptPath)) {
    return { messages: [] };
  }

  const content = await readFile(transcriptPath, 'utf-8');
  const lines = content.trim().split('\n').filter(Boolean);

  const messages: TranscriptMessage[] = [];

  for (const line of lines) {
    try {
      const entry: RawTranscriptEntry = JSON.parse(line);
      const message = parseEntry(entry);
      if (message) {
        messages.push(message);
      }
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return { messages };
}

function parseEntry(entry: RawTranscriptEntry): TranscriptMessage | null {
  // Handle different entry types
  if (entry.type === 'user' || entry.message?.role === 'user') {
    return {
      type: 'user',
      content: extractContent(entry.message?.content),
      timestamp: entry.timestamp,
    };
  }

  if (entry.type === 'assistant' || entry.message?.role === 'assistant') {
    return {
      type: 'assistant',
      content: extractContent(entry.message?.content),
      timestamp: entry.timestamp,
    };
  }

  if (entry.type === 'tool_use' || entry.tool_name) {
    return {
      type: 'tool_use',
      content: `Tool: ${entry.tool_name}`,
      toolName: entry.tool_name,
      toolInput: entry.tool_input,
      timestamp: entry.timestamp,
    };
  }

  if (entry.type === 'tool_result' || entry.tool_output !== undefined) {
    return {
      type: 'tool_result',
      content: entry.tool_output || '',
      toolOutput: entry.tool_output,
      timestamp: entry.timestamp,
    };
  }

  return null;
}

function extractContent(
  content: string | Array<{ type: string; text?: string }> | undefined
): string {
  if (!content) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('\n');
  }

  return '';
}

/**
 * Get the last N messages from the transcript
 */
export function getRecentMessages(
  transcript: Transcript,
  count: number = 10
): TranscriptMessage[] {
  return transcript.messages.slice(-count);
}

/**
 * Get all tool uses from the transcript
 */
export function getToolUses(transcript: Transcript): TranscriptMessage[] {
  return transcript.messages.filter((m) => m.type === 'tool_use');
}

/**
 * Get the conversation summary (user prompts only)
 */
export function getUserPrompts(transcript: Transcript): TranscriptMessage[] {
  return transcript.messages.filter((m) => m.type === 'user');
}
