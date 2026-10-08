# Website structure and page design

## Shared shell

Use the selected Ants 51 logo, the Obsidian/Champagne tokens and the same understated type, dividers and controls on every page. Global navigation: **Home · Open League · LLM Benchmark · About**. A theme toggle may live on the right; remember the user's preference. Logo links to Home. Do not add extra top-level archive items.

The live runner/control header is a specialised battle view. Avoid making every public page look like an operator control console. Preserve the compact global navigation on public pages, with battle progress immediately below it where needed. Public replay viewers must not expose commands that change a live tournament.

Example routes below are a proposal, not a prescribed framework:

| Page | Suggested route | Entry |
|---|---|---|
| Home | `/` | Logo and Home |
| Current Open League | `/open-league` | Main navigation |
| Open League archive | `/open-league/archive` | Quiet link on league page |
| Current LLM Benchmark | `/llm-benchmark` | Main navigation |
| Benchmark archive | `/llm-benchmark/archive` | Quiet link on benchmark page |
| Battle/replay | `/battles/:battleId` | League/archive links or featured replay |
| Ranking snapshot | `/open-league/rankings/:snapshotId` | Archive; analogous benchmark route |
| About | `/about` | Main navigation |

"Hidden" archives means absent from the main menu, not secret, unlinked or access-controlled.

## Home

Top: a short introduction (one compact headline and 1–2 sentences). Keep the map in the first desktop screen where practical; avoid a tall illustrated hero that pushes the actual game away.

Main attraction: one substantial **Recorded replay**, selected from completed **Open League** battles. Play historical battles sequentially while the visitor watches; no fake live indicator. Show battle ID, participating races, turn progress and pause/speed/next-replay controls. Clearly distinguish replay standings from current league standings. Do not reveal the winner until the replay ends unless the user asks to see the result.

At wide widths, compact Open League and LLM Benchmark introductions can sit beside the featured replay. When the selected map scale needs the space, move these introductions beneath it. Reuse the battle viewer’s scale and colour behaviour. Do not squeeze several small maps into a carousel of unreadable thumbnails.

At completion, show the historical result briefly (suggested 4 seconds), then load the next available completed replay. Pause when the page is hidden/offscreen; resume sensibly without event backlog. No autoplay audio. Respect reduced motion by starting paused when appropriate. On loading failure, show a retry/next option; if no completed battles exist, give an honest empty state and league links.

Lower content: a small Code → Upload → Compete explanation, followed by a brief origin/story link to About. No recent-events feed or redundant analytics cards.

## Open League

Compact heading and introduction. Main action **Submit an ant race**, leading to the existing upload/validation flow. Keep setup/editing separate from battle observation.

Current ranking table is the main content and uses the available width. Suggested columns: rank, ant race + creator, rating/points, battles, wins, recent placements, change since previous published snapshot. Allow more than ten league entries; 5–10 applies to participants in one battle. Label the actual ranking method and updated-at time. Do not ship the preview's invented rating values.

Row details may expose submission version and recent battle links. Use pagination or sensible progressive loading for large leagues. Below: latest completed battles with Watch replay links, and a quieter **Past battles & rankings** archive link. Avoid duplicating a large battle player above the rankings on this page.

Archive: tabs **Past battles / Past rankings**. Filters may include date range, entrant and version only when supported by stored data. Battle rows show timestamp, entrants, status/outcome and replay link. Ranking snapshots show timestamp and league/rating version. Opening a snapshot keeps a persistent Historical snapshot label. Never recompute old snapshots from today's entrants.

## LLM Benchmark

Reuse the Open League layout, replacing creator identity with model provider + exact model version and its generated entry/run information. Show benchmark version and evaluation track above the table. Use separate ranking tables for incompatible generation budgets or harness versions; do not silently mix them.

Provide expandable **Methodology** covering prompt, model version, tools, budget, retry policy, independent code-generation runs, validation failures, shared test conditions and rating method. A concise explanation is visible without opening details. If performance uncertainty has not been estimated, say so instead of drawing invented error bars.

Completed battles and historical snapshots follow the same archive design. Each model ranking should lead to the evidence (generated entry version/run and relevant battle results) that is publishable under the project’s rules. Keep failures visible in the benchmark accounting. This package does not define or implement a statistically validated benchmark.

## About

Quiet editorial layout with max-width around 760px and generous line spacing, while retaining site colours and navigation. Sections: (1) the game and rules at a high level; (2) the user's motivation and rebuilding story; (3) the original MyreKrig creator and idea; (4) explanation of the two competitions; (5) contact and relevant source links.

Insert the user's approved biography and verified creator name/dates/credits before publication. Do not invent historical facts or imply official endorsement. The original creator's identity and licensing are not re-researched in this design package. Keep any required attribution/licence notices from actual code/assets in the implementation.

## Common states

Design loading, empty, paused, completed and failed states. Preserve page layout during loading; use concise text placeholders rather than fake numbers. Navigation and tables work without animation. Public pages never depend on a full live simulation to load their main text or rankings.
