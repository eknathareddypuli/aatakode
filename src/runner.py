"""AataKode Python runner. Runs inside Pyodide in the learner's browser.

Learner code is compiled with the filename "<mission>" so the tracer can
(1) stop infinite loops, (2) record step-through snapshots, and
(3) ignore everything that is not the learner's own code.
"""
import sys, io, json, re, builtins

_FN = "<mission>"


class _Limit(Exception):
    pass


def _short(v, n=60):
    try:
        r = repr(v)
    except Exception:
        r = "<unprintable>"
    return r if len(r) <= n else r[: n - 1] + "…"


def _visible(d):
    res = {}
    for k, v in list(d.items()):
        if k.startswith("__") or callable(v) or type(v).__name__ == "module":
            continue
        res[k] = _short(v)
    return res


def _norm(s):
    lines = [l.rstrip() for l in str(s).replace("\r", "").split("\n")]
    while lines and lines[-1] == "":
        lines.pop()
    return "\n".join(lines)


def _exec(code, stdin=None, echo=False, trace=False, limit=150000, max_steps=300, inject=None):
    buf = io.StringIO()
    ns = {"__name__": "__main__"}
    if inject:
        ns.update(inject)
    queue = list(stdin or [])
    steps = []
    count = [0]

    def fake_input(prompt=""):
        if echo:
            buf.write(str(prompt))
        if not queue:
            raise EOFError("input() was called but there is no input left")
        v = str(queue.pop(0))
        if echo:
            buf.write(v + "\n")
        return v

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != _FN:
            return None
        if event == "line":
            count[0] += 1
            if count[0] > limit:
                raise _Limit()
            if trace and len(steps) < max_steps:
                stack = []
                f = frame
                while f is not None:
                    if f.f_code.co_filename == _FN:
                        name = f.f_code.co_name
                        stack.append("main" if name == "<module>" else name)
                    f = f.f_back
                stack.reverse()
                steps.append({
                    "line": frame.f_lineno,
                    "vars": _visible(frame.f_locals),
                    "stack": stack,
                    "out": len(buf.getvalue()),
                })
        return tracer

    err = None
    old_out, old_in = sys.stdout, builtins.input
    sys.stdout = buf
    builtins.input = fake_input
    try:
        try:
            co = compile(code, _FN, "exec")
        except SyntaxError as e:
            err = {"type": type(e).__name__, "msg": e.msg, "line": e.lineno}
            co = None
        if co is not None:
            sys.settrace(tracer)
            try:
                exec(co, ns)
            finally:
                sys.settrace(None)
    except _Limit:
        err = {"type": "Timeout", "msg": "ran for too long", "line": None}
    except BaseException as e:
        line = None
        tb = e.__traceback__
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == _FN:
                line = tb.tb_lineno
            tb = tb.tb_next
        err = {"type": type(e).__name__, "msg": str(e), "line": line}
    finally:
        sys.stdout = old_out
        builtins.input = old_in
    return {"out": buf.getvalue(), "err": err, "steps": steps, "ns": ns}


def _guarded(fn, limit=150000):
    count = [0]

    def tr(frame, event, arg):
        if frame.f_code.co_filename != _FN:
            return None
        if event == "line":
            count[0] += 1
            if count[0] > limit:
                raise _Limit()
        return tr

    buf = io.StringIO()
    old = sys.stdout
    sys.stdout = buf
    sys.settrace(tr)
    try:
        return fn()
    finally:
        sys.settrace(None)
        sys.stdout = old


def _run(code, stdin_json, trace):
    r = _exec(code, json.loads(stdin_json), echo=True, trace=bool(trace))
    return json.dumps({"out": r["out"], "err": r["err"], "steps": r["steps"]})


def _res(t, ok, **extra):
    d = {"label": t.get("label") or t.get("kind"), "ok": bool(ok), "hidden": bool(t.get("hidden")), "star": bool(t.get("star"))}
    if not t.get("hidden"):
        d.update({k: v for k, v in extra.items() if v is not None})
    return d


