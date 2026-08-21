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
  .linkbtn { background: none; border: 0; padding: 0; font: inherit; font-size: 12px;
             color: var(--accent); cursor: pointer; text-decoration: underline; }
  .muted { color: var(--ink-2); }
  dialog#confirm-delete { width: min(560px, 92vw); padding: 0; border: 0;
    border-radius: 12px; background: var(--panel); color: var(--ink); }
  dialog#confirm-delete::backdrop { background: rgba(0,0,0,.6); }
  dialog#confirm-delete header { display: flex; justify-content: space-between;
    align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
  #del-body { padding: 16px 18px 20px; font-size: 13px; line-height: 1.55; }
  #del-body ul { margin: 10px 0; padding-left: 18px; color: var(--ink-2); }
  #del-body input { width: 100%; margin-top: 10px; padding: 9px 11px; font: inherit;
    font-family: var(--mono); font-size: 12px; color: var(--ink); background: var(--bg);
    border: 1px solid var(--line); border-radius: 8px; }
  .danger { margin-top: 14px; width: 100%; padding: 10px; font: inherit; font-weight: 600;
    color: #fff; background: var(--bad); border: 0; border-radius: 8px; cursor: pointer; }
  .danger:disabled { opacity: .45; cursor: not-allowed; }
  dialog#transcript { width: min(720px, 92vw); max-height: 82vh; padding: 0; border: 0;
    border-radius: 12px; background: var(--panel); color: var(--ink); }
  dialog#transcript::backdrop { background: rgba(0,0,0,.6); }
  dialog#transcript header { display: flex; justify-content: space-between; align-items: center;
    gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); position: sticky; top: 0;
    background: var(--panel); }
  #transcript-body { padding: 14px 18px 20px; overflow-y: auto; max-height: calc(82vh - 56px); }
  .turn { margin-bottom: 14px; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
  .turn-meta { font-family: var(--mono); font-size: 11px; color: var(--ink-2); margin-bottom: 3px; }
  .turn-user > div:last-child { color: var(--ink); }
  .turn-bot  > div:last-child { color: var(--ink-2); }
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

<!-- Native <dialog>: focus trapping, Escape-to-close and the backdrop come for
     free, and this page ships no framework to provide them. -->
<dialog id="confirm-delete">
  <header>
    <strong>Delete this lead permanently</strong>
    <button type="button" id="del-cancel" class="linkbtn">Cancel</button>
  </header>
  <div id="del-body"></div>
</dialog>

<dialog id="transcript">
  <header>
    <strong id="transcript-who"></strong>
    <button type="button" id="transcript-close" class="linkbtn">Close</button>
  </header>
  <div id="transcript-body"></div>
</dialog>

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

  // emptyMsg is per-caller because a single generic string lied. The leads
  // table used to say "Nothing in this window" while running no window at all,
  // which sent operators to widen a filter that changed nothing and made a
  // working portal look broken.
  function table(cols, rows, build, emptyMsg) {
    if (!rows.length) return el('div', emptyMsg || 'Nothing in this window.', 'empty');
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

  // Opens the conversation behind a lead. Built with textContent only, like
  // every other node here — a transcript is visitor-typed text and must never
  // reach innerHTML.
  function showTranscript(convId, label) {
    var dlg = document.getElementById('transcript');
    var body = document.getElementById('transcript-body');
    document.getElementById('transcript-who').textContent = label;
    body.replaceChildren(el('p', 'Loading…', 'muted'));
    dlg.showModal();

    fetch('/admin/api/conversation?id=' + encodeURIComponent(convId), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var turns = (d && d.turns) || [];
        if (!turns.length) { body.replaceChildren(el('p', 'No messages recorded.', 'muted')); return; }
        body.replaceChildren.apply(body, turns.map(function (t) {
          var wrap = el('div', null, 'turn ' + (t.role === 'user' ? 'turn-user' : 'turn-bot'));
          wrap.appendChild(el('div', (t.role === 'user' ? 'Visitor' : 'Mary') +
            ' · ' + new Date(t.createdAt).toLocaleString('en-AU'), 'turn-meta'));
          wrap.appendChild(el('div', t.content));
          return wrap;
        }));
      })
      .catch(function () { body.replaceChildren(el('p', 'Could not load the transcript.', 'muted')); });
  }

  document.getElementById('transcript-close').addEventListener('click', function () {
    document.getElementById('transcript').close();
  });

  document.getElementById('del-cancel').addEventListener('click', function () {
    document.getElementById('confirm-delete').close();
  });

  // Shows the real per-table impact first, then requires the operator to type
  // the lead's email. That is the browser translation of delete-lead.sh's
  // "type the id, not y" — a habitual click is exactly how the wrong lead gets
  // deleted, and an address is not something you type by reflex.
  function confirmDelete(lead) {
    var dlg = document.getElementById('confirm-delete');
    var body = document.getElementById('del-body');
    body.replaceChildren(el('p', 'Checking what would be deleted…', 'muted'));
    dlg.showModal();

    get('/admin/api/lead/impact?id=' + encodeURIComponent(lead.id)).then(function (r) {
      var i = r.impact;
      body.replaceChildren();
      body.appendChild(el('p', 'This permanently deletes ' + lead.email +
        ' and everything derived from it. There is no undo and no backup.'));

      var ul = el('ul');
      [['conversation', i.conversations], ['message', i.messages], ['brief', i.briefs],
       ['quote', i.quotes], ['event', i.events]].forEach(function (pair) {
        ul.appendChild(el('li', pair[1] + ' ' + pair[0] + (pair[1] === 1 ? '' : 's')));
      });
      body.appendChild(ul);
      body.appendChild(el('p', 'Rate-limit counters are not touched — they hold salted ' +
        'hashes, not personal information.', 'muted'));

      var label = el('p', 'Type the email address to confirm:');
      body.appendChild(label);
      var input = el('input');
      input.type = 'text';
      input.setAttribute('aria-label', 'Type the email address to confirm deletion');
      input.autocomplete = 'off';
      body.appendChild(input);

      var go = el('button', 'Delete permanently', 'danger');
      go.type = 'button';
      go.disabled = true;
      input.addEventListener('input', function () {
        go.disabled = input.value.trim().toLowerCase() !== lead.email.trim().toLowerCase();
      });
      go.addEventListener('click', function () {
        go.disabled = true;
        go.textContent = 'Deleting…';
        fetch('/admin/api/lead/delete', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: lead.id, confirmEmail: input.value.trim() }),
        }).then(function (res) {
          if (!res.ok) throw new Error('delete failed (' + res.status + ')');
          dlg.close();
          loadAll();
        }).catch(function (e) {
          go.textContent = 'Delete permanently';
          body.appendChild(el('p', e.message, 'muted'));
        });
      });
      body.appendChild(go);
      input.focus();
    }).catch(function (e) {
      if (e.message !== 'reauth') body.replaceChildren(el('p', 'Could not check: ' + e.message, 'muted'));
    });
  }

  function renderLeads(d) {
    document.getElementById('leads').replaceChildren(table(
      [{ label: 'When' }, { label: 'Email' }, { label: 'Name' }, { label: 'Company' },
       { label: 'Mobile' }, { label: 'Source' }, { label: 'Came from' }, { label: 'Consent' },
       { label: 'Quote' }, { label: 'Chat' },
       { label: 'Value', numeric: true }, { label: '' }],
      d.leads,
      function (r) {
        var tr = el('tr');
        tr.appendChild(el('td', new Date(r.createdAt).toLocaleDateString('en-AU'), 'mono'));
        tr.appendChild(el('td', r.email, 'mono'));
        tr.appendChild(el('td', r.name || '—'));
        tr.appendChild(el('td', r.company || '—'));
        tr.appendChild(el('td', r.phone || '—', 'mono'));
        // Source is the UTM tag; "direct" there only means untagged.
        var src = el('td', r.utmSource || 'direct', 'mono');
        if (r.utmSource && (r.utmMedium || r.utmCampaign)) {
          src.title = [r.utmMedium, r.utmCampaign].filter(Boolean).join(' / ');
        }
        tr.appendChild(src);

        // ...so the referrer sits beside it. An untagged LinkedIn click and a
        // typed URL both read "direct" in Source; only this tells them apart.
        // Shown as the host alone — the full URL is long, and the host is the
        // part an operator reads.
        var ref = el('td', '—', 'mono');
        if (r.referrer) {
          var host = r.referrer;
          try { host = new URL(r.referrer).host.replace(/^www\./, ''); } catch (e) { /* keep raw */ }
          ref.textContent = host;
          ref.title = r.referrer;
        }
        tr.appendChild(ref);
        var c = el('td');
        c.appendChild(el('span', r.consent ? 'yes' : 'no', 'pill ' + (r.consent ? 'ok' : 'err')));
        tr.appendChild(c);

        // The signed /q/ page already renders the quote and carries its own
        // Download PDF control, so this links there rather than duplicating a
        // renderer inside the dashboard.
        var q = el('td');
        if (r.quoteUrl) {
          var a = el('a', 'PDF');
          a.href = r.quoteUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.className = 'linkbtn';
          q.appendChild(a);
        } else { q.textContent = '—'; }
        tr.appendChild(q);

        var t = el('td');
        if (r.conversationId) {
          var b = el('button', 'View');
          b.type = 'button'; b.className = 'linkbtn';
          b.addEventListener('click', function () {
            showTranscript(r.conversationId, r.name ? r.name + ' · ' + r.email : r.email);
          });
          t.appendChild(b);
        } else { t.textContent = '—'; }
        tr.appendChild(t);

        tr.appendChild(el('td', r.quotes ? fmtAud.format(r.lowAud) + '–' + fmtAud.format(r.highAud) : '—', 'n'));

        var del = el('td');
        var db_ = el('button', 'Delete');
        db_.type = 'button';
        db_.className = 'linkbtn';
        db_.style.color = 'var(--bad)';
        db_.setAttribute('aria-label', 'Delete lead ' + r.email);
        db_.addEventListener('click', function () { confirmDelete(r); });
        del.appendChild(db_);
        tr.appendChild(del);

        return tr;
      },
      leadsEmptyMessage(d)
    ));
  }

  var leadTimer;
  function leadsEmptyMessage(d) {
    var q = document.getElementById('q').value.trim();
    if (q) return 'No leads match “' + q + '”. Clear the filter to see all leads.';
    var older = d.olderThanWindow || 0;
    if (older > 0) {
      return 'No leads in this window — ' + older + ' older. Choose All to see them.';
    }
    return 'No leads yet. A lead is created when a visitor completes the interview '
         + 'and submits the contact form.';
  }

  function loadLeads() {
    var q = document.getElementById('q').value.trim();
    // Carries the window so the table agrees with its own tile — the tile has
    // always been windowed and the table was not.
    get('/admin/api/leads?limit=100&days=' + days + (q ? '&q=' + encodeURIComponent(q) : ''))
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
