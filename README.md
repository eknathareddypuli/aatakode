# AataKode (ఆటకోడ్)

Free, offline-first, gamified coding academy. **Aata** = "play" in Telugu. Live at https://aatakode.eknathalabs.com

No sign-up, no ads, no tracking. Progress lives in your browser; Python runs in your browser via Pyodide.

## What's in
- **247 missions in 5 tracks.** Python Quest: 12 regions, 137 missions from your first `print()` to real-world tools: First Steps, Decisions, Loops, Strings, Collections, Functions, Files and Errors, Modules and Debugging, Objects, Clean Code, Problem Solving, Real-World Python. Each region ends in a bug-fix boss, and most have a mini-project.
- **Eight mission types**: write code, fix the bug, predict the output, fill the blank, put lines in order, terminal, SQL, pair debugging.
- **Teaching loop**: predict, fix, explain, compare solutions. 3-level hints, free Socratic questions, step-through visualizer, block view, friendly error messages.
- **Gamification**: XP, 8 ranks (English + Telugu), 1 to 3 stars per mission (no hints, then a clean solution or first-try), streak with freezes, badges, Daily Quest "Pest Control", a story map where Aata-gram's places are restored as you clear regions, free parrot outfits and code colours, shareable region/graduate certificate cards (self-reported).
- **Teachers**: offline dashboard (paste student cards, class table, class goal, CSV). Self-reported, not for exams.
- Offline-first PWA, progress export/import, EN/Telugu interface, light/dark, reduced motion.

Not built yet (premium/P2): cloud sync, AI tutor, human review, leagues, verifiable certificates. See `docs/ROADMAP.md`.

- **Debug the Outage: 20 broken-server missions** in a simulated Linux terminal (permissions, services, logs, cron, DNS, OOM, 502s) plus **6 Mystery Cases** and a new *Outage of the Day*.
- **SQL Market (25 missions):** real SQLite in your browser. **Git Garden (18):** a built-in Git simulator with branches, merge conflicts, reflog and stash.
- **Career Boost:** Python for DevOps (14) and Interview Prep (11).
- **Arena:** Code Golf Shrine, Pair Parrot (diagnose, then fix), Speed Run, Predict Blitz, Endless Dungeon, and a placement quiz.
- **Feel:** parrot reactions and companions, test-by-test lighting, worked-example fading, sound (synthesised, can be silenced), phone haptics, a village you rebuild and decorate with Seeds, with day and night.

## v3
Learn-and-practice lessons, real multi-step projects (Log Analyzer, Key-Value Store, Link Shortener), shareable proof (cards, Markdown portfolio, Proof ID), Daily Quests with a chest, visual puzzles (Robot Maze, Pipeline Plumber), Security Hunt, a Go track (checked statically; answers verified with real `go`), an HTTP/API track with a simulated `curl` and `jq`, plus animation (parrot growth, star map, streak flame, weather, hearts, confetti tiers) and festival and place-name culture touches. Festival greetings in Telugu, Hindi, Kannada, Tamil and Malayalam are unreviewed by native speakers. Corrections welcome.

## v4
- **Bot Arena** (`#/bots`): write `play(state)` for the Seed Grab game and climb Wood, Bronze, Silver, Gold and Legend. Rules are always on screen, matches replay by seed with a step-through viewer, and there is a "vs my previous version" mode. Opponents are Python sources shipped in `missions/arena.json`; everything runs locally.
- **Clash of Code** (`#/clash`): 14 five-minute puzzles in fastest, shortest and reverse modes, recorded ghost times, and a friend link plus score code compared by paste (no backend).
- **Read-the-code missions** (`type: "read"`): predict the output, find the buggy line, or say what a function does. 20 missions in the Code Reading Hut.
- **Explain panel:** every Python mission carries a `learn` card id (68 cards in `missions/learn.json`). A failed check shows "5 of 6 pass" and a short "what went wrong"; a pass unlocks the example, the common mistake, a diff against the reference and an optional variation.
- **Core loop:** hints cost a seed (one free per day), never XP; an easier sibling after 3 fails and a skip-ahead after 3 clean solves; a side quest after each solve; the name is asked after the first win.
- **Motivation, fairly:** 12 story chapters, behavioural titles, a weekly goal ring, a golden mission, a mystery packet (1 to 5 seeds every 7th solve), roles, Chilaka's 20 second morning, weekend pass and a 3-mission comeback quest, a "you debugged it" moment, zen mode, and a Play fair page.
- **Feel:** sound packs, micro-sounds, an optional music layer that grows with the village, league and festival stingers, more outfits by track and companions.
- **Practical:** offline install guide with a "download Pyodide now" button, a local mission health dashboard (JSON and CSV export), printable worksheets, answer keys and certificates.

## v5
- "What do you want to learn?" goal chooser (9 goals) on first visit, a path bar on Home, and a Switch path page (`#/path`). Nothing is locked; a goal only orders the next missions. Optional "show only my path" map filter.
- Mastery map per concept (`#/mastery`): first-try solves count fully, retries and hints count less, shaky ones get a gentle revisit link. No penalties.
- Build-a-game track (Game Workshop, plus the Adventure capstone) and Real-world Micro-Jobs track, each ending in a boss.
- Maze Dash: a second Arena game (`#/dash`) with 4 leagues, local and offline.
- Story boss battles: a skippable intro, a choice (scout, bold, patient) with perks that never penalise, an HP bar driven by passing checks.
- Parrot growth with choices (path, trait, crest), always changeable from Profile.
- Misconception detector: 22 rules show a "common mix-up" card after a failed run.
- Telugu strings for the new tracks need native review.

## v6
- **Real Go execution**: a Go interpreter (`src/goeval.js`) runs your program in the page, with real-looking compile errors and panics. Two new regions, Write Real Go (12 missions) and Go Projects (3 steps). Verified against real `go run`. Limits: no goroutines, channels, generics or `time`; type errors show at run time.
- **Web Basics track** (36 missions): HTML, CSS, JavaScript and a four-step Quiz Page project. Your page runs in a sandboxed iframe (no network) with a live preview and a Console tab; checks run inside the sandbox.
- **SQL**: Subqueries, CTEs and Windows (10 missions) and a four-step SQL Capstone, with expected rows computed in SQLite.
- **Track-level Test out** (`#/testout`): beat a short gauntlet of boss missions and the whole track opens for good. A placement quiz link sits in the goal chooser and on the Path page.
- Track status labels (Complete, Core, Preview, Play) with mission count and rough hours; a learn-first card on each region's first mission; a daily review queue of 3 replays; a copy-paste progress transfer code on Profile (the file export stays).
- Dark mode: the goal chooser text is readable (the buttons used an undefined colour variable).
- Telugu titles for the new tracks need native review.

## Develop
```
python3 build.py                      # writes index.html + sw.js from src/ and missions/
cd tests && npm ci && node verify.mjs # runs every solution, starter and predicted output in real Python
python3 tests/e2e_play_all.py         # optional: plays every mission through the real UI (needs Playwright + Chrome)
python3 -m http.server                # open http://localhost:8000
```
`index.html` and `sw.js` are generated and committed so GitHub Pages can serve the repo root.

## Add a mission
Drop a JSON file in `missions/<region>/`. See `docs/MISSION_FORMAT.md` and `CONTRIBUTING.md`. CI fails if a solution doesn't pass or the starter already does.

MIT licensed.
