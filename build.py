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
import hashlib
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
LABS: dict[str, dict] = {}  # experiment name -> id, page, title, and the html of its first look
MATH: list[dict] = []  # collected, rendered in one node call


def math_token(tex: str, display: bool) -> str:
    MATH.append(dict(tex=tex, display=display))
    return f"\x00MATH{len(MATH) - 1}\x00"


def make_md(page: dict) -> MarkdownIt:
    md = MarkdownIt("commonmark", {"html": True, "typographer": True, "linkify": False}).enable(["table", "strikethrough", "replacements", "smartquotes"])
    md.use(attrs_plugin, spans=True).use(attrs_block_plugin).use(deflist_plugin)
    md.use(dollarmath_plugin, allow_space=True, allow_digits=True, double_inline=True)
    state = dict(fig=0, sec=0, lab=0, labs=[], labstack=[], widgets=[], sections=[])
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
            a, _, title = a.partition("|")
            title = title.strip()
            if not title:
                raise BuildError(f"{page['slug']}: figure '{a.strip()}' needs a name: write '::: {kind} {a.strip()} | A short name'")
            name, _, rest = a.strip().partition(" ")
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
            return f'<figure class="{cls}" id="fig-{name}" data-title="{html.escape(title)}">{body}<figcaption><span class="fn">Fig {num}</span><span class="fname">{md.renderInline(title)}</span> '
        return fn
    simple("widget", fig_open("widget"), "</figcaption></figure>\n")

    # experiments: ":::: lab <widget> [look]" around ::: question / recipe / key / look / reading blocks
    def lab_open(a):
        a, _, title = a.partition("|")
        name, _, look = a.strip().partition(" ")
        look = look.strip() or "first"
        state["widgets"].append(name)
        first = name not in LABS
        if first:
            state["lab"] += 1
            LABS[name] = dict(id=f"{page['num']}{chr(64 + state['lab'])}" if page["num"] else chr(64 + state["lab"]),
                              slug=page["slug"], title=title.strip() or name)
        elif look == "first" or title.strip():
            raise BuildError(f"{page['slug']}: experiment '{name}' shown again: write ':::: lab {name} again' without a title")
        lab = LABS[name]
        state["labs"].append(name)
        state["labstack"].append((name, look))
        tag = "first look" if first else ("second look" if look == "again" else "another look")
        head = (f'<header class="lab-head"><span class="lab-id">Experiment {lab["id"]}</span>'
                f'<span class="lab-title">{html.escape(lab["title"])}</span><span class="lab-tag">{html.escape(tag)}</span></header>')
        ref = "" if first else f"<!--LABREF:{name}-->"
        return (f'<figure class="fig wide lab{" again" if not first else ""}" id="lab-{name}{"" if first else "-" + look}" '
                f'data-lab="{name}" data-look="{look}">{head}{ref}<div class="lab-body">')

    def lab_render(self, tokens, idx, _options, env):
        t = tokens[idx]
        if t.nesting == 1:
            return lab_open(t.info.strip()[len("lab"):].strip())
        name, look = state["labstack"].pop()
        return (f'<div class="stage widget lab-stage" data-widget="{name}" data-look="{look}">'
                '<noscript>This experiment is interactive and needs JavaScript.</noscript></div></div></figure>\n')
    md.use(container_plugin, "lab", render=lab_render)

    LAB_PARTS = dict(question=("lab-q", ""), recipe=("lab-recipe", "What was done"), legend=("lab-key", "How to read it"),
                     look=("lab-look", "Before you read on, look for"), reading=("lab-reading", "Read it again"))

    def lab_part(kind):
        cls, default = LAB_PARTS[kind]

        def render(self, tokens, idx, _options, env):
            t = tokens[idx]
            if t.nesting == -1:
                return "</div>\n"
            title = t.info.strip()[len(kind):].strip() or default
            h = f'<div class="lab-h">{md.renderInline(title)}</div>' if title else ""
            return f'<div class="{cls}">{h}\n'
        return render

    for kind in LAB_PARTS:
        md.use(container_plugin, kind, render=lab_part(kind))
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


