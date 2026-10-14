# /// script
# requires-python = ">=3.11"
# dependencies = ["markdown-it-py>=3", "mdit-py-plugins>=0.4", "pyyaml", "pygments"]
# ///
"""Static-site build for the book.

    uv run build.py            # content/*.md + theme/ + data/  ->  dist/
    uv run build.py --serve    # build, then serve dist/ on http://localhost:8000

Content is markdown (content/), the look lives in theme/, numbers come from data/results.json.
See content/README.md for the authoring syntax.
"""
from __future__ import annotations

import html
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import yaml
from markdown_it import MarkdownIt
from mdit_py_plugins.attrs import attrs_block_plugin, attrs_plugin
from mdit_py_plugins.container import container_plugin
from mdit_py_plugins.deflist import deflist_plugin
from mdit_py_plugins.dollarmath import dollarmath_plugin
from pygments import highlight
from pygments.formatters import HtmlFormatter
from pygments.lexers import get_lexer_by_name
from pygments.util import ClassNotFound

ROOT = Path(__file__).resolve().parent
CONTENT, THEME, DIST = ROOT / "content", ROOT / "theme", ROOT / "dist"
sys.path.insert(0, str(ROOT))


class BuildError(Exception):
    pass


# ----------------------------------------------------------------------------- inputs
BOOK = yaml.safe_load((ROOT / "book.yml").read_text())
GLOSSARY: dict = yaml.safe_load((CONTENT / "glossary.yml").read_text())
RESULTS = json.loads((ROOT / "data" / "results.json").read_text()) if (ROOT / "data" / "results.json").exists() else {}

from facts import facts as make_facts  # noqa: E402

FACTS = make_facts(RESULTS)

PAGES: list[dict] = []  # flat reading order
for pi, part in enumerate(BOOK["parts"]):
    for qi, slug in enumerate(part["pages"]):
        PAGES.append(dict(slug=slug, part=pi, idx=qi, num=f"{part['n']}.{qi + 1}" if part.get("n") is not None else ""))
BY_SLUG = {p["slug"]: p for p in PAGES}

# term lookup: id and every alias, lower-cased
TERM_OF: dict[str, str] = {}
for tid, t in GLOSSARY.items():
    for name in [tid, t["term"], *t.get("aliases", [])]:
        TERM_OF[name.lower()] = tid


def slugify(s: str) -> str:
    s = re.sub(r"<[^>]+>", "", s).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")


# ----------------------------------------------------------------------------- pre-pass on markdown source
FENCE_SPLIT = re.compile(r"(^```.*?^```[ \t]*$|`[^`\n]+`|\$\$.*?\$\$|\$[^$\n]+\$)", re.S | re.M)


def fmt_value(v, spec: str) -> str:
    spec = spec.strip()
    if not spec:
        return f"{v:,}" if isinstance(v, int) else (f"{v:.3g}" if isinstance(v, float) else str(v))
    if spec.endswith("%"):  # value is a fraction
        return format(v * 100, spec[:-1] + "f") + "%"
    if spec == "x":
        return f"{v:.2f}×"
    return format(v, spec)


def prepass(src: str, where: str) -> str:
    """{{fact|fmt}}, [[term]], [[@page]], ==mark== -- everywhere except code and math."""

    def fact(m, strict=True):
        key, _, spec = m.group(1).partition("|")
        key = key.strip()
        if key not in FACTS:
            if strict:
                raise BuildError(f"{where}: unknown fact {{{{{key}}}}}")
            return m.group(0)  # inside math, {{x}} may simply be TeX grouping
        return fmt_value(FACTS[key], spec)

    def link(m):
        body = m.group(1)
        target, _, text = body.partition("|")
        target = target.strip()
        if target.startswith("@"):
            slug, _, frag = target[1:].partition("#")
            if slug not in BY_SLUG:
                raise BuildError(f"{where}: unknown page [[@{slug}]]")
            p = BY_SLUG[slug]
            label = text or f"{p['num']} {p['title']}".strip()
            return f'<a class="xr" href="{slug}.html{"#" + frag if frag else ""}" data-page="{slug}">{label}</a>'
        tid = TERM_OF.get(target.lower())
        if not tid:
            raise BuildError(f"{where}: unknown glossary term [[{target}]]")
        return term_link(tid, text or target)

    out = []
    for i, chunk in enumerate(FENCE_SPLIT.split(src)):
        if i % 2 == 0:
            chunk = re.sub(r"\[\[([^\]]+)\]\]", link, chunk)
            chunk = re.sub(r"==(?=\S)(.+?)(?<=\S)==", r"<mark>\1</mark>", chunk)
            chunk = re.sub(r"\*\*([^*\n]+?)\*\*\{\.([\w -]+?)\}", r'<strong class="\2">\1</strong>', chunk)
        is_math = chunk.startswith("$")
        chunk = re.sub(r"\{\{\s*([a-z_][a-z0-9_]*(?:\|[^{}]*)?)\s*\}\}", lambda m: fact(m, strict=not is_math), chunk)
        out.append(chunk)
    return "".join(out)


