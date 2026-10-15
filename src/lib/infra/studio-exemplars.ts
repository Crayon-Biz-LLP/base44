// Engine 1 (Studio) exemplar library — the pattern memory Canvas has
// internalized. Lesson of the session: anything left for the model to WRITE is
// variance (the broken modal-close was invented code); anything it COPIES from
// a complete, working pattern is reliable. So this skeleton is a COMPLETE
// working console — the model adapts content (names, fields, KPIs, categories),
// never control flow. Zero runtime dependencies: all CSS inline, no CDNs.

export const SPATIAL_EXEMPLAR = `<!-- ═══ REFERENCE CONSOLE — keep the structure, ids and ALL code below;
     adapt only [ADAPT: ...] markers (product name, fields, categories, copy) ═══ -->
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>[ADAPT: Product Name]</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    :root { --bg:#0f172a; --surface:#1e293b; --border:#334155; --text:#f1f5f9; --muted:#94a3b8; --accent:#f59e0b; }
    * { box-sizing:border-box; }
    body { background:var(--bg); color:var(--text); font-family:'Inter',sans-serif; margin:0; }
    .mono { font-family:'JetBrains Mono',monospace; font-variant-numeric:tabular-nums; }
    ::-webkit-scrollbar { width:6px; height:6px; }
    ::-webkit-scrollbar-thumb { background:var(--border); border-radius:4px; }
    ::selection { background:var(--accent); color:#000; }
    .row { display:flex; align-items:center; gap:12px; }
    .spread { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .grid-6 { display:grid; grid-template-columns:repeat(6,1fr); gap:1px; background:var(--border); }
    .grid-auto { display:grid; grid-template-columns:repeat(auto-fill,minmax(132px,1fr)); gap:12px; }
    /* DEPTH: cards read as physical structures, not flat data tiles */
    .card.hi { background:linear-gradient(180deg,#243349,#1b2740); border-top:1px solid rgba(148,163,184,.35); box-shadow:0 10px 24px rgba(2,6,23,.45); }
    /* SKEUOMORPHISM: the 8 physical tiers rendered INSIDE each rack card —
       a miniature cross-section of the real rack. Color = material identity. */
    .stack { display:flex; flex-direction:column; gap:3px; margin:10px 0; }
    .tier { height:9px; border-radius:3px; }
    .tier.empty { background:transparent; border:1px dashed #3b4a63; }
    .badge { font-size:10px; padding:2px 8px; border-radius:999px; border:1px solid; font-weight:700; white-space:nowrap; }
    .badge.full { color:#34d399; border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.1); }
    .badge.part { color:#fbbf24; border-color:rgba(251,191,36,.3); background:rgba(251,191,36,.1); }
    .badge.none { color:#94a3b8; border-color:rgba(148,163,184,.25); background:rgba(148,163,184,.08); }
    .meta { font-size:11px; color:var(--muted); }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:10px; padding:14px; }
    .btn { padding:8px 16px; border-radius:8px; border:1px solid var(--border); background:var(--surface); color:var(--text); cursor:pointer; font-weight:600; }
    .btn.primary { background:var(--accent); color:#000; border-color:var(--accent); }
    .input { padding:8px 12px; border-radius:8px; border:1px solid var(--border); background:var(--bg); color:var(--text); }
    .muted { color:var(--muted); }
    .bar { height:6px; background:var(--bg); border-radius:3px; overflow:hidden; margin-top:8px; }
    .bar > div { height:100%; background:var(--accent); border-radius:3px; }
    .unit-card { cursor:pointer; transition:border-color .1s, transform .1s; }
    .unit-card:hover { border-color:var(--accent); transform:scale(1.01); }
    .pill { padding:6px 14px; border-radius:20px; background:var(--surface); border:1px solid #3b4a63; font-size:12px; cursor:pointer; color:#f8fafc; }
    .pill.active { background:var(--accent); color:#000; font-weight:600; }
    .dot { width:8px; height:8px; border-radius:50%; display:inline-block; margin-right:6px; }
    .kpi { padding:14px 16px; background:var(--bg); }
    .kpi .label { font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:.5px; }
    .kpi .val { font-size:20px; font-weight:800; }
    /* modal + toast: ONE mechanism, the .open class. Never mix with style.display. */
    .modal { position:fixed; inset:0; background:rgba(0,0,0,.65); display:none; align-items:center; justify-content:center; z-index:50; }
    .modal.open { display:flex; }
    .toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); background:var(--accent); color:#000; padding:10px 20px; border-radius:10px; font-weight:700; display:none; z-index:60; }
    .toast.open { display:block; }
    @media (max-width:760px) { .grid-6 { grid-template-columns:repeat(2,1fr); } }
  </style>
</head>
<body>
  <header class="row" style="position:sticky;top:0;z-index:10;padding:12px 24px;border-bottom:1px solid var(--border);background:var(--surface)">
    <div class="row">
      <div style="width:36px;height:36px;border-radius:8px;background:var(--accent);color:#000;display:flex;align-items:center;justify-content:center;font-weight:800">[ADAPT: 2-letter logo]</div>
      <b style="font-size:17px">[ADAPT: Product Name]</b>
    </div>
    <input id="search" class="input" style="flex:1;max-width:420px" placeholder="[ADAPT: SS304, 3mm, Rack 12]" oninput="applyFilters()">
    <button class="btn" onclick="exportCsv()">Export CSV</button>
    <button id="syncBtn" class="btn primary" onclick="sync()">Sync Changes</button>
  </header>

  <section class="grid-6" style="border-bottom:1px solid var(--border)">
    <div class="kpi"><span class="label">Utilization</span><div class="val mono" id="kpiUtil">0%</div><div class="bar"><div id="barUtil" style="width:0%"></div></div></div>
    <div class="kpi"><span class="label">Filled Slots</span><div class="val mono" id="kpiTotal">0 / 0</div></div>
    <div class="kpi"><span class="label">[ADAPT: Category A]</span><div class="val mono" id="kpiSS" style="color:#38bdf8">0</div></div>
    <div class="kpi"><span class="label">[ADAPT: Category B]</span><div class="val mono" id="kpiMS" style="color:#f97316">0</div></div>
    <div class="kpi"><span class="label">[ADAPT: Category C]</span><div class="val mono" id="kpiAL" style="color:#34d399">0</div></div>
    <div class="kpi"><span class="label">Empty</span><div class="val mono" id="kpiEmpty" style="color:var(--muted)">0</div></div>
  </section>

  <div class="row" style="padding:12px 24px;gap:8px">
    <button class="pill active" onclick="setFilter('all',this)">All</button>
    <button class="pill" onclick="setFilter('ss',this)">[ADAPT: Cat A]</button>
    <button class="pill" onclick="setFilter('ms',this)">[ADAPT: Cat B]</button>
    <button class="pill" onclick="setFilter('empty',this)">Empty</button>
    <span class="muted" style="font-size:12px"><span class="dot" style="background:#38bdf8"></span>A <span class="dot" style="background:#f97316"></span>B <span class="dot" style="background:#34d399"></span>C</span>
  </div>

  <main id="mapView" style="padding:0 24px 32px">
    <div id="unitsGrid" class="grid-auto"></div>
  </main>

  <section id="detailView" hidden style="padding:0 24px 32px">
    <div class="row" style="margin-bottom:14px">
      <button class="btn" onclick="closeDetail()">← Back to Overview</button>
      <h3 id="detailTitle" style="margin:0"></h3>
    </div>
    <div id="rackRows" class="grid-auto"></div>
  </section>

  <section id="listView" hidden style="padding:0 24px 32px">
    <table style="width:100%;border-collapse:collapse;font-size:14px" id="listTable"></table>
  </section>

  <nav class="row" style="position:fixed;bottom:0;left:0;right:0;justify-content:center;padding:10px;gap:8px;border-top:1px solid var(--border);background:var(--surface)">
    <button class="btn" id="tabMap" onclick="showView('map')">Map</button>
    <button class="btn" id="tabList" onclick="showView('list')">Inventory List</button>
  </nav>

  <div id="modal" class="modal" onclick="if(event.target===this)closeModal()">
    <div class="card" style="width:min(420px,92vw)">
      <h3 style="margin:0 0 12px" id="modalTitle">Edit Slot</h3>
      <input id="editMat" class="input" style="width:100%;margin-bottom:10px" placeholder="[ADAPT: field 1, e.g. Material]">
      <input id="editGrade" class="input" style="width:100%;margin-bottom:10px" placeholder="[ADAPT: field 2, e.g. Grade]">
      <input id="editThk" class="input" type="number" inputmode="decimal" enterkeyhint="done" style="width:100%;margin-bottom:14px" placeholder="[ADAPT: field 3, e.g. Thickness (mm)]">
      <div class="row" style="justify-content:flex-end">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="applyEdit()">Apply</button>
      </div>
    </div>
  </div>

  <div id="toast" class="toast"></div>

  <script>
    // ── STATE: flat array; each unit carries its location (rack, row). ──
    let state = [];
    let currentRack = null, editing = null, currentFilter = 'all';
    const LS_KEY = 'console_state';

    function saveLocal() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
    function loadLocal() { try { const r = localStorage.getItem(LS_KEY); return r ? JSON.parse(r) : null; } catch (e) { return null; } }

    // ── DEMO SEED: first boot only. [ADAPT] realistic names/values, not zeros. ──
    function seedDemo() {
      const mats = ['SS304','SS316','MS IS2062','Al 5052','Al 6061','Brass C36000'];
      const thk = [1.5,2,3,5,6,10];
      state = Array.from({ length: 240 }, (_, i) => {
        const rack = Math.floor(i / 8) + 1, row = (i % 8) + 1;
        if (Math.random() > 0.72) return { rack, row, material:'', grade:'', thickness:'' };
        const material = mats[Math.floor(Math.random() * mats.length)];
        return { rack, row, material, grade: material.split(' ')[0], thickness: thk[Math.floor(Math.random() * thk.length)] };
      });
      saveLocal();
    }

    function catOf(u) {
      if (!u.material) return 'empty';
      if (u.material.indexOf('SS') === 0) return 'ss';
      if (u.material.indexOf('MS') === 0) return 'ms';
      if (u.material.indexOf('Al') === 0) return 'al';
      return 'brass';
    }
    // MATERIAL COLOR IDENTITY: each category owns an industrial color.
    // [ADAPT] map to the domain's real categories.
    const CAT_COLORS = { ss:'#38bdf8', ms:'#f97316', al:'#34d399', brass:'#fbbf24' };
    // SHOP-FLOOR INTELLIGENCE: estimated load in tons (density heuristic).
    // [ADAPT] per-unit weight factor for the domain.
    function rackTons(units) {
      const D = { ss:0.014, ms:0.012, al:0.004, brass:0.011 };
      return units.reduce((s,u) => { const c = catOf(u); return s + (c !== 'empty' ? (Number(u.thickness) || 0) * D[c] : 0); }, 0);
    }

    // ── RENDER: group by parent container → ONE card per group. Never a flat
    // grid of all units. Groups open the Detail view. KPIs recompute here. ──
    function render() {
      const grid = document.getElementById('unitsGrid');
      grid.innerHTML = '';
      const groups = new Map();
      state.forEach(u => { if (!groups.has(u.rack)) groups.set(u.rack, []); groups.get(u.rack).push(u); });
      let ss=0, ms=0, al=0, other=0, empty=0, filled=0;
      groups.forEach((units, rackNum) => {
        const f = units.filter(u => u.material).length;
        filled += f;
        units.forEach(u => { const c = catOf(u); if (c==='ss') ss++; else if (c==='ms') ms++; else if (c==='al') al++; else if (c==='empty') empty++; else other++; });
        // Miniature cross-section: one tier sliver per physical row, top to bottom.
        const slivers = units.slice().sort((a,b) => a.row - b.row).map(u => {
          const c = catOf(u);
          return '<div class="tier' + (c === 'empty' ? ' empty' : '') + '" title="Row ' + u.row + (u.material ? ': ' + u.material : ': Empty') + '" style="' + (c !== 'empty' ? 'background:' + CAT_COLORS[c] : '') + '"></div>';
        }).join('');
        const badge = f === units.length ? '<span class="badge full">FULL</span>' : f > 0 ? '<span class="badge part">' + f + '/' + units.length + '</span>' : '<span class="badge none">EMPTY</span>';
        const card = document.createElement('div');
        card.className = 'card hi unit-card';
        card.innerHTML = '<div class="spread"><b>Rack ' + rackNum + '</b>' + badge + '</div>' +
          '<div class="stack">' + slivers + '</div>' +
          '<div class="meta mono">' + rackTons(units).toFixed(1) + ' T · ' + Math.round(100 * f / units.length) + '% Cap</div>';
        card.onclick = () => openDetail(rackNum);
        grid.appendChild(card);
      });
      document.getElementById('kpiUtil').innerText = Math.round(100 * filled / state.length) + '%';
      document.getElementById('barUtil').style.width = Math.round(100 * filled / state.length) + '%';
      document.getElementById('kpiTotal').innerText = filled + ' / ' + state.length;
      document.getElementById('kpiSS').innerText = ss;
      document.getElementById('kpiMS').innerText = ms;
      document.getElementById('kpiAL').innerText = al;
      document.getElementById('kpiEmpty').innerText = empty;
      renderList();
    }

    function openDetail(rackNum) {
      currentRack = rackNum;
      document.getElementById('detailTitle').innerText = 'Rack ' + rackNum + ' — 8 rows, top to bottom';
      const rows = document.getElementById('rackRows');
      rows.innerHTML = '';
      state.filter(u => u.rack === rackNum).sort((a,b) => b.row - a.row).forEach(u => {
        const d = document.createElement('div');
        const c = catOf(u);
        d.className = 'card unit-card';
        if (c !== 'empty') d.style.borderLeft = '3px solid ' + CAT_COLORS[c];
        d.innerHTML = '<div class="spread"><b>Row ' + u.row + '</b><span class="mono muted">' + (u.material ? u.material + ' · ' + u.thickness + 'mm' : 'Empty') + '</span></div>';
        d.onclick = () => openModal(u.rack, u.row);
        rows.appendChild(d);
      });
      document.getElementById('mapView').hidden = true;
      document.getElementById('detailView').hidden = false;
    }
    function closeDetail() {
      document.getElementById('detailView').hidden = true;
      document.getElementById('mapView').hidden = false;
      currentRack = null;
    }

    // ── MODAL: one mechanism only (.open class). Open and close match. ──
    function openModal(rack, row) {
      editing = state.find(u => u.rack === rack && u.row === row);
      if (!editing) return;
      document.getElementById('modalTitle').innerText = 'Edit Rack ' + rack + ' · Row ' + row;
      document.getElementById('editMat').value = editing.material || '';
      document.getElementById('editGrade').value = editing.grade || '';
      document.getElementById('editThk').value = editing.thickness || '';
      document.getElementById('modal').classList.add('open');
    }
    function closeModal() { document.getElementById('modal').classList.remove('open'); }
    function applyEdit() {
      if (!editing) return;
      editing.material = document.getElementById('editMat').value.trim();
      editing.grade = document.getElementById('editGrade').value.trim();
      editing.thickness = document.getElementById('editThk').value.trim();
      saveLocal(); render();
      if (currentRack) openDetail(currentRack);
      closeModal(); toast('Saved');
    }

    function toast(msg) {
      const t = document.getElementById('toast');
      t.innerText = msg; t.classList.add('open');
      setTimeout(() => t.classList.remove('open'), 2000);
    }

    // ── FILTERS / SEARCH / LIST ──
    function setFilter(f, el) {
      currentFilter = f;
      document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
      if (el) el.classList.add('active');
      showView('list'); render();
    }
    function applyFilters() { render(); }
    function matchesFilters(u) {
      const q = (document.getElementById('search').value || '').toLowerCase();
      const okQ = !q || (u.material + ' ' + u.grade + ' rack ' + u.rack + ' row ' + u.row).toLowerCase().indexOf(q) !== -1;
      const okF = currentFilter === 'all' || catOf(u) === currentFilter;
      return okQ && okF;
    }
    function renderList() {
      const t = document.getElementById('listTable');
      if (!t) return;
      const rows = state.filter(matchesFilters);
      t.innerHTML = '<tr style="text-align:left;color:var(--muted)"><th style="padding:8px">Rack</th><th>Row</th><th>Material</th><th>Grade</th><th>Thickness</th></tr>' +
        rows.map(u => '<tr><td style="padding:8px">' + u.rack + '</td><td>' + u.row + '</td><td>' + (u.material || '—') + '</td><td>' + (u.grade || '—') + '</td><td class="mono">' + (u.thickness ? u.thickness + ' mm' : '—') + '</td></tr>').join('');
    }

    function showView(v) {
      document.getElementById('mapView').hidden = v !== 'map';
      document.getElementById('detailView').hidden = true;
      document.getElementById('listView').hidden = v !== 'list';
    }

    // ── SYNC + EXPORT: sync posts records to the host when available. ──
    async function sync() {
      const btn = document.getElementById('syncBtn');
      btn.innerText = 'Syncing…';
      try {
        if (typeof window.__opsDeskSubmit__ === 'function') {
          await window.__opsDeskSubmit__({ records: state });
          toast('Synced to OpsDesk');
        } else { toast('Saved locally'); }
      } catch (e) { toast('Sync failed'); }
      btn.innerText = 'Sync Changes';
    }
    function exportCsv() {
      const rows = [['rack','row','material','grade','thickness']].concat(state.map(u => [u.rack,u.row,u.material,u.grade,u.thickness]));
      const blob = new Blob([rows.map(r => r.join(',')).join('\\n')], { type:'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'inventory.csv'; a.click();
      toast('Exported CSV');
    }
    function clearDemo() { state = state.map(u => ({ ...u, material:'', grade:'', thickness:'' })); saveLocal(); render(); toast('Cleared'); }

    // ── BOOT ──
    (function boot() {
      const saved = loadLocal();
      if (saved && saved.length) state = saved; else seedDemo();
      render();
    })();
  </script>
</body>
</html>`;

export const FALLBACK_EXEMPLAR = SPATIAL_EXEMPLAR;

// Keyword classifier: pick the exemplar from the user's own words. Deterministic,
// fast, extensible (new genre = new rule + skeleton).
export function pickStudioExemplar(userPrompt: string): string {
  const p = userPrompt.toLowerCase();
  const spatialWords = [
    "rack", "racks", "shelf", "shelves", "row", "rows", "slot", "slots",
    "bin", "bins", "warehouse", "godown", "storage", "room", "table", "tables",
    "floor plan", "layout", "bay", "bays", "cabinet", "locker", "seat",
  ];
  if (spatialWords.some((w) => p.includes(w))) return SPATIAL_EXEMPLAR;
  return FALLBACK_EXEMPLAR;
}
