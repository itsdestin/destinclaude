const ANSI_ESCAPE = /\u001b\[[0-9;]*[a-zA-Z]/g;

const TITLE_OVERRIDES: Record<string, string> = {
  'trust': 'Trust This Folder?',
  'dark mode': 'Choose a Theme',
  'login method': 'Select Login Method',
  'dangerously-skip-permissions': 'Skip Permissions Warning',
  'skip all permission': 'Skip Permissions Warning',
};

export interface ParsedMenu {
  id: string;
  title: string;
  options: string[];
  selectedIndex: number;
}

export interface PromptButton {
  label: string;
  input: string;
}

function stripAnsi(line: string): string {
  return line.replace(ANSI_ESCAPE, '');
}

/**
 * Parse an Ink select menu from rendered terminal screen text.
 *
 * Instead of walking line-by-line (fragile with wrapped text), this:
 * 1. Finds the ❯ selector character
 * 2. Extracts the full menu block (selector line + surrounding numbered options)
 * 3. Joins multi-line text into single options using numbered-item boundaries
 */
export function parseInkSelect(screenText: string): ParsedMenu | null {
  const clean = stripAnsi(screenText);
  const lines = clean.split('\n');

  // Find the line with the ❯ selector
  let selectorIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\s*❯/.test(lines[i])) { selectorIdx = i; break; }
  }
  if (selectorIdx < 0) return null;

  // Collect the full menu region: walk up and down from the selector
  // to find all numbered option lines and their continuations
  let regionStart = selectorIdx;
  let regionEnd = selectorIdx;

  // Walk backward to find the start of the menu
  for (let i = selectorIdx - 1; i >= 0; i--) {
    const trimmed = lines[i].trim();
    if (!trimmed) break;
    // A numbered option or heavily-indented continuation
    if (/^\d+\.\s+/.test(trimmed) || /^\s{2,}/.test(lines[i])) {
      regionStart = i;
    } else {
      break;
    }
  }

  // Walk forward to find the end of the menu
  for (let i = selectorIdx + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) break;
    if (/^\d+\.\s+/.test(trimmed) || /^\s{2,}/.test(lines[i])) {
      regionEnd = i;
    } else {
      break;
    }
  }

  // Flatten the region into a single string, collapsing internal newlines
  // Then split on numbered-item boundaries to extract individual options
  const regionLines = lines.slice(regionStart, regionEnd + 1);
  const regionText = regionLines.map((l) => {
    // Normalize: strip selector ❯ and leading whitespace, keep the rest
    return l.replace(/^\s*❯\s*/, '  ');
  }).join(' ');

  // Match numbered options: "1. text", "2. text", etc.
  // Use a regex that captures everything from one number to the next
  const optionPattern = /(\d+)\.\s+(.+?)(?=\s+\d+\.\s+|$)/g;
  const options: string[] = [];
  const optionNumbers: number[] = [];
  let match;

  while ((match = optionPattern.exec(regionText)) !== null) {
    const num = parseInt(match[1], 10);
    // Clean up whitespace (from joining multi-line text)
    const text = match[2].replace(/\s+/g, ' ').trim();
    options.push(text);
    optionNumbers.push(num);
  }

  if (options.length < 2) return null;
  if (options.some((o) => o.length > 200)) return null;

  // Determine which option is selected (the one on the ❯ line)
  const selectorLine = lines[selectorIdx];
  const selectorNumMatch = /❯\s*(\d+)\./.exec(selectorLine);
  let selectedIndex = 0;
  if (selectorNumMatch) {
    const selNum = parseInt(selectorNumMatch[1], 10);
    const idx = optionNumbers.indexOf(selNum);
    if (idx >= 0) selectedIndex = idx;
  }

  // Extract title from lines above the menu
  const title = extractTitle(lines, regionStart, clean);

  const id = 'menu_' + options.map((o) => o.slice(0, 10)).join('_')
    .toLowerCase().replace(/[^a-z0-9_]/g, '');

  return { id, title, options, selectedIndex };
}

function extractTitle(lines: string[], firstOptionLine: number, fullText: string): string {
  const lower = fullText.toLowerCase();

  for (const [keyword, title] of Object.entries(TITLE_OVERRIDES)) {
    if (lower.includes(keyword)) return title;
  }

  const searchStart = Math.max(0, firstOptionLine - 10);
  for (let i = firstOptionLine - 1; i >= searchStart; i--) {
    const clean = stripAnsi(lines[i]).trim();
    if (!clean) continue;
    if (clean.endsWith('?') || clean.endsWith(':')) {
      return clean.replace(/[:?]$/, '').trim() + (clean.endsWith('?') ? '?' : '');
    }
    if (clean.length >= 3 && clean.length <= 80) return clean;
  }

  return 'Select an Option';
}

export function menuToButtons(menu: ParsedMenu): PromptButton[] {
  const UP = '\u001b[A';
  const DOWN = '\u001b[B';

  return menu.options.map((label, index) => {
    const offset = index - menu.selectedIndex;
    let input: string;
    if (offset < 0) {
      input = UP.repeat(-offset) + '\r';
    } else if (offset > 0) {
      input = DOWN.repeat(offset) + '\r';
    } else {
      input = '\r';
    }
    return { label, input };
  });
}