def term_link(tid: str, text: str) -> str:
    return f'<a class="term" href="glossary.html#{tid}" data-term="{tid}">{text}</a>'


# ----------------------------------------------------------------------------- markdown renderer
BOXES = {
    "note": "Note", "key": "Key idea", "warn": "Watch out", "practice": "In practice", "check": "Checkpoint",
    "try": "Try it", "recap": "Recap", "measured": "Measured",
}
MATH: list[dict] = []  # collected, rendered in one node call


def math_token(tex: str, display: bool) -> str:
    MATH.append(dict(tex=tex, display=display))
    return f"\x00MATH{len(MATH) - 1}\x00"


def make_md(page: dict) -> MarkdownIt:
    md = MarkdownIt("commonmark", {"html": True, "typographer": True, "linkify": False}).enable(["table", "strikethrough", "replacements", "smartquotes"])
    md.use(attrs_plugin, spans=True).use(attrs_block_plugin).use(deflist_plugin)
    md.use(dollarmath_plugin, allow_space=True, allow_digits=True, double_inline=True)
    state = dict(fig=0, sec=0, widgets=[], sections=[])
    page["_state"] = state

    def box(kind):
        def render(self, tokens, idx, _options, env):
            t = tokens[idx]
            if t.nesting == 1:
                title = t.info.strip()[len(kind):].strip() or BOXES[kind]
                return f'<aside class="box box-{kind}"><span class="label">{md.renderInline(title)}</span>\n'
            return "</aside>\n"
        return render

    for kind in BOXES:
        md.use(container_plugin, kind, render=box(kind))

    def simple(name, open_fn, close):
        def render(self, tokens, idx, _options, env):
            t = tokens[idx]
            return open_fn(t.info.strip()[len(name):].strip()) if t.nesting == 1 else close
        md.use(container_plugin, name, render=render)

    simple("aside", lambda a: f'<aside class="sn"><span class="label">{md.renderInline(a or "Side note")}</span>', "</aside>\n")
    simple("pull", lambda a: '<blockquote class="pull">', "</blockquote>\n")
    simple("qa", lambda a: f'<div class="qa"><p class="ask">{md.renderInline(a)}</p>', "</div>\n")
    simple("deep", lambda a: f'<details class="deep"><summary>{md.renderInline(a or "Derivation")}</summary><div>', "</div></details>\n")
    simple("stats", lambda a: '<div class="stats">', "</div>\n")
    simple("cards", lambda a: f'<div class="cards {a}">', "</div>\n")
    simple("steps", lambda a: '<div class="steps">', "</div>\n")
    simple("cols", lambda a: '<div class="cols">', "</div>\n")
    simple("wide", lambda a: '<div class="wide">', "</div>\n")
    simple("lede", lambda a: '<div class="lede">', "</div>\n")

    def story_open(a):
        who, _, when = a.partition("|")
        who = who.strip() or "Priya"
        return (f'<div class="story"><div class="who"><span class="av">{html.escape(who[0])}</span>'
                f'<span class="nm">{html.escape(who)}<small>{html.escape(when.strip())}</small></span></div>')
    simple("story", story_open, "</div>\n")

    def fig_open(kind):
        def fn(a):
            name, _, rest = a.partition(" ")
            state["fig"] += 1
            num = f"{page['num']}.{state['fig']}" if page["num"] else str(state["fig"])
            cls = "fig wide" if "narrow" not in rest.split() else "fig"
            if kind == "widget":
                state["widgets"].append(name)
                body = f'<div class="stage widget" data-widget="{name}"><noscript>This figure is interactive and needs JavaScript.</noscript></div>'
            else:
                f = ROOT / "figures" / f"{name}.svg"
                if not f.exists():
                    raise BuildError(f"{page['slug']}: missing figure figures/{name}.svg")
                body = f'<div class="stage diawrap">{f.read_text()}</div>'
            return f'<figure class="{cls}" id="fig-{name}">{body}<figcaption><span class="fn">Fig {num}</span>'
        return fn
    simple("widget", fig_open("widget"), "</figcaption></figure>\n")
    simple("svg", fig_open("svg"), "</figcaption></figure>\n")

    # fenced blocks: code (pygments) and the "score" strip
    def fence(self, tokens, idx, options, env):
        t = tokens[idx]
        lang, _, title = t.info.strip().partition(" ")
        if lang == "score":
            pills = []
            for line in t.content.strip().splitlines():
                grade, _, rest = line.partition(" ")
                k, _, v = rest.partition("|")
                pills.append(f'<span class="pill {grade}">{html.escape(k.strip())} <b>{html.escape(v.strip())}</b></span>')
            return f'<div class="score"><span class="who">{html.escape(title)}</span>{"".join(pills)}</div>\n'
        try:
            lexer = get_lexer_by_name(lang or "text")
        except ClassNotFound:
            lexer = get_lexer_by_name("text")
        code = highlight(t.content, lexer, HtmlFormatter(nowrap=True))
        head = ""
        if title:
            a, _, b = title.partition("|")
            head = f'<div class="codehead"><span>{html.escape(a.strip())}</span><span>{html.escape(b.strip())}</span></div>'
        return f'{head}<pre class="code"><code>{code}</code></pre>\n'
    md.add_render_rule("fence", fence)

    md.add_render_rule("math_inline", lambda self, tokens, idx, o, e: math_token(tokens[idx].content, False))
    md.add_render_rule("math_inline_double", lambda self, tokens, idx, o, e: math_token(tokens[idx].content, True))
    md.add_render_rule("math_block", lambda self, tokens, idx, o, e: f'<div class="math">{math_token(tokens[idx].content, True)}</div>\n')

    md.add_render_rule("table_open", lambda self, tokens, idx, o, e: '<div class="tablewrap"><table>')
    md.add_render_rule("table_close", lambda self, tokens, idx, o, e: "</table></div>\n")

    # numbered, linkable section headings
    def heading_open(self, tokens, idx, options, env):
        t = tokens[idx]
        text = tokens[idx + 1].content
        if t.tag == "h2":
            state["sec"] += 1
            m = re.search(r"\s*\{#([\w-]+)\}\s*$", text)
            if m:  # "## Title {#explicit-id}"
                text = text[: m.start()]
                kids = tokens[idx + 1].children
                if kids and kids[-1].type == "text":
                    kids[-1].content = re.sub(r"\s*\{#[\w-]+\}\s*$", "", kids[-1].content)
            sid = (m.group(1) if m else None) or slugify(re.sub(r"<[^>]+>", "", text))
            state["sections"].append(dict(id=sid, title=re.sub(r"<[^>]+>|[*_`]", "", text)))
            return f'<h2 id="{sid}"><a class="hnum" href="#{sid}" aria-label="Link to this section">{state["sec"]}</a>'
        return f"<{t.tag}>"
    md.add_render_rule("heading_open", heading_open)

    # external links open in a new tab; "@slug" links point at pages
    def link_open(self, tokens, idx, options, env):
        t = tokens[idx]
        href = t.attrGet("href") or ""
        if href.startswith("@"):
            slug, _, frag = href[1:].partition("#")
            if slug not in BY_SLUG:
                raise BuildError(f"{page['slug']}: unknown page link (@{slug})")
            t.attrSet("href", f"{slug}.html" + (f"#{frag}" if frag else ""))
            t.attrSet("data-page", slug)
            t.attrJoin("class", "xr-inline")
        elif re.match(r"https?://", href):
            t.attrSet("target", "_blank")
            t.attrSet("rel", "noopener")
            t.attrJoin("class", "ext")
        return self.renderToken(tokens, idx, options, env)
    md.add_render_rule("link_open", link_open)

    md.core.ruler.push("autoterms", lambda st: autoterms(st, page))
    return md


