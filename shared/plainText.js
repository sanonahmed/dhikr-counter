/**
 * Plain-text normaliser shared by the AI Talk server route and the overlay.
 *
 * Spoken replies read badly when a model decorates them with emoji, markdown,
 * bullet glyphs, or arrows, and speech synthesis may spell those symbols out
 * ("asterisk asterisk"). This strips every character that is not a letter, a
 * combining mark, a digit, or basic sentence punctuation, while keeping Bangla
 * vowel signs, Bangla danda, and the Arabic comma intact.
 */

/** Punctuation a sentence actually needs, in Bangla and English. */
const ALLOWED_PUNCTUATION = new Set([
  '.', ',', '!', '?', ';', ':', "'", '"', '(', ')', '-',
  '\u0964', // । Bangla danda
  '\u0965', // ॥ double danda
  '\u060C', // ، Arabic comma
]);

/** Letters, marks (Bangla vowel signs), digits, and whitespace survive. */
const KEEP = /[\p{L}\p{Mn}\p{Mc}\p{N}\s]/u;

/**
 * Converts a model reply into plain sentences: markdown and list markers are
 * dropped, links keep their label, emoji and symbols become spaces, and runs of
 * whitespace collapse.
 *
 * @param {unknown} value Raw reply text.
 * @returns {string} Plain text safe to display and read aloud.
 */
export function toPlainText(value) {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const undecorated = raw
    .replace(/```[\w-]*[ \t]*\r?\n?/g, '')
    .replace(/`/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+\u2022]\s+/gm, '')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/[*#|~^={}[\]<>\\]/g, ' ');

  let text = '';
  for (const char of undecorated) {
    text += KEEP.test(char) || ALLOWED_PUNCTUATION.has(char) ? char : ' ';
  }

  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\r?\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/ +([.,!?;:)])/g, '$1')
    .trim();
}
