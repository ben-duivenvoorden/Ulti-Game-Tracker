# Tournament / League Layer — Scoping Q&A

**Date:** 2026-05-24
**Trigger:** [Design ↔ Code delta audit](2026-05-24-design-code-delta.md) Q6 — `RecordingOptions` need to live at a layer above the per-recorder localStorage; that layer (tournament / league) is yet to be scoped.
**Reviewer:** Ben

Each item: dimension being scoped, options, Ben's response inline.

---

## L1. Entity model

**Q:** "Tournament" vs "league" — one concept or two?

> **Ben:** **One concept** — single entity called **Competition**, with an optional discriminator field `type: 'league' | 'tournament'` (just `type`, not `competitionType` — the entity name already provides the namespace). Same settings surface, same membership model. League-vs-tournament-specific extras (seasons, brackets, etc.) only added later if a concrete need emerges; the type field is the hook.

---

## L2. Settings cascade — what lives at Competition level

**Q:** Which settings move from per-recorder / per-game up to Competition? All, or a subset?

> **Ben:** **All, for now.** Everything currently in `RecordingOptions` (pullBonus, brick, foul, pick, stall, gameMode, lineRatio) plus `halfTimeAt` and `scoreCapAt` from `GameConfig`, plus ABBA tracking and gender-ratio advisory toggles. A single source of truth at Competition level; games inherit.

### L2b. Per-game override model

**Q:** Can individual games override Competition-level settings?

> **Ben:** **Per-setting policy** — each setting on the Competition is configured as one of three policy modes:
> - **`strict`** — Competition value is locked; games inherit and cannot override. Use when the setting defines the format (e.g. lineRatio for a Mixed competition; pullBonus for stat-integrity).
> - **`default`** — Competition provides a value as the starting point; games can override it. Use for things that legitimately vary game-to-game (e.g. `halfTimeAt`, `scoreCapAt` differing for playoffs).
> - **`none`** — Competition leaves the setting unset; per-game (or per-recorder) decides. Use for casual competitions that don't want to dictate everything.
>
> Implementation shape: each Competition setting is a `{ mode: 'strict' | 'default' | 'none', value?: T }` pair rather than a bare value. Game-level config reads from Competition; override is allowed iff mode is `default` (or absent / `none`).

---

## L3. Membership

### L3a. Team membership

**Q:** Teams explicitly enrolled in a Competition, or implicit from games?