AUTO = sorted(
    ((alias, tid) for tid, t in GLOSSARY.items() if t.get("auto", True) for alias in [t["term"], *t.get("aliases", [])]),
    key=lambda x: -len(x[0]),
)
AUTO_RE = re.compile(r"(?<![\w\-/])(" + "|".join(re.escape(a) for a, _ in AUTO) + r")(?![\w\-])") if AUTO else None
AUTO_ID = {a: tid for a, tid in AUTO}


def autoterms(state, page):
    """Link the first mention of each glossary term on a page (prose only: not headings, links or code)."""
    from markdown_it.token import Token

    seen = page.setdefault("_terms", set())
    skip_next = False
    for tok in state.tokens:
        if tok.type == "heading_open":
            skip_next = True
            continue
        if tok.type != "inline" or not tok.children:
            continue
        if skip_next:
            skip_next = False
            continue
        out, depth = [], 0
        for ch in tok.children:
            if ch.type == "link_open":
                depth += 1
            elif ch.type == "link_close":
                depth -= 1
            elif ch.type == "html_inline":
                if re.match(r"<a\b", ch.content):
                    depth += 1
                    m = re.search(r'data-term="([^"]+)"', ch.content)
                    if m:
                        seen.add(m.group(1))
                elif ch.content.startswith("</a"):
                    depth -= 1
            if ch.type != "text" or depth > 0 or AUTO_RE is None:
                out.append(ch)
                continue
            pos, text = 0, ch.content
            for m in AUTO_RE.finditer(text):
                tid = AUTO_ID[m.group(1)]
                if tid in seen or tid == page.get("defines"):
                    continue
                seen.add(tid)
                if m.start() > pos:
                    t = Token("text", "", 0)
                    t.content = text[pos:m.start()]
                    out.append(t)
                h = Token("html_inline", "", 0)
                h.content = term_link(tid, html.escape(m.group(1)))
                out.append(h)
                pos = m.end()
            if pos == 0:
                out.append(ch)
            elif pos < len(text):
                t = Token("text", "", 0)
                t.content = text[pos:]
                out.append(t)
        tok.children = out


