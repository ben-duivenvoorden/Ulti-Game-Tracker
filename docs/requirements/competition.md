# Competition Layer
## Ultimate Stat Tracker

**Version:** 0.1 (initial spec from scoping pass)
**Last Updated:** 2026-05-24
**Status:** 🟡 Planned — not yet implemented
**Source:** [league-layer-scoping](../feedback/2026-05-24-league-layer-scoping.md) (L1–L12)

---

## Overview

A **Competition** is the umbrella entity that owns settings, members (teams), and roles for a coherent group of games. It is the long-term home for things currently scattered or per-recorder:

- Recording options (pullBonus, brick, foul, pick, stall, gameMode, lineRatio)
- Game configuration defaults (halfTimeAt, scoreCapAt)
- Optional behaviours (ABBA tracking on/off, gender-ratio advisory on/off)
- Team roster ownership
- Scorer + admin access

A Competition can be a **league** (ongoing, multi-season — e.g. Parity) or a **tournament** (one-off event). The same entity model serves both — distinguished only by a `type` field.

---

## C1. Entity shape

```ts
interface Competition {
  id: CompetitionId
  name: string
  type: 'league' | 'tournament'
  startDate: ISODate
  endDate: ISODate
  settings: CompetitionSettings   // per-setting policy — see C2
  archived: boolean
  // members + roles maintained via the event log, not on the entity
}
```

Lifecycle is **dated** — `startDate` and `endDate` are descriptive metadata, not enforced gates. A Competition with `endDate` in the past is implicitly finished but the app does not block adding games to it. No formal `draft / active / complete` state machine.

---

## C2. Settings cascade

Each Competition-level setting carries a policy mode plus an optional value:

```ts
interface SettingPolicy<T> {
  mode: 'strict' | 'default' | 'none'
  value?: T   // required when mode is 'strict' or 'default'
}

interface CompetitionSettings {
  pullBonus:        SettingPolicy<boolean>
  brick:            SettingPolicy<boolean>
  foul:             SettingPolicy<boolean>
  pick:             SettingPolicy<boolean>
  stall:            SettingPolicy<boolean>
  gameMode:         SettingPolicy<'mixed' | 'open'>
  lineRatio:        SettingPolicy<{ M: number; F: number }>
  halfTimeAt:       SettingPolicy<number>
  scoreCapAt:       SettingPolicy<number>
  abbaTracking:     SettingPolicy<boolean>
  ratioAdvisory:    SettingPolicy<boolean>
  qrAutoScorer:     SettingPolicy<boolean>   // see C5
  // future additions slot in here
}
```

| Mode | Game-level behaviour |
|---|---|
| `strict` | Competition value is locked. Games inherit and **cannot** override. |
| `default` | Competition value is the starting point. Games **can** override per-game. |
| `none` | Competition leaves the setting unset. Per-game (or per-recorder fallback) decides. |

A game resolves each setting as: if Competition mode is `strict`, use Competition value; if `default`, use the per-game override if present otherwise the Competition value; if `none`, use the per-game value (or recorder default).

---

## C3. Membership

### Teams

- Teams are **enrolled** in a Competition (explicit list — "the 8 Parity teams"). Not derived from which teams appear in games.
- Teams are **Competition-scoped** — a team is created for a specific Competition, from scratch each time. "Lizards in Parity 2026" and "Lizards in Tournament X" are distinct team records with no shared roster.
- The current global `teamsLog` model is incompatible with this — implementation pass needs to either scope `teamsLog` under a Competition or carry a `competitionId` discriminator on every event.

### Players

- Players are also **Competition-scoped** — same human in two Competitions = two distinct player records.
- Cross-Competition stat aggregation (e.g. career stats) is a manual matching exercise downstream — out of core scope.

### Standalone games

- Games can exist without a Competition. Implementation will likely use a hidden catch-all "Unaffiliated" Competition for orphan games so every `Game.competitionId` is non-null (model uniformity).

---

## C4. Roles

Three roles per Competition. A user has at most one role per Competition.

| | Admin | Scorer | Viewer |
|---|---|---|---|
| See Competition | ✓ | ✓ | ✓ |
| See teams, game schedule, results | ✓ | ✓ | ✓ |
| View exports | ✓ | ✓ | ✓ |
| Record stats during a game | ✓ | ✓ | ✗ |
| Edit log (truncate / splice) | ✓ | ✓ | ✗ |
| Add/remove/edit players in the **game roster** (C6) | ✓ | ✓ | ✗ |
| Promote a viewer → scorer | ✓ | ✓ | ✗ |
| Edit Competition settings | ✓ | ✗ | ✗ |
| Add/remove teams + edit durable team rosters | ✓ | ✗ | ✗ |
| Create / edit games | ✓ | ✗ | ✗ |
| Promote a scorer → admin (assign co-admin) | ✓ | ✗ | ✗ |
| Toggle `qrAutoScorer` setting | ✓ | ✗ | ✗ |

