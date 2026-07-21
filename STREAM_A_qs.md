# Stream A — questions / blockers

## 1. ~~(BLOCKER) push approval~~ — RESOLVED: approved, deployed to the Pi (`089f926`), prod-verified; EAS updates published to both runtimes.

## 2. (non-blocking) Event RSVP?

Events currently model hosts + invitees + visibility, but no RSVP ("going /
not going"). Deliberately left out of v1 since the spec didn't mention it —
flag if you want an `event_rsvp` table in the same pass.

## 3. (non-blocking) Who can see the invite list?

Current rule: only hosts/creator see `invited`; invitees see the event but not
who else is invited. Flip if you'd rather everyone invited can see the guest
list.
