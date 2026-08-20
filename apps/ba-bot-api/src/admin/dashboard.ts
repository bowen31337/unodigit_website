/**
 * The dashboard page, as a single self-contained document.
 *
 * No build step, no bundle, no CDN. The Worker is the only thing serving this
 * hostname, and a dashboard that needs `pnpm build` to change one column is a
 * dashboard nobody changes. It is also a strict-CSP page with no external
 * origins, so there is nothing here for a compromised third-party script to
 * ride in on — a page displaying every lead's email is the wrong place to
 * trust a CDN.
 *
 * The palette deliberately echoes apps/web (Apple-ish neutrals, cyan accent)
 * without importing the token layer: this ships from a different package and a
 * copy of six colours is cheaper than a shared build.
 */

/**
 * Content-Security-Policy for the page.
 *
 * `default-src 'none'` with no external origin anywhere is the point: lead
 * names, companies and event payloads are authored by whoever talked to the
 * bot, so this page renders attacker-supplied strings to the one browser
 * session that can read every lead. The script builds its DOM with
 * `textContent` rather than `innerHTML`, and this policy is the second line —
 * even a mistake there has no origin to exfiltrate to and no remote script to
 * pull in.
 *
 * `'unsafe-inline'` is unavoidable for a single-document page with no build
 * step; it is scoped to a page that loads nothing else at all.
 */
const CSP = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'self'",
  "img-src 'self' data:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

export function dashboardCsp(): string {
  return CSP
}