def _grade(code, tests_json):
    tests = json.loads(tests_json)
    results = []
    base = None
    for t in tests:
        k = t["kind"]
        if k == "source":
            found = re.search(t["pattern"], code) is not None
            results.append(_res(t, (not found) if t.get("absent") else found))
        elif k == "raises":
            if base is None:
                base = _exec(code, [])
            if base["err"]:
                results.append(_res(t, False, err=base["err"], expect=t["exc"]))
                continue
            try:
                _guarded(lambda: eval(t["expr"], base["ns"]))
                results.append(_res(t, False, got="no error", expect=t["exc"], expr=t["expr"]))
            except _Limit:
                results.append(_res(t, False, err={"type": "Timeout", "msg": "ran for too long", "line": None}, expr=t["expr"]))
            except BaseException as e:
                results.append(_res(t, type(e).__name__ == t["exc"], got=type(e).__name__, expect=t["exc"], expr=t["expr"]))
        elif k == "maxlines":
            n = len([l for l in code.split("\n") if l.strip() and not l.strip().startswith("#")])
            results.append(_res(t, n <= t["max"], got=str(n), expect="at most " + str(t["max"])))
        elif k == "stdout":
            r = _exec(code, t.get("stdin") or [])
            exp = _norm(t["expect"])
            if r["err"]:
                results.append(_res(t, False, err=r["err"], got=_norm(r["out"]), expect=exp, stdin=t.get("stdin")))
            else:
                got = _norm(r["out"])
                results.append(_res(t, got == exp, got=got, expect=exp, stdin=t.get("stdin")))
        elif k == "eval":
            if base is None:
                base = _exec(code, [])
            if base["err"]:
                results.append(_res(t, False, err=base["err"], expect=t["expect"]))
                continue
            try:
                expected = eval(t["expect"], {})
                value = _guarded(lambda: eval(t["expr"], base["ns"]))
                results.append(_res(t, value == expected, got=_short(value, 80), expect=_short(expected, 80), expr=t["expr"]))
            except _Limit:
                results.append(_res(t, False, err={"type": "Timeout", "msg": "ran for too long", "line": None}, expr=t["expr"]))
            except BaseException as e:
                results.append(_res(t, False, err={"type": type(e).__name__, "msg": str(e), "line": None}, expr=t["expr"]))
        else:
            results.append(_res(t, False, got="unknown test kind"))
    return json.dumps(results)


# ---------------------------------------------------------------- SQL missions (sqlite3 runs inside the browser too)
import sqlite3


def _sql_stmts(script):
    out, cur = [], ""
    for line in script.splitlines(True):
        cur += line
        if sqlite3.complete_statement(cur):
            out.append(cur.strip())
            cur = ""
    if cur.strip():
        out.append(cur.strip())
    return out


def _sql_con(setup):
    con = sqlite3.connect(":memory:")
    con.executescript(setup or "")
    ticks = [0]

    def guard():
        ticks[0] += 1
        return 1 if ticks[0] > 6000 else 0

    con.set_progress_handler(guard, 1000)
    return con


def _sql_play(con, query):
    cols = rows = err = None
    try:
        for st in _sql_stmts(query):
            cur = con.execute(st)
            if cur.description is not None:
                cols = [d[0] for d in cur.description]
                rows = cur.fetchall()
    except Exception as e:
        err = {"type": type(e).__name__, "msg": str(e), "line": None}
    return cols, rows, err


def _nrow(r):
    return [round(v, 4) if isinstance(v, float) else v for v in r]


def _fmt_rows(cols, rows, limit=10):
    if rows is None:
        return "(no rows returned)"
    lines = [" | ".join(cols or [])] if cols else []
    for r in rows[:limit]:
        lines.append(" | ".join("NULL" if v is None else str(v) for v in _nrow(r)))
    if len(rows) > limit:
        lines.append("… " + str(len(rows) - limit) + " more rows")
    return "\n".join(lines) if lines else "(empty)"


def _same_rows(got, exp, ordered):
    g = [_nrow(r) for r in (got or [])]
    e = [_nrow(r) for r in exp]
    if not ordered:
        g = sorted(g, key=repr)
        e = sorted(e, key=repr)
    return g == e


