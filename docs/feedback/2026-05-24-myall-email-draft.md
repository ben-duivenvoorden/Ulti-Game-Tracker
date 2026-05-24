# Draft email to Myall

**Date drafted:** 2026-05-24

---

**Subject:** Stat tracker — feedback responses

Hi Myall,

Thanks for the thorough write-up — really useful. Walked through every item; quick rundown of where each landed.

### What's changing (some already done)

- **Brick pull** — already built; now also a config toggle per league.
- **Portrait layout with large fixed action buttons** — this is exactly the direction we're heading next. One caveat: keeping Pass as the default on player tap (no Pass button) to minimise clicks. No 8th "previous holder" slot.
- **Unknown "?" player slot** — agreed, real gap when scoring an opposition you don't know. Will be a roster slot (not an event), configurable per league.
- **Offline-first** — adopting. Local queue, batched flush whenever connectivity returns — same model as a messaging client. Append-only per session so ingestion is conflict-free.
- **ABBA gender-point tracking** — yes, planned. Full advisory ("next point is 4M/3F" suggestion), not just a passive readout. Configurable.
- **In-app stats for line management** — yes, narrow scope: points-played per player at Line Selection, plus an end-of-point reconciliation glance for catching errors early.
- **Point duration** — derivable from Pull → Goal timestamps, will surface as part of the above.
- **Stall as a distinct event** — already configurable per league. We treat stall = thrower-throwaway for BUML; you can switch it on in your config.

### Probably won't do

- **Event-first flow (event → player)** — doesn't sit well with "pass is the default on player tap"; would add clicks to the most common interaction.
- **Compound turnovers (Block + Throwaway + Drop)** — extra tap cost mid-play. We keep entries flat in the log; "group as one turnover" can happen in analysis downstream.
- **Double-tap debounce** — would silently swallow valid fast passes (give-and-go's especially). Existing undo handles real misclicks.
- **Disc-hold / catch-to-throw timer in-app** — not enough practical use mid-game; you can derive it from the log timestamps later if it's interesting.
- **8th "previous holder" button** — see above; sticking with 7.

### Considering

- **Renaming Pull Bonus to "Deep Pull"** — just a terminology change. The thresholds stay league-configurable (ours is gendered: women's brick mark+, men's endzone; you can set yours however).
- **Field location per pass** — treating this as a bonus feature, behind a config toggle, for teams that want spatial data. It'd practically require a landscape mode (the portrait layout above doesn't fit a field diagram), so it'd be a parallel mode rather than the default. [Statto](https://statto.app/) already targets this niche if it's a near-term priority for you.
- **Two-hand layout (players RHS, actions LHS)** — under consideration; the explosion model already gives state-aware action visibility, so the final shape will likely be a hybrid.

### Already covered by the current flow

- **Visual distinction for post-turnover pickup** — the "intercepted by" and "blocked by" pick screens already make this unambiguous. Side note: things like Callahan are derived from the log (intercept directly followed by goal) rather than needing a dedicated button cluttering the UI.
- **Editing earlier entries** — easier than you found it: long-press an event to set a cursor, the canvas rewinds to that point, then recording the corrected event commits the rewind atomically. There's also a fuller edit-range mode for bigger fixes. (Both are now exposed in-game, not just post-game.)
- **Gender ratios are never enforced** — only an advisory warning if the line is off-ratio; recorder can always proceed. Configurable per competition.

### Architecture-level

- **Conflict resolution** — we're not at multi-scorer yet so this isn't live, but the principle is: every submission goes into the append-only log, automatic resolution applies post-ingestion when reconstructing the view, and conflicts stay admin-visible (no silent overwrites). Your first-write-wins-with-sequence-numbers is a reasonable starting point for the auto layer.
- **Auth** — likely QR-based with optional email-verify + admin approval. Per-event emailed passwords ruled out as too heavy. Specific mechanism TBA.

Happy to dig into any of these further if you want to push back — particularly the event-first flow or the compound-turnovers calls, since those were judgement-based.

Cheers,
Ben

---

## Notes for sender

- Tone is informal/peer-to-peer; adjust if Myall's existing relationship is more formal.
- Length: ~500 words; could halve to a TL;DR if preferred.
- Sections roughly mirror the [responses doc](2026-05-24-myall-responses.md) but skip the design-internal items.
- "BUML" mentioned once — should be "Parity" if you want to align with the official league name (BUML was a test ground). Or leave it if Myall already knows BUML in your conversations.