# ----------------------------------------------------------------------------- pages
def read_page(p: dict):
    f = CONTENT / f"{p['slug']}.md"
    if not f.exists():
        raise BuildError(f"missing content/{p['slug']}.md (listed in book.yml)")
    raw = f.read_text()
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", raw, re.S)
    if not m:
        raise BuildError(f"{f.name}: missing front matter")
    meta = {}
    for line in m.group(1).splitlines():  # "key: value", value verbatim (it may contain colons and quotes)
        k, sep, v = line.partition(":")
        if sep and k.strip():
            v = v.strip()
            meta[k.strip()] = v[1:-1] if len(v) > 1 and v[0] == v[-1] == '"' and v.count('"') == 2 else v
    p.update(meta)
    p["_src"] = m.group(2)
    p.setdefault("title", p["slug"])
    words = len(re.findall(r"\w+", re.sub(r"```.*?```", "", p["_src"], flags=re.S)))
    p["minutes"] = max(2, round(words / 190) + (2 if ":::" in p["_src"] and "widget" in p["_src"] else 0))


def widget_files() -> dict[str, str]:
    """widget name -> js file that registers it (found by scanning for CE.widget('name')."""
    out = {}
    for f in sorted((THEME / "js" / "widgets").glob("*.js")):
        for name in re.findall(r"CE\.widget\(\s*['\"]([\w-]+)['\"]", f.read_text()):
            out[name] = f.name
    return out


