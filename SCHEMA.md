# report-kit schema (for AI assistants)

Write reports as report-kit JSON. Do not write HTML, CSS or chart code.

## File

```html
<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="https://cdn.jsdelivr.net/gh/omert11/report-kit@0.3.0/report-kit.min.js"></script>
<script type="application/json" class="rk-v">{ ...version 1... }</script>
```

New version = **append** another `<script type="application/json" class="rk-v">` at the end of the file. Never edit earlier versions.

## Version

`{"title", "sum", "meta":[chips], "date", "note":"what changed", "lang":"en|tr", "blocks":[...]}`

- `title`, `sum`, `meta`, `lang` are inherited from the previous version when omitted.
- `{"ref":"id"}` reuses the newest earlier block with that `id`. Use it for anything unchanged.

## Blocks

A block is an object; its type key holds the data. Optional on any block: `title`, `icon` (Lucide name), `id`, `src` (source line).
Inline text supports `**bold**`, `` `code` ``, `[text](https://url)`. Tones: `good` `bad` `warn` `info`.

```
{"h":"Section"}                                   section heading (goes to table of contents)
{"p":"Paragraph"}
{"callout":"Text","tone":"warn"}
{"kpi":[["Label",value,"tone","sub","icon"]]}
{"progress":[["Label",7,10,"tone"]]}              max defaults to 100
{"diff":{"before":{"k":1},"after":{"k":2}},"good":"down"}
{"chart":"bar|hbar|stacked|line|area|pie|doughnut|radar","x":["a","b"],"y":{"Series":[1,2]}}   y may be a plain array
{"flow":"flowchart LR\n A-->B"}                   any Mermaid diagram
{"table":[["H1","H2"],["a",1]],"total":true}      or [{"H1":"a","H2":1}]; numbers stay numbers
{"timeline":[["Oct 6","Text","good"]]}
{"code":"source","lang":"diff"}
{"copy":"text to paste","text":"explanation"}
{"risk":[["Text","high|med|low"]]}
{"todo":["open item",["done item",true]]}
{"review":[["id","Item to approve or reject"]]}
{"ask":[{"id":"q1","q":"Question?","opt":["A","B"],"multi":false},{"id":"q2","q":"Free text?"}]}
{"faq":[["Question","Answer"]]}
{"img":{"before":"a.png","after":"b.png"},"labels":["Before","After"],"cap":"Caption"}   or "img":"url"
{"sources":[["What","cmd|file|link|db","command, path or URL"]]}
{"tabs":{"Tab A":[blocks],"Tab B":[blocks]}}
{"cols":[block,block]}
{"details":"Summary","blocks":[blocks]}
```

## Rules

- Every number comes from a real source (command output, file, query). Cite it with `src` or `sources`.
- Lead with `kpi` and a one-line `sum`; put details later.
- Ask the reader with `ask` / `review` instead of guessing. Give every `ask` question and `review` item a stable `id`.
- Chart series must have the same length as `x`. Table rows must have the same length as the header.
- After writing, run `npx --yes github:omert11/report-kit report.html` and fix every reported problem.
- The reader replies by pasting a "my responses" Markdown block. Answer by appending the next version.
