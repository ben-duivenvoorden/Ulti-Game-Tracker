# Myall — Requirements & Feedback (Raw)

**Date captured:** 2026-05-24
**Source:** Myall (external — different ultimate community, considering reusing this app)
**Status:** Unapproved input — pending review per-item

---

## Thoughts on current version

- prefer extra buttons (goal, turnover, throwaway) to be in fixed location on screen - so it can be done easily while not really looking at phone, mostly looking at field. Maybe even giant buttons that combine to take up half the screen, I don't care if it looks terrible if it's easy to use.
- I'm not sure if this was discussed much, but currently with the event entry "player explosion" is "who" then "what". I prefer the other way:
--- pass: just select player
--- goal: event, then player
--- throw away: just select event
--- stall out: just select event (prefer to have separate to "throw away", but technically not much difference so can leave out for simplicty - e.g. stall 9 throw away not too different to just a stall out)
--- receiver error, block: select event, then player

- perhaps optimise for 2 hand use - list of players down RHS of screen, list of actions down LHS.
- additional (8th?) "player" button - throw back to person who had it previously (so that quick 1-2's can be tracked)
- error correction - couldn't quite figure it out? docs say you can edit a log entry, but I could only get it to go back to that point and then write new passes (vs just change one event, then return to present). I only briefly tried it though. Most common occurrence will be changing name of player in earlier pass.
- maybe add a "?" player option for playing an unknown team and just don't know who it was - I'll likely be doing that a bit.
- clarifying message when needing to select who is picking up after turnover (so it looks a bit different than normal pass)
- consider: selecting two players in quick succession - currently counted as another pass right? consider short time window (e.g. <0.5s) where it's more likely first tap was mistake, and should only count the second one?

- ABBA tracking would be great to have. Just a thing that says what the players selected (e.g. 4M/3F) last point would be enough (last two points would be ideal)
- "brick" pull option valuable for normal stats


## Architecture open questions
- conflict: go with first received by server, because then second gets an immediate error (vs someone submitting an event, then a 2nd person changing it, then 1st person looks back and doesn't understand what happened). (presuming server can tell when 2nd submission has skipped 1st vs when it's just the next correct event - e.g. with a log entry/line #)
- authentication: password emailed to players? probably want it to be per-event long term. Otherwise QR code for permanent access?

## Validation open questions
- I would have "pull bonus" as if it gets to other endzone (lands or rolls that far). Anything in playing field is standard. Maybe call it "deep pull" or "pull - endzone"
- don't enforce any gender ratios, so it doesn't break if teams do something abnormal (e.g. deliberately or accidentally)


## Bigger changes I'd like, but may not be worth you doing if you won't use it
- field location for each pass. Have normal event/player buttons, but then after selected, show screen to tap on for location. (other way around is fine too)
- offline functionality (would be really annoying if it breaks or glitches due to poor reception) - Claude says a PWA will do it fine? Have to figure out syncing and write conflict stuff - perhaps have the option to just go "record rest of game offline" - and then at the end it's uploaded as an "offline" version?
- some real-time stats. Mainly I want points played showing when selecting the line, for live line management. Would be nice to have other options like "total time played" (does it record how long each point goes for, or at least time between "pull" event and "goal" event?), or "number of touches", or "number of possessions played" - similar to number of points, but accounts for longer points with lots of turnovers.
- allow for turnovers to be combinations of Block, Throw-away, Drop. Can be any combination of 1, 2, or 3 reasons. Just to give some more nuance.
- [very low priority] timer showing how long person has had disc for? (or just stat for how long between catch and throw, assuming stat recording is perfect of course)