# ----------------------------------------------------------------------------- experiments
GLYPHS = {  # little pictures for the "how to read it" key of an experiment
    "dot": '<circle cx="9" cy="9" r="4.2" class="g-fill"/>',
    "ring": '<circle cx="9" cy="9" r="5.5" class="g-line" stroke-width="2"/>',
    "hollow": '<circle cx="9" cy="9" r="4.2" class="g-line" stroke-width="1.6"/>',
    "dots": '<circle cx="4" cy="12" r="2.2" class="g-fill"/><circle cx="9" cy="6" r="2.2" class="g-fill"/><circle cx="14" cy="10" r="2.2" class="g-fill"/>',
    "line": '<path d="M2 13 L7 8 L11 11 L16 4" class="g-line" stroke-width="1.6"/>',
    "thick": '<path d="M2 13 C6 4, 11 15, 16 5" class="g-line" stroke-width="3.2"/>',
    "dash": '<path d="M2 9 H16" class="g-line" stroke-width="1.6" stroke-dasharray="3 2.5"/>',
    "bar": '<rect x="3" y="7" width="4" height="9" rx="1" class="g-fill"/><rect x="10" y="3" width="4" height="13" rx="1" class="g-fill"/>',
    "cell": '<rect x="2" y="2" width="6" height="6" class="g-fill" opacity=".35"/><rect x="10" y="2" width="6" height="6" class="g-fill"/><rect x="2" y="10" width="6" height="6" class="g-fill"/><rect x="10" y="10" width="6" height="6" class="g-fill" opacity=".35"/>',
    "x": '<path d="M2 14 H16 M13 11 L16 14 L13 17" class="g-line" stroke-width="1.6"/>',
    "y": '<path d="M4 16 V2 M1 5 L4 2 L7 5" class="g-line" stroke-width="1.6"/>',
    "colour": '<circle cx="5" cy="6" r="3" fill="var(--s1)"/><circle cx="13" cy="6" r="3" fill="var(--s2)"/><circle cx="9" cy="13" r="3" fill="var(--s3)"/>',
    "arrow": '<path d="M2 14 L14 4 M8 4 H14 V10" class="g-line" stroke-width="1.6"/>',
    "ramp": '<rect x="1" y="5" width="16" height="8" rx="2" fill="url(#g-ramp)"/>',
    "hover": '<path d="M5 2 L5 14 L8 11 L10.5 16 L12.5 15 L10 10 L14 10 Z" class="g-fill"/>',
}
GLYPH_DEFS = ('<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="g-ramp">'
              '<stop offset="0" stop-color="var(--bg-3)"/><stop offset=".45" stop-color="var(--k-q)"/><stop offset=".75" stop-color="var(--k-code)"/>'
              '<stop offset="1" stop-color="var(--k-vec)"/></linearGradient></defs></svg>')


def lab_post(p: dict) -> None:
    """Key glyphs (a list item that starts with !name), reading steps ({view}), and remember each first look."""
    body = p["body"]

    def glyph(m):
        g = GLYPHS.get(m.group(2))
        if g is None:
            raise BuildError(f"{p['slug']}: unknown key glyph !{m.group(2)} (known: {', '.join(GLYPHS)})")
        return f'<li class="lk">{m.group(1) or ""}<svg class="glyph" viewBox="0 0 18 18" aria-hidden="true">{g}</svg>'

    body = re.sub(r'<li>(\s*<p>)?!([a-z]+)\s*', glyph, body)
    body = re.sub(r'<li>(\s*<p>)?\{([\w-]+)\}\s*', lambda m: f'<li data-view="{m.group(2)}" tabindex="0" role="button">{m.group(1) or ""}', body)
    if 'class="lk"' in body:
        body = GLYPH_DEFS + body
    for name in dict.fromkeys(p["_state"]["labs"]):
        lab = LABS[name]
        if lab["slug"] != p["slug"] or "parts" in lab:
            continue
        m = re.search(rf'<figure class="fig wide lab" id="lab-{re.escape(name)}".*?<div class="lab-body">(.*?)<div class="stage widget lab-stage"', body, re.S)
        if m:   # question, recipe and legend: everything before the "look for" prompts
            lab["parts"] = m.group(1).split('<div class="lab-look">')[0]
    p["body"] = body