def _sql_grade(query, setup, tests_json):
    tests = json.loads(tests_json)
    results = []
    for t in tests:
        k = t["kind"]
        if k == "source":
            found = re.search(t["pattern"], query, re.I | re.S) is not None
            results.append(_res(t, (not found) if t.get("absent") else found))
            continue
        con = _sql_con(t.get("setup") or setup)
        cols, rows, err = _sql_play(con, query)
        if err:
            results.append(_res(t, False, err=err))
            continue
        if k == "rows":
            ok = _same_rows(rows, t["expect"], t.get("ordered", False)) and (not t.get("cols") or [c.lower() for c in (cols or [])] == [c.lower() for c in t["cols"]])
            results.append(_res(t, ok, got=_fmt_rows(cols, rows), expect=_fmt_rows(t.get("cols"), [tuple(r) for r in t["expect"]])))
        elif k == "cols":
            ok = [c.lower() for c in (cols or [])] == [c.lower() for c in t["expect"]]
            results.append(_res(t, ok, got=", ".join(cols or []) or "(no columns)", expect=", ".join(t["expect"])))
        elif k == "after":
            c2, r2, e2 = _sql_play(con, t["query"])
            if e2:
                results.append(_res(t, False, err=e2))
            else:
                ok = _same_rows(r2, t["expect"], t.get("ordered", False))
                results.append(_res(t, ok, got=_fmt_rows(c2, r2), expect=_fmt_rows(c2, [tuple(r) for r in t["expect"]])))
        else:
            results.append(_res(t, False, got="unknown test kind"))
    return json.dumps(results)


def _sql_run(query, setup):
    con = _sql_con(setup)
    cols, rows, err = _sql_play(con, query)
    return json.dumps({"cols": cols, "rows": [_nrow(r) for r in (rows or [])][:200], "count": len(rows or []), "err": err, "hasRows": rows is not None})


def _sql_schema(setup):
    con = _sql_con(setup)
    out = []
    for (name,) in con.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").fetchall():
        info = con.execute("pragma table_info(" + name + ")").fetchall()
        rows = con.execute("select * from " + name + " limit 5").fetchall()
        total = con.execute("select count(*) from " + name).fetchone()[0]
        out.append({"name": name, "cols": [{"name": c[1], "type": c[2], "pk": bool(c[5])} for c in info], "rows": [_nrow(r) for r in rows], "total": total})
    return json.dumps(out)


class RobotError(Exception):
    pass


def _grid_run(code, grid_json):
    """Robot maze: runs learner code against a map and returns the recorded actions for the animation."""
    g = json.loads(grid_json)
    rows = g["rows"]
    H, W = len(rows), len(rows[0])
    facing = {"N": 0, "E": 1, "S": 2, "W": 3}[g.get("facing", "E")]
    walls, coins, start, goal = set(), set(), None, None
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == "#":
                walls.add((x, y))
            elif c == "S":
                start = (x, y)
            elif c == "G":
                goal = (x, y)
            elif c == "o":
                coins.add((x, y))
    total = len(coins)
    st = {"x": start[0], "y": start[1], "d": facing, "got": 0}
    acts = []
    DX, DY = [0, 1, 0, -1], [-1, 0, 1, 0]
    maxact = int(g.get("max") or 400) * 3
    ahead = lambda k=0: (st["x"] + DX[(st["d"] + k) % 4], st["y"] + DY[(st["d"] + k) % 4])
    free = lambda p: 0 <= p[0] < W and 0 <= p[1] < H and p not in walls

    def log(a):
        acts.append({"a": a, "x": st["x"], "y": st["y"], "d": st["d"], "got": st["got"]})
        if len(acts) > maxact:
            raise RobotError("The parrot ran out of energy (too many steps). Is there a loop that never ends?")

    def move():
        p = ahead()
        if not free(p):
            raise RobotError("Bump! There is a wall in front of the parrot. Check front_clear() first.")
        st["x"], st["y"] = p
        log("move")

    def turn_left():
        st["d"] = (st["d"] + 3) % 4
        log("left")

    def turn_right():
        st["d"] = (st["d"] + 1) % 4
        log("right")

    def pick_coin():
        p = (st["x"], st["y"])
        if p in coins:
            coins.discard(p)
            st["got"] += 1
            log("coin")

    api = {
        "move": move, "turn_left": turn_left, "turn_right": turn_right, "pick_coin": pick_coin,
        "front_clear": lambda: free(ahead()), "left_clear": lambda: free(ahead(3)), "right_clear": lambda: free(ahead(1)),
        "at_goal": lambda: (st["x"], st["y"]) == goal, "coin_here": lambda: (st["x"], st["y"]) in coins,
    }
    r = _exec(code, [], echo=True, inject=api)
    return json.dumps({"err": r["err"], "out": r["out"], "acts": acts, "reached": (st["x"], st["y"]) == goal, "coins": st["got"], "total": total,
                       "start": list(start), "goal": list(goal), "facing": facing})