export function dashboardHtml(): string {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>BA bot · metrics</title>
<style>
  :root {
    --bg: #f2f2f7; --panel: #fff; --line: rgba(60,60,67,.18);
    --ink: #1c1c1e; --ink-2: rgba(60,60,67,.73); --ink-3: rgba(60,60,67,.5);
    --accent: #0e7490; --good: #1a7f5a; --warn: #a1620a; --bad: #b3261e;
    --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #000; --panel: #1c1c1e; --line: rgba(235,235,245,.2);
      --ink: #f2f2f7; --ink-2: rgba(235,235,245,.6); --ink-3: rgba(235,235,245,.4);
      --accent: #22d3ee; --good: #4ade80; --warn: #fbbf24; --bad: #ff6b6b;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  header {
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
    padding: 20px 24px; border-bottom: 1px solid var(--line);
    position: sticky; top: 0; background: var(--bg); z-index: 5;
  }
  h1 { font-size: 19px; font-weight: 600; margin: 0; letter-spacing: -.01em; }
  .who { color: var(--ink-3); font-size: 13px; margin-left: auto; }
  main { padding: 24px; max-width: 1200px; margin: 0 auto; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
  .seg button {
    font: inherit; font-size: 13px; padding: 5px 12px; border: 0; cursor: pointer;
    background: transparent; color: var(--ink-2);
  }
  .seg button[aria-pressed="true"] { background: var(--accent); color: var(--bg); font-weight: 600; }
  .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin-bottom: 28px; }
  .tile { background: var(--panel); border-radius: 12px; padding: 14px 16px; border: 1px solid var(--line); }
  .tile .k { font-size: 12px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .04em; }
  .tile .v { font-size: 26px; font-weight: 600; letter-spacing: -.02em; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .tile .s { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
  section { margin-bottom: 32px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--ink-3); margin: 0 0 10px; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; background: var(--panel); border-radius: 12px; overflow: hidden; border: 1px solid var(--line); }
  th, td { text-align: left; padding: 9px 14px; font-size: 13px; border-bottom: 1px solid var(--line); }
  th { color: var(--ink-3); font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  tr:last-child td { border-bottom: 0; }
  td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
  td.mono { font-family: var(--mono); font-size: 12px; color: var(--ink-2); }
  .bar { height: 5px; background: var(--accent); border-radius: 3px; min-width: 2px; }
  .pill { display: inline-block; padding: 1px 7px; border-radius: 20px; font-size: 11px; font-family: var(--mono); }
  .pill.err { background: color-mix(in srgb, var(--bad) 18%, transparent); color: var(--bad); }
  .pill.ok  { background: color-mix(in srgb, var(--good) 18%, transparent); color: var(--good); }
  .empty { color: var(--ink-3); font-size: 13px; padding: 14px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; }
  .err-banner { background: color-mix(in srgb, var(--bad) 15%, transparent); color: var(--bad); padding: 10px 14px; border-radius: 10px; margin-bottom: 16px; font-size: 13px; }
  .spark { display: flex; align-items: flex-end; gap: 2px; height: 44px; }
  .spark div { flex: 1; background: var(--accent); border-radius: 2px 2px 0 0; min-height: 2px; opacity: .85; }
  input[type=search] { font: inherit; font-size: 13px; padding: 5px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--panel); color: var(--ink); }
  .row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
</style>
</head>
<body>
<header>
  <h1>BA bot · metrics</h1>
  <div class="seg" id="range" role="group" aria-label="Time range">
    <button data-days="7">7d</button>
    <button data-days="30" aria-pressed="true">30d</button>
    <button data-days="90">90d</button>
    <button data-days="0">All</button>
  </div>
  <div class="who" id="who"></div>
</header>
<main>
  <div id="error" hidden class="err-banner"></div>
  <div class="grid" id="tiles"></div>

  <section>
    <h2>Spend per day</h2>
    <div class="spark" id="spark"></div>
  </section>

  <section>
    <h2>Where conversations stop</h2>
    <div id="funnel"></div>
  </section>

  <section>
    <h2>Events — every signal the bot records</h2>
    <div id="events"></div>
  </section>

  <section>
    <h2>Leads</h2>
    <div class="row">
      <input type="search" id="q" placeholder="filter by email, name or company" autocomplete="off">
    </div>
    <div id="leads"></div>
  </section>
</main>

<script>
(function () {
  'use strict';
  var days = 30;

  var fmtInt = new Intl.NumberFormat('en-AU');
  var fmtAud = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
  var fmtUsd = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });

  function el(tag, text, cls) {
    var n = document.createElement(tag);
    // textContent, never innerHTML: names, companies and event payloads are
    // typed by visitors, and this page is the one session that can read every
    // lead. Escaping by construction beats escaping by discipline.
    if (text !== undefined && text !== null) n.textContent = String(text);
    if (cls) n.className = cls;
    return n;
  }

  function fail(msg) {
    var box = document.getElementById('error');
    box.hidden = false;
    box.textContent = msg;
  }

  function get(path) {
    return fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) {
        // 401 here means the Access session lapsed mid-session. Reloading
        // bounces through Access and comes back with a fresh token, which is
        // friendlier than showing a dead page.
        if (r.status === 401) { location.reload(); throw new Error('reauth'); }
        if (!r.ok) throw new Error(path + ' → ' + r.status);
        return r.json();
      });
  }

  function tile(k, v, s) {
    var t = el('div', null, 'tile');
    t.appendChild(el('div', k, 'k'));
    t.appendChild(el('div', v, 'v'));
    if (s) t.appendChild(el('div', s, 's'));
    return t;
  }

  function table(cols, rows, build) {
    if (!rows.length) return el('div', 'Nothing in this window.', 'empty');
    var t = el('table'), thead = el('thead'), tr = el('tr');
    cols.forEach(function (c) {
      var th = el('th', c.label, c.numeric ? 'n' : '');
      tr.appendChild(th);
    });
    thead.appendChild(tr); t.appendChild(thead);
    var tb = el('tbody');
    rows.forEach(function (r) { tb.appendChild(build(r)); });
    t.appendChild(tb);
    return t;
  }

  // Timestamps from this API are MILLISECONDS — every column is written from
  // Date.now(). Never multiply by 1000 before new Date(...). Doing so put the
  // events "Last seen" and the leads "When" column in the year 58602, and the
  // same seconds/milliseconds confusion independently broke since() and
  // daily() in db/admin. It is the recurring mistake in this codebase.
  function renderSummary(d) {
    var o = d.overview;
    var tiles = document.getElementById('tiles');
    tiles.replaceChildren(
      tile('Conversations', fmtInt.format(o.conversations),
        fmtInt.format(o.completed) + ' completed · ' + fmtInt.format(o.unfinished) + ' unfinished'),
      tile('Leads', fmtInt.format(o.leads), o.conversations ? Math.round(100 * o.leads / o.conversations) + '% of conversations' : ''),
      tile('Quotes', fmtInt.format(o.quotes), fmtInt.format(o.briefs) + ' briefs'),
      tile('Quoted value', fmtAud.format(o.quotedValueLowAud) + '–' + fmtAud.format(o.quotedValueHighAud)),
      tile('LLM spend', fmtUsd.format(o.totalCostUsd), fmtInt.format(o.tokensIn + o.tokensOut) + ' tokens'),
      tile('Avg turns', o.avgTurns)
    );

    var max = d.daily.reduce(function (m, r) { return Math.max(m, r.costUsd); }, 0) || 1;
    var spark = document.getElementById('spark');
    spark.replaceChildren();
    d.daily.forEach(function (r) {
      var b = el('div');
      b.style.height = Math.max(2, Math.round(100 * r.costUsd / max)) + '%';
      b.title = r.day + ' · ' + fmtUsd.format(r.costUsd) + ' · ' + r.conversations + ' conversations';
      spark.appendChild(b);
    });
    if (!d.daily.length) spark.replaceChildren(el('div', null));

    document.getElementById('funnel').replaceChildren(table(
      [{ label: 'Stopped at' }, { label: 'Conversations', numeric: true },
       { label: '%', numeric: true }, { label: 'Avg turns', numeric: true }, { label: '' }],
      d.funnel,
      function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', r.state, 'mono'));
        tr.appendChild(el('td', fmtInt.format(r.conversations), 'n'));
        tr.appendChild(el('td', r.pctOfTotal + '%', 'n'));
        tr.appendChild(el('td', r.avgTurns, 'n'));
        var cell = el('td'), bar = el('div', null, 'bar');
        bar.style.width = Math.max(2, r.pctOfTotal) + '%';
        cell.appendChild(bar); tr.appendChild(cell);
        return tr;
      }
    ));

    document.getElementById('events').replaceChildren(table(
      [{ label: 'Event' }, { label: 'Count', numeric: true }, { label: 'Last seen' }],
      d.events,
      function (r) {
        var tr = el('tr'), td = el('td');
        // "failed", "rejected", "reached", "expired" are the signals worth
        // noticing; everything else is routine bookkeeping.
        var bad = /fail|reject|cap|limit|expired/.test(r.type);
        td.appendChild(el('span', r.type, 'pill ' + (bad ? 'err' : 'ok')));
        tr.appendChild(td);
        tr.appendChild(el('td', fmtInt.format(r.count), 'n'));
        tr.appendChild(el('td', new Date(r.lastAt).toLocaleString('en-AU'), 'mono'));
        return tr;
      }
    ));
  }

  function renderLeads(d) {
    document.getElementById('leads').replaceChildren(table(
      [{ label: 'When' }, { label: 'Email' }, { label: 'Name' }, { label: 'Company' },
       { label: 'Source' }, { label: 'Consent' }, { label: 'Quotes', numeric: true }, { label: 'Value', numeric: true }],
      d.leads,
      function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', new Date(r.createdAt).toLocaleDateString('en-AU'), 'mono'));
        tr.appendChild(el('td', r.email, 'mono'));
        tr.appendChild(el('td', r.name || '—'));
        tr.appendChild(el('td', r.company || '—'));
        tr.appendChild(el('td', r.utmSource || 'direct', 'mono'));
        var c = el('td');
        c.appendChild(el('span', r.consent ? 'yes' : 'no', 'pill ' + (r.consent ? 'ok' : 'err')));
        tr.appendChild(c);
        tr.appendChild(el('td', r.quotes, 'n'));
        tr.appendChild(el('td', r.quotes ? fmtAud.format(r.lowAud) + '–' + fmtAud.format(r.highAud) : '—', 'n'));
        return tr;
      }
    ));
  }

  var leadTimer;
  function loadLeads() {
    var q = document.getElementById('q').value.trim();
    get('/admin/api/leads?limit=100' + (q ? '&q=' + encodeURIComponent(q) : ''))
      .then(renderLeads).catch(function (e) { if (e.message !== 'reauth') fail(e.message); });
  }

  function loadAll() {
    get('/admin/api/summary?days=' + days)
      .then(renderSummary).catch(function (e) { if (e.message !== 'reauth') fail(e.message); });
    loadLeads();
  }

  document.getElementById('range').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    days = Number(b.dataset.days);
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) {
      x.setAttribute('aria-pressed', String(x === b));
    });
    loadAll();
  });

  document.getElementById('q').addEventListener('input', function () {
    clearTimeout(leadTimer);
    leadTimer = setTimeout(loadLeads, 250);
  });

  get('/admin/api/whoami')
    .then(function (d) { document.getElementById('who').textContent = d.email; })
    .catch(function () {});
  loadAll();
})();
</script>
</body>
</html>`
}