def lab_refs(p: dict) -> None:
    """A second look carries the question, recipe and key of the first, folded."""
    def ref(m):
        lab = LABS[m.group(1)]
        where = "above" if lab["slug"] == p["slug"] else f'in <a class="xr" href="{lab["slug"]}.html#lab-{m.group(1)}" data-page="{lab["slug"]}">{BY_SLUG[lab["slug"]]["num"]} {html.escape(BY_SLUG[lab["slug"]]["title"])}</a>'
        return (f'<details class="lab-ref"><summary>Same experiment as {where}: show what was done and how to read it</summary>'
                f'<div class="lab-ref-body">{lab.get("parts", "")}</div></details>')
    p["body"] = re.sub(r"<!--LABREF:([\w-]+)-->", ref, p["body"])


# ----------------------------------------------------------------------------- browse: everything that is not prose
KIND_ONE = dict(experiment="experiment", figure="figure", diagram="diagram", key="key idea", measured="measured", warn="pitfall",
                practice="in practice", code="code", check="checkpoint")
KIND_ONE["try"] = "exercise"
KINDS = [  # kind, plural label, one-line description for the browse page
    ("experiment", "Experiments", "Numerical experiments on real embeddings. Each leads a section: shown first, explained, shown again."),
    ("figure", "Interactive figures", "Charts and playgrounds you can hover, drag and adjust."),
    ("diagram", "Diagrams", "Static pictures of a mechanism."),
    ("key", "Key ideas", "The one idea a section hangs on."),
    ("measured", "Measured results", "Numbers measured on this book's data, with what they mean."),
    ("warn", "Pitfalls", "Ways this goes wrong in practice."),
    ("practice", "In practice", "What real systems do."),
    ("try", "Exercises", "Things to try yourself."),
    ("code", "Code sketches", "Short numpy versions of the ideas."),
    ("check", "Checkpoints", "The end-of-page summary of each page: the fastest way to review."),
]
ITEMS: list[dict] = []


MATH_HTML: list[str] = []  # KaTeX output, filled once the whole book is rendered


def plain(h: str, n: int = 0) -> str:
    """Text of an html fragment; formulas stay as \x00MATHn\x00 placeholders (see with_math)."""
    t = h
    t = html.unescape(re.sub(r"<[^>]+>", " ", t))
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r" ([.,;:!?)’”])", r"\1", re.sub(r"([(“‘]) ", r"\1", t))   # tags removed next to punctuation leave a space
    return t if not n or len(t) <= n else t[:n].rsplit(" ", 1)[0] + " …"


def with_math(t: str, rendered: bool = True) -> str:
    return re.sub(r"\x00MATH(\d+)\x00", lambda m: MATH_HTML[int(m.group(1))] if rendered else "…", t)


