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

interface ContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  id?: string;
  tool_use_id?: string;
  content?: string;
}

interface RawTranscriptEntry {
  type: string;
  message?: {
    role?: string;
    content?: string | ContentBlock[];
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
      const parsed = parseEntry(entry);
      messages.push(...parsed);
    } catch {
      // Skip malformed lines
      continue;
    }
  }

  return { messages };
}

function parseEntry(entry: RawTranscriptEntry): TranscriptMessage[] {
  const messages: TranscriptMessage[] = [];

  // Handle user messages
  if (entry.type === 'user' || entry.message?.role === 'user') {
    messages.push({
      type: 'user',
      content: extractTextContent(entry.message?.content),
      timestamp: entry.timestamp,
    });
    return messages;
  }

  // Handle assistant messages - may contain tool_use blocks
  if (entry.type === 'assistant' || entry.message?.role === 'assistant') {
    const content = entry.message?.content;

    // Extract text content
    const textContent = extractTextContent(content);
    if (textContent) {
      messages.push({
        type: 'assistant',
        content: textContent,
        timestamp: entry.timestamp,
      });
    }

    // Extract tool_use blocks from content array
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === 'tool_use' && block.name) {
          messages.push({
            type: 'tool_use',
            content: `Tool: ${block.name}`,
            toolName: block.name,
            toolInput: block.input,
            timestamp: entry.timestamp,
          });
        }
        if (block.type === 'tool_result' && block.content) {
          messages.push({
            type: 'tool_result',
            content: block.content,
            toolOutput: block.content,
            timestamp: entry.timestamp,
          });
        }
      }
    }

    return messages;
  }

  // Handle standalone tool_use entries
  if (entry.type === 'tool_use' || entry.tool_name) {
    messages.push({
      type: 'tool_use',
      content: `Tool: ${entry.tool_name}`,
      toolName: entry.tool_name,
      toolInput: entry.tool_input,
      timestamp: entry.timestamp,
    });
    return messages;
  }

  // Handle standalone tool_result entries
  if (entry.type === 'tool_result' || entry.tool_output !== undefined) {
    messages.push({
      type: 'tool_result',
      content: entry.tool_output || '',
      toolOutput: entry.tool_output,
      timestamp: entry.timestamp,
    });
    return messages;
  }

  return messages;
}

function extractTextContent(
  content: string | ContentBlock[] | undefined
): string {
  if (!content) return '';

  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text!)
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
