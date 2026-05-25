# Ultimate Stat Tracker

A sideline stat recording app for Ultimate Frisbee — fast, validated, and usable by anyone.

Built for **Parity League**: per-player stats recorded live so General Managers can trade players under a salary cap between games.

---

## Project Status

🟡 **Phase 0 — Requirements Gathering**

---

## Key Decisions

- **UI:** Google Stitch (web-first)
- **Transport:** WebSockets only — all communication is uniform, one protocol
- **Data:** Append-only event log — amendments are new entries, nothing mutated
- **Validation:** App only presents valid next actions — invalid sequences are impossible
- **Multi-user:** Multiple recorders per game, all synced via WebSocket session
- **Session persistence:** Leave and rejoin any time — full state restored on reconnect

