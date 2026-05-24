# Screens
## Ultimate Stat Tracker

**Version:** 0.5 (portrait migration landed)
**Last Updated:** 2026-05-24
**Status:** 🟢 Reflects current implementation

This doc is an index. Per-screen layouts (mockups, state variants, layout rules) live in [portrait-layout-proposal.md](portrait-layout-proposal.md) — treat that as the canonical source.

---

## Device & orientation

- **Platform:** Web app today (React + Vite). Native app TBD.
- **Orientation:** **Portrait.** Portrait suits one-handed sideline use and the fixed-position action buttons on Live Entry. The previous landscape design — with a left-to-right "field" metaphor and side-rail drawers — has been retired; pre-portrait state is preserved on the `pre-portrait-snapshot` branch for reference.
- Landscape may return as a parallel mode for the bonus field-location feature ([Myall #18](../feedback/2026-05-24-myall-responses.md)) — not the default.

---

## Screen list

| # | Screen | File | Purpose |
|---|---|---|---|
| 1 | **Game Setup** | `screens/GameSetup/index.tsx` | Scrolling list of scheduled games; tap to expand pulling-team picker + Start; FAB for new game. |
| 2 | **New Game form** | `screens/NewGame/index.tsx` | Push view from GameSetup's FAB. Vertical stack of inputs. |
| 3 | **Game Settings** | `screens/GameSettings/index.tsx` | Recording options (per-recorder today; will move to Competition level). Single column. |
| 4 | **Teams Manager** | `screens/TeamsManager/index.tsx` | Three views: team list / team detail (push) / new team (push). |
| 5 | **Line Selection** | `screens/LineSelection/index.tsx` | Per-team tab switcher with full-width roster; counter row + Add player. |
| 6 | **Live Event Entry** | `screens/LiveEntry/index.tsx` | Header · log peek · canvas · fixed 2×2 action zone. Bottom sheet (Log / More) overlays when open. |
| 7 | **Game Over** | banner overlay in Live Entry | Final score + Back to games / Edit log buttons. |

A future **Competitions Manager** + **Competition Detail** pair sits above Game Setup once the Competition layer lands ([league scoping L9](../feedback/2026-05-24-league-layer-scoping.md)).

---

## Where to look for what

- **Layout sketches + per-state visualisation** — [portrait-layout-proposal.md](portrait-layout-proposal.md).
- **Engine-level state transitions** — [screen-states.md](screen-states.md).
- **Feature-level descriptions** — [../requirements/features.md](../requirements/features.md).
