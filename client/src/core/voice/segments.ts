// ─── Capture segment word accounting ─────────────────────────────────────────
// The toggle-mode capture applies narration incrementally: each pause-closed
// segment arrives as a partial and is applied on the spot; `stopCapture` then
// resolves with the FULL stitched transcript (already-heard segments + the
// unheard tail). Both the native side (single-space join of segment texts) and
// the dev mock (comma/period-separated clauses) preserve one identity through
// the word split below: words(final) = concat(words(segment_i)). So counting
// words as segments apply, then slicing the final word list past that count,
// yields exactly the unheard tail — no string-prefix math, no plugin changes.
// (Capacitor-free on purpose: Vitest imports this without touching
// registerPlugin.)

/** Word list for the matcher/parser — strips punctuation artifacts. */
export function transcriptWords(text: string): string[] {
  return text.split(/[\s,.!?]+/).filter(w => w.length > 0)
}

/** The words of `finalTranscript` not yet applied from partials. */
export function tailWords(finalTranscript: string, appliedWordCount: number): string[] {
  return transcriptWords(finalTranscript).slice(Math.max(0, appliedWordCount))
}
