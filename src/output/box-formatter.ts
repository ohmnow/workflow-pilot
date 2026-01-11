/**
 * Box Formatter
 *
 * Creates visually appealing rounded boxes with background color
 * for Workflow Pilot output.
 */

// Box-drawing characters (rounded corners)
const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
};

// ANSI Color Codes
const COLORS = {
  // True color background (#caaf5e = RGB 202, 175, 94)
  bgGolden: '\x1b[48;2;202;175;94m',
  // Fallback for terminals without true color support
  bgYellow: '\x1b[43m',
  // Text colors (dark on light background)
  fgBlack: '\x1b[30m',
  fgDarkGray: '\x1b[90m',
  // Formatting
  bold: '\x1b[1m',
  reset: '\x1b[0m',
  // Additional colors for icons/emphasis
  fgRed: '\x1b[31m',
  fgYellow: '\x1b[33m',
};

export interface BoxOptions {
  /** Minimum width of the box (default: 40) */
  minWidth?: number;
  /** Maximum width of the box (default: 80) */
  maxWidth?: number;
  /** Padding inside the box (default: 1) */
  padding?: number;
  /** Use true color (24-bit) or fallback to 256-color (default: true) */
  trueColor?: boolean;
  /** Title to show in the header (optional) */
  title?: string;
  /** Type of box for styling (default: 'info') */
  type?: 'info' | 'warning' | 'critical' | 'tip';
}

/**
 * Strip ANSI escape codes from a string to get actual display length
 */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get the display width of a string (excluding ANSI codes)
 */
function displayWidth(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Pad a string to a target width, accounting for ANSI codes
 */
function padToWidth(str: string, targetWidth: number): string {
  const currentWidth = displayWidth(str);
  if (currentWidth >= targetWidth) {
    return str;
  }
  return str + ' '.repeat(targetWidth - currentWidth);
}

/**
 * Format content into a rounded box with background color
 *
 * @param lines - Array of content lines to display
 * @param options - Formatting options
 * @returns Array of formatted lines ready for console output
 */
export function formatBox(lines: string[], options: BoxOptions = {}): string[] {
  const {
    minWidth = 40,
    maxWidth = 80,
    padding = 1,
    trueColor = true,
    title,
    type = 'info',
  } = options;

  // Calculate content width (max line length + padding)
  const contentLines = lines.filter(line => line !== undefined);
  const maxLineWidth = Math.max(
    ...contentLines.map(line => displayWidth(line)),
    title ? displayWidth(title) + 4 : 0, // Account for title + icon
    minWidth - (padding * 2) - 2 // Minimum content area
  );

  // Total box width (content + padding + borders)
  const innerWidth = Math.min(maxLineWidth + (padding * 2), maxWidth - 2);
  const totalWidth = innerWidth + 2; // +2 for left and right borders

  // Select background color
  const bg = trueColor ? COLORS.bgGolden : COLORS.bgYellow;
  const fg = COLORS.fgBlack;
  const reset = COLORS.reset;

  // Build the box
  const output: string[] = [];

  // Border uses golden color for the line characters (no background fill)
  const borderFg = '\x1b[38;2;202;175;94m'; // Golden foreground for border chars

  // Top border - rounded corners with golden line color, no background
  output.push(
    `${borderFg}${BOX.topLeft}${BOX.horizontal.repeat(innerWidth)}${BOX.topRight}${reset}`
  );

  // Title line (if provided)
  if (title) {
    const icon = getTypeIcon(type);
    const titleLine = `${icon} ${title}`;
    const paddedTitle = padToWidth(titleLine, innerWidth - padding);
    // Golden border chars │, content area with golden background
    output.push(
      `${borderFg}${BOX.vertical}${reset}${bg}${fg}${' '.repeat(padding)}${paddedTitle}${reset}${borderFg}${BOX.vertical}${reset}`
    );
    // Empty line after title
    output.push(
      `${borderFg}${BOX.vertical}${reset}${bg}${fg}${' '.repeat(innerWidth)}${reset}${borderFg}${BOX.vertical}${reset}`
    );
  }

  // Content lines
  for (const line of contentLines) {
    // Golden border chars │, content with golden background
    const paddedLine = padToWidth(' '.repeat(padding) + line, innerWidth);
    output.push(
      `${borderFg}${BOX.vertical}${reset}${bg}${fg}${paddedLine}${reset}${borderFg}${BOX.vertical}${reset}`
    );
  }

  // Bottom border - rounded corners with golden line color
  output.push(
    `${borderFg}${BOX.bottomLeft}${BOX.horizontal.repeat(innerWidth)}${BOX.bottomRight}${reset}`
  );

  return output;
}

/**
 * Get icon for box type
 */
function getTypeIcon(type: BoxOptions['type']): string {
  switch (type) {
    case 'critical':
      return '🚨';
    case 'warning':
      return '⚠️';
    case 'tip':
      return '💡';
    case 'info':
    default:
      return '🎯';
  }
}

/**
 * Quick helper to print a box to stderr
 */
export function printBox(lines: string[], options: BoxOptions = {}): void {
  const boxLines = formatBox(lines, options);
  console.error(''); // Empty line before
  for (const line of boxLines) {
    console.error(line);
  }
  console.error(''); // Empty line after
}

/**
 * Format a critical alert box (red emphasis)
 */
export function formatCriticalBox(
  title: string,
  messages: Array<{ text: string; detail?: string }>
): string[] {
  const lines: string[] = [];

  for (const msg of messages) {
    lines.push(`  → ${msg.text}`);
    if (msg.detail) {
      lines.push(`    ${msg.detail}`);
    }
  }

  return formatBox(lines, {
    title,
    type: 'critical',
    minWidth: 50,
  });
}

/**
 * Format a warning box
 */
export function formatWarningBox(
  title: string,
  suggestions: Array<{ text: string; detail?: string; priority?: string }>
): string[] {
  const lines: string[] = [];

  for (const s of suggestions) {
    const icon = s.priority === 'high' ? '⚠' : '→';
    lines.push(`  ${icon} ${s.text}`);
    if (s.detail) {
      lines.push(`    ${s.detail}`);
    }
  }

  return formatBox(lines, {
    title,
    type: 'warning',
    minWidth: 45,
  });
}

/**
 * Format a tip box
 */
export function formatTipBox(tip: string, detail?: string): string[] {
  const lines = [tip];
  if (detail) {
    lines.push(`  ${detail}`);
  }

  return formatBox(lines, {
    title: 'Tip',
    type: 'tip',
    minWidth: 35,
  });
}

// Export colors for use in index.ts if needed
export { COLORS };
