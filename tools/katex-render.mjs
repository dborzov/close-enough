// Renders a JSON list of {tex, display} from stdin to a JSON list of HTML strings on stdout.
// Called once per build by build.py, so pages ship pre-rendered math and need no math JavaScript.
import katex from "./katex.mjs";

// Concept colours: \kv{x} paints x in the "data vector" colour, and so on. Same classes as the prose.
const macros = {};
for (const k of ["vec", "book", "code", "res", "enc", "dec", "q", "bits"]) {
  macros["\\k" + k] = `\\htmlClass{k-${k}}{#1}`;
}
macros["\\norm"] = "\\lVert #1 \\rVert";
macros["\\E"] = "\\mathbb{E}";
macros["\\R"] = "\\mathbb{R}";

let input = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) input += chunk;
const out = JSON.parse(input).map(({ tex, display }) => {
  try {
    return katex.renderToString(tex, { displayMode: display, trust: true, strict: false, macros: { ...macros }, throwOnError: true });
  } catch (e) {
    process.stderr.write(`KaTeX error in: ${tex}\n  ${e.message}\n`);
    process.exitCode = 1;
    return `<code class="math-error">${tex}</code>`;
  }
});
process.stdout.write(JSON.stringify(out));