> **Ben:** **Explicit enrolment.** A Competition has a defined member-team list — "the 8 Parity teams" is a first-class fact, not derived from which teams happen to appear in games. **However, games can exist standalone** (not attached to any Competition). Two viable implementations: (i) Game.competitionId is nullable; (ii) a hidden catch-all "Unaffiliated" Competition exists for orphan games. Implementation detail — leaning (ii) for model uniformity (every game has a Competition; sometimes it's just the invisible default).

### L3b. Cross-Competition teams

**Q:** Can the same team belong to multiple Competitions? Shared roster, or per-Competition roster?

> **Ben:** **No cross-Competition sharing.** Teams are **Competition-scoped** — a team is created for a specific Competition, from scratch each time. "Lizards in Parity 2026" and "Lizards in Weekend Tournament" are distinct team records that happen to share a name. No shared roster, no player carry-over.
>
> **⚠️ Implementation impact:** This is a meaningful divergence from the current model where `teamsLog` holds **global** teams with global `GlobalTeamId`s, reused across games. Moving to Competition-scoped teams means: (a) `teamsLog` is either scoped under a Competition (each Competition has its own teams log) or every team event carries a `competitionId`; (b) the Teams Manager screen becomes Competition-aware; (c) the "Manage teams" entry point likely sits inside a Competition rather than as a global shortcut. Flag for the implementation pass.

---

## L4. Player scoping

**Q:** Players global, or Competition-scoped too?

> **Ben:** **Competition-scoped** — same as teams. Every Competition has its own players from scratch. The same human playing in Parity 2026 and a weekend tournament results in two distinct player records, no automatic link between them. Cross-Competition stat aggregation (e.g. "Ben's career stats across all Competitions") becomes a manual matching exercise later if/when it matters.
>
> **⚠️ Implementation impact:** Today `PlayerId` is a global surrogate (per-game in the rawLog, but the underlying player record in `teamsLog` is global). Moving to Competition-scoped players means `teamsLog` truly scopes everything beneath a Competition, and player ids are unique within a Competition (not globally). Consistent with the team-scoping decision in L3b.

---

## L5. Lifecycle

**Q:** Open-ended, dated, or stateful (draft/active/complete)?

> **Ben:** **Dated.** Competition carries `startDate` and `endDate`. Used for filtering (e.g. "show current Competitions"), stats cut-offs, and natural sorting. No explicit state machine — dates are descriptive metadata, not enforced gates. A Competition with `endDate` in the past is implicitly "finished" but the app doesn't block adding games to it (recorder discretion). Archival (per L5a) handled separately if needed.

---

## L6. Admin / who owns config

**Q:** Who can edit Competition settings — anyone (current model), a distinct admin role, or deferred?

> **Ben:** **Distinct admin role.** Each Competition has one (or more) designated admins; only admins can change Competition settings. Recorders inside the Competition see the settings but can't edit them. The Game Settings panel becomes read-only for non-admins (or surfaces an "ask your admin to change this" affordance).
>
> **⚠️ Implementation impact:** This implies a multi-user model and a per-Competition role system, neither of which exist today. Permission checks needed on every settings-mutation action. Tied directly to **A3 (scorer auth)** — admin identity has to come from somewhere, and QR-based access with email-verify + admin-approval was the leading direction. This effectively makes A3 a blocker for the league layer's settings-management flow rather than an optional add-on.

---

## L7. Stats aggregation

**Q:** Does Competition own roll-up stats, or is it just settings + membership?

> **Ben:** **Defer aggregation entirely.** Competition is a settings + membership container; it does not own roll-up stats. Per-game stats stay as they are (per-game export). "Competition-wide" stats (player career within the Competition, team standings, head-to-head) are out of scope for the app — they belong in the downstream analysis tools that consume the exported logs. Consistent with the broader principle ([feedback log](2026-05-24-myall-responses.md) #17): this app is stats *collection*, not *analysis*.

---

## L8. Persistence model

**Q:** Append-only event log (matching the rest of the system), or plain mutable entity store?

> **Ben:** **Append-only event log** — fourth log alongside `rawLog`, `teamsLog`, `scheduledGamesLog`. Event types: `competition-add`, `competition-edit`, `competition-archive`, `competition-add-team`, `competition-remove-team`, `competition-update-setting`. Derived state = current Competitions, member-team lists, and resolved settings (with `{ mode, value }` per L2b). Audit trail falls out for free, which matters now that admins can edit settings (L6).
>
> **Consequence for the existing logs:** Per L3b/L4, teams and players are Competition-scoped — so `teamsLog` either gets a new outer scope or every team event carries a `competitionId` discriminator. Same for `scheduledGamesLog` (games belong to a Competition, including the invisible catch-all from L3a). Concrete shape to be decided in the implementation pass.

---

## L9. UI surface

**Q:** Which new screens / surfaces does this layer introduce?

> **Ben:** **All five.**
> - **(a) Competitions Manager** — full CRUD list, analogous to Teams Manager.
> - **(b) Competition Detail / Settings** — per-Competition screen with settings (`strict`/`default`/`none` per L2b), member-team list, scheduled games list, admin list.
> - **(c) Game Setup — Competition picker** — pick Competition (or Standalone) when creating a New Game.
> - **(d) Game Settings becomes Competition-aware** — read-only display of inherited values, with override controls only where the Competition's policy is `default`.
> - **(e) Competition switcher in the global header** — quick active-Competition context switch; filters game list, scopes Teams Manager, etc.
>
> **Visibility rule:** A user only sees Competitions they have a role in — **admin**, **scorer**, or **viewer** (see L9b). Hidden Competitions don't appear in pickers, switchers, or lists. (Discovery of new Competitions to join therefore needs to happen via invite / QR / link rather than browsing — ties back to A3.)

### L9b. Role model

**Q:** What roles exist and what can each do?

> **Ben:** **Three roles: admin, scorer, viewer.** Live viewers in F6 are session-scoped (real-time spectating of one game) and orthogonal to these Competition-level roles. The Competition-level "viewer" is broader: it's the default state for anyone who scans the Competition's QR code without being explicitly elevated.
>
> | | Admin | Scorer | Viewer |
> |---|---|---|---|
> | See Competition | ✓ | ✓ | ✓ |
> | See teams, game schedule, results | ✓ | ✓ | ✓ |
> | View exports | ✓ | ✓ | ✓ |
> | Record stats during a game | ✓ | ✓ | ✗ |
> | Edit log (truncate / splice) | ✓ | ✓ | ✗ |
> | Add/remove/edit players in the **game roster** (see L9c) | ✓ | ✓ | ✗ |
> | Promote a viewer → scorer | ✓ | ✓ | ✗ |
> | Edit Competition settings | ✓ | ✗ | ✗ |
> | Add/remove teams + edit team rosters (durable) | ✓ | ✗ | ✗ |
> | Create / edit games | ✓ | ✗ | ✗ |
> | Promote a scorer → admin (assign co-admin) | ✓ | ✗ | ✗ |
> | Toggle "QR auto-elevates to scorer" setting | ✓ | ✗ | ✗ |
>
> The Competition creator is auto-admin. Admins can promote co-admins (same permissions, symmetric). Scorers can promote viewers → scorers — deliberate trust delegation so a live scoring session can pull in another body without waking the admin.
>
> **Access flow / QR settings:**
> 1. Anyone with the Competition QR code scans it → they get **viewer** access by default.
> 2. An admin can toggle a Competition-level setting `qrAutoScorer`. When **on**, scanning the QR elevates the user straight to **scorer** (skips the viewer stage) — useful for casual leagues where the bar is low. When **off**, the user lands as viewer and needs explicit promotion. Default: **off** (safer; admin opts in).
> 3. Admin promotion (scorer → admin) is never automatic — always explicit.

### L9c. Game roster (new concept)

**Q:** How do scorers handle game-day roster realities (subs, unregistered players) without needing an admin?

> **Ben:** **Introduce a "game roster" layer**, distinct from the durable Competition-level team roster.
>
> - **Team roster (Competition level, admin-managed)** — the official roster set up before the season / event. Admin-only writes.
> - **Game roster (game level, scorer-mutable)** — the actual roster for a single game. Seeded from the team roster at game creation, but the scorer can: **add a new player**, **remove a player**, **update a player** (name correction, gender, jersey, etc.). All scoped to that game only.
>
> Game-roster changes **do not** flow back to the Competition-level team roster. If a new player should become a permanent member, an admin promotes them out-of-band (potentially a future "promote game-roster player to team" affordance, but not core scope).
>
> **Implementation impact:** Today `GameConfig.rosters` resolves from the Competition-level `teamsLog` at session creation; rosters then live inside `GameConfig`. The new model needs a separate mutation surface — likely additional event types on `rawLog` (e.g. `game-roster-add-player`, `game-roster-remove-player`, `game-roster-edit-player`) so the per-game changes are append-only and audit-trailed alongside the play-by-play events. Resolves cleanly into the canonical `activeLine` derivation.

---

## L10. Concurrent admin edits

**Q:** What happens if two admins edit Competition settings at the same time?

> **Ben:** **Covered by [feedback log](2026-05-24-myall-responses.md) #13** — same principles apply (append-only log captures all submissions; automatic resolution layered on top post-ingestion; admin-visible conflicts). Deferred until multi-user is actually built. No separate answer required for the config layer.

---

## L11. Archiving a Competition

**Q:** How does a Competition leave the active set — delete, archive, something else?

> **Ben:** **Archive only — no hard delete.** Consistent with the append-only model (immutable history).
> - An admin can **archive** a Competition. It disappears from default views (game-setup picker, switcher, Competitions Manager lists) but the data persists in full.
> - Games inside an archived Competition **stay attached** — they appear when the user opts into "show archived" in the manager. Immutable association.
> - An admin can **un-archive** a Competition at any time, restoring it to default views.
> - No mechanism for reassigning games out of an archived Competition (would break the immutable-history principle and create migration complexity for marginal value).

---

## L12. Demotion / ownership transfer

**Q:** Who can demote whom? How do we avoid the last-admin-locks-themselves-out scenario?

> **Ben:** **Only a peer can demote a peer.** An admin cannot demote themselves; only another admin can demote them. Same rule cascades to scorers (only a scorer or admin can demote a scorer). This guarantees there's always at least one admin as long as the role-grant graph is non-empty — you can never leave a Competition without an admin via UI actions alone.
>
> (Edge case: the sole admin loses access entirely — e.g. loses their device + auth credentials with no backup admin — has no in-app recovery path. That's a separate "orphaned Competition" problem to be handled by external admin/recovery flows when auth lands; out of core scope here.)

