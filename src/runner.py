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


def _exec(code, stdin=None, echo=False, trace=False, limit=150000, max_steps=300):
    buf = io.StringIO()
    ns = {"__name__": "__main__"}
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
    d = {"label": t.get("label") or t.get("kind"), "ok": bool(ok), "hidden": bool(t.get("hidden"))}
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
