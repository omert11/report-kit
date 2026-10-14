/*! report-kit v0.3.0 | MIT | https://github.com/omert11/report-kit
 *  JSON -> single-file interactive report with versions.
 *  Browser: renders <script type="application/json" class="rk-v"> versions. All text via textContent (no raw HTML).
 *  Node:    require("report-kit").validate(rawVersions) -> string[] problems (used by bin/rk-check.js). */
(() => {
  "use strict";

  const VERSION = "0.3.0";

  // ---------- schema (shared by browser + node validator) ----------
  const isStr = (v) => typeof v === "string";
  const isArr = Array.isArray;
  const isObj = (v) => !!v && typeof v === "object" && !isArr(v);
  const arr = (v) => (isArr(v) ? v : [v]);
  const rows = (v, min) => isArr(v) && v.every((r) => isArr(r) && r.length >= min);
  const list = (v) => isArr(v) && v.every((r) => isStr(r) || isArr(r) || isObj(r));
  const CHARTS = ["bar", "hbar", "stacked", "line", "area", "pie", "doughnut", "radar"];

  // table accepts [[header...], [row...]] or [{col: value}, ...] (columns = union of keys, in order seen)
  function tableRows(v) {
    if (isArr(v) && v.length && v.every(isObj)) {
      const cols = [...new Set(v.flatMap(Object.keys))];
      return [cols, ...v.map((o) => cols.map((c) => o[c] ?? ""))];
    }
    return rows(v, 1) && v.length ? v : null;
  }

  const SCHEMA = {
    h: (b) => isStr(b.h) || "h must be a string",
    p: (b) => isStr(b.p) || "p must be a string",
    callout: (b) => isStr(b.callout) || "callout must be a string",
    kpi: (b) => rows(b.kpi, 2) || "kpi must be [[label, value, tone?, sub?, icon?], ...]",
    progress: (b) => (rows(b.progress, 2) && b.progress.every((r) => typeof r[1] === "number")) || "progress must be [[label, number, max?, tone?], ...]",
    diff: (b) => (isObj(b.diff) && isObj(b.diff.before) && isObj(b.diff.after)) || "diff needs {before:{}, after:{}}",
    chart: (b) => {
      if (!CHARTS.includes(b.chart)) return "chart type must be " + CHARTS.join("|");
      if (!isArr(b.x)) return "chart needs x labels array";
      const s = isArr(b.y) ? { y: b.y } : b.y;
      if (!isObj(s)) return "chart y must be [...] or {series:[...]}";
      for (const k in s) if (!isArr(s[k]) || s[k].length !== b.x.length) return `y.${k} length ≠ x length (${b.x.length})`;
      return true;
    },
    flow: (b) => isStr(b.flow) || "flow must be mermaid source",
    table: (b) => {
      const t = tableRows(b.table);
      return (!!t && t.every((r) => r.length === t[0].length)) || "table must be [[header...], [row...]] or [{col: value}, ...] with equal row lengths";
    },
    timeline: (b) => rows(b.timeline, 2) || "timeline must be [[when, text, tone?], ...]",
    code: (b) => isStr(b.code) || "code must be a string",
    copy: (b) => isStr(b.copy) || "copy must be a string",
    risk: (b) => list(b.risk) || "risk must be [[text, level], ...]",
    todo: (b) => list(b.todo) || "todo must be [text | [text, done], ...]",
    review: (b) => list(b.review) || "review must be [text | [id, text], ...]",
    faq: (b) => rows(b.faq, 2) || "faq must be [[question, answer], ...]",
    ask: (b) => (isArr(b.ask) && b.ask.every((q) => isObj(q) && isStr(q.q))) || "ask must be [{q, id?, opt?, multi?}, ...]",
    img: (b) => isStr(b.img) || (isObj(b.img) && isStr(b.img.before) && isStr(b.img.after)) || "img must be url or {before, after}",
    sources: (b) => rows(b.sources, 1) || "sources must be [[text, kind?, ref?], ...]",
    tabs: (b) => isObj(b.tabs) || "tabs must be {name: [blocks]}",
    cols: (b) => isArr(b.cols) || "cols must be [blocks]",
    details: (b) => (isStr(b.details) && isArr(b.blocks)) || "details needs summary string + blocks"
  };
  const TYPES = Object.keys(SCHEMA);
  const typeOf = (b) => Object.keys(b).find((k) => TYPES.includes(k));

  function validate(raws) {
    const errs = [], seen = [];
    raws.forEach((raw, vi) => {
      const V = "v" + ((raw && raw.v) || vi + 1);
      if (!raw || raw.__error) { errs.push(`${V}: JSON parse error — ${raw && raw.__error}`); seen.push(new Set()); return; }
      if (vi === 0 && !raw.title) errs.push(`${V}: title missing`);
      if (!isArr(raw.blocks)) { errs.push(`${V}: blocks must be an array`); seen.push(new Set()); return; }
      const ids = new Set();
      const walk = (bs, path) => bs.forEach((b, i) => {
        const P = `${V} ${path}[${i}]`;
        if (!isObj(b)) { errs.push(`${P}: block must be an object`); return; }
        if (b.ref) {
          if (!seen.some((s) => s.has(b.ref))) errs.push(`${P}: ref "${b.ref}" not found in earlier versions`);
          ids.add(b.ref);
          return;
        }
        const t = typeOf(b);
        if (!t) { errs.push(`${P}: unknown block ${JSON.stringify(Object.keys(b))}`); return; }
        const r = SCHEMA[t](b);
        if (r !== true) errs.push(`${P} ${t}: ${r}`);
        if (b.id) { if (ids.has(b.id)) errs.push(`${P}: duplicate id "${b.id}"`); ids.add(b.id); }
        if (t === "cols" && isArr(b.cols)) walk(b.cols, `${path}[${i}].cols`);
        if (t === "details" && isArr(b.blocks)) walk(b.blocks, `${path}[${i}].blocks`);
        if (t === "tabs" && isObj(b.tabs)) Object.entries(b.tabs).forEach(([k, bs]) => walk(arr(bs), `${path}[${i}].tabs.${k}`));
      });
      walk(raw.blocks, "blocks");
      seen.push(ids);
    });
    return errs;
  }

  if (typeof document === "undefined") {
    module.exports = { validate, SCHEMA, tableRows, VERSION };
    return;
  }

  // ---------- i18n ----------
  const I18N = {
    en: {
      before: "Before", after: "After", change: "Change", value: "Value", total: "Total", metric: "Metric", note: "Note",
      searchTable: "Search table…", searchFaq: "Search questions…", copy: "Copy", copied: "Copied",
      copiedPaste: "Copied — paste it into your AI chat", downloaded: "Downloaded: ",
      csv: "Download as CSV", excel: "Copy for Excel", excelTitle: "Copy as tab-separated values", copiedExcel: "Copied — paste into Excel / Sheets",
      data: "Data", dataTitle: "Show data as a table",
      decisions: "Decisions", review: "Approve / reject", approved: "Approved", rejected: "Rejected", todoChanged: "To-dos (changed by me)",
      notes: "Section notes / questions", general: "General", report: "Report", myAnswers: "my responses",
      copyAnswers: "Copy responses", clearConfirm: "Delete all responses, notes and checks for this report?", clear: "Clear responses",
      q: "Q", a: "A", why: "Reason / note (optional)", approve: "Approve", reject: "Reject", answer: "Your answer…",
      slider: "Before / after comparison", notePh: "Your note or question about this section…", noteAdd: "Add note / question", noteLabel: "Note / question",
      source: "Source: ", askTitle: "General note / question", askPh: "A question or request about the whole report…",
      askHint: "Decisions, approvals, notes and this question are copied together by the single button at the bottom right. Paste them into your AI chat; it writes the next version.",
      jsonError: "JSON error", refMissing: "ref not found: ",
      cmp: (a, b, n, c, r) => `**v${a} → v${b}:** ${n} new, ${c} changed, ${r} removed blocks.`, removed: "Removed: ", changedMetrics: "Changed metrics",
      toc: "Contents", version: "Version", compare: "Compare", latest: "latest", mdTitle: "Copy report as Markdown", jsonTitle: "Copy this version's JSON",
      print: "Print / PDF", theme: "Theme: ", auto: "Auto", light: "Light", dark: "Dark",
      untitled: "Report", problems: (n) => `**Validation:** ${n} problem(s) found`,
      old: (v, l) => `Viewing an older version (v${v}). Latest: v${l}.`, toLatest: "Go to latest", inVersion: "In this version:",
      flagNew: "new", flagChg: "changed", table: "table", chart: "chart", diff: "diff"
    },
    tr: {
      before: "Önce", after: "Sonra", change: "Değişim", value: "Değer", total: "Toplam", metric: "Metrik", note: "Not",
      searchTable: "Tabloda ara…", searchFaq: "Sorularda ara…", copy: "Kopyala", copied: "Kopyalandı",
      copiedPaste: "Kopyalandı, AI sohbetine yapıştır", downloaded: "İndirildi: ",
      csv: "CSV olarak indir", excel: "Excel'e kopyala", excelTitle: "Sekmeyle ayrılmış kopyala", copiedExcel: "Kopyalandı, Excel / Sheets'e yapıştır",
      data: "Veri", dataTitle: "Veriyi tablo olarak göster",
      decisions: "Kararlar", review: "Onay / ret", approved: "Onay", rejected: "Ret", todoChanged: "Yapılacaklar (değiştirdiklerim)",
      notes: "Bölüm notları / soruları", general: "Genel", report: "Rapor", myAnswers: "yanıtlarım",
      copyAnswers: "Yanıtları kopyala", clearConfirm: "Bu rapordaki tüm yanıtlar, notlar ve işaretler silinsin mi?", clear: "Yanıtları temizle",
      q: "S", a: "C", why: "Gerekçe / not (isteğe bağlı)", approve: "Onayla", reject: "Reddet", answer: "Cevabın…",
      slider: "Önce / sonra karşılaştırma", notePh: "Bu bölümle ilgili notun ya da sorun…", noteAdd: "Not / soru ekle", noteLabel: "Not / soru",
      source: "Kaynak: ", askTitle: "Genel not / soru", askPh: "Rapor geneliyle ilgili sorun, isteğin…",
      askHint: "Kararların, onayların, notların ve bu soru sağ alttaki tek butonla birlikte kopyalanır; AI sohbetine yapıştır, yeni sürümü o yazar.",
      jsonError: "JSON hatası", refMissing: "ref bulunamadı: ",
      cmp: (a, b, n, c, r) => `**v${a} → v${b}:** ${n} yeni, ${c} değişen, ${r} kaldırılan blok.`, removed: "Kaldırılan: ", changedMetrics: "Değişen metrikler",
      toc: "İçindekiler", version: "Sürüm", compare: "Karşılaştır", latest: "güncel", mdTitle: "Raporu Markdown olarak kopyala", jsonTitle: "Bu sürümün JSON'unu kopyala",
      print: "Yazdır / PDF", theme: "Tema: ", auto: "Otomatik", light: "Açık", dark: "Koyu",
      untitled: "Rapor", problems: (n) => `**Doğrulama:** ${n} sorun bulundu`,
      old: (v, l) => `Eski sürüm görüntüleniyor (v${v}). Güncel sürüm: v${l}.`, toLatest: "Güncel sürüme git", inVersion: "Bu sürümde:",
      flagNew: "yeni", flagChg: "değişti", table: "tablo", chart: "grafik", diff: "fark"
    }
  };
  let L = I18N.en, LOCALE = "en-US", LANG = "en";

  // ---------- browser ----------
  const CDN = {
    chart: "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.js",
    mermaid: "https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js",
    lucide: "https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js"
  };
  const PALETTE = ["#4f7cff", "#22b07d", "#f2a33a", "#e5484d", "#8e6cf0", "#14a3b8", "#d6609e"];
  const TONES = new Set(["good", "bad", "warn", "info"]);
  const STATUS = {
    good: /^(ok|done|pass|passed|active|live|tamam|bitti|aktif|geçti|✓)$/i,
    warn: /^(pending|wip|partial|warning|bekliyor|devam|kısmi|uyarı)$/i,
    bad: /^(error|fail|failed|broken|down|hata|kırık|durdu|yok|✗)$/i
  };
  const LEVEL = { high: "bad", yüksek: "bad", med: "warn", medium: "warn", orta: "warn", low: "info", düşük: "info" };
  const ICON = {
    diff: "git-compare", chart: "chart-column", flow: "workflow", table: "table", timeline: "clock",
    code: "code", risk: "triangle-alert", todo: "list-checks", progress: "loader", copy: "clipboard",
    faq: "messages-square", ask: "circle-help", review: "list-todo", img: "image", sources: "book-open",
    callout: { good: "circle-check", bad: "circle-x", warn: "triangle-alert", info: "info" }
  };
  const SRC_ICON = { cmd: "terminal", file: "file", link: "link", db: "database" };

  const DARK = "--bg:#0e1116;--card:#161b22;--fg:#e6edf3;--mut:#8b949e;--line:#2a313c;--good:#3fb950;--bad:#f85149;--warn:#d29922;--info:#58a6ff;--code:#1f2630";
  const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--fg:#1b1f24;--mut:#667085;--line:#e4e7ec;--good:#16a34a;--bad:#dc2626;--warn:#d97706;--info:#2563eb;--code:#f2f4f7}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){${DARK}}}
:root[data-theme=dark]{${DARK}}
*{box-sizing:border-box}.rk-root [hidden]{display:none!important}html{scroll-padding-top:64px}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.rk{max-width:1120px;margin:0 auto;padding:24px 16px 96px}
.rk-root svg.lucide{width:16px;height:16px;flex:none}
.rk-tools{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 85%,transparent);backdrop-filter:blur(8px);border-bottom:1px solid var(--line)}
.rk-tools-in{max-width:1120px;margin:0 auto;padding:8px 16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-size:13px}
.rk-tools-in>label{display:inline-flex;gap:6px;align-items:center;color:var(--mut)}.rk-sp{flex:1}
.rk-btn{display:inline-flex;align-items:center;gap:6px;font:inherit;font-size:13px;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:5px 10px;cursor:pointer}
.rk-btn:hover{border-color:var(--mut)}.rk-btn.primary{background:var(--info);border-color:var(--info);color:#fff}.rk-btn.on{border-color:var(--info);color:var(--info)}
.rk-in{font:inherit;font-size:14px;color:var(--fg);background:var(--card);border:1px solid var(--line);border-radius:8px;padding:6px 10px;width:100%}
.rk-sel{width:auto;max-width:100%;font-size:13px;padding:5px 8px}
.rk-menu{position:relative}.rk-menu>summary{list-style:none}.rk-menu>summary::-webkit-details-marker{display:none}
.rk-menu>nav{position:absolute;top:calc(100% + 6px);left:0;min-width:220px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.12)}
.rk-toc a{display:block;padding:5px 10px;border-radius:6px;color:var(--mut);text-decoration:none;font-size:13px}.rk-toc a:hover{color:var(--fg);background:var(--code)}
.rk-toc a.on{color:var(--info);font-weight:600}
.rk-side{display:none}
@media (min-width:1500px){.rk-side{display:block;position:fixed;top:72px;left:calc(50% - 560px - 200px);width:184px}.rk-side .rk-toc{border-left:2px solid var(--line)}.rk-menu.toc{display:none}}
.rk-head h1{font-size:28px;margin:8px 0 6px}.rk-sum{font-size:17px;color:var(--mut);margin:0 0 12px}
.rk-meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}.rk-meta span{font-size:12px;padding:3px 10px;border:1px solid var(--line);border-radius:99px;color:var(--mut)}
.rk-h{font-size:19px;margin:32px 0 12px;display:flex;align-items:center;gap:8px}
.rk-card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-bottom:16px;min-width:0}
.rk-card>h3{margin:0 0 12px;padding-right:40px;font-size:14px;font-weight:600;color:var(--mut);display:flex;align-items:center;gap:6px;text-transform:uppercase;letter-spacing:.04em}
.rk-act{position:absolute;top:10px;right:10px;opacity:0;transition:opacity .15s}.rk-act .rk-btn{padding:4px 6px}.rk-act .rk-btn.has{color:var(--info);border-color:var(--info)}
.rk-card:hover>.rk-act,.rk-act:focus-within,.rk-act:has(.has){opacity:1}@media (hover:none){.rk-act{opacity:1}}
.rk-note{margin-top:12px;border-top:1px dashed var(--line);padding-top:12px}.rk-note label{font-size:12px;color:var(--mut);display:block;margin-bottom:4px}
.rk-src{margin-top:10px;font-size:12px;color:var(--mut);display:flex;gap:6px;align-items:flex-start}.rk-src svg.lucide{width:13px;height:13px;margin-top:2px}
.rk-tbar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}.rk-tbar .rk-search{flex:1;max-width:280px;margin:0}.rk-tbar .end{margin-left:auto;display:flex;gap:6px}
.rk-tbar .rk-btn{padding:3px 8px;font-size:12px}.rk-tbar svg.lucide{width:14px;height:14px}
.rk-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));margin-bottom:16px}.rk-grid>.rk-card{margin:0}
.rk-cols{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));margin-bottom:16px}.rk-cols>*{margin-bottom:0}
.rk-kpi .v{font-size:28px;font-weight:700;line-height:1.1}.rk-kpi .l{font-size:13px;color:var(--mut);display:flex;gap:6px;align-items:center}.rk-kpi .s{font-size:12px;color:var(--mut);margin-top:4px}
.t-good{color:var(--good)}.t-bad{color:var(--bad)}.t-warn{color:var(--warn)}.t-info{color:var(--info)}
.rk-kpi.t-good,.rk-kpi.t-bad,.rk-kpi.t-warn,.rk-kpi.t-info{color:inherit}
.rk-kpi.t-good{border-top:3px solid var(--good)}.rk-kpi.t-bad{border-top:3px solid var(--bad)}.rk-kpi.t-warn{border-top:3px solid var(--warn)}.rk-kpi.t-info{border-top:3px solid var(--info)}
.rk-badge{display:inline-block;font-size:12px;font-weight:600;padding:1px 9px;border-radius:99px;background:color-mix(in srgb,currentColor 14%,transparent);white-space:nowrap}
.rk table{width:100%;border-collapse:collapse;font-size:14px}.rk th,.rk td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.rk th{color:var(--mut);font-weight:600;font-size:12px;text-transform:uppercase;white-space:nowrap}.rk td.n{text-align:right;font-variant-numeric:tabular-nums}
.rk tfoot td{font-weight:700;border-top:2px solid var(--line);border-bottom:0}
.rk th.sort{cursor:pointer;user-select:none}.rk th.sort:hover{color:var(--fg)}.rk th[data-dir=asc]:after{content:" ▲"}.rk th[data-dir=desc]:after{content:" ▼"}
.rk-scroll{overflow-x:auto}.rk-search{margin-bottom:10px;max-width:280px}.rk-chart+.rk-scroll{margin-top:14px}
.rk-bar{height:8px;border-radius:99px;background:var(--line);overflow:hidden}.rk-bar>i{display:block;height:100%;border-radius:99px;background:var(--info)}
.rk-diffbars{display:grid;gap:3px;min-width:120px}.rk-diffbars .rk-bar>i.b{background:var(--mut)}
.rk-prog{display:grid;gap:12px}.rk-prog .row{display:grid;grid-template-columns:minmax(90px,1fr) 3fr auto;gap:12px;align-items:center;font-size:14px}
.rk-callout{display:flex;gap:10px;align-items:flex-start;border-left:4px solid currentColor;padding:12px 16px;border-radius:8px;margin-bottom:16px;background:color-mix(in srgb,currentColor 9%,var(--card))}
.rk-callout>div{color:var(--fg);flex:1;min-width:0}.rk-callout p{margin:0}.rk-callout ul{margin:6px 0 0;padding-left:18px;font:13px ui-monospace,monospace}.rk-callout svg.lucide{margin-top:3px}.rk-callout .rk-btn{margin-top:8px}
.rk-list{list-style:none;margin:0;padding:0;display:grid;gap:8px}.rk-list li{display:flex;gap:10px;align-items:flex-start}
.rk-list li.done span{text-decoration:line-through;color:var(--mut)}
.rk-chk{display:flex;gap:10px;align-items:flex-start;cursor:pointer}.rk-chk input{margin-top:4px;accent-color:var(--good)}
.rk-dot{width:10px;height:10px;border-radius:50%;background:currentColor;flex:none;margin-top:7px}
.rk-tl{position:relative;margin:0;padding:0 0 0 22px;list-style:none}.rk-tl:before{content:'';position:absolute;left:4px;top:6px;bottom:6px;width:2px;background:var(--line)}
.rk-tl li{position:relative;margin-bottom:14px}.rk-tl li .rk-dot{position:absolute;left:-22px;top:0;outline:3px solid var(--card)}.rk-tl .w{font-size:12px;color:var(--mut)}
.rk-pre{position:relative}.rk-pre>.rk-btn{position:absolute;top:8px;right:8px;padding:4px 6px}
.rk pre{margin:0;background:var(--code);border-radius:8px;padding:12px 44px 12px 12px;overflow-x:auto;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace}
.rk pre.wrap{white-space:pre-wrap;overflow-wrap:anywhere}
.rk pre .add{color:var(--good);display:block}.rk pre .del{color:var(--bad);display:block}.rk pre .hunk{color:var(--info);display:block}
.rk code{font:.9em ui-monospace,Menlo,monospace;background:var(--code);padding:1px 5px;border-radius:4px}
.rk a{color:var(--info)}
.rk-chart{position:relative;height:var(--h,280px)}
.rk-flow{overflow-x:auto;text-align:center}
.rk details>summary{cursor:pointer;font-weight:600}.rk details[open]>summary{margin-bottom:12px}
.rk-faq{display:grid;gap:8px}.rk-faq details{border:1px solid var(--line);border-radius:8px;padding:10px 14px}.rk-faq details p{margin:0}
.rk-faq details[open]>summary{margin-bottom:8px}
.rk-ask{display:grid;gap:14px}.rk-q{border:0;margin:0;padding:0;display:grid;gap:6px}.rk-q legend{font-weight:600;margin-bottom:6px;padding:0}
.rk-opts{display:flex;flex-wrap:wrap;gap:8px}
.rk-opt{display:inline-flex;gap:6px;align-items:center;border:1px solid var(--line);border-radius:8px;padding:5px 12px;cursor:pointer;font-size:14px}
.rk-opt:has(input:checked){border-color:var(--info);background:color-mix(in srgb,var(--info) 10%,var(--card))}.rk-opt input{accent-color:var(--info)}
.rk-rev{gap:0}.rk-rev li{display:grid;grid-template-columns:1fr auto;gap:8px 12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line)}.rk-rev li:last-child{border-bottom:0}
.rk-rev li[data-v=ok] .t{color:var(--good)}.rk-rev li[data-v=no] .t{color:var(--bad);text-decoration:line-through}
.rk-rev-act{display:flex;gap:6px}.rk-rev .rk-btn.ok.on{background:var(--good);border-color:var(--good);color:#fff}.rk-rev .rk-btn.no.on{background:var(--bad);border-color:var(--bad);color:#fff}
.rk-why{grid-column:1/-1}
.rk-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:16px;overflow-x:auto}
.rk-tabs .rk-btn{border:0;border-bottom:2px solid transparent;border-radius:0;background:none;color:var(--mut);padding:8px 12px}
.rk-tabs .rk-btn.on{color:var(--fg);border-bottom-color:var(--info)}
.rk-img{display:block;max-width:100%;border-radius:8px}.rk-cap{font-size:13px;color:var(--mut);margin-top:8px}
.rk-ba{position:relative;overflow:hidden;border-radius:8px;user-select:none}.rk-ba img{display:block;width:100%}
.rk-ba img.before{position:absolute;inset:0;height:100%;object-fit:cover}
.rk-ba-line{position:absolute;top:0;bottom:0;width:3px;margin-left:-1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.25);pointer-events:none}
.rk-ba-l{position:absolute;top:10px;font-size:12px;font-weight:600;padding:2px 10px;border-radius:99px;background:rgba(0,0,0,.6);color:#fff;pointer-events:none}.rk-ba-l.l{left:10px}.rk-ba-l.r{right:10px}
.rk-ba input{position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:ew-resize}
.rk-srcs svg.lucide{margin-top:3px;color:var(--mut)}.rk-src-ref{font-size:13px;margin-top:2px;overflow-wrap:anywhere}
.rk-askbox{border-style:dashed}.rk-askbox p{margin:0 0 10px;font-size:13px;color:var(--mut)}
.rk-new,.rk-chg{position:relative;outline:2px dashed;outline-offset:4px;border-radius:12px}.rk-new{outline-color:var(--good)}.rk-chg{outline-color:var(--warn)}
.rk-flag{position:absolute;top:-12px;left:12px;z-index:1;font-size:11px;font-weight:700;padding:1px 8px;border-radius:99px;background:var(--card);border:1px solid currentColor}
.rk-err{color:var(--bad);border:1px dashed var(--bad);border-radius:8px;padding:10px;margin-bottom:16px;font:13px ui-monospace,monospace}
.rk-fab{position:fixed;right:20px;bottom:20px;z-index:15;display:flex;gap:6px;align-items:center}
.rk-fab .primary{padding:10px 16px;font-size:14px;border-radius:99px;box-shadow:0 6px 20px rgba(37,99,235,.35)}
.rk-fab .n{background:#fff;color:var(--info);border-radius:99px;padding:0 7px;font-size:12px;font-weight:700}
.rk-fab .clr{border-radius:99px;padding:8px}
.rk-toast{position:fixed;left:50%;bottom:24px;transform:translate(-50%,20px);opacity:0;pointer-events:none;background:var(--fg);color:var(--bg);padding:8px 16px;border-radius:8px;font:14px system-ui,sans-serif;transition:.2s;z-index:20}
.rk-toast.on{opacity:1;transform:translate(-50%,0)}
@media print{.rk-tools,.rk-side,.rk-act,.rk-askbox,.rk-fab,.rk-tbar,.rk-pre>.rk-btn,.rk-note:not(.has){display:none!important}body{background:#fff}.rk-card{break-inside:avoid}}
`;

  // ---------- state ----------
  const S = { raws: [], versions: [], problems: [], idx: 0, cmp: -1, charts: [], pending: [], store: {}, key: "", root: null, ui: {}, spy: null };

  // ---------- helpers ----------
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  };
  const icon = (name) => { const i = el("i"); i.setAttribute("data-lucide", name); return i; };
  const tone = (t) => (TONES.has(t) ? "t-" + t : "");
  const fmt = (n) => (typeof n === "number" ? n.toLocaleString(LOCALE) : n);
  const lower = (s) => String(s).toLocaleLowerCase(LANG);
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const label = (b) => b.title || b.h || b.details || typeOf(b);
  const noteKey = (b) => b.id || typeOf(b) + ":" + label(b);
  const itemOf = (it) => (isStr(it) ? [it, it] : isArr(it) ? [it[0], it[1] ?? it[0]] : [it.id || it.text, it.text]);
  const safeUrl = (u) => (/^\s*(javascript|vbscript|data:(?!image\/))/i.test(u) ? "" : u);
  const refreshIcons = () => window.lucide && window.lucide.createIcons();
  const spec = () => S.versions[S.idx];
  const vLabel = (v) => `v${v.v}${v.date ? ", " + v.date : ""}`;
  function chartRows(b) {
    const s = isArr(b.y) ? { [L.value]: b.y } : b.y;
    return [["", ...Object.keys(s)], ...b.x.map((x, i) => [x, ...Object.values(s).map((v) => v[i])])];
  }

  function walkAll(bs, out = []) {
    arr(bs).forEach((b) => {
      if (!isObj(b)) return;
      out.push(b);
      if (b.cols) walkAll(b.cols, out);
      if (b.details && b.blocks) walkAll(b.blocks, out);
      if (b.tabs) Object.values(b.tabs).forEach((x) => walkAll(x, out));
    });
    return out;
  }

  // inline: **bold**, `code`, [text](https://url) -> DOM nodes, never innerHTML
  function inline(text) {
    const f = document.createDocumentFragment();
    String(text).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/).forEach((p) => {
      if (!p) return;
      if (p.startsWith("**")) f.appendChild(el("strong", null, p.slice(2, -2)));
      else if (p[0] === "`") f.appendChild(el("code", null, p.slice(1, -1)));
      else if (p[0] === "[" && p.endsWith(")")) f.appendChild(link(...p.match(/^\[([^\]]+)\]\((.+)\)$/).slice(1)));
      else f.appendChild(document.createTextNode(p));
    });
    return f;
  }
  function link(text, href) {
    const a = el("a", null, text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }
  const badge = (text, t) => el("span", "rk-badge " + tone(t), text);
  function autoStatus(v) {
    for (const k in STATUS) if (STATUS[k].test(String(v).trim())) return k;
    return null;
  }
  function btn(ic, text, fn, title) {
    const b = el("button", "rk-btn");
    b.type = "button";
    if (ic) b.appendChild(icon(ic));
    if (text) b.appendChild(document.createTextNode(text));
    if (title) { b.title = title; b.setAttribute("aria-label", title); }
    b.addEventListener("click", fn);
    return b;
  }
  function card(b, type) {
    const c = el("section", "rk-card");
    if (b.title) {
      const h = el("h3"), ic = b.icon || ICON[type];
      if (isStr(ic)) h.appendChild(icon(ic));
      h.appendChild(document.createTextNode(b.title));
      c.appendChild(h);
    }
    return c;
  }
  const scripts = {};
  function loadScript(url) {
    return (scripts[url] ||= new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = ok;
      s.onerror = () => fail(new Error("load failed: " + url));
      document.head.appendChild(s);
    }));
  }

  // ---------- clipboard / download / toast / storage ----------
  function toast(msg) {
    let t = document.querySelector(".rk-toast");
    if (!t) { t = el("div", "rk-toast"); t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add("on");
    clearTimeout(toast.h);
    toast.h = setTimeout(() => t.classList.remove("on"), 1800);
  }
  function copyText(text, msg) {
    const done = () => toast(msg || L.copied);
    const fallback = () => {
      const a = el("textarea");
      a.value = text;
      a.style.cssText = "position:fixed;opacity:0";
      document.body.appendChild(a);
      a.select();
      document.execCommand("copy");
      a.remove();
      done();
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }
  function download(name, text, type) {
    const a = el("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(L.downloaded + name);
  }
  const slug = (s) => lower(s || L.table).replace(/ı/g, "i").normalize("NFD")
    .replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "table";
  // CSV: ";" separator + UTF-8 BOM so locales with decimal comma (e.g. tr, de) open it in Excel columns; Sheets auto-detects
  const csvCell = (x) => { const s = String(x ?? ""); return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCSV = (rs) => "﻿" + rs.map((r) => r.map(csvCell).join(";")).join("\r\n");
  const toTSV = (rs) => rs.map((r) => r.map((x) => String(x ?? "").replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
  // data export buttons for table-like blocks; getRows returns the current view incl. header
  function dataTools(name, getRows, extra) {
    const w = el("div", "rk-tbar"), end = el("div", "end");
    if (extra) end.appendChild(extra);
    end.append(
      btn("download", "CSV", () => download(slug(name) + ".csv", toCSV(getRows()), "text/csv;charset=utf-8"), L.csv),
      btn("sheet", L.excel, () => copyText(toTSV(getRows()), L.copiedExcel), L.excelTitle)
    );
    w.appendChild(end);
    return w;
  }
  const store = {
    load(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } },
    save() {
      try { localStorage.setItem(S.key, JSON.stringify(S.store)); } catch { /* storage unavailable: responses live for this page view only */ }
      if (S.ui.refresh) S.ui.refresh();
    }
  };
  function getTheme() { try { return localStorage.getItem("rk:theme") || "auto"; } catch { return "auto"; } }
  function setTheme(t) {
    try { localStorage.setItem("rk:theme", t); } catch { /* storage unavailable */ }
    applyTheme(t);
  }
  function applyTheme(t) {
    if (t === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
  }
  function isDark() {
    const t = document.documentElement.dataset.theme;
    return t ? t === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  }

  // ---------- reader responses: one copy button collects everything ----------
  function fmtAns(v) { return isArr(v) ? v.join(", ") : String(v ?? "").trim(); }
  function collect() {
    const st = S.store, all = walkAll(spec().blocks), secs = [];
    let count = 0;
    const sec = (title, lines) => { if (lines.length) { secs.push(`## ${title}\n${lines.join("\n")}`); count += lines.length; } };
    sec(L.decisions, all.filter((b) => b.ask).flatMap((b) => b.ask
      .map((q) => [q.q, fmtAns((st.ask || {})[q.id || q.q])])
      .filter(([, a]) => a)
      .map(([q, a]) => `- ${q} → ${a}`)));
    sec(L.review, all.filter((b) => b.review).flatMap((b) => b.review.map(itemOf)
      .filter(([k]) => (st.review || {})[k]?.v)
      .map(([k, t]) => { const r = st.review[k]; return `- ${r.v === "ok" ? "✓ " + L.approved : "✗ " + L.rejected}: ${t}${(r.why || "").trim() ? " — " + r.why.trim() : ""}`; })));
    sec(L.todoChanged, all.filter((b) => b.todo).flatMap((b) => b.todo.map(arr)
      .filter((r) => r[0] in (st.todo || {}) && st.todo[r[0]] !== !!r[1])
      .map((r) => `- [${st.todo[r[0]] ? "x" : " "}] ${r[0]}`)));
    sec(L.notes, Object.entries(st.notes || {})
      .filter(([, v]) => v.trim())
      .map(([k, v]) => `- [${k.includes(":") ? k.split(":").slice(1).join(":") : k}] ${v.trim()}`));
    if ((st.q || "").trim()) sec(L.general, [st.q.trim()]);
    const s = spec();
    return { count, text: `${L.report}: ${s.title} (${vLabel(s)}) — ${L.myAnswers}\n\n${secs.join("\n\n")}` };
  }
  function fab() {
    const w = el("div", "rk-fab"), n = el("span", "n");
    const go = btn("clipboard-copy", L.copyAnswers, () => copyText(collect().text, L.copiedPaste));
    go.classList.add("primary");
    go.appendChild(n);
    const clr = btn("trash-2", null, () => {
      if (!confirm(L.clearConfirm)) return;
      S.store = {};
      store.save();
      mount();
    }, L.clear);
    clr.classList.add("clr");
    w.append(clr, go);
    S.ui.refresh = () => {
      const { count } = collect();
      w.hidden = !count;
      n.textContent = count;
    };
    return w;
  }

  // ---------- markdown export ----------
  function mdTable(rs) {
    const cell = (x) => String(x ?? "").replace(/\|/g, "\\|");
    return rs.map((r, i) => "| " + r.map(cell).join(" | ") + " |" + (i === 0 ? "\n|" + r.map(() => " --- |").join("") : "")).join("\n");
  }
  function diffRows(b) {
    const bf = b.diff.before, af = b.diff.after, lb = b.labels || [L.before, L.after];
    return [["", ...lb, L.change, "%"], ...Object.keys({ ...bf, ...af }).map((k) => {
      const a = bf[k], z = af[k], num = typeof a === "number" && typeof z === "number";
      return [k, a ?? "", z ?? "", num ? z - a : "", num && a ? Math.round(((z - a) / a) * 100) : ""];
    })];
  }
  function md(b) {
    const t = typeOf(b), T = b.title ? `### ${b.title}\n\n` : "", st = S.store;
    switch (t) {
      case "h": return `## ${b.h}`;
      case "p": return b.p;
      case "callout": return `> ${b.callout}`;
      case "kpi": return mdTable([[L.metric, L.value, L.note], ...b.kpi.map((k) => [k[0], k[1], k[3]])]);
      case "progress": return T + b.progress.map((r) => `- ${r[0]}: ${r[1]}/${r[2] || 100}`).join("\n");
      case "diff": return T + mdTable(diffRows(b));
      case "chart": return T + mdTable(chartRows(b));
      case "flow": return T + "```mermaid\n" + b.flow + "\n```";
      case "table": return T + mdTable(tableRows(b.table));
      case "timeline": return T + b.timeline.map((r) => `- **${r[0]}** — ${r[1]}`).join("\n");
      case "code": return T + "```" + (b.lang || "") + "\n" + b.code + "\n```";
      case "copy": return T + "```" + (b.lang || "") + "\n" + b.copy + "\n```";
      case "risk": return T + b.risk.map((r) => { r = arr(r); return `- [${r[1] || "med"}] ${r[0]}`; }).join("\n");
      case "todo": return T + b.todo.map((r) => { r = arr(r); const done = r[0] in (st.todo || {}) ? st.todo[r[0]] : !!r[1]; return `- [${done ? "x" : " "}] ${r[0]}`; }).join("\n");
      case "review": return T + b.review.map(itemOf).map(([k, x]) => { const v = (st.review || {})[k]?.v; return `- ${v === "ok" ? "✓" : v === "no" ? "✗" : "○"} ${x}`; }).join("\n");
      case "faq": return T + b.faq.map(([q, a]) => `**${L.q}:** ${q}\n**${L.a}:** ${a}`).join("\n\n");
      case "ask": return T + b.ask.map((q) => `- ${q.q}: ${fmtAns((st.ask || {})[q.id || q.q]) || "—"}`).join("\n");
      case "img": return isStr(b.img) ? `![${b.title || ""}](${b.img})` : `![${L.before}](${b.img.before}) ![${L.after}](${b.img.after})`;
      case "sources": return T + b.sources.map((r) => `- ${r[0]}${r[2] ? ` — \`${r[2]}\`` : ""}`).join("\n");
      case "cols": return b.cols.map(md).join("\n\n");
      case "details": return `### ${b.details}\n\n` + b.blocks.map(md).join("\n\n");
      case "tabs": return Object.entries(b.tabs).map(([n, bs]) => `### ${n}\n\n` + arr(bs).map(md).join("\n\n")).join("\n\n");
      default: return "";
    }
  }
  const mdDoc = (s) => [`# ${s.title} (${vLabel(s)})`, s.sum, ...s.blocks.map(md)].filter(Boolean).join("\n\n");

  // ---------- blocks ----------
  function preBox(text, lang, wrap) {
    const w = el("div", "rk-pre"), pre = el("pre", wrap ? "wrap" : null);
    if (lang === "diff") {
      text.split("\n").forEach((ln) => {
        const k = ln[0] === "+" ? "add" : ln[0] === "-" ? "del" : ln.startsWith("@@") ? "hunk" : null;
        pre.appendChild(k ? el("span", k, ln) : document.createTextNode(ln + "\n"));
      });
    } else pre.textContent = text;
    w.append(pre, btn("copy", null, () => copyText(text), L.copy));
    return w;
  }
  function searchBox(placeholder, onInput) {
    const inp = el("input", "rk-in rk-search");
    inp.type = "search";
    inp.placeholder = placeholder;
    inp.addEventListener("input", () => onInput(lower(inp.value)));
    return inp;
  }
  function cellEl(v) {
    const td = el("td", typeof v === "number" ? "n" : null), s = autoStatus(v);
    if (s) td.appendChild(badge(v, s));
    else if (typeof v === "number") td.textContent = fmt(v);
    else td.appendChild(inline(v));
    return td;
  }
  // static table from rows (header first), used by the chart data view
  function plainTable(rs) {
    const wrap = el("div", "rk-scroll"), t = el("table"), htr = el("tr");
    rs[0].forEach((h) => htr.appendChild(el("th", null, h)));
    t.appendChild(htr);
    rs.slice(1).forEach((r) => { const tr = el("tr"); r.forEach((v) => tr.appendChild(cellEl(v))); t.appendChild(tr); });
    wrap.appendChild(t);
    return wrap;
  }

  const R = {
    h(b) {
      const h = el("h2", "rk-h");
      if (b.icon) h.appendChild(icon(b.icon));
      h.appendChild(document.createTextNode(b.h));
      return h;
    },

    p(b) { const p = el("p"); p.appendChild(inline(b.p)); return p; },

    callout(b) {
      const t = TONES.has(b.tone) ? b.tone : "info", c = el("div", "rk-callout " + tone(t)), d = el("div"), p = el("p");
      c.appendChild(icon(b.icon || ICON.callout[t]));
      p.appendChild(inline(b.callout));
      d.appendChild(p);
      if (b.items) { const ul = el("ul"); b.items.forEach((x) => ul.appendChild(el("li", null, x))); d.appendChild(ul); }
      c.appendChild(d);
      return c;
    },

    // kpi: [[label, value, tone?, sub?, icon?], ...]
    kpi(b) {
      const g = el("div", "rk-grid");
      b.kpi.forEach((k) => {
        const c = el("div", "rk-card rk-kpi " + tone(k[2])), l = el("div", "l");
        if (k[4]) l.appendChild(icon(k[4]));
        l.appendChild(document.createTextNode(k[0]));
        c.append(l, el("div", "v " + tone(k[2]), fmt(k[1])));
        if (k[3]) c.appendChild(el("div", "s", k[3]));
        g.appendChild(c);
      });
      return g;
    },

    // progress: [[label, value, max=100, tone?], ...]
    progress(b) {
      const c = card(b, "progress"), w = el("div", "rk-prog");
      b.progress.forEach((r) => {
        const max = r[2] || 100, pct = Math.max(0, Math.min(100, (r[1] / max) * 100));
        const row = el("div", "row"), bar = el("div", "rk-bar"), fill = el("i");
        fill.style.width = pct + "%";
        if (TONES.has(r[3])) fill.style.background = "var(--" + r[3] + ")";
        bar.appendChild(fill);
        row.append(el("span", null, r[0]), bar, el("strong", null, r[2] && r[2] !== 100 ? fmt(r[1]) + "/" + fmt(max) : Math.round(pct) + "%"));
        w.appendChild(row);
      });
      c.appendChild(w);
      return c;
    },

    // diff: {before:{k:n}, after:{k:n}}, good: "down"|"up"|{k:"down"}
    diff(b) {
      const c = card(b, "diff"), wrap = el("div", "rk-scroll"), t = el("table"), head = el("tr");
      c.appendChild(dataTools(b.title || L.diff, () => diffRows(b)));
      ["", ...(b.labels || [L.before, L.after]), L.change, ""].forEach((x) => head.appendChild(el("th", null, x)));
      t.appendChild(head);
      const bef = b.diff.before, aft = b.diff.after;
      Object.keys({ ...bef, ...aft }).forEach((k) => {
        const a = bef[k], z = aft[k], tr = el("tr"), td = el("td", "n"), bars = el("td");
        tr.append(el("td", null, k), el("td", "n", a == null ? "—" : fmt(a)), el("td", "n", z == null ? "—" : fmt(z)));
        if (typeof a === "number" && typeof z === "number") {
          const d = z - a, pct = a ? Math.round((d / a) * 100) : null;
          const want = isObj(b.good) ? b.good[k] : b.good;
          const t2 = !d || !want ? null : (d < 0) === (want === "down") ? "good" : "bad";
          td.appendChild(badge((d > 0 ? "+" : "") + fmt(d) + (pct != null ? " (" + (pct > 0 ? "+" : "") + pct + "%)" : ""), t2));
          const bx = el("div", "rk-diffbars"), m = Math.max(a, z) || 1;
          [[a, "b"], [z, ""]].forEach(([v, cls]) => {
            const bar = el("div", "rk-bar"), f = el("i", cls);
            f.style.width = (v / m) * 100 + "%";
            bar.appendChild(f);
            bx.appendChild(bar);
          });
          bars.appendChild(bx);
        }
        tr.append(td, bars);
        t.appendChild(tr);
      });
      wrap.appendChild(t);
      c.appendChild(wrap);
      return c;
    },

    // chart: bar|hbar|stacked|line|area|pie|doughnut|radar; x: labels; y: {series:[...]} or [...]
    chart(b) {
      const c = card(b, "chart"), box = el("div", "rk-chart"), cv = el("canvas"), data = plainTable(chartRows(b));
      data.hidden = true;
      const tg = btn("table", L.data, () => { data.hidden = !data.hidden; tg.classList.toggle("on", !data.hidden); }, L.dataTitle);
      c.appendChild(dataTools(b.title || L.chart, () => chartRows(b), tg));
      if (b.height) box.style.setProperty("--h", b.height + "px");
      cv.setAttribute("role", "img");
      cv.setAttribute("aria-label", b.title || b.chart + " chart");
      box.appendChild(cv);
      c.append(box, data);
      S.pending.push(loadScript(CDN.chart).then(() => drawChart(cv, b)));
      return c;
    },

    // flow: mermaid source (any diagram type)
    flow(b) {
      const c = card(b, "flow"), d = el("div", "rk-flow");
      d.textContent = b.flow;
      c.appendChild(d);
      S.pending.push(loadScript(CDN.mermaid).then(() => {
        window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme: isDark() ? "dark" : "neutral" });
        const id = "rkm" + Math.random().toString(36).slice(2);
        // mermaid output is sanitized SVG under securityLevel "strict"
        return window.mermaid.render(id, b.flow).then((r) => { d.innerHTML = r.svg; });
      }));
      return c;
    },

    // table: [[header...], [row...]] | [{col: value}, ...]; sortable, search > 5 rows, total: true adds sums,
    // CSV / Excel export of the current (filtered + sorted) view
    table(b) {
      const all = tableRows(b.table), head = all[0], data = all.slice(1), c = card(b, "table");
      const wrap = el("div", "rk-scroll"), t = el("table"), thead = el("thead"), htr = el("tr"), tb = el("tbody"), tf = el("tfoot");
      let col = -1, asc = true, q = "", view = data;
      const numCols = head.map((_, i) => data.some((r) => typeof r[i] === "number"));
      const totals = (rs) => head.map((_, i) => numCols[i]
        ? Math.round(rs.reduce((s, r) => s + (typeof r[i] === "number" ? r[i] : 0), 0) * 100) / 100
        : i === 0 ? L.total : "");
      const tools = dataTools(b.title || L.table, () => [head, ...view, ...(b.total ? [totals(view)] : [])]);
      if (data.length > 5 || b.search) tools.prepend(searchBox(L.searchTable, (v) => { q = v; draw(); }));
      c.appendChild(tools);
      const ths = head.map((h, i) => {
        const th = el("th", "sort", h);
        th.addEventListener("click", () => { asc = col === i ? !asc : true; col = i; draw(); });
        htr.appendChild(th);
        return th;
      });
      function draw() {
        view = data.filter((row) => !q || lower(row.join(" ")).includes(q));
        if (col > -1) view = view.slice().sort((x, y) => {
          const a = x[col], z = y[col];
          const d = typeof a === "number" && typeof z === "number" ? a - z : String(a).localeCompare(String(z), LANG);
          return asc ? d : -d;
        });
        ths.forEach((th, i) => { if (i === col) th.dataset.dir = asc ? "asc" : "desc"; else delete th.dataset.dir; });
        tb.replaceChildren(...view.map((row) => { const tr = el("tr"); row.forEach((v) => tr.appendChild(cellEl(v))); return tr; }));
        if (b.total) {
          const tr = el("tr");
          totals(view).forEach((v) => tr.appendChild(el("td", typeof v === "number" ? "n" : null, fmt(v))));
          tf.replaceChildren(tr);
        }
      }
      thead.appendChild(htr);
      t.append(thead, tb, tf);
      wrap.appendChild(t);
      c.appendChild(wrap);
      draw();
      return c;
    },

    // timeline: [[when, text, tone?], ...]
    timeline(b) {
      const c = card(b, "timeline"), ul = el("ul", "rk-tl");
      b.timeline.forEach((r) => {
        const li = el("li"), d = el("div");
        d.appendChild(inline(r[1]));
        li.append(el("span", "rk-dot " + (tone(r[2]) || "t-info")), el("div", "w", r[0]), d);
        ul.appendChild(li);
      });
      c.appendChild(ul);
      return c;
    },

    // code: source; lang "diff" colors +/- lines
    code(b) { const c = card(b, "code"); c.appendChild(preBox(b.code, b.lang)); return c; },

    // copy: ready-to-paste text (command, message), optional "text" explanation above
    copy(b) {
      const c = card(b, "copy");
      if (b.text) { const p = el("p"); p.style.marginTop = "0"; p.appendChild(inline(b.text)); c.appendChild(p); }
      c.appendChild(preBox(b.copy, b.lang, true));
      return c;
    },

    // risk: [[text, level], ...] level: high|med|low
    risk(b) {
      const c = card(b, "risk"), ul = el("ul", "rk-list");
      b.risk.forEach((r) => {
        r = arr(r);
        const li = el("li"), s = el("span");
        s.appendChild(inline(r[0]));
        li.append(badge(r[1] || "med", LEVEL[r[1]] || "warn"), s);
        ul.appendChild(li);
      });
      c.appendChild(ul);
      return c;
    },

    // todo: ["text" | [text, done], ...]; reader can tick items
    todo(b) {
      const c = card(b, "todo"), ul = el("ul", "rk-list"), st = (S.store.todo ||= {});
      b.todo.forEach((r) => {
        r = arr(r);
        const li = el("li"), lab = el("label", "rk-chk"), cb = el("input"), s = el("span");
        cb.type = "checkbox";
        cb.checked = r[0] in st ? st[r[0]] : !!r[1];
        const sync = () => li.classList.toggle("done", cb.checked);
        cb.addEventListener("change", () => {
          if (cb.checked === !!r[1]) delete st[r[0]];
          else st[r[0]] = cb.checked;
          store.save();
          sync();
        });
        sync();
        s.appendChild(inline(r[0]));
        lab.append(cb, s);
        li.appendChild(lab);
        ul.appendChild(li);
      });
      c.appendChild(ul);
      return c;
    },

    // review: [text | [id, text], ...] — reader approves / rejects each item, optional reason
    review(b) {
      const c = card(b, "review"), ul = el("ul", "rk-list rk-rev"), rv = (S.store.review ||= {});
      b.review.map(itemOf).forEach(([k, text]) => {
        const li = el("li"), t = el("div", "t"), acts = el("div", "rk-rev-act"), why = el("input", "rk-in rk-why");
        t.appendChild(inline(text));
        why.placeholder = L.why;
        const ok = btn("check", null, () => set("ok"), L.approve), no = btn("x", null, () => set("no"), L.reject);
        ok.classList.add("ok");
        no.classList.add("no");
        const sync = () => {
          const r = rv[k] || {};
          ok.classList.toggle("on", r.v === "ok");
          no.classList.toggle("on", r.v === "no");
          li.dataset.v = r.v || "";
          why.hidden = !r.v;
          why.value = r.why || "";
        };
        const set = (v) => {
          const r = (rv[k] ||= {});
          r.v = r.v === v ? null : v;
          if (!r.v) delete rv[k];
          store.save();
          sync();
        };
        why.addEventListener("input", () => { if (rv[k]) { rv[k].why = why.value; store.save(); } });
        acts.append(ok, no);
        li.append(t, acts, why);
        sync();
        ul.appendChild(li);
      });
      c.appendChild(ul);
      return c;
    },

    // faq: [[question, answer], ...]
    faq(b) {
      const c = card(b, "faq"), box = el("div", "rk-faq");
      const items = b.faq.map(([q, a]) => {
        const d = el("details"), p = el("p");
        p.appendChild(inline(a));
        d.append(el("summary", null, q), p);
        box.appendChild(d);
        return [d, lower(q + " " + a)];
      });
      if (items.length > 4) c.appendChild(searchBox(L.searchFaq, (q) => items.forEach(([d, txt]) => { d.hidden = !!q && !txt.includes(q); })));
      c.appendChild(box);
      return c;
    },

    // ask: [{id, q, opt?:[...], multi?, ph?}, ...] — questions to the reader
    ask(b) {
      const c = card(b, "ask"), f = el("div", "rk-ask"), ans = (S.store.ask ||= {});
      b.ask.forEach((q) => {
        const id = q.id || q.q, row = el("fieldset", "rk-q");
        row.appendChild(el("legend", null, q.q));
        if (q.opt) {
          const opts = el("div", "rk-opts"), cur = arr(ans[id] ?? []);
          q.opt.forEach((o) => {
            const lab = el("label", "rk-opt"), inp = el("input");
            inp.type = q.multi ? "checkbox" : "radio";
            inp.name = "rk-" + id;
            inp.value = o;
            inp.checked = cur.includes(o);
            inp.addEventListener("change", () => {
              ans[id] = q.multi ? [...opts.querySelectorAll("input:checked")].map((x) => x.value) : o;
              store.save();
            });
            lab.append(inp, document.createTextNode(o));
            opts.appendChild(lab);
          });
          row.appendChild(opts);
        } else {
          const ta = el("textarea", "rk-in");
          ta.rows = 2;
          ta.value = ans[id] || "";
          ta.placeholder = q.ph || L.answer;
          ta.addEventListener("input", () => { ans[id] = ta.value; store.save(); });
          row.appendChild(ta);
        }
        f.appendChild(row);
      });
      c.appendChild(f);
      return c;
    },

    // img: "url" | {before:"url", after:"url"} (drag slider); labels?, cap?
    img(b) {
      const c = card(b, "img");
      if (isStr(b.img)) {
        const im = el("img", "rk-img");
        im.src = safeUrl(b.img);
        im.alt = b.alt || b.title || "";
        im.loading = "lazy";
        c.appendChild(im);
      } else {
        const w = el("div", "rk-ba"), after = el("img"), before = el("img", "before"), line = el("div", "rk-ba-line"), r = el("input");
        const lb = b.labels || [L.before, L.after];
        after.src = safeUrl(b.img.after);
        before.src = safeUrl(b.img.before);
        after.alt = lb[1];
        before.alt = lb[0];
        r.type = "range";
        r.min = 0;
        r.max = 100;
        r.value = 50;
        r.setAttribute("aria-label", L.slider);
        const set = () => { before.style.clipPath = `inset(0 ${100 - r.value}% 0 0)`; line.style.left = r.value + "%"; };
        r.addEventListener("input", set);
        w.append(after, before, line, el("span", "rk-ba-l l", lb[0]), el("span", "rk-ba-l r", lb[1]), r);
        set();
        c.appendChild(w);
      }
      if (b.cap) { const p = el("div", "rk-cap"); p.appendChild(inline(b.cap)); c.appendChild(p); }
      return c;
    },

    // sources: [[text, kind: cmd|file|link|db, ref], ...] — where the numbers come from
    sources(b) {
      const c = card(b, "sources"), ul = el("ul", "rk-list rk-srcs");
      b.sources.forEach(([text, kind, ref]) => {
        const li = el("li"), d = el("div");
        d.appendChild(inline(text));
        if (ref) {
          const x = el("div", "rk-src-ref");
          x.appendChild(kind === "link" && /^https?:\/\//.test(ref) ? link(ref, ref) : el("code", null, ref));
          d.appendChild(x);
        }
        li.append(icon(SRC_ICON[kind] || "info"), d);
        ul.appendChild(li);
      });
      c.appendChild(ul);
      return c;
    },

    // tabs: {"Tab name": [blocks], ...}
    tabs(b) {
      const c = card(b, "tabs"), bar = el("div", "rk-tabs"), panes = [];
      bar.setAttribute("role", "tablist");
      const sel = (i) => panes.forEach(([t, p], j) => {
        t.classList.toggle("on", i === j);
        t.setAttribute("aria-selected", i === j);
        p.hidden = i !== j;
      });
      Object.entries(b.tabs).forEach(([name, blocks], i) => {
        const t = btn(null, name, () => sel(i)), p = el("div");
        t.setAttribute("role", "tab");
        p.setAttribute("role", "tabpanel");
        arr(blocks).forEach((x) => p.appendChild(block(x)));
        bar.appendChild(t);
        panes.push([t, p]);
      });
      c.append(bar, ...panes.map((x) => x[1]));
      sel(0);
      return c;
    },

    // cols: [block, block, ...] side by side
    cols(b) {
      const g = el("div", "rk-cols");
      b.cols.forEach((x) => g.appendChild(block(x)));
      return g;
    },

    // details: "summary", blocks: [...]
    details(b) {
      const c = el("section", "rk-card"), d = el("details");
      d.appendChild(el("summary", null, b.details));
      b.blocks.forEach((x) => d.appendChild(block(x)));
      c.appendChild(d);
      return c;
    }
  };

  function drawChart(cv, b) {
    const type = b.chart, fg = cssVar("--mut"), line = cssVar("--line");
    const round = type === "pie" || type === "doughnut", filled = type === "area" || type === "radar";
    const series = isArr(b.y) ? { "": b.y } : b.y;
    const ds = Object.keys(series).map((name, i) => {
      const col = PALETTE[i % PALETTE.length];
      return {
        label: name, data: series[name],
        backgroundColor: round ? series[name].map((_, j) => PALETTE[j % PALETTE.length]) : filled ? col + "33" : col,
        borderColor: round ? cssVar("--card") : col,
        borderWidth: round ? 2 : type === "line" || filled ? 2 : 0,
        borderRadius: type.includes("bar") || type === "stacked" ? 4 : 0,
        fill: filled, tension: 0.3, pointRadius: 3
      };
    });
    const base = { hbar: "bar", stacked: "bar", area: "line" }[type] || type;
    const axis = { grid: { color: line }, ticks: { color: fg }, stacked: type === "stacked", beginAtZero: true };
    S.charts.push(new window.Chart(cv, {
      type: base,
      data: { labels: b.x, datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false, animation: navigator.webdriver ? false : undefined,
        indexAxis: type === "hbar" ? "y" : "x",
        plugins: { legend: { display: round || ds.length > 1, labels: { color: fg } } },
        scales: round ? {} : type === "radar"
          ? { r: { grid: { color: line }, angleLines: { color: line }, pointLabels: { color: fg }, ticks: { display: false } } }
          : { x: axis, y: axis }
      }
    }));
  }

  // per-card note / question; included in the single copy output
  function addNote(node, b) {
    const k = noteKey(b), notes = (S.store.notes ||= {});
    const box = el("div", "rk-note"), ta = el("textarea", "rk-in"), act = el("div", "rk-act");
    ta.rows = 2;
    ta.placeholder = L.notePh;
    ta.value = notes[k] || "";
    const tg = btn("message-square-plus", null, () => { box.hidden = false; ta.focus(); }, L.noteAdd);
    const sync = () => { const has = !!(notes[k] || "").trim(); tg.classList.toggle("has", has); box.classList.toggle("has", has); };
    ta.addEventListener("input", () => { notes[k] = ta.value; if (!ta.value.trim()) delete notes[k]; store.save(); sync(); });
    ta.addEventListener("blur", () => { if (!ta.value.trim()) box.hidden = true; });
    box.hidden = !ta.value.trim();
    box.append(el("label", null, L.noteLabel), ta);
    act.appendChild(tg);
    node.append(act, box);
    sync();
  }

  function block(b) {
    try {
      if (!isObj(b)) throw new Error("block must be an object");
      const t = typeOf(b);
      if (!t) throw new Error("unknown block: " + JSON.stringify(Object.keys(b)));
      const node = R[t](b);
      if (node.classList.contains("rk-card")) {
        if (b.src) { const s = el("div", "rk-src"); s.append(icon("file-search"), inline(L.source + b.src)); node.appendChild(s); }
        if (t !== "ask" && t !== "review") addNote(node, b);
      }
      return node;
    } catch (e) {
      console.error("[report-kit]", e);
      return el("div", "rk-err", "report-kit: " + e.message);
    }
  }

  function askBox() {
    const c = el("section", "rk-card rk-askbox"), h = el("h3"), ta = el("textarea", "rk-in");
    h.append(icon("sparkles"), document.createTextNode(L.askTitle));
    ta.rows = 3;
    ta.placeholder = L.askPh;
    ta.value = S.store.q || "";
    ta.addEventListener("input", () => { S.store.q = ta.value; store.save(); });
    c.append(h, el("p", null, L.askHint), ta);
    return c;
  }

  // ---------- versions ----------
  // Each <script type="application/json" class="rk-v"> is one version, in order. title/sum/meta/lang inherit
  // from the previous version; {"ref":"id"} reuses the newest earlier block with that id.
  function findId(s, id) { return walkAll(s.blocks).find((b) => b.id === id) || null; }
  function parseRaws() {
    return [...document.querySelectorAll('script[type="application/json"]#report, script[type="application/json"].rk-v')].map((n) => {
      try { return JSON.parse(n.textContent); } catch (e) { return { __error: e.message }; }
    });
  }
  function resolve(raws) {
    const out = [];
    raws.forEach((raw, i) => {
      const prev = out[i - 1];
      if (raw.__error) raw = { note: L.jsonError, blocks: [{ callout: `v${i + 1} ${L.jsonError}: ${raw.__error}`, tone: "bad" }] };
      const find = (id) => out.reduceRight((hit, v) => hit || findId(v, id), null);
      const ref = (b) => {
        if (!isObj(b)) return b;
        if (b.ref) return find(b.ref) || { callout: L.refMissing + b.ref, tone: "bad" };
        if (b.cols) return { ...b, cols: b.cols.map(ref) };
        if (b.details) return { ...b, blocks: arr(b.blocks || []).map(ref) };
        if (b.tabs) return { ...b, tabs: Object.fromEntries(Object.entries(b.tabs).map(([k, bs]) => [k, arr(bs).map(ref)])) };
        return b;
      };
      out.push({
        ...raw,
        v: raw.v ?? i + 1,
        title: raw.title ?? prev?.title,
        sum: raw.sum ?? prev?.sum,
        meta: raw.meta ?? prev?.meta,
        lang: raw.lang ?? prev?.lang,
        blocks: arr(raw.blocks || []).map(ref)
      });
    });
    return out;
  }
  function keys(bs) {
    const n = {};
    return bs.map((b) => {
      if (!isObj(b)) return "?";
      if (b.id) return b.id;
      const t = typeOf(b) || "?", l = b.title || b.h || b.details;
      if (l) return t + ":" + l;
      n[t] = (n[t] || 0) + 1;
      return t + "#" + n[t];
    });
  }
  function diffOf(cur, base) {
    const bk = keys(base.blocks), bm = new Map(bk.map((k, i) => [k, JSON.stringify(base.blocks[i])]));
    const ck = keys(cur.blocks), cs = new Set(ck);
    // a block moved into cols/tabs/details is not "removed": look for its id or type:title anywhere in cur
    const deep = new Set(walkAll(cur.blocks).flatMap((b) => [b.id, typeOf(b) + ":" + (b.title || b.h || b.details)]));
    return {
      st: ck.map((k, i) => (!bm.has(k) ? "new" : bm.get(k) !== JSON.stringify(cur.blocks[i]) ? "chg" : null)),
      removed: base.blocks.filter((_, i) => !cs.has(bk[i]) && !deep.has(bk[i])).map(label)
    };
  }
  // metric values (kpi + progress) by label, for version-to-version comparison
  function metrics(s) {
    const m = new Map();
    walkAll(s.blocks).forEach((b) => {
      if (b.kpi) b.kpi.forEach((k) => m.set(k[0], fmt(k[1])));
      if (b.progress) b.progress.forEach((r) => m.set(r[0], r[2] && r[2] !== 100 ? `${r[1]}/${r[2]}` : `${r[1]}%`));
    });
    return m;
  }
  function compareCard(cur, base, d) {
    const a = metrics(base), z = metrics(cur), out = [];
    new Set([...a.keys(), ...z.keys()]).forEach((k) => {
      const x = a.get(k) ?? "—", y = z.get(k) ?? "—";
      if (x !== y) out.push([k, String(x), String(y)]);
    });
    const c = el("div");
    c.appendChild(R.callout({
      callout: L.cmp(base.v, cur.v, d.st.filter((x) => x === "new").length, d.st.filter((x) => x === "chg").length, d.removed.length) +
        (d.removed.length ? " " + L.removed + d.removed.join(", ") : ""),
      tone: "info", icon: "git-compare"
    }));
    if (out.length) c.appendChild(block({ table: [[L.metric, `v${base.v}`, `v${cur.v}`], ...out], title: `${L.changedMetrics} (v${base.v} → v${cur.v})`, icon: "arrow-right-left" }));
    return c;
  }

  // ---------- page ----------
  function tocLinks(toc) {
    const nav = el("nav", "rk-toc");
    toc.forEach(([id, text]) => { const a = el("a", null, text); a.href = "#" + id; nav.appendChild(a); });
    return nav;
  }
  function toolbar(s, toc) {
    const bar = el("div", "rk-tools"), inner = el("div", "rk-tools-in"), last = S.versions.length - 1;
    if (toc.length) {
      const m = el("details", "rk-menu toc"), sum = el("summary", "rk-btn"), nav = tocLinks(toc);
      sum.append(icon("list"), document.createTextNode(L.toc));
      nav.addEventListener("click", () => { m.open = false; });
      m.append(sum, nav);
      inner.appendChild(m);
    }
    if (last > 0) {
      const sel = el("select", "rk-in rk-sel"), cmp = el("select", "rk-in rk-sel"), l1 = el("label"), l2 = el("label");
      sel.setAttribute("aria-label", L.version);
      S.versions.forEach((v, i) => {
        const o = el("option", null, `${vLabel(v)}${v.note ? " — " + v.note : ""}${i === last ? ` (${L.latest})` : ""}`);
        o.value = i;
        o.selected = i === S.idx;
        sel.appendChild(o);
      });
      sel.addEventListener("change", () => go(+sel.value));
      cmp.setAttribute("aria-label", L.compare);
      cmp.appendChild(el("option", null, "—")).value = -1;
      S.versions.forEach((v, i) => {
        if (i === S.idx) return;
        const o = el("option", null, vLabel(v));
        o.value = i;
        o.selected = i === S.cmp;
        cmp.appendChild(o);
      });
      cmp.addEventListener("change", () => { S.cmp = +cmp.value; mount(); });
      l1.append(icon("history"), sel);
      l2.append(document.createTextNode(L.compare + ":"), cmp);
      inner.append(l1, l2);
    }
    const themes = { auto: ["monitor", L.auto], light: ["sun", L.light], dark: ["moon", L.dark] }, order = ["auto", "light", "dark"];
    const cur = getTheme();
    inner.append(
      el("span", "rk-sp"),
      btn("file-text", "Markdown", () => copyText(mdDoc(s)), L.mdTitle),
      btn("braces", "JSON", () => copyText(JSON.stringify(s, null, 1)), L.jsonTitle),
      btn("printer", null, () => print(), L.print),
      btn(themes[cur][0], null, () => { setTheme(order[(order.indexOf(cur) + 1) % 3]); mount(); }, L.theme + themes[cur][1])
    );
    bar.appendChild(inner);
    return bar;
  }

  function go(i) {
    S.idx = i;
    S.cmp = -1;
    history.replaceState(null, "", "#v=" + S.versions[i].v);
    mount();
    scrollTo(0, 0);
  }

  function scrollSpy(heads, navs) {
    if (S.spy) S.spy.disconnect();
    if (!heads.length || !("IntersectionObserver" in window)) return;
    S.spy = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        navs.forEach((nav) => nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id)));
      });
    }, { rootMargin: "-64px 0px -70% 0px" });
    heads.forEach((h) => S.spy.observe(h));
  }

  function mount() {
    S.charts.forEach((c) => c.destroy());
    S.charts = [];
    S.pending = [];
    S.ui = {};
    document.documentElement.removeAttribute("data-rk");
    const s = spec(), last = S.versions.length - 1, base = S.versions[S.cmp];
    document.title = s.title || L.untitled;

    const main = el("main", "rk"), head = el("header", "rk-head");
    head.appendChild(el("h1", null, s.title || L.untitled));
    if (s.sum) { const p = el("p", "rk-sum"); p.appendChild(inline(s.sum)); head.appendChild(p); }
    const m = el("div", "rk-meta");
    [...(s.meta ? arr(s.meta) : []), vLabel(s).replace(", ", " · ")].forEach((x) => m.appendChild(el("span", null, x)));
    head.appendChild(m);
    main.appendChild(head);

    if (S.problems.length) main.appendChild(R.callout({ callout: L.problems(S.problems.length), tone: "bad", items: S.problems }));
    if (S.idx < last) {
      const c = R.callout({ callout: L.old(s.v, S.versions[last].v), tone: "warn" });
      c.lastChild.appendChild(btn("arrow-right", L.toLatest, () => go(last)));
      main.appendChild(c);
    }
    if (s.note) main.appendChild(R.callout({ callout: `**${L.inVersion}** ${s.note}`, tone: "info", icon: "history" }));

    const d = base ? diffOf(s, base) : null;
    if (d) main.appendChild(compareCard(s, base, d));
    const toc = [], heads = [];
    s.blocks.forEach((b, i) => {
      const node = block(b), st = d && d.st[i];
      if (isObj(b) && b.h) { node.id = "rk-s" + i; toc.push([node.id, b.h]); heads.push(node); }
      if (st) {
        node.classList.add("rk-" + st);
        node.appendChild(el("span", "rk-flag " + (st === "new" ? "t-good" : "t-warn"), st === "new" ? L.flagNew : L.flagChg));
      }
      main.appendChild(node);
    });
    main.appendChild(askBox());

    const side = el("aside", "rk-side");
    if (toc.length) side.appendChild(tocLinks(toc));
    S.root.replaceChildren(toolbar(s, toc), side, main, fab());
    S.ui.refresh();
    scrollSpy(heads, [...S.root.querySelectorAll(".rk-toc")]);
    S.pending.push(loadScript(CDN.lucide).then(refreshIcons));
    return Promise.allSettled(S.pending).then((rs) => {
      rs.forEach((r) => { if (r.status === "rejected") console.error("[report-kit]", r.reason); });
      document.documentElement.setAttribute("data-rk", "ready");
    });
  }

  function setLang(raws) {
    const want = (raws.find((r) => r && r.lang) || {}).lang || document.documentElement.lang || "en";
    LANG = I18N[want.slice(0, 2)] ? want.slice(0, 2) : "en";
    L = I18N[LANG];
    LOCALE = LANG === "tr" ? "tr-TR" : "en-US";
    document.documentElement.lang = LANG;
  }

  function start() {
    S.raws = parseRaws();
    if (!S.raws.length) return;
    setLang(S.raws);
    S.problems = validate(S.raws);
    S.problems.forEach((p) => console.warn("[report-kit]", p));
    document.documentElement.dataset.rkProblems = S.problems.length;
    S.versions = resolve(S.raws);
    const st = el("style");
    st.textContent = CSS;
    document.head.appendChild(st);
    applyTheme(getTheme());
    const last = S.versions.length - 1, hv = (location.hash.match(/v=([^&]+)/) || [])[1];
    const hi = hv ? S.versions.findIndex((v) => String(v.v) === decodeURIComponent(hv)) : -1;
    S.idx = hi > -1 ? hi : last;
    S.key = "rk:" + S.versions[last].title;
    S.store = store.load(S.key);
    S.root = el("div", "rk-root");
    document.body.appendChild(S.root);
    mount();
  }

  window.ReportKit = { version: VERSION, blocks: R, validate, md: mdDoc, collect, versions: () => S.versions, i18n: I18N };
  document.addEventListener("DOMContentLoaded", start);
})();
