# Myall — Requirements Review (Responses)

**Date:** 2026-05-24
**Source feedback:** [2026-05-24-myall-requirements.md](2026-05-24-myall-requirements.md)
**Reviewer:** Ben

Each item: Myall's input, then Ben's response inline.

---

## Already-covered items (sanity check)

### A1. Don't enforce gender ratios
Already explicit in F1 ("never enforced or blocked").

> **Ben:** Already aligned in spirit — the app **guides but does not enforce** ratios. When a ratio expectation is configured (league-level), an advisory warning surfaces if the selected line is off-ratio, but the recorder can always confirm and proceed. Ratios are never blocked. Configurable via the planned tournament/league layer (gender ratio, score cap, half-time threshold etc. flow down to games inside it), so communities like Myall's can run with the advisory off entirely.

### A2. ABBA tracking (show last 1–2 points' ratio)
Already in Deferred Features (F10) as Phase 2+. Myall's lighter framing — just display last point's ratio — could refine that entry.

> **Ben:** Agreed — will plan for this and build the full F10 version (advisory on next point's ratio, not just a passive readout). Configurable: ABBA mode toggled at the tournament/league level so non-mixed competitions don't see it, with the starting gender confirmed at game start as per F10.

### A3. Scorer auth (password / QR)
Overlaps `docs/design/future-changes.md` "Incorporate scorer".

> **Ben:** TBA — a dedicated auth system is planned but design isn't locked. QR-based access is the likely direction to avoid overcooking it (vs per-event emailed passwords). Possible flows under consideration: open QR join, or email-verify + admin approval before access. Final mechanism deferred.

---

## UX — Live Entry

### 1. Fixed-location giant action buttons (Goal / Turnover / Throwaway)
Eyes-on-field operation; he doesn't care if it looks ugly.

> **Ben:** Clashes with the current F2 explosion model, but this is the direction we're heading next anyway — portrait-style layout with large, fixed action buttons. Broadly aligned with Myall's suggestion, with two divergences: (1) no dedicated Pass button — pass remains the default action on player tap to minimise clicks, and (2) no 8th "previous holder" slot for now. The freed-up space stays empty or hosts a "special events" affordance (e.g. the injury-sub pathway).

### 2. Flip event-entry to event-first
Pass = player only; Goal = event→player; Throwaway / Stall = event only; Receiver Error / Block = event→player. Direct conflict with current F2 player-explosion model.

> **Ben:** Not planning to take this one on. The event-first flow doesn't sit well with "pass is the default action on player tap" (see #1) and would add clicks to the most common interaction. Keeping player-first feels right; the fixed event buttons from #1 should cover the eyes-on-field need without flipping the model.

### 3. Two-hand layout
Players down RHS, actions down LHS.

> **Ben:** Under consideration but not committed. A pure split layout wastes screen real estate because many actions are only valid in specific states (you can't pass to yourself, can't goal off a pull, pulls are irrelevant most of the game). The explosion model was introduced partly to surface only contextually-valid actions — so the likely direction is a hybrid: fixed-button anchor points from #1 combined with state-aware visibility so we're not paying full layout cost for actions that are inactive 95% of the time.

### 4. 8th "previous holder" button
For quick give-and-go's.

> **Ben:** Not planning to add. Per #1, no 8th player slot — the existing 7-player zone stays, and a give-and-go is recorded as two normal taps. The marginal speed win doesn't justify a permanent UI slot or the complication of a "ghost" button whose meaning changes with possession.

### 5. "?" unknown-player button
For scoring opposing team you don't know.

> **Ben:** Adopting. Philosophically uncomfortable — it formalises a path for lower-quality data — but after using the app in my own Parity game the unknown-opponent case is real and unavoidable, so refusing to support it just pushes recorders to skip events entirely. Good suggestion from Myall. The "?" fills an unknown *player slot* in the lineup (not an event type) — so it lives in the roster/line, occupies a position like any other player, and events attach to it normally. Configurable: tournament/league setting decides whether unknown placeholders are permitted.

### 6. Distinct visual state for "pick up after turnover"
Make it look different from a normal pass.

> **Ben:** Already covered by the current flow — the "intercepted by" and "blocked by" pick screens make the post-turnover ask visually distinct from a normal pass. No change needed. Worth noting more broadly: log entries can be interpreted contextually downstream — e.g. an "intercepted by" immediately followed by a goal from the same player is a Callahan, derived from the sequence rather than needing a dedicated "Callahan" button cluttering the UI all game.

### 7. Double-tap debounce (~<0.5s)
Treat two rapid player taps as a single corrected pick.

> **Ben:** Not adopting. Under the "default tap = pass" model, two player taps in quick succession is the natural and correct way to record a real two-pass sequence between players. Adding a debounce would silently swallow valid fast passes (give-and-go's especially), which is worse than the occasional mistap. The existing undo path handles genuine misclicks. Keeping the model clean and predictable.

### 8. Edit-an-earlier-entry UX is confusing
Couldn't change one old event and return to present without rewriting subsequent passes. Most common case: fixing a wrong player on an old pass.

> **Ben:** Acknowledged it's a little tricky, but not expecting heavy use. The editing surface is essentially list editing — copy/paste-style edits are allowed — but the simplest mental model for most recorders is "go back in time and re-record from there," which already works. Important to remember the underlying model: the **raw log has no deletions, only appends**. The visual log reflects edits, but full auditability is preserved — we can always reconstruct what was recorded, what was amended, and how the visual log was reassembled. Not prioritising a dedicated single-event edit UX for now.

---

## Event model

### 9. Stall Out as a distinct event (vs Throwaway)
Myall notes it's mergeable for simplicity.

> **Ben:** Already configurable — Stall Out can be enabled as a distinct event type per tournament/league. For Parity we don't differentiate; a stall-out scores identically to a thrower-throwaway. Myall's community can switch it on in their config without affecting ours.

### 10. "Brick" pull
Foul/out-of-bounds pull placed at the brick mark. Distinct from current Pull Bonus.

> **Ben:** Already covered — Brick is an existing pull option, on by default, and should be configurable per league.

### 11. Rename / redefine Pull Bonus
"Deep Pull" / "Pull – Endzone" with the bar being *reaches the opposite endzone*.

> **Ben:** Minor — really just a terminology difference; Myall calls it something different but the concept overlaps. Pull Bonus is a distance incentive specific to our league (women's brick mark+, men's endzone) and is separate in purpose from a Brick (see #10). Will consider renaming to "Deep Pull" for clearer self-description, but no functional change. Threshold stays league-configurable so Myall's single-endzone definition can coexist with our gendered one.

### 12. Compound turnovers
Allow 1–3 of {Block, Throwaway, Drop} on a single turnover for richer attribution.

> **Ben:** Not adopting — the extra tap cost during live entry isn't worth it. Each turnover should resolve to one type at record time so the recorder isn't forced into a multi-select mid-play. The principle here is to **keep entry types flat** in the raw log — one event = one type — and let the stats/reporting/analysis layer do any grouping it needs (e.g. reconstructing a tip-then-drop sequence by joining adjacent turnover events). We keep the granularity that matters most: Block credits the defence as a +, Throwaway and Drop debit the offence as a −.

---

## Architecture

### 13. Conflict resolution: first-write-wins at server
With line-number/sequence checks so the second submitter gets an immediate error rather than silent overwrite.

> **Ben:** Not relevant yet — we're still single-scorer per session (see F6), so genuine multi-writer conflicts can't happen today. When we do introduce concurrent scorers, the principle is: **record every submission in the raw log regardless of conflict** (consistent with the append-only model), then layer automatic conflict resolution on top for the visual log. Critically, conflicts must remain visible to an admin — auto-resolution shouldn't hide the fact that one happened. Myall's first-write-wins-with-sequence-numbers is a reasonable starting point for the auto layer, but locking the design is deferred until we actually have multi-entry scoring.

### 14. Offline-first / PWA
With "record rest of game offline → upload as offline version" escape hatch.

> **Ben:** Adopting — offline capability is essential. Model comms like a messaging chat client: events queue locally and flush to the server whenever a connection is available, batched in the meantime. No explicit "offline mode" toggle needed — it's just always how the app behaves. Because each session's log is append-only per "conversation," ingestion itself is conflict-free; any cross-scorer conflicts (per #13) are resolved automatically or by an admin as a separate step *after* ingestion, never live mid-ingestion.

---

## Stats

### 15. Real-time stats on Line Selection
At minimum points-played per player; ideally also total time played, touches, possessions played.

> **Ben:** Good suggestion — in-app stats are currently a gap and worth filling. Points-played per player at Line Selection time is the obvious first one. Beyond that, an **end-of-point stats view** (organised per point) is appealing — and aimed less at "fun live scoreboard" and more at **scorer reconciliation and accuracy**: a chance to glance at what was recorded for the just-finished point and catch obvious errors before too much more happens. Other stats (touches, possessions, time played) layer on from there.

### 16. Point duration
Capture time between Pull and Goal (and infer per-possession time).

> **Ben:** Adopting — straightforwardly derivable from existing event timestamps (Pull → Goal). Caveat: the measurement reflects scorer responsiveness as much as actual game time, so it's a rough indicator rather than a precise stat. Worth surfacing as part of the in-app stats from #15, with that caveat understood.

### 17. Disc-hold timer / catch-to-throw duration
Low priority.

> **Ben:** Not adopting in-app. No practical in-game use — it wouldn't give a recorder grounds to challenge a stall call, and as a live stat it would mostly measure scorer reaction time rather than the player. More broadly: this app's primary purpose is **stats collection — building the log** — not analysis. Slicing and dicing the data belongs in tools built for that. Some derived stats will inevitably land in-app (#15, #16) because they aid line management or scorer accuracy, but speculative analytical metrics like this one shouldn't pull scope. That said, the *raw material* is already in the log — event timestamps between catch and throw give average disc-in-hand time per player as a derivable metric at the downstream analysis step, for anyone interested.

---

## Bigger

### 18. Field location for each pass
Tap a field diagram after event/player selection.

> **Ben:** Treated as a bonus feature, not core scope. [Statto](https://statto.app/) already targets this niche, and based on real-game use even a single tap per event was already pushing the recorder's attention budget — adding a location tap would compound that. Sits naturally behind a configurable for high-level teams who genuinely want spatial data and are willing to pay the entry cost. Practically requires a **landscape layout** to be usable, which clashes with the portrait-first direction from #1 — so if/when we build it, it's effectively a parallel landscape mode rather than a tweak to portrait. Designing portrait-primary remains the priority; landscape + field-tap is a nice-to-have bonus on top.