def render_all():
    for p in PAGES:
        read_page(p)
    wf = widget_files()
    needs_data = {f.name for f in (THEME / "js" / "widgets").glob("*.js") if "DATA." in f.read_text() or "DATA[" in f.read_text()}
    for p in PAGES:
        md = make_md(p)
        body = md.render(prepass(p["_src"], p["slug"]))
        st = p["_state"]
        p["body"] = body
        p["sections"] = st["sections"]
        missing = [w for w in st["widgets"] if w not in wf]
        if missing:
            raise BuildError(f"{p['slug']}: unknown widget(s) {missing}")
        files = list(dict.fromkeys(wf[w] for w in st["widgets"]))
        p["scripts"] = files
        p["needs_data"] = any(f in needs_data for f in files)
        p["goal_html"] = MarkdownIt("commonmark", {"typographer": True}).use(dollarmath_plugin).renderInline(prepass(p.get("goal", ""), p["slug"]))
    # glossary definitions may use math and term links too
    gmd = MarkdownIt("commonmark", {"html": True, "typographer": True}).use(dollarmath_plugin, allow_space=True)
    gmd.add_render_rule("math_inline", lambda self, tokens, idx, o, e: math_token(tokens[idx].content, False))
    for tid, t in GLOSSARY.items():
        t["short_html"] = gmd.renderInline(prepass(t["short"], f"glossary:{tid}"))
        t["long_html"] = gmd.render(prepass(t["long"], f"glossary:{tid}")) if t.get("long") else ""
        if t.get("page") and t["page"] not in BY_SLUG:
            raise BuildError(f"glossary:{tid}: unknown page {t['page']}")
    # one KaTeX call for the whole book
    if MATH:
        r = subprocess.run(["node", str(ROOT / "tools" / "katex-render.mjs")], input=json.dumps(MATH), capture_output=True, text=True)
        if r.returncode != 0:
            raise BuildError("KaTeX failed:\n" + r.stderr)
        rendered = json.loads(r.stdout)
        sub = lambda s: re.sub(r"\x00MATH(\d+)\x00", lambda m: rendered[int(m.group(1))], s)
        for p in PAGES:
            p["body"], p["goal_html"] = sub(p["body"]), sub(p["goal_html"])
        for t in GLOSSARY.values():
            t["short_html"], t["long_html"] = sub(t["short_html"]), sub(t["long_html"])


def fill(tpl: str, **kw) -> str:
    return re.sub(r"\{\{(\w+)\}\}", lambda m: str(kw[m.group(1)]), tpl)


def page_html(p: dict, tpl: str, prev_p, next_p) -> str:
    part = BOOK["parts"][p["part"]]

    def navcard(q, cls, label):
        if not q:
            return f'<span class="navcard {cls} empty"></span>'
        qp = BOOK["parts"][q["part"]]
        return (f'<a class="navcard {cls}" href="{q["slug"]}.html" rel="{cls}" style="--pc:var(--{qp["color"]})">'
                f'<span class="dir">{label}</span><span class="tt"><span class="n">{q["num"]}</span>{html.escape(q["title"])}</span></a>')

    strip = "".join(
        f'<a href="{s}.html" data-page="{s}" class="{"here" if s == p["slug"] else ""}" title="{html.escape(BY_SLUG[s]["title"])}"></a>'
        for s in part["pages"]
    )
    scripts = "".join(f'<script defer src="assets/js/widgets/{f}"></script>' for f in p["scripts"])
    if p["needs_data"]:
        scripts = '<script defer src="assets/data.js"></script>' + scripts
    if p["scripts"]:
        scripts = '<script defer src="assets/js/lib.js"></script>' + scripts
    return fill(
        tpl,
        title=html.escape(p["title"]), book=html.escape(BOOK["title"]),
        doc_title=html.escape(BOOK["title"] + ": " + BOOK["subtitle"] if p["slug"] == "index" else f'{p["title"]} · {BOOK["title"]}'), desc=html.escape(re.sub(r"<[^>]+>", "", p["goal_html"])),
        slug=p["slug"], num=p["num"], part_title=html.escape(part["title"]), part_n=part.get("n", 0),
        part_label=f"Part {part['n']}" if part.get("n") is not None else "", color=part["color"],
        kicker=html.escape(p.get("kicker", part["title"])), goal=p["goal_html"], minutes=p["minutes"],
        body=p["body"], prev=navcard(prev_p, "prev", "← Previous"), next=navcard(next_p, "next", "Next →"),
        strip=strip, scripts=scripts, layout=p.get("layout", "page"), nfig=p["_state"]["fig"],
    )