### Demotion rule

**Only a peer can demote a peer.** An admin cannot demote themselves; only another admin can demote them. Same for scorers (only a scorer or admin can demote a scorer). This guarantees there's always at least one admin as long as the role-grant graph is non-empty.

Edge case: the sole admin loses access (e.g. loses their device + auth credentials with no backup admin) — no in-app recovery path. A separate "orphaned Competition" problem to handle in the auth layer.

### Visibility rule

A user only sees Competitions they have a role in. Hidden Competitions don't appear in pickers, switchers, or lists. Discovery of new Competitions happens via invite / QR / link (see C5), not browsing.

---

## C5. Access flow (QR-driven)

1. The Competition has a QR code (admin generates).
2. A user scans the QR → they get **viewer** access by default.
3. If the Competition's `qrAutoScorer` setting is **on**, scanning the QR elevates the user straight to **scorer** (skips the viewer stage) — useful for casual leagues. When **off**, the user lands as viewer and needs explicit promotion. Default: **off**.
4. Admin promotion (scorer → admin) is never automatic — always explicit.

Auth mechanism details (email verification, admin approval flow, identity persistence across devices) deferred — see A3 in the [Myall responses](../feedback/2026-05-24-myall-responses.md).

---

## C6. Game roster (scorer-mutable)

Distinct from the durable Competition-level team roster:

- **Team roster** (Competition level, admin-managed) — the official roster. Admin-only writes.
- **Game roster** (game level, scorer-mutable) — the actual roster for a single game. Seeded from the team roster at game creation; the scorer can add a new player, remove a player, or edit a player (name correction, gender, jersey number, etc.) — scoped to that game only.

Game-roster changes do **not** flow back to the Competition-level team roster. If a new player should become a permanent member, an admin promotes them out-of-band.

**Implementation:** Add per-game roster mutation events to `rawLog` (`game-roster-add-player` / `-remove-player` / `-edit-player`) so changes are append-only and audit-trailed alongside play events. Resolves into the canonical `activeLine` derivation.

---

## C7. Persistence

A fourth append-only event log: **`competitionsLog`**.

Event types:
- `competition-add` — name, type, startDate, endDate, initial settings, creator (auto-admin)
- `competition-edit` — name / dates / settings updates
- `competition-archive` / `competition-unarchive`
- `competition-add-team` / `competition-remove-team`
- `competition-update-setting` — single-setting update (mode, value)
- `competition-add-admin` / `competition-add-scorer` / `competition-add-viewer`
- `competition-remove-admin` / `competition-remove-scorer` / `competition-remove-viewer`
- `competition-update-qr-auto-scorer`

Derived state via `deriveCompetitionsState(competitionsLog)`:
- List of current (non-archived) Competitions
- Per-Competition: members (team list), roles (admin/scorer/viewer rosters), resolved settings (`SettingPolicy` per key)
- Archived Competitions hidden from default views (un-archive restores)

Audit trail is automatic — every settings change, role grant, or membership update is logged. Matters for admin oversight (per L10).

---

## C8. Archival

- Admin can **archive** a Competition. It disappears from default views (pickers, switchers, manager lists). Data persists.
- Games inside an archived Competition **stay attached** — they appear when the user opts into "show archived". Immutable association.
- Admin can **un-archive** at any time.
- No hard delete. No mechanism for reassigning games out of an archived Competition (would break the immutable-history principle).

---

## C9. UI surfaces *(planned)*

- **Competitions Manager** — full CRUD list (analogous to Teams Manager).
- **Competition Detail / Settings** — per-Competition screen with settings (per-policy toggles), member-team list, scheduled games list, admin/scorer/viewer rosters.
- **Game Setup — Competition picker** — pick Competition (or Standalone) when creating a New Game.
- **Game Settings becomes Competition-aware** — read-only display of inherited values; override controls only where Competition policy is `default`.
- **Competition switcher in the global header** — quick active-Competition context switch; filters game list, scopes Teams Manager.

---

## C10. Concurrent admin edits

Same model as the play-by-play conflict resolution ([Myall #13](../feedback/2026-05-24-myall-responses.md)): record all submissions in `competitionsLog`, automatic resolution applied post-ingestion when reconstructing derived state, conflicts remain admin-visible. Deferred until multi-user is actually built.

---

## Open questions

- [ ] Auth mechanism details — email verification + admin approval, QR-only, or hybrid? (A3 deferred.)
- [ ] Concrete shape of Competition-scoping for `teamsLog` and `scheduledGamesLog` — nested under a Competition, or `competitionId` discriminator on every event?
- [ ] Server tech / sync layer — when does the four-log model get a real server backing? (Architecture-level decision.)
- [ ] Promote-game-roster-player-to-team affordance — future quality-of-life, not core scope.
- [ ] Public read-only Competition view (e.g. share results page) — out of scope today; revisit if a real need appears.
