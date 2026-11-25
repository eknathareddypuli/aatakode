/* AataKode v3 logic (no DOM): Quest Board, festivals, Chilaka's growth stages, pipelines, robot-maze helpers,
   Security Hunt and Go checks, lessons, share-proof summaries. The browser and the Node verifier both load this file. */
(function (root) {
  "use strict";
  const AK = typeof module !== "undefined" && module.exports ? require("./engine.js") : root.AK;
  const hash = (str) => { let h = 5381; for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; return h; };
  const nowOf = (x) => (x instanceof Date ? x : new Date());
  const seeds = (S) => (S.seeds = S.seeds || { earned: 0, spent: 0 });

  /* ---------------------------------------------------------------- state additions */
  const baseNew = AK.newState;
  AK.newState = function () {
    const s = baseNew();
    s.quest = { date: "", goals: [], chest: false }; s.questsDone = 0; s.questLog = {};
    s.festSeen = {}; s.stage = 0; s.lessons = {}; s.pipes = {}; s.hunts = {};
    return s;
  };
  const baseMerge = AK.mergeState;
  AK.mergeState = function (cur, inc) {
    const out = baseMerge(cur, inc);
    if (inc.quest && inc.quest.date > ((out.quest || {}).date || "")) out.quest = inc.quest;
    out.questsDone = Math.max(out.questsDone || 0, inc.questsDone || 0);
    out.questLog = Object.assign({}, inc.questLog || {}, out.questLog || {});
    out.festSeen = Object.assign({}, inc.festSeen || {}, out.festSeen || {});
    out.stage = Math.max(out.stage || 0, inc.stage || 0);
    out.lessons = Object.assign({}, inc.lessons || {}); Object.keys(out.lessons).forEach((k) => (out.lessons[k] = Object.assign({}, out.lessons[k]))); Object.keys(cur.lessons || {}).forEach((k) => (out.lessons[k] = Object.assign(out.lessons[k] || {}, cur.lessons[k])));
    out.pipes = Object.assign({}, inc.pipes || {}, out.pipes || {});
    out.hunts = Object.assign({}, inc.hunts || {}, out.hunts || {});
    return out;
  };

  /* ---------------------------------------------------------------- festivals (Telugu, Kannada, Tamil, Malayalam and national days) */
  const LUNAR = {
    ugadi: { 2026: "2026-03-19", 2027: "2027-04-07", 2028: "2028-03-26" },
    onam: { 2026: "2026-08-26", 2027: "2027-09-12", 2028: "2028-09-01" },
    chavithi: { 2026: "2026-09-14", 2027: "2027-09-04", 2028: "2028-08-23" },
    dasara: { 2026: "2026-10-20", 2027: "2027-10-09", 2028: "2028-09-27" },
    diwali: { 2026: "2026-11-08", 2027: "2027-10-29", 2028: "2028-10-17" },
  };
  AK.FESTIVALS = [
    { id: "sankranti", icon: "🪁", decor: "kites", fixed: ["01-13", "01-16"], en: "Makar Sankranti and Pongal", names: { te: "సంక్రాంతి", hi: "मकर संक्रांति", kn: "ಸಂಕ್ರಾಂತಿ", ta: "பொங்கல்", ml: "മകര സംക്രാന്തി" },
      hello: { en: "Happy Sankranti and Pongal!", te: "సంక్రాంతి శుభాకాంక్షలు!", hi: "मकर संक्रांति की शुभकामनाएँ!", kn: "ಸಂಕ್రాಂತಿ ಶುಭಾಶಯಗಳು!", ta: "பொங்கல் நல்வாழ்த்துக்கள்!", ml: "സംക്രാന്തി ആശംസകൾ!" }, line: "Kites fill the sky and the harvest is in." },
    { id: "republic", icon: "🇮🇳", decor: "flags", fixed: ["01-26", "01-26"], en: "Republic Day", names: { te: "గణతంత్ర దినోత్సవం", hi: "गणतंत्र दिवस", kn: "ಗಣರಾಜ್ಯೋತ್ಸವ", ta: "குடியரசு தினம்", ml: "റിപ്പബ്ലിക് ദിനം" },
      hello: { en: "Happy Republic Day!", te: "గణతంత్ర దినోత్సవ శుభాకాంక్షలు!", hi: "गणतंत्र दिवस की शुभकामनाएँ!", kn: "ಗಣರಾಜ್ಯೋತ್ಸವದ ಶುಭಾಶಯಗಳು!", ta: "குடியரசு தின நல்வாழ்த்துக்கள்!", ml: "റിപ്പബ്ലിക് ദിന ആശംസകൾ!" }, line: "Flags up in Aata-gram." },
    { id: "ugadi", icon: "🌿", decor: "toran", lunar: "ugadi", en: "Ugadi", names: { te: "ఉగాది", hi: "उगादी", kn: "ಯುಗಾದಿ", ta: "உகாதி", ml: "ഉഗാദി" },
      hello: { en: "Happy Ugadi!", te: "ఉగాది శుభాకాంక్షలు!", hi: "उगादी की शुभकामनाएँ!", kn: "ಯುಗಾದಿ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು!", ta: "உகாதி நல்வாழ்த்துக்கள்!", ml: "ഉഗാദി ആശംസകൾ!" }, line: "New year, new code. Mango leaves on every door." },
    { id: "puthandu", icon: "🌼", decor: "kolam", fixed: ["04-14", "04-15"], en: "Tamil New Year and Vishu", names: { te: "తమిళ నూతన సంవత్సరం", hi: "तमिल नववर्ष और विशु", kn: "ತಮಿಳು ಹೊಸ ವರ್ಷ", ta: "புத்தாண்டு", ml: "വിഷു" },
      hello: { en: "Happy Puthandu and Vishu!", te: "పుత్తాండు, విషు శుభాకాంక్షలు!", hi: "पुथांडु और विशु की शुभकामनाएँ!", kn: "ಹೊಸ ವರ್ಷದ ಶುಭಾಶಯಗಳು!", ta: "புத்தாண்டு நல்வாழ்த்துக்கள்!", ml: "വിഷു ആശംസകൾ!" }, line: "A fresh start, a fresh kolam." },
    { id: "independence", icon: "🇮🇳", decor: "flags", fixed: ["08-15", "08-15"], en: "Independence Day", names: { te: "స్వాతంత్ర్య దినోత్సవం", hi: "स्वतंत्रता दिवस", kn: "ಸ್ವಾತಂತ್ರ್ಯ ದಿನ", ta: "சுதந்திர தினம்", ml: "സ്വാതന്ത്ര്യ ദിനം" },
      hello: { en: "Happy Independence Day!", te: "స్వాతంత్ర్య దినోత్సవ శుభాకాంక్షలు!", hi: "स्वतंत्रता दिवस की शुभकामनाएँ!", kn: "ಸ್ವಾತಂತ್ರ್ಯ ದಿನದ ಶುಭಾಶಯಗಳು!", ta: "சுதந்திர தின நல்வாழ்த்துக்கள்!", ml: "സ്വാതന്ത്ര്യ ദിന ആശംസകൾ!" }, line: "Flags up in Aata-gram." },
    { id: "onam", icon: "🌸", decor: "pookalam", lunar: "onam", en: "Onam", names: { te: "ఓనం", hi: "ओणम", kn: "ಓಣಂ", ta: "ஓணம்", ml: "ഓണം" },
      hello: { en: "Happy Onam!", te: "ఓనం శుభాకాంక్షలు!", hi: "ओणम की शुभकामनाएँ!", kn: "ಓಣಂ ಶುಭಾಶಯಗಳು!", ta: "ஓணம் நல்வாழ்த்துக்கள்!", ml: "ഓണാശംസകൾ!" }, line: "A flower carpet at the village gate." },
    { id: "chavithi", icon: "🐘", decor: "ganesha", lunar: "chavithi", en: "Vinayaka Chavithi", names: { te: "వినాయక చవితి", hi: "गणेश चतुर्थी", kn: "ಗಣೇಶ ಚತುರ್ಥಿ", ta: "விநாயகர் சதுர்த்தி", ml: "ഗണേശ ചതുർത്ഥി" },
      hello: { en: "Happy Vinayaka Chavithi!", te: "వినాయక చవితి శుభాకాంక్షలు!", hi: "गणेश चतुर्थी की शुभकामनाएँ!", kn: "ಗಣೇಶ ಚತುರ್ಥಿಯ ಶುಭಾಶಯಗಳು!", ta: "விநாயகர் சதுர்த்தி நல்வாழ்த்துக்கள்!", ml: "ഗണേശ ചതുർത്ഥി ആശംസകൾ!" }, line: "Ganesha on the village square." },
    { id: "dasara", icon: "🏹", decor: "golu", lunar: "dasara", en: "Dasara", names: { te: "దసరా", hi: "दशहरा", kn: "ದಸರಾ", ta: "விஜயதசமி", ml: "വിജയദശമി" },
      hello: { en: "Happy Dasara!", te: "దసరా శుభాకాంక్షలు!", hi: "दशहरा की शुभकामनाएँ!", kn: "ದಸರಾ ಹಬ್ಬದ ಶುಭಾಶಯಗಳು!", ta: "விஜயதசமி நல்வாழ்த்துக்கள்!", ml: "വിജയദശമി ആശംസകൾ!" }, line: "Victory of good over bugs." },
    { id: "rajyotsava", icon: "🎊", decor: "flags", fixed: ["11-01", "11-01"], en: "Kannada Rajyotsava and Andhra Avatarana Dinotsavam", names: { te: "ఆంధ్ర అవతరణ దినోత్సవం", hi: "कन्नड़ राज्योत्सव", kn: "ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವ", ta: "மாநில உருவாக்க நாள்", ml: "കേരളപ്പിറവി" },
      hello: { en: "Happy State Formation Day!", te: "అవతరణ దినోత్సవ శుభాకాంక్షలు!", hi: "राज्योत्सव की शुभकामनाएँ!", kn: "ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವದ ಶುಭಾಶಯಗಳು!", ta: "மாநில நாள் நல்வாழ்த்துக்கள்!", ml: "കേരളപ്പിറവി ആശംസകൾ!" }, line: "Four southern states, one village of coders." },
    { id: "diwali", icon: "🪔", decor: "lamps", lunar: "diwali", en: "Deepavali", names: { te: "దీపావళి", hi: "दीपावली", kn: "ದೀಪಾವಳಿ", ta: "தீபாவளி", ml: "ദീപാവലി" },
      hello: { en: "Happy Deepavali!", te: "దీపావళి శుభాకాంక్షలు!", hi: "दीपावली की शुभकामनाएँ!", kn: "ದೀಪಾವಳಿಯ ಶುಭಾಶಯಗಳು!", ta: "தீபாவளி நல்வாழ்த்துக்கள்!", ml: "ദീപാവലി ആശംസകൾ!" }, line: "Every window glows with diyas." },
  ];
  const ymd = (d) => AK.dateKey(d);
  const addDays = (key, n) => { const [y, m, d] = key.split("-").map(Number); return AK.dateKey(new Date(y, m - 1, d + n)); };
  /* Returns the festival active on date d (a day either side of the lunar festivals), or null. */
  AK.festivalFor = function (d) {
    const key = ymd(d), y = d.getFullYear();
    for (const f of AK.FESTIVALS) {
      if (f.fixed) { const md = key.slice(5); if (md >= f.fixed[0] && md <= f.fixed[1]) return f; }
      else if (f.lunar) { const day = LUNAR[f.lunar][y]; if (day && key >= addDays(day, -1) && key <= addDays(day, 1)) return f; }
    }
    return null;
  };
  AK.festivalName = (f, lang) => (lang && f.names[lang]) || f.en;
  AK.festivalHello = (f, lang) => f.hello[lang] || f.hello.en;

  /* ---------------------------------------------------------------- Chilaka grows */
  AK.STAGES = [
    { id: "egg", en: "Egg", at: 0 }, { id: "hatchling", en: "Hatchling", at: 20 }, { id: "fledgling", en: "Fledgling", at: 300 },
    { id: "plumed", en: "Plumed", at: 1300 }, { id: "royal", en: "Royal", at: 3400 },
  ];
  AK.parrotStage = function (xp) { let i = 0; AK.STAGES.forEach((s, k) => { if (xp >= s.at) i = k; }); return i; };

  /* ---------------------------------------------------------------- Quest Board */
  const QDEFS = [
    { id: "solve2", cat: "core", ev: "solve", need: 2, ico: "🧭", text: "Solve 2 missions" },
    { id: "solve3", cat: "core", ev: "solve", need: 3, ico: "🧭", text: "Solve 3 missions" },
    { id: "star3", cat: "core", ev: "star3", need: 1, ico: "⭐", text: "Earn ⭐⭐⭐ on one mission (no hints, first try)" },
    { id: "nohint2", cat: "core", ev: "nohint", need: 2, ico: "🧠", text: "Solve 2 missions without hints" },
    { id: "predict3", cat: "core", ev: "predict_ok", need: 3, ico: "🔮", text: "Predict 3 outputs correctly" },
    { id: "daily3", cat: "core", ev: "daily_card", need: 3, ico: "📅", text: "Finish the three Daily cards" },
    { id: "explain", cat: "core", ev: "explain", need: 1, ico: "✍️", text: "Explain one solution in your own words" },
    { id: "outage", cat: "play", ev: "outage_day", need: 1, ico: "📟", text: "Fix the Outage of the Day" },
    { id: "speed", cat: "play", ev: "speed", need: 1, ico: "⏱", text: "Beat the clock in a Speed Run", needs: "speed" },
    { id: "blitz", cat: "play", ev: "blitz", need: 1, ico: "⚡", text: "Play a Predict Blitz" },
    { id: "dungeon", cat: "play", ev: "floor", need: 3, ico: "🕳", text: "Clear 3 Dungeon floors" },
    { id: "golf", cat: "play", ev: "golf", need: 1, ico: "⛳", text: "Play a Code Golf hole" },
    { id: "maze", cat: "play", ev: "type:grid", need: 1, ico: "🤖", text: "Guide the parrot through a maze", needs: "type:grid" },
    { id: "pipe", cat: "play", ev: "type:pipe", need: 1, ico: "🔧", text: "Plumb a pipeline", needs: "type:pipe" },
    { id: "hunt", cat: "track", ev: "type:hunt", need: 1, ico: "🕵️", text: "Hunt a bug or vulnerability", needs: "type:hunt" },
    { id: "lesson", cat: "track", ev: "type:lesson", need: 1, ico: "📖", text: "Finish a lesson", needs: "type:lesson" },
    { id: "project", cat: "track", ev: "project", need: 1, ico: "🏗️", text: "Move a project forward", needs: "project" },
    { id: "t-python", cat: "track", ev: "track:python", need: 1, ico: "🐍", text: "Solve a Python Quest mission", needs: "track:python" },
    { id: "t-go", cat: "track", ev: "track:go", need: 1, ico: "🐹", text: "Solve a Go mission", needs: "track:go" },
    { id: "t-http", cat: "track", ev: "track:http", need: 1, ico: "🌐", text: "Solve an API Bazaar mission", needs: "track:http" },
    { id: "t-security", cat: "track", ev: "track:security", need: 1, ico: "🛡️", text: "Solve a Security Hunt mission", needs: "track:security" },
    { id: "t-sql", cat: "track", ev: "track:sql", need: 1, ico: "🗄️", text: "Solve a SQL mission", needs: "track:sql" },
    { id: "t-git", cat: "track", ev: "track:git", need: 1, ico: "🌿", text: "Solve a Git mission", needs: "track:git" },
    { id: "t-ops", cat: "track", ev: "track:ops", need: 1, ico: "🚨", text: "Solve a Debug-the-Outage mission", needs: "track:ops" },
  ];
  AK.QUEST_DEFS = QDEFS;
  AK._data = null;
  /* A quest only appears if the learner can actually do it today. */
  function feasible(def, S, data) {
    if (!def.needs) return true;
    const open = (m) => !S.solved[m.id] && AK.isUnlocked(S, data, m, null);
    if (def.needs === "speed") return data.missions.some((m) => S.solved[m.id] && (m.type === "write-code" || m.type === "fix-the-bug"));
    if (def.needs === "project") return data.missions.some((m) => m.project_step && open(m));
    if (def.needs.startsWith("type:")) return data.missions.some((m) => m.type === def.needs.slice(5) && open(m));
    if (def.needs.startsWith("track:")) { const regs = data.regions.filter((r) => r.track === def.needs.slice(6)).map((r) => r.id); return data.missions.some((m) => regs.indexOf(m.region) >= 0 && open(m)); }
    return true;
  }
  AK.questsFor = function (S, data, now) {
    data = data || AK._data; now = nowOf(now); const key = ymd(now);
    S.quest = S.quest || { date: "", goals: [], chest: false };
    if (S.quest.date === key && S.quest.goals.length) return S.quest;
    const pick = (cat) => {
      const pool = QDEFS.filter((q) => q.cat === cat && feasible(q, S, data)).sort((a, b) => hash(key + a.id) - hash(key + b.id));
      return pool[0];
    };
    const goals = ["core", "play", "track"].map(pick).filter(Boolean).map((q) => ({ id: q.id, ev: q.ev, need: q.need, have: 0, done: false, ico: q.ico, text: q.text }));
    S.quest = { date: key, goals: goals, chest: false };
    return S.quest;
  };
  AK.questFeed = [];
  AK.drainFeed = () => AK.questFeed.splice(0);
  /* Records that something happened (ev) and completes any matching quest goals. Returns the feed entries added. */
  AK.questEvent = function (S, ev, n, now, data) {
    data = data || AK._data; if (!data) return [];
    now = nowOf(now); const q = AK.questsFor(S, data, now), added = [];
    q.goals.forEach((g) => {
      if (g.done || g.ev !== ev) return;
      g.have = Math.min(g.need, g.have + (n || 1));
      if (g.have >= g.need) { g.done = true; seeds(S).earned += 2; added.push({ kind: "goal", text: g.text, ico: g.ico, seeds: 2 }); }
    });
    if (q.goals.length && q.goals.every((g) => g.done) && !q.chest) {
      q.chest = true; seeds(S).earned += 10; S.dailyXp = (S.dailyXp || 0) + 20; S.questsDone = (S.questsDone || 0) + 1;
      S.questLog = S.questLog || {}; S.questLog[q.date] = 1; AK.recomputeXp(S);
      added.push({ kind: "chest", text: "Quest chest opened", seeds: 10, xp: 20 });
    }
    added.forEach((a) => AK.questFeed.push(a));
    return added;
  };

  /* Quest-aware wrappers around the engine functions that already exist. */
  const trackOf = (data, m) => { const r = data.regions.find((x) => x.id === m.region); return r ? r.track : ""; };
  const baseSolve = AK.applySolve;
  AK.applySolve = function (S, data, m, opts) {
    AK._data = data || AK._data; opts = opts || {};
    const was = AK.regionComplete(S, data, m.region), now = nowOf(opts.now);
    const res = baseSolve(S, data, m, opts);
    if (res.repeat) return res;
    res.regionDone = !was && AK.regionComplete(S, data, m.region);
    const fest = AK.festivalFor(now);
    if (fest) { const k = fest.id + ymd(now); if (!(S.festSeen || (S.festSeen = {}))[k]) { S.festSeen[k] = 1; seeds(S).earned += 3; res.festival = { id: fest.id, seeds: 3 }; res.seeds = (res.seeds || 0) + 3; if (Array.isArray(res.breakdown)) res.breakdown.push({ label: "Festival bonus: +3 seeds", xp: 0 }); } }
    const t = trackOf(data, m);
    AK.questEvent(S, "solve", 1, now, data);
    AK.questEvent(S, "type:" + m.type, 1, now, data);
    if (t) AK.questEvent(S, "track:" + t, 1, now, data);
    if (m.type === "predict") AK.questEvent(S, "predict_ok", 1, now, data);
    if ((opts.hintsUsed || 0) === 0) AK.questEvent(S, "nohint", 1, now, data);
    if (res.stars === 3) AK.questEvent(S, "star3", 1, now, data);
    if (m.project_step) AK.questEvent(S, "project", 1, now, data);
    if (opts.dayId && opts.dayId === m.id) AK.questEvent(S, "outage_day", 1, now, data);
    const st = AK.parrotStage(S.xp); res.stageUp = st > (S.stage || 0); if (res.stageUp) S.stage = st;
    return res;
  };
  const wrap = (name, fn) => { const base = AK[name]; if (typeof base !== "function") return; AK[name] = function () { const r = base.apply(AK, arguments); try { fn(arguments, r); } catch (e) { /* quests must never break play */ } return r; }; };
  wrap("dailyAnswer", (a, r) => { const S = a[0]; if (r && r.gained) { AK.questEvent(S, "daily_card", 1, a[4], a[1]); AK.questEvent(S, "predict_ok", 1, a[4], a[1]); } });
  wrap("speedRecord", (a) => AK.questEvent(a[0], "speed", 1, a[a.length - 1], a[1]));
  wrap("blitzRecord", (a, r) => { AK.questEvent(a[0], "blitz", 1, a[a.length - 1], a[1]); if (a[2] > 0) AK.questEvent(a[0], "predict_ok", a[2], a[a.length - 1], a[1]); });
  wrap("golfRecord", (a) => AK.questEvent(a[0], "golf", 1, a[a.length - 1], a[1]));
  wrap("dungeonCleared", (a) => AK.questEvent(a[0], "floor", 1, null));
  wrap("addExplanation", (a, r) => { if (r && r.bonus) AK.questEvent(a[0], "explain", 1, a[4], a[1]); });
  const baseStage = AK.applySolve;
  void baseStage;

  /* ---------------------------------------------------------------- Pipeline Plumber */
  const ls = (s) => (s === "" ? [] : String(s).replace(/\n$/, "").split("\n"));
  const numKey = (l) => { const m = String(l).match(/^\s*(-?\d+(?:\.\d+)?)/); return m ? parseFloat(m[1]) : 0; };
  AK.pipeLabel = (st) => [st.cmd].concat(st.args || []).join(" ");
  AK.pipeStep = function (inp, st) {
    const L = ls(inp), a = st.args || [];
    switch (st.cmd) {
      case "cat": return inp;
      case "grep": {
        const inv = a.includes("-v"), ic = a.includes("-i"), pat = a.filter((x) => x[0] !== "-")[0] || "", re = new RegExp(pat, ic ? "i" : "");
        return L.filter((l) => re.test(l) !== inv).join("\n");
      }
      case "sort": {
        const rev = a.some((x) => /^-.*r/.test(x)), num = a.some((x) => /^-.*n/.test(x)), uniq = a.includes("-u");
        let out = L.slice().sort((x, y) => { let c = num ? numKey(x) - numKey(y) : 0; if (!c) c = x < y ? -1 : x > y ? 1 : 0; return rev ? -c : c; });
        if (uniq) out = out.filter((l, i) => i === 0 || l !== out[i - 1]);
        return out.join("\n");
      }
      case "uniq": {
        const out = []; L.forEach((l) => { if (out.length && out[out.length - 1].l === l) out[out.length - 1].n++; else out.push({ l: l, n: 1 }); });
        return out.map((o) => (a.includes("-c") ? String(o.n).padStart(7) + " " + o.l : o.l)).join("\n");
      }
      case "head": { const n = Number(a.filter((x) => /^\d+$/.test(x))[0] || 10); return L.slice(0, n).join("\n"); }
      case "tail": { const n = Number(a.filter((x) => /^\d+$/.test(x))[0] || 10); return L.slice(Math.max(0, L.length - n)).join("\n"); }
      case "wc": return String(L.length);
      case "cut": { const d = a[a.indexOf("-d") + 1] === undefined ? "\t" : a[a.indexOf("-d") + 1], f = Number(a[a.indexOf("-f") + 1]); return L.map((l) => (l.indexOf(d) < 0 ? l : l.split(d)[f - 1] || "")).join("\n"); }
      case "col": { const n = Number(a[0]); return L.map((l) => l.trim().split(/\s+/)[n - 1] || "").join("\n"); }
      case "tr": return L.map((l) => (a[0] === "a-z" ? l.toUpperCase() : l.toLowerCase())).join("\n");
      case "rev": return L.slice().reverse().join("\n");
      default: return inp;
    }
  };
  AK.pipeRun = function (input, steps) {
    let cur = String(input).replace(/\n$/, ""); const stages = [];
    (steps || []).forEach((st) => { cur = AK.pipeStep(cur, st); stages.push({ label: AK.pipeLabel(st), out: cur }); });
    return { out: cur, stages: stages };
  };
  AK.pipeGrade = function (m, steps) {
    return m.tests.map((t) => {
      if (t.kind === "pipe-out") { const r = AK.pipeRun(t.input !== undefined ? t.input : m.input, steps); const ok = r.out.trim() === String(t.expect).trim(); return { label: t.label, ok: ok, hidden: !!t.hidden, got: r.out, expect: t.expect }; }
      if (t.kind === "pipe-uses") { const ok = steps.some((s) => new RegExp(t.pattern).test(AK.pipeLabel(s))) !== !!t.absent; return { label: t.label, ok: ok, hidden: !!t.hidden }; }
      if (t.kind === "pipe-max") return { label: t.label, ok: steps.length <= t.n, hidden: !!t.hidden };
      return { label: t.label || t.kind, ok: false };
    });
  };

  /* ---------------------------------------------------------------- Security Hunt and Go checks */
  AK.huntCheck = function (m, picked) {
    const want = m.bad.slice().sort((a, b) => a - b), got = Array.from(new Set(picked)).sort((a, b) => a - b);
    return { ok: want.join() === got.join(), missed: want.filter((x) => got.indexOf(x) < 0), wrong: got.filter((x) => want.indexOf(x) < 0) };
  };
  AK.goNorm = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  AK.goFillCheck = function (m, vals) { return (m.blanks || []).map((b, i) => b.answers.map(AK.goNorm).indexOf(AK.goNorm(vals[i])) >= 0); };
  AK.goFillCode = function (m, vals) { let i = 0; return m.template.replace(/___/g, () => vals[i++] || ""); };
  AK.goOrderOk = function (m, lines) { const j = lines.map((l) => l.replace(/\s+$/, "")).join("\n"); return (m.orders || [m.lines_ok]).some((o) => o.map((l) => l.replace(/\s+$/, "")).join("\n") === j); };

  /* Lessons: interactive blocks decide completion. */
  AK.lessonNeed = (m) => (m.blocks || []).map((b, i) => (b.kind === "try" || b.kind === "quiz" || b.kind === "gofill" ? i : -1)).filter((i) => i >= 0);
  AK.lessonDone = (S, m) => { const d = (S.lessons || {})[m.id] || {}; return AK.lessonNeed(m).every((i) => d[i]); };

  /* ---------------------------------------------------------------- grid helpers */
  AK.gridParse = function (g) {
    const rows = g.rows, H = rows.length, W = rows[0].length; let start = null, goal = null; const coins = [], walls = [];
    rows.forEach((r, y) => { if (r.length !== W) throw new Error("ragged map"); r.split("").forEach((c, x) => { if (c === "S") start = [x, y]; else if (c === "G") goal = [x, y]; else if (c === "o") coins.push([x, y]); else if (c === "#") walls.push([x, y]); }); });
    return { W: W, H: H, start: start, goal: goal, coins: coins, walls: walls, facing: g.facing || "E" };
  };
  AK.gridGrade = function (m, code) {
    const out = []; let traces = {};
    const maps = [{ rows: m.grid.rows, facing: m.grid.facing, max: m.grid.max, visible: true }].concat((m.maps || []).map((x) => Object.assign({ max: m.grid.max }, x)));
    const run = (k) => { if (!traces[k]) traces[k] = AK.py.gridRun(code, maps[k]); return traces[k]; };
    const srcTests = m.tests.filter((t) => t.kind === "source" || t.kind === "maxlines");
    const srcRes = srcTests.length ? AK.py.grade(code, srcTests) : [];
    let si = 0;
    m.tests.forEach((t) => {
      if (t.kind === "source" || t.kind === "maxlines") { out.push(srcRes[si++]); return; }
      const k = t.map === undefined ? 0 : t.map + 1, r = run(k);
      if (t.kind === "grid-reach") out.push({ label: t.label, ok: !r.err && r.reached, hidden: !!t.hidden, err: r.err || undefined });
      else if (t.kind === "grid-coins") out.push({ label: t.label, ok: !r.err && r.reached && r.coins === r.total, hidden: !!t.hidden, err: r.err || undefined, got: r.coins + " of " + r.total + " coins", expect: "all coins" });
      else if (t.kind === "grid-max") out.push({ label: t.label, ok: !r.err && r.reached && r.acts.length <= t.n, hidden: !!t.hidden, got: r.acts.length + " actions", expect: "at most " + t.n });
      else out.push({ label: t.label || t.kind, ok: false });
    });
    out.traces = traces; return out;
  };

  /* ---------------------------------------------------------------- Share proof */
  AK.proofId = function (S) {
    let h1 = 0xdeadbeef ^ 0, h2 = 0x41c6ce57 ^ 0; const str = (S.name || "") + "|" + Object.keys(S.solved).sort().join(",");
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909); h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase().padStart(14, "0").slice(0, 10);
  };
  AK.proofSummary = function (S, data) {
    const tracks = data.tracks.map((t) => {
      const regs = data.regions.filter((r) => r.track === t.id), ms = data.missions.filter((m) => regs.some((r) => r.id === m.region));
      return { id: t.id, title: t.title, done: ms.filter((m) => S.solved[m.id]).length, total: ms.length, cleared: regs.filter((r) => AK.regionComplete(S, data, r.id)).map((r) => r.id), regions: regs.length };
    });
    const projects = data.regions.filter((r) => r.capstone).map((r) => { const ms = AK.regionMissions(data, r.id); return { id: r.id, title: r.title, done: ms.filter((m) => S.solved[m.id]).length, total: ms.length, complete: AK.regionComplete(S, data, r.id) }; });
    return { tracks: tracks, projects: projects, id: AK.proofId(S), xp: S.xp, stars: AK.totalStars(S) };
  };
  AK.portfolioMarkdown = function (S, data) {
    const sm = AK.proofSummary(S, data), L = ["# " + (S.name || "A learner") + " · AataKode portfolio", "", "Self-reported progress from aatakode.eknathalabs.com · Proof ID " + sm.id + " · " + sm.xp + " XP · ⭐ " + sm.stars, ""];
    sm.tracks.forEach((t) => L.push("- **" + t.title + "**: " + t.done + " of " + t.total + " missions" + (t.cleared.length ? ", cleared " + t.cleared.length + " of " + t.regions + " regions" : "")));
    sm.projects.forEach((p) => {
      L.push("", "## Project: " + p.title + " (" + p.done + " of " + p.total + " checkpoints)");
      const ms = AK.regionMissions(data, p.id), last = ms.filter((m) => S.solved[m.id]).pop();
      if (last && S.solved[last.id].code) L.push("", "```" + (last.lang || "python"), S.solved[last.id].code.trimEnd(), "```");
    });
    return L.join("\n") + "\n";
  };

  if (typeof module !== "undefined" && module.exports) module.exports = AK;
})(typeof self !== "undefined" ? self : globalThis);
