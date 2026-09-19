# Product design — agreed first version

## Confirmed direction

- Build an initial version for Laura before she has tried or requested it; her preferences have not yet been validated.
- A simple, attractive, animated web app, primarily used in a phone browser.
- Focus the main view on Today, with an option to look ahead.
- Use a repeating Week A / Week B timetable for the initial fixed-day chores. Completion-based timing is a possible later extension; none of the initial chores requires it.
- Initial chore candidates: change bedding, take bins down, clean bathroom, clean room, wash lights, and wash darks.
- Use a cartoon red panda companion with little celebrations.
- Laura controls her tracker; any shared access is her choice. Shared access is not yet a feature requirement.
- Deploy a self-hosted Docker app with server-side saving and a Cloudflare Tunnel for internet access. Sign in through Pocket ID, restricted to Laura's account. No shared progress-viewing account is included.
- Chore schedules are editable; initial timings should be sensible guesses rather than assumed hotel requirements.
- Chore actions: Done, Move, and Skip this time. Unfinished chores appear in a small Still to do section and must not duplicate when the next occurrence arrives.
- Laundry has Wash, Dry, and Put away steps, preserving progress. Other chores initially use one completion action.
- Rewards are occasional bonus date invitations using messages and achievable plans supplied by Laura's partner. Ordinary time together is not conditional on chores.
- No notifications in the first version; show the daily view when opened.
- Cute colours and a clean, minimal interface with a little red panda at the top, gentle completion animations, and reduced-motion support.
- On first use, the current week becomes Week A, anchored to Monday and using Europe/London local dates. The rotation anchor can be changed in settings.
- Keep one actionable card per chore. A new scheduled occurrence replaces an unfinished previous occurrence without a penalty; preserve a laundry cycle already in progress. Moving a chore affects only that occurrence, leaving future scheduled dates unchanged.
- While date invitations are waiting, every 10 completed chores reveals the next invitation. A full laundry cycle counts once. Invitations remain available until marked used and never expire. Add invitation content later through settings; rewards and progress toward invitations remain inactive while the queue is empty.
- Today / Upcoming navigation, with Upcoming showing the next 14 days.
- Settings allow Laura to add, edit, pause, and remove chores and change their scheduled days. Provide undo for accidental completions.

## Editable starter schedule

These are editable product defaults, not confirmed hotel rules or cleaning guidance. Days identify when a card appears; no time-of-day deadlines are proposed.

| Chore          | Week A           | Week B           |
| -------------- | ---------------- | ---------------- |
| Take bins down | Monday, Thursday | Monday, Thursday |
| Wash darks     | Tuesday          | Tuesday          |
| Clean bathroom | Wednesday        | Wednesday        |
| Wash lights    | Friday           | Friday           |
| Clean room     | Saturday         | Saturday         |
| Change bedding | —                | Sunday           |

Start with fixed days for these chores. Completion-based timing remains available as a design concept, but no initial chore requires it yet.

## Implementation

- A single Node.js application serving the interface and API, with a persistent SQLite database.
- Locally bundled Nunito font and an animated SVG red panda; no external browser asset requests.
- Atomic saved changes, revision checks for concurrent tabs, and undo of the latest action for up to ten minutes. The visible undo prompt lasts fifteen seconds.
- Local development runs on loopback without identity setup. Production requires HTTPS app/issuer URLs, Pocket ID configuration, and Laura's immutable subject.
- Deployment and backup/restore instructions are in README.md.
- Pausing keeps progress. Removing a chore keeps completed history. Editing a schedule affects future dates; existing active cards remain actionable.
- Moved occurrences are preserved until their chosen day rather than duplicated by a scheduled occurrence before that date.
- Upcoming includes today and the following thirteen days. An unfinished laundry cycle is shown once; future cycles are not forecast while it is in progress.
- Reduced motion can be selected in settings and always respects the device preference.

## Deployment inputs still needed

Public app hostname, Pocket ID issuer/client credentials, Laura's subject, and the host's Cloudflare Tunnel route must be configured on the deployment host. No live deployment has been made.
