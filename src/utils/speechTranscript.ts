export interface SpeechRecognitionAlternativeLike { transcript?: string; }
export type SpeechRecognitionResultLike = ArrayLike<SpeechRecognitionAlternativeLike> & { isFinal?: boolean };

export interface SpeechRecognitionTranscripts {
  finalTranscript: string;
  interimTranscript: string;
}

/** Split newly updated recognition results so interim guesses can be previewed but never submitted. */
export function splitSpeechRecognitionResults(
  results: ArrayLike<SpeechRecognitionResultLike>,
  startIndex = 0,
): SpeechRecognitionTranscripts {
  let finalTranscript = '';
  let interimTranscript = '';

  for (let index = Math.max(0, startIndex); index < results.length; index += 1) {
    const result = results[index];
    const transcript = result?.[0]?.transcript?.trim();
    if (!transcript) continue;

    if (result.isFinal === false) interimTranscript += `${transcript} `;
    else finalTranscript += `${transcript} `;
  }

  return { finalTranscript: finalTranscript.trim(), interimTranscript: interimTranscript.trim() };
}