def collect_items(p: dict) -> None:
    """Give every non-prose block an anchor and remember it for the browse page and the search."""
    body, n = p["body"], dict()
    heads = [(m.start(), m.group(1), plain(m.group(2))) for m in re.finditer(r'<h2 id="([\w-]+)">(?:<a class="hnum"[^>]*>[^<]*</a>)?(.*?)</h2>', body)]

    def section(pos):
        h = [x for x in heads if x[0] < pos]
        return (h[-1][1], h[-1][2]) if h else (None, None)

    def add(kind, pos, anchor, title, text, **extra):
        sid, stitle = section(pos)
        ITEMS.append(dict(kind=kind, slug=p["slug"], num=p["num"], page=p["title"], part=p["part"], anchor=anchor,
                          title=title, text=text, sec=stitle, **extra))

    def box(m):
        kind = m.group(1)
        if kind not in {k for k, *_ in KINDS}:
            return m.group(0)
        n[kind] = n.get(kind, 0) + 1
        return f'<aside class="box box-{kind}" id="{kind}-{n[kind]}">'
    body = re.sub(r'<aside class="box box-([\w-]+)">', box, body)
    for m in re.finditer(r'<aside class="box box-([\w-]+)" id="([\w-]+)"><span class="label">(.*?)</span>(.*?)</aside>', body, re.S):
        kind, aid, label, inner = m.groups()
        label = plain(label)
        title = label if label != BOXES.get(kind) else ""
        if kind == "check":
            title = f"After {p['num']} {p['title']}".strip()
        add(kind, m.start(), aid, title, plain(inner, 260))
    k = 0

    def codehead(m):
        nonlocal k
        k += 1
        return f'<div class="codehead" id="code-{k}">'
    body = re.sub(r'<div class="codehead">', codehead, body)
    for m in re.finditer(r'<div class="codehead" id="([\w-]+)"><span>(.*?)</span><span>(.*?)</span></div><pre class="code"><code>(.*?)</code>', body, re.S):
        add("code", m.start(), m.group(1), plain(m.group(2)), plain(m.group(4), 160), lang=plain(m.group(3)))
    for m in re.finditer(r'<figure class="fig[^"]*" id="(fig-[\w-]+)" data-title="([^"]*)"><div class="stage (widget|diawrap)".*?<figcaption><span class="fn">(.*?)</span><span class="fname">.*?</span>(.*?)</figcaption>', body, re.S):
        cap = m.group(5)
        lead = re.match(r"\s*<p>\s*<strong>(.*?)</strong>", cap)   # captions open with a bold lead: an instruction or a subtitle
        add("figure" if m.group(3) == "widget" else "diagram", m.start(), m.group(1), html.unescape(m.group(2)),
            plain(cap[lead.end():] if lead else cap, 220), fig=plain(m.group(4)), hint=plain(lead.group(1)) if lead else "")
    for m in re.finditer(r'<figure class="fig wide lab(?P<again> again)?" id="(?P<id>[\w-]+)" data-lab="(?P<name>[\w-]+)" data-look="(?P<look>[\w-]+)">', body):
        lab = LABS[m.group("name")]
        if not m.group("again"):
            q = re.search(r'<div class="lab-q">(.*?)</div>', body[m.end():], re.S)
            steps = len(re.findall(r"<li\b", lab.get("parts", "").split('class="lab-recipe"')[-1].split('class="lab-key"')[0]))
            add("experiment", m.start(), m.group("id"), lab["title"], plain(q.group(1), 300) if q else "", lab=m.group("name"),
                labid=lab["id"], steps=steps, looks=[])
        else:
            first = next(i for i in ITEMS if i["kind"] == "experiment" and i.get("lab") == m.group("name"))
            sid, stitle = section(m.start())
            views = len(re.findall(r"data-view=", body[m.end():body.find("</figure>", m.end())]))
            first["looks"].append(dict(slug=p["slug"], num=p["num"], anchor=m.group("id"), sec=stitle, views=views))
    p["body"] = body


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
        lab_post(p)
        p["goal_html"] = MarkdownIt("commonmark", {"typographer": True}).use(dollarmath_plugin).renderInline(prepass(p.get("goal", ""), p["slug"]))
    for p in PAGES:
        collect_items(p)
        lab_refs(p)
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
        MATH_HTML[:] = rendered
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


