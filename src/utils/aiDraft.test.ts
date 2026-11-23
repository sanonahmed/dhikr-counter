import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildNotificationPrompt,
  DRAFT_BODY_LIMIT,
  DRAFT_TITLE_LIMIT,
  parseAiDraft,
} from './aiDraft';

test('aiDraft reads a clean JSON reply', () => {
  const draft = parseAiDraft('{"title":"A moment for dhikr","body":"Take a mindful pause and remember Allah."}');
  assert.equal(draft.title, 'A moment for dhikr');
  assert.equal(draft.body, 'Take a mindful pause and remember Allah.');
  assert.equal(draft.source, 'json');
});

test('aiDraft unwraps a fenced object surrounded by prose', () => {
  const draft = parseAiDraft(
    'Here is a draft:\n```json\n{"title":"Pause","body":"Breathe and remember."}\n```\nLet me know if you want changes.'
  );
  assert.equal(draft.title, 'Pause');
  assert.equal(draft.body, 'Breathe and remember.');
  assert.equal(draft.source, 'json');
});

test('aiDraft repairs JSON cut off mid-string', () => {
  const draft = parseAiDraft('{"title":"Evening dhikr","body":"Set aside two quiet minutes');
  assert.equal(draft.title, 'Evening dhikr');
  assert.equal(draft.body, 'Set aside two quiet minutes');
  assert.equal(draft.source, 'json');
});

test('aiDraft repairs JSON cut off at a key', () => {
  const draft = parseAiDraft('{"title":"Evening dhikr","body":');
  assert.equal(draft.title, 'Evening dhikr');
  assert.equal(draft.body, 'Evening dhikr');
  assert.equal(draft.source, 'json');
});

test('aiDraft repairs an escaped character cut off at the end of a string', () => {
  const draft = parseAiDraft('{"title":"Pause","body":"Remember Allah\\');
  assert.equal(draft.body, 'Remember Allah');
});

test('aiDraft tolerates smart quotes, raw newlines, and trailing commas', () => {
  const draft = parseAiDraft('{\u201ctitle\u201d:\u201cMorning dhikr\u201d,\u201cbody\u201d:\u201cStart the day\nwith remembrance\u201d,}');
  assert.equal(draft.title, 'Morning dhikr');
  assert.equal(draft.body, 'Start the day with remembrance');
  assert.equal(draft.source, 'json');
});

test('aiDraft reads a labelled plain-text reply', () => {
  const draft = parseAiDraft('Here is a suggestion.\nTitle: A quiet moment\nBody: Take one mindful breath and remember Allah.');
  assert.equal(draft.title, 'A quiet moment');
  assert.equal(draft.body, 'Take one mindful breath and remember Allah.');
  assert.equal(draft.source, 'labeled');
});

test('aiDraft falls back to the reply text instead of throwing', () => {
  const draft = parseAiDraft('We need an easy way to remind people to pause for dhikr during the day.');
  assert.equal(draft.source, 'text');
  assert.match(draft.body, /pause for dhikr/);
  assert.ok(draft.title.length <= DRAFT_TITLE_LIMIT);
  assert.ok(draft.body.length <= DRAFT_BODY_LIMIT);
});

test('aiDraft clamps long fields and fills a missing half', () => {
  const long = parseAiDraft(JSON.stringify({ title: 'x'.repeat(120), body: 'y'.repeat(300) }));
  assert.equal(long.title.length, DRAFT_TITLE_LIMIT);
  assert.equal(long.title.at(-1), '\u2026');
  assert.equal(long.body.length, DRAFT_BODY_LIMIT);

  const titleOnly = parseAiDraft('{"title":"Only a title"}');
  assert.equal(titleOnly.body, 'Only a title');

  const bodyOnly = parseAiDraft('{"body":"Take one slow breath."}');
  assert.equal(bodyOnly.title, 'Take one slow breath.');
});

test('aiDraft rejects an empty reply with a helpful message', () => {
  assert.throws(() => parseAiDraft('   '), /empty reply/i);
});

test('buildNotificationPrompt keeps the topic and the JSON contract', () => {
  const prompt = buildNotificationPrompt('evening dhikr');
  assert.match(prompt, /Topic: evening dhikr/);
  assert.match(prompt, /\{"title":"\.\.\.","body":"\.\.\."\}/);
  assert.match(buildNotificationPrompt('  '), /A gentle daily dhikr reminder/);
});