def glossary_page() -> str:
    groups: dict[str, list] = {}
    for tid, t in sorted(GLOSSARY.items(), key=lambda kv: kv[1]["term"].lower()):
        groups.setdefault(t.get("group", "Other"), []).append((tid, t))
    order = [g for g in BOOK.get("glossary_groups", []) if g in groups] + [g for g in groups if g not in BOOK.get("glossary_groups", [])]
    out = ['<div class="gl-tools"><input id="gl-filter" type="search" placeholder="Filter terms…" aria-label="Filter glossary terms"><span id="gl-count"></span></div>']
    for g in order:
        out.append(f'<h2 id="{slugify(g)}">{html.escape(g)}</h2><dl class="gloss">')
        for tid, t in groups[g]:
            where = ""
            if t.get("page"):
                q = BY_SLUG[t["page"]]
                where = f'<a class="xr" href="{q["slug"]}.html" data-page="{q["slug"]}">{q["num"]} {html.escape(q["title"])}</a>'
            aka = ", ".join(a for a in t.get("aliases", []) if a.lower() != t["term"].lower())
            out.append(
                f'<div class="gl-item" id="{tid}" data-term-id="{tid}"><dt><span class="k-{t.get("color", "ink")}">{html.escape(t["term"])}</span>'
                f'{f"<small>{html.escape(aka)}</small>" if aka else ""}</dt>'
                f'<dd><p>{t["short_html"]}</p>{t["long_html"]}{f"<p class=where>Explained in {where}</p>" if where else ""}</dd></div>'
            )
        out.append("</dl>")
    return "\n".join(out)


def build():
    render_all()
    if DIST.exists():
        shutil.rmtree(DIST)
    (DIST / "assets").mkdir(parents=True)
    shutil.copytree(THEME / "css", DIST / "assets" / "css")
    shutil.copytree(THEME / "js", DIST / "assets" / "js")
    shutil.copytree(THEME / "vendor", DIST / "assets" / "vendor")
    if (THEME / "img").exists():
        shutil.copytree(THEME / "img", DIST / "assets" / "img")
    (DIST / "assets" / "css" / "pygments.css").write_text("")  # token colours live in theme css
    (DIST / "assets" / "data.js").write_text("window.DATA=" + json.dumps(RESULTS, separators=(",", ":")) + ";")
    # each experiment's data is a separate script, loaded by its figure when it scrolls into view
    (DIST / "assets" / "lab").mkdir()
    for f in sorted((ROOT / "data" / "lab").glob("*.json")):
        (DIST / "assets" / "lab" / f"{f.stem}.js").write_text(f"CE.labData.put({json.dumps(f.stem)},{f.read_text()});")
    manifest = dict(
        title=BOOK["title"], subtitle=BOOK["subtitle"],
        parts=[dict(n=pt.get("n"), title=pt["title"], color=pt["color"], blurb=pt.get("blurb", ""), pages=pt["pages"]) for pt in BOOK["parts"]],
        pages={p["slug"]: dict(title=p["title"], num=p["num"], part=p["part"], minutes=p["minutes"],
                               goal=re.sub(r"<[^>]+>", "", p["goal_html"]), sections=p["sections"]) for p in PAGES},
        order=[p["slug"] for p in PAGES],
        terms={tid: dict(term=t["term"], short=t["short_html"], page=t.get("page"), color=t.get("color", "ink"),
                         aka=[a for a in t.get("aliases", [])][:3]) for tid, t in GLOSSARY.items()},
    )
    (DIST / "assets" / "book.js").write_text("window.BOOK=" + json.dumps(manifest, separators=(",", ":")) + ";")
    tpl = (THEME / "template.html").read_text()
    for i, p in enumerate(PAGES):
        (DIST / f"{p['slug']}.html").write_text(page_html(p, tpl, PAGES[i - 1] if i else None, PAGES[i + 1] if i + 1 < len(PAGES) else None))
    # glossary: a generated page that reuses the page template
    g = dict(slug="glossary", part=len(BOOK["parts"]) - 1, num="", title="Glossary", kicker="Reference",
             goal_html=f"Every term in the book, {len(GLOSSARY)} of them, each with a one-line reminder and a link to the page that explains it.",
             minutes=5, body=glossary_page(), scripts=[], needs_data=False, layout="page glossary", _state=dict(fig=0))
    (DIST / "glossary.html").write_text(page_html(g, tpl, PAGES[-1], None))
    (DIST / ".nojekyll").write_text("")
    words = sum(len(re.findall(r"\w+", p["_src"])) for p in PAGES)
    print(f"built {len(PAGES)} pages + glossary ({len(GLOSSARY)} terms), {len(MATH)} formulas, ~{words:,} words -> {DIST}")


if __name__ == "__main__":
    try:
        build()
    except BuildError as e:
        sys.exit(f"build error: {e}")
    if "--serve" in sys.argv:
        import functools
        import http.server

        print("serving http://localhost:8000")
        http.server.ThreadingHTTPServer(("127.0.0.1", 8000), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST))).serve_forever()
