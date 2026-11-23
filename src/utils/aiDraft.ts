/**
 * Turns whatever an AI provider sends back into a notification draft.
 *
 * Models rarely honour "return only JSON" exactly: they wrap the object in a
 * markdown fence, explain themselves first, emit typographic quotes, or stop
 * when the token budget runs out mid-string. A bare JSON.parse turned each of
 * those into "Unexpected token ... is not valid JSON" in the admin panel, so
 * this module salvages the reply and falls back to its plain text instead.
 */

export const DRAFT_TITLE_LIMIT = 60;
export const DRAFT_BODY_LIMIT = 180;
/**
 * Generous enough for a reasoning model to think and still print the object.
 * The previous 180-token budget cut drafts off mid-string, which is what
 * produced "Unterminated string in JSON".
 */
export const DRAFT_MAX_TOKENS = 600;

export type AiDraftSource = 'json' | 'labeled' | 'text';

export interface AiDraft {
  title: string;
  body: string;
  /** How the reply was read, so the panel can explain a non-JSON answer. */
  source: AiDraftSource;
}

/** Instruction sent with a draft request; the JSON shape is the contract. */
export function buildNotificationPrompt(topic: string): string {
  const subject = topic.trim() || 'A gentle daily dhikr reminder';
  return [
    'You write one short reminder for a Muslim dhikr (remembrance) app.',
    `Topic: ${subject}`,
    'Reply with one JSON object and nothing else: no prose, no markdown, no code fences.',
    '{"title":"...","body":"..."}',
    'Rules: title at most 50 characters, body at most 140 characters.',
    'Do not quote the Quran or hadith, and never claim a religious source. Keep it warm and non-judgemental.',
  ].join('\n');
}

/**
 * Reads a reply into a draft. Never throws for malformed JSON: a plain-text
 * answer is used as the message body so the draft can still be reviewed and
 * edited instead of failing the whole request.
 */
export function parseAiDraft(raw: string): AiDraft {
  const text = (raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('The AI provider returned an empty reply. Try generating again.');

  for (const candidate of candidates(text)) {
    const fromJson = draftFromJson(candidate);
    if (fromJson) return fromJson;
  }

  const labeled = draftFromLabels(text);
  if (labeled) return labeled;

  return draftFromText(text);
}

/** Candidate payloads, most structured first. */
function candidates(text: string): string[] {
  const found = [...fencedBlocks(text)];
  const balanced = balancedObject(text);
  if (balanced) found.push(balanced);
  found.push(text);
  return [...new Set(found.filter(Boolean))];
}

function fencedBlocks(text: string): string[] {
  const blocks: string[] = [];
  const pattern = /```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)(?:```|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const block = match[1].trim();
    if (block) blocks.push(block);
  }
  return blocks;
}

/** First {...} in the text, or the tail from the first { when it is truncated. */
function balancedObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') { depth += 1; continue; }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  // Unbalanced: keep the tail so the repair pass can close it.
  return text.slice(start);
}

function draftFromJson(text: string): AiDraft | null {
  const parsed = attemptParse(text) ?? attemptParse(balancedObject(text) ?? '');
  if (!parsed) return null;
  const title = firstString(parsed, ['title', 'heading']);
  const body = firstString(parsed, ['body', 'message', 'text']);
  if (!title && !body) return null;
  return finish(title, body, 'json');
}

function attemptParse(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null;
  for (const attempt of [text, repairJson(text)]) {
    try {
      const value: unknown = JSON.parse(attempt);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // Try the repaired form, then let the caller fall back.
    }
  }
  return null;
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
}

/**
 * Escapes raw control characters inside strings, drops trailing commas, and
 * closes whatever the token limit cut off, so a truncated object still parses.
 */
function repairJson(text: string): string {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let out = '';
  for (const char of normalizeSmartQuotes(text)) {
    if (inString) {
      if (escaped) { out += char; escaped = false; continue; }
      if (char === '\\') { out += char; escaped = true; continue; }
      if (char === '"') { inString = false; out += char; continue; }
      if (char === '\n') { out += '\\n'; continue; }
      if (char === '\r') continue;
      if (char === '\t') { out += '\\t'; continue; }
      out += char;
      continue;
    }
    if (char === '"') { inString = true; out += char; continue; }
    if (char === '{' || char === '[') { stack.push(char); out += char; continue; }
    if (char === '}' || char === ']') {
      if (stack.length === 0) continue;
      stack.pop();
      out += char;
      continue;
    }
    out += char;
  }

  let repaired = out;
  if (inString) {
    // A dangling backslash would escape the quote that closes the string.
    if (escaped) repaired = repaired.slice(0, -1);
    repaired += '"';
  }
  repaired = repaired.replace(/[\s,]+$/, '').replace(/:\s*$/, '');
  repaired = dropTrailingCommas(repaired);
  // A cut-off object can end on a key, as in {"title":"x","body" — give it an
  // empty value so the repaired object still parses.
  if (stack.length > 0 && repaired.endsWith('"') && isDanglingKey(repaired)) {
    repaired += ':""';
  }
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    repaired += stack[index] === '{' ? '}' : ']';
  }
  return repaired;
}