def browse_page() -> str:
    by = {k: [i for i in ITEMS if i["kind"] == k] for k, *_ in KINDS}
    def esc(t):
        return with_math(html.escape(t))

    def where(i, anchor=None, sec=None, num=None, slug=None):
        slug, num = slug or i["slug"], num or i["num"]
        sec = sec if sec is not None else i["sec"]
        t = f'{num} {esc(BY_SLUG[slug]["title"])}' + (f' <span class="br-sec">› {esc(sec)}</span>' if sec else "")
        return f'<a class="br-where" href="{slug}.html#{anchor or i["anchor"]}" data-page="{slug}">{t}</a>'

    chips = "".join(f'<button class="br-chip k-{k}" data-kind="{k}" aria-pressed="true"><b>{len(by[k])}</b> {esc(lab)}</button>' for k, lab, _ in KINDS if by[k])
    parts = "".join(f'<option value="{i}">{"Part " + str(pt["n"]) + " · " if pt.get("n") is not None else ""}{esc(pt["title"])}</option>' for i, pt in enumerate(BOOK["parts"]) if any(x["part"] == i for x in ITEMS))
    out = [f'<div class="br-sticky"><div class="gl-tools br-tools"><input id="br-filter" type="search" placeholder="Filter by any word…" aria-label="Filter"><select id="br-part" aria-label="Part"><option value="">all parts</option>{parts}</select><span id="br-count"></span></div>'
           f'<div class="br-chips" role="group" aria-label="Kinds of content">{chips}</div></div>']
    for k, label, blurb in KINDS:
        items = by[k]
        if not items:
            continue
        out.append(f'<section class="br-kind" data-kind="{k}" id="{k}s"><h2>{esc(label)} <small>{len(items)}</small></h2><p class="br-blurb">{esc(blurb)}</p>')
        if k == "experiment":
            out.append('<div class="br-labs">')
            for i in items:
                looks = "".join(f'<li><span class="br-look again">{"second" if j == 0 else "another"} look</span>{where(i, l["anchor"], l["sec"], l["num"], l["slug"])}<span class="br-n">{l["views"]} guided step{"s" if l["views"] != 1 else ""}</span></li>' for j, l in enumerate(i["looks"]))
                out.append(f'<article class="br-item br-lab" data-part="{i["part"]}"><header><span class="lab-id">Experiment {i["labid"]}</span><a class="br-t" href="{i["slug"]}.html#{i["anchor"]}">{esc(i["title"])}</a></header>'
                           f'<p class="br-q">{esc(i["text"])}</p><ul class="br-looks"><li><span class="br-look">first look</span>{where(i)}<span class="br-n">{i["steps"]}-step recipe</span></li>{looks}</ul></article>')
            out.append("</div>")
        else:
            out.append('<ol class="br-list">')
            for i in items:
                tag = i.get("fig") or i.get("lang") or ""
                title = f'<a class="br-t" href="{i["slug"]}.html#{i["anchor"]}">{esc(i["title"])}</a>' if i["title"] else ""
                hint = f'<span class="br-hint">{esc(i["hint"])}</span>' if i.get("hint") else ""
                out.append(f'<li class="br-item" data-part="{i["part"]}">{f"<span class=br-tag>{esc(tag)}</span>" if tag else ""}{title}{hint}'
                           f'<p>{esc(i["text"])}</p>{where(i)}</li>')
            out.append("</ol>")
        out.append("</section>")
    return "\n".join(out)


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
        items=[[i["kind"], i["slug"], i["anchor"], with_math(i["title"] or i["text"][:70], False), i.get("labid", i.get("fig", "")), with_math(i["text"][:200], False)] for i in ITEMS],
        kinds=KIND_ONE,
        labVersions={f.stem: hashlib.sha256(f.read_bytes()).hexdigest()[:12]
                     for f in sorted((DIST / "assets" / "lab").glob("*.js"))},
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
    nlab = sum(i["kind"] == "experiment" for i in ITEMS)
    b = dict(slug="browse", part=len(BOOK["parts"]) - 1, num="", title="Browse by kind", kicker="Reference",
             goal_html=f"Everything in the book that is not running prose, by kind: {nlab} experiments, every figure and diagram, the key ideas, measured results, pitfalls and checkpoints. Each links to its place in the text.",
             minutes=5, body=browse_page(), scripts=[], needs_data=False, layout="page glossary browse", _state=dict(fig=0))
    (DIST / "browse.html").write_text(page_html(b, tpl, PAGES[-1], None))
    # New HTML must not reuse a previous deployment's navigation, CSS or widget code.
    # Content hashes are deterministic, so unchanged assets still benefit from caching.
    versions = {str(f.relative_to(DIST)): hashlib.sha256(f.read_bytes()).hexdigest()[:12]
                for f in (DIST / "assets").rglob("*") if f.is_file()}
    def versioned_asset(m):
        path = m.group(2)
        return f'{m.group(1)}{path}?v={versions[path]}{m.group(3)}' if path in versions else m.group(0)
    for page in DIST.glob("*.html"):
        page.write_text(re.sub(r'((?:src|href)=")(assets/[^"?#]+)(")', versioned_asset, page.read_text()))
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
