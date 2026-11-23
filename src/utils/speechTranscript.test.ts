import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSpeechRecognitionResults } from './speechTranscript';

function result(transcript: string, isFinal: boolean) {
  return Object.assign([{ transcript }], { isFinal });
}

test('speech transcript keeps interim recognition as preview, not submitted speech', () => {
  const transcripts = splitSpeechRecognitionResults([
    result('background noise mistaken for words', false),
  ]);

  assert.equal(transcripts.finalTranscript, '');
  assert.equal(transcripts.interimTranscript, 'background noise mistaken for words');
});

test('speech transcript submits finalized results and keeps interim guesses separate', () => {
  const transcripts = splitSpeechRecognitionResults([
    result('What time is', true),
    result('What time is prayer?', false),
  ]);

  assert.equal(transcripts.finalTranscript, 'What time is');
  assert.equal(transcripts.interimTranscript, 'What time is prayer?');
});

test('speech transcript only reads changed results from the recognition event', () => {
  const transcripts = splitSpeechRecognitionResults([
    result('already handled', true),
    result('new finalized words', true),
  ], 1);

  assert.equal(transcripts.finalTranscript, 'new finalized words');
  assert.equal(transcripts.interimTranscript, '');
});