/** True when the trailing string in `text` is a key, not a finished value. */
function isDanglingKey(text: string): boolean {
  const head = text.slice(0, -1);
  const boundary = Math.max(head.lastIndexOf(','), head.lastIndexOf('{'), head.lastIndexOf('['));
  return !head.slice(boundary + 1).includes(':');
}

function dropTrailingCommas(text: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      out += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; out += char; continue; }
    if (char === ',') {
      const next = text.slice(index + 1).replace(/^\s+/, '')[0];
      if (next === '}' || next === ']') continue;
    }
    out += char;
  }
  return out;
}

/**
 * Some models quote keys and values with typographic quotes. Only convert them
 * when the reply has no straight quote at all, so quotes inside a real value
 * are left untouched.
 */
function normalizeSmartQuotes(text: string): string {
  return text.includes('"') ? text : text.replace(/[\u201c\u201d\u201e\u201f]/g, '"');
}

/** "Title: ..." / "**Body:** ..." style replies, common when a model ignores JSON. */
function draftFromLabels(text: string): AiDraft | null {
  const title = labeledValue(text, 'title') ?? labeledValue(text, 'heading');
  const body = labeledValue(text, 'body') ?? labeledValue(text, 'message') ?? labeledValue(text, 'text');
  if (!body) return null;
  return finish(title ?? '', body, 'labeled');
}

function labeledValue(text: string, field: string): string | null {
  const key = `["'\u201c\u201d]?${field}["'\u201c\u201d]?`;
  const quoted = new RegExp(`${key}\\s*[:=]\\s*"((?:[^"\\\\]|\\\\.)*)"?`, 'i').exec(text);
  if (quoted?.[1]) return unescapeJsonString(quoted[1]);
  const smart = new RegExp(`${key}\\s*[:=]\\s*\u201c([^\u201c\u201d]*)\u201d?`, 'i').exec(text);
  if (smart?.[1]) return cleanValue(smart[1]);
  const line = new RegExp(`^[\\s*]*${field}[\\s*]*[:\\-\u2013]\\s*(.+)$`, 'im').exec(text);
  return line?.[1] ? cleanValue(line[1]) : null;
}

function unescapeJsonString(value: string): string {
  try {
    const parsed: unknown = JSON.parse(`"${value}"`);
    if (typeof parsed === 'string') return parsed;
  } catch {
    // Fall through to the manual best effort below.
  }
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, ' ')
    .replace(/\\t/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
}

function cleanValue(value: string): string {
  return value.replace(/^[\s*_`"'“”]+/, '').replace(/[\s*_`"'“”]+$/, '');
}

/** Last resort: use the reply itself, so the admin can still edit a draft. */
function draftFromText(text: string): AiDraft {
  const cleaned = collapse(text.replace(/```/g, ' '));
  return { title: titleFrom(cleaned), body: clamp(cleaned, DRAFT_BODY_LIMIT), source: 'text' };
}

/**
 * Normalises a recovered pair: fills a missing half from the other one and
 * applies the same limits as the form fields, so nothing is silently dropped.
 */
function finish(title: string, body: string, source: AiDraftSource): AiDraft | null {
  const cleanTitle = collapse(title);
  const cleanBody = collapse(body);
  const combined = cleanBody || cleanTitle;
  if (!combined) return null;
  return {
    title: clamp(cleanTitle || titleFrom(combined), DRAFT_TITLE_LIMIT),
    body: clamp(cleanBody || combined, DRAFT_BODY_LIMIT),
    source,
  };
}

function titleFrom(text: string): string {
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(text);
  return clamp(sentence ? sentence[1] : text, DRAFT_TITLE_LIMIT);
}

function clamp(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}\u2026`;
}

/** Notification text renders on one line, so runs of whitespace collapse. */
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
