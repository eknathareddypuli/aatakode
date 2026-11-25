# AataKode (ఆటకోడ్)

Free, offline-first, gamified coding academy. **Aata** = "play" in Telugu. Live at https://aatakode.eknathalabs.com

No sign-up, no ads, no tracking. Progress lives in your browser; Python runs in your browser via Pyodide.

## What's in
- **Python Quest: 12 regions, 137 missions** from your first `print()` to real-world tools: First Steps, Decisions, Loops, Strings, Collections, Functions, Files and Errors, Modules and Debugging, Objects, Clean Code, Problem Solving, Real-World Python. Each region ends in a bug-fix boss, and most have a mini-project.
- **Debug the Outage**: 4 simulated-terminal incidents, plus a weekly Outage of the Week.
- **Six mission types**: write code, fix the bug, predict the output, fill the blank, put lines in order, terminal.
- **Teaching loop**: predict, fix, explain, compare solutions. 3-level hints, free Socratic questions, step-through visualizer, block view, friendly error messages.
- **Gamification**: XP, 8 ranks (English + Telugu), 1 to 3 stars per mission (no hints, then a clean solution or first-try), streak with freezes, badges, Daily Quest "Pest Control", a story map where Aata-gram's places are restored as you clear regions, free parrot outfits and code colours, shareable region/graduate certificate cards (self-reported).
- **Teachers**: offline dashboard (paste student cards, class table, class goal, CSV). Self-reported, not for exams.
- Offline-first PWA, progress export/import, EN/Telugu interface, light/dark, reduced motion.

Not built yet (premium/P2): cloud sync, AI tutor, human review, leagues, verifiable certificates. See `docs/ROADMAP.md`.

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
