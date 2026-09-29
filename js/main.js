import { Model, KEYS, LENSES, LENS, PERSONAS, esc, ruby, f1 } from './model.js';
import { MapScene } from './scene.js';
import * as UI from './ui.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const st = {
  lens: 'total', persona: 'balance', weights: { ...PERSONAS[0].w }, area: 'all', mu: null, line: null,
  rentMax: null, dest: null, comMax: null, sel: null, selMu: null, mode: 'station', top: false, elev: false, compare: [],
  listN: 60, boardSort: 'total', boardAsc: false,
};
let model, scene, geo, guide, R;
const ui = { dockOff: false, condOff: false, sheet: 'half' };
try { const u = JSON.parse(localStorage.getItem('sumika-ui') || '{}'); ui.dockOff = !!u.dockOff; ui.condOff = !!u.condOff; } catch (e) { /* 保存領域なし */ }
const isMobile = () => matchMedia('(max-width:760px)').matches;

try { const t = localStorage.getItem('sumika-theme'); if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; } catch (e) { /* 保存領域なし */ }

boot();

async function boot() {
  try {
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); });
    const [g, d, gd] = await Promise.all([get('data/geo.json'), get('data/stations.json'), get('data/guide.json')]);
    geo = g; guide = gd; model = new Model(d);
    $('#st-n').textContent = model.T.length; $('#st-m').textContent = model.M.length;
    scene = new MapScene($('#map'), $('#labels'), geo, model, { pickStation: sid => selectStation(sid), pickMuni, hover, userMove: () => closeSugg(), bearing: updateCompass });
    await scene.loadTextures('data/hillshade.png', 'data/elev.png');
    buildControls();
    initPanels();
    apply();
    if (/[?&](debug|promo)/.test(location.search)) window.__sumika = { scene, model, st, apply, setLens, setMuScope, setLineScope, setDest, selectStation, closeDetail, setMode };
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { scene.applyTheme(); apply(); });
    const boot = $('#boot'); boot.classList.add('done'); setTimeout(() => boot.remove(), 700);
    openFromHash();
    const touch = matchMedia('(pointer: coarse)').matches;
    const hint = $('#hint');
    if (hint && touch) hint.innerHTML = '柱の高さ＝選んだ視点での魅力度。<br>タップで詳細・2本指でピンチと回転。<br>下のパネルは取っ手を下げるとしまえます。';
    else if (hint) hint.innerHTML = '柱の高さと色が「いま選んでいる視点」での魅力度です。上の視点を切り替えると地図とランキングが入れ替わります。<br>柱や駅名をクリックすると詳細、ドラッグで移動、右ドラッグで回転、ホイールで拡大縮小。パネルは « で、下のバーは ∨ でしまえます。';
    const hideHint = () => { $('#hint')?.classList.add('off'); setTimeout(() => $('#hint')?.remove(), 500); };
    setTimeout(hideHint, 12000);
    ['pointerdown', 'wheel', 'keydown'].forEach(ev => window.addEventListener(ev, hideHint, { once: true, passive: true }));
  } catch (e) {
    console.error(e);
    $('#boot-msg').innerHTML = '<span class="err">データを読み込めませんでした。ページを再読み込みしてください。</span>';
  }
}

// ---------- 状態の反映 ----------
function lensName() {
  if (st.lens === 'access' && model.commute) return `${model.S[model.commute.sid].n}までの近さ`;
  if (st.lens === 'total') return `総合スコア（${PERSONAS.find(p => p.id === st.persona)?.label || 'カスタム'}）`;
  return LENS[st.lens].title;
}
function labelFn(s) {
  const rk = R.rank[s.i]; const inTop = R.flag[s.i] === 3 && rk && rk <= 10;
  const v = st.lens === 'total' ? Math.round(R.score[s.i]) : ['rent', 'access', 'elev', 'nature'].includes(st.lens) ? model.value(s, st.lens, { short: true }) : Math.round(R.score[s.i]);
  return `${inTop ? `<span class="rk">${rk}</span>` : ''}<ruby>${esc(s.n)}<rt>${esc(s.y)}</rt></ruby><span class="sc">${esc(String(v))}</span>`;
}
function muniValues() {
  const k = st.lens; const out = [];
  const inArea = m => st.area === 'all' || (st.area === '23' ? m.ward : !m.ward);
  const avg = (m, f) => { const xs = m.stations.map(f).filter(v => v != null && isFinite(v)); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null; };
  for (const m of model.M) {
    if (!inArea(m)) { out.push(null); continue; }
    let v = null, label = '', better = 1;
    if (k === 'total') { v = avg(m, s => model.total(s, st.weights)); label = v == null ? '' : `${Math.round(v)}点`; }
    else if (k === 'rent') { v = m.rent?.['1K'] ?? null; label = v == null ? '' : `1K ${f1(v)}万`; better = -1; }
    else if (k === 'access') { v = avg(m, s => model.accessMin(s)); label = v == null ? '' : `${Math.round(v)}分`; better = -1; }
    else if (k === 'safety') { v = m.cr ?? null; label = v == null ? '' : `${f1(v)}件/千人`; better = -1; }
    else if (k === 'elev') { v = avg(m, s => s.el); label = v == null ? '' : `平均${Math.round(v)}m`; }
    else if (k === 'child') { v = m.cd ?? null; label = v == null ? '' : `子ども${f1(v)}%`; }
    else { v = avg(m, s => model.p(s, k)); label = v == null ? '' : `${Math.round(v)}`; }
    out.push(v == null ? null : { v, label, better });
  }
  const vals = out.filter(Boolean).map(o => o.v);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  for (const o of out) if (o) { let t = hi > lo ? (o.v - lo) / (hi - lo) : 0.5; if (o.better < 0) t = 1 - t; o.t = t; }
  return out;
}
function apply() {
  R = model.evaluate(st);
  const mv = st.mode === 'muni' ? muniValues() : null;
  scene.setStations(R, { mode: st.mode, line: st.line, muni: st.mu ?? st.selMu, muniValues: mv, labelFn });
  scene.select(st.sel);
  renderDock(mv);
  renderLegend();
  syncControls();
  if (st.sel != null || st.selMu != null) renderDetail();
  if (!$('#board').hidden) renderBoard();
  renderCompareBar();
}

function renderDock(mv) {
  const L = LENS[st.lens];
  const scope = UI.scopeLabel(model, st);
  if (st.mode === 'muni') {
    $('#rk-title').textContent = `区市町村 × ${L.label}`;
    const rows = model.M.map((m, i) => [m, mv[i]]).filter(([, v]) => v).sort((a, b) => b[1].t - a[1].t);
    $('#rk-count').textContent = `${rows.length}市区町村`;
    $('#rk-desc').textContent = `${L.desc} 区市町村ごとの値で高さと色を付けています。`;
    $('#rank').innerHTML = rows.map(([m, v], k) => UI.muniRow(m, v, k + 1, st.selMu === m.i)).join('');
  } else {
    $('#rk-title').textContent = st.lens === 'total' ? '総合ランキング' : `${L.title}ランキング`;
    const pass = R.list.length;
    $('#rk-count').textContent = `${scope} ${pass}駅${pass < R.scoped ? ` / ${R.scoped}駅` : ''}`;
    $('#rk-desc').textContent = st.lens === 'access' && model.commute ? `${model.S[model.commute.sid].n}駅までの所要時間（乗車＋乗り換え、待ち時間を除く）が短い順です。` : L.desc;
    const rows = R.list.slice(0, st.listN).map(s => UI.rankRow(model, s, R, st, R.rank[s.i])).join('');
    const more = R.list.length > st.listN ? `<button class="btn wide" style="margin:8px 4px" data-act="more">さらに表示（残り${R.list.length - st.listN}駅）</button>` : '';
    $('#rank').innerHTML = rows ? rows + more : '<p class="note" style="padding:12px">条件に合う駅がありません。家賃の上限や通勤時間をゆるめてください。</p>';
  }
  $('#persona').hidden = st.lens !== 'total';
  $('#persona').innerHTML = PERSONAS.map(p => `<button class="pill" data-persona="${p.id}" aria-pressed="${st.persona === p.id}">${esc(p.label)}</button>`).join('') + (st.persona === 'custom' ? '<button class="pill" data-persona="custom" aria-pressed="true">カスタム</button>' : '');
  // 範囲タグ
  const tags = [];
  if (st.mu != null) tags.push(`<span class="scope-tag">${esc(model.M[st.mu].n)}<button data-clear="mu" aria-label="区市町村の絞り込みを解除">${UI.ICON.x}</button></span>`);
  if (st.line != null) tags.push(`<span class="scope-tag">${esc(model.L[st.line].s)}<button data-clear="line" aria-label="路線の絞り込みを解除">${UI.ICON.x}</button></span>`);
  $('#scope-tags').innerHTML = tags.join('');
}
function renderLegend() {
  const t = $('#legend-t'); if (!t) return;
  if (st.elev) {
    t.innerHTML = '地面の色 = <b>標高</b>（青いほど低地）';
    $('.c-legend .ramp').style.background = 'linear-gradient(90deg,#7a9ecc 0%,#a9cce3 14%,#d6e8d4 32%,#eeeecc 50%,#f0dcb8 66%,#dcbc9a 84%,#b89e85 100%)';
    $('.c-legend .ramp-ax').innerHTML = '<span>0m未満</span><span>3m</span><span>10m</span><span>20m</span><span>40m</span><span>150m+</span>';
  } else {
    t.innerHTML = `${st.mode === 'muni' ? '区市町村の高さと色' : '柱の高さと色'} = <b>${esc(lensName())}</b>`;
    $('.c-legend .ramp').style.background = '';
    $('.c-legend .ramp-ax').innerHTML = st.lens === 'total' || st.mode === 'muni' ? '<span>低い</span><span>高い</span>' : '<span>都内で下位</span><span>上位</span>';
  }
}
function syncControls() {
  $$('#lens .chip').forEach(b => b.setAttribute('aria-checked', String(b.dataset.lens === st.lens)));
  $$('#area .pill').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.area === st.area)));
  $('#s-mu').value = st.mu == null ? '' : String(st.mu);
  $('#s-ln').value = st.line == null ? '' : String(st.line);
  $('#m-st').setAttribute('aria-pressed', String(st.mode === 'station')); $('#m-mu').setAttribute('aria-pressed', String(st.mode === 'muni'));
  $('#c-3d').setAttribute('aria-pressed', String(!st.top)); $('#c-top').setAttribute('aria-pressed', String(st.top));
  $('#b-terrain').setAttribute('aria-pressed', String(st.elev));
  $$('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === st.mode)));
  $$('[data-cam]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.cam === 'top') === st.top)));
  $('#f-rent-v').innerHTML = st.rentMax == null ? '上限なし' : `${f1(st.rentMax)}<small>万円まで</small>`;
  $('#f-com').disabled = st.dest == null;
  $('#f-com-v').innerHTML = st.dest == null ? '—' : st.comMax == null ? '上限なし' : `${st.comMax}<small>分以内</small>`;
  const chips = [];
  if (st.rentMax != null) chips.push(`家賃 ${f1(st.rentMax)}万円まで`);
  if (st.dest != null) chips.push(`${model.S[st.dest].n}まで${st.comMax ? `${st.comMax}分以内` : ''}`);
  $('#cond-pill-t').innerHTML = chips.length ? chips.map(c => `<span class="cp-chip">${esc(c)}</span>`).join('') : '家賃・勤務地で絞る';
}

// ---------- 詳細 ----------
function renderDetail() {
  const d = $('#detail');
  const grab = '<div class="dgrab" aria-hidden="true"></div>';
  if (st.sel != null) d.innerHTML = grab + UI.stationDetail(model, model.S[st.sel], st, R);
  else if (st.selMu != null) d.innerHTML = grab + UI.muniDetail(model, model.M[st.selMu], st);
  else { d.hidden = true; $('#app').classList.remove('detail-open'); return; }
  d.hidden = false; $('#app').classList.add('detail-open');
}
function selectStation(sid, { fly = true } = {}) {
  if (sid == null) return;
  if (isMobile()) { setSheet('peek'); $('#q').blur(); }
  st.sel = sid; st.selMu = null;
  scene.select(sid);
  if (fly) scene.flyToStation(sid, { upShift: isMobile() ? 0.2 : 0 });
  renderDetail(); $('#detail .d-body')?.scrollTo(0, 0);
  $$('#rank .rrow').forEach(b => b.classList.toggle('act', +b.dataset.sid === sid));
  scene.setStations(R, { mode: st.mode, line: st.line, muni: st.mu, muniValues: st.mode === 'muni' ? muniValues() : null, labelFn });
}
function pickMuni(i) {
  if (i == null) { closeDetail(); return; }
  st.selMu = i; st.sel = null; scene.select(null);
  apply(); renderDetail();
}
function closeDetail() {
  st.sel = null; st.selMu = null; scene.select(null); const d = $('#detail'); d.hidden = true; d.classList.remove('full'); d.style.transform = ''; $('#app').classList.remove('detail-open');
  apply();
}
function setLens(k) {
  st.lens = k; st.listN = 60; apply();
}
function setMuScope(i, fly = true) {
  st.mu = i; st.listN = 60;
  if (i != null) { const m = model.M[i]; if (st.area === '23' && !m.ward || st.area === 'tama' && m.ward) st.area = 'all'; }
  apply(); if (fly && i != null) scene.flyToMuni(i);
}
function setLineScope(li, fly = true) {
  st.line = li; st.listN = 60; apply(); if (fly && li != null) scene.flyToLine(li);
}
function setDest(sid) {
  st.dest = sid; model.setCommute(sid);
  if (sid == null) { st.comMax = null; $('#f-com').value = 90; $('#f-dest').value = ''; if (st.lens === 'access') st.lens = 'access'; }
  else { $('#f-dest').value = model.S[sid].n; st.lens = 'access'; }
  apply();
}
function hover(sid, p) {
  const tip = $('#tip');
  if (sid == null) { tip.hidden = true; return; }
  const s = model.S[sid];
  const pos = p || scene.screenPos(sid) || { x: 0, y: 0 };
  const lens = st.lens === 'total' ? null : st.lens;
  tip.innerHTML = `<div class="t-name">${ruby(s.label, s.y)}</div><div class="t-row"><span>${esc(s.m.n)}</span><span>${UI.dots(model, s, 5)}</span></div>
    <div class="t-row"><span>${esc(lensName())}</span><b>${Math.round(R.score[s.i])}</b></div>
    ${lens ? `<div class="t-row"><span>${esc(LENS[lens].label)}</span><span>${esc(model.value(s, lens))}</span></div>` : `<div class="t-row"><span>家賃（1K）</span><span>${esc(model.value(s, 'rent', { short: true }))}</span></div><div class="t-row"><span>都心6駅へ平均</span><span>${s.avg == null ? '—' : Math.round(s.avg) + '分'}</span></div>`}`;
  tip.hidden = false;
  const W = window.innerWidth, H = window.innerHeight; const tw = tip.offsetWidth, th = tip.offsetHeight;
  let x = pos.x + 16, y = pos.y + 16; if (x + tw > W - 8) x = pos.x - tw - 16; if (y + th > H - 8) y = pos.y - th - 16;
  tip.style.transform = `translate(${Math.max(8, x)}px,${Math.max(8, y)}px)`;
}

// ---------- シート ----------
function openSheet(id) {
  const el = $('#' + id);
  if (id === 'board') renderBoard();
  if (id === 'guide' && !el.dataset.done) { $('#guide-in').innerHTML = UI.guideSheet(guide); el.dataset.done = 1; updateCalc(); }
  if (id === 'about' && !el.dataset.done) { $('#about-in').innerHTML = UI.aboutSheet(model); el.dataset.done = 1; }
  if (id === 'cmp') $('#cmp-in').innerHTML = UI.compareSheet(model, st);
  el.hidden = false; el.scrollTop = 0;
  el.querySelector('.sheet-close')?.focus({ preventScroll: true });
}
function closeSheet(id) { $('#' + id).hidden = true; }
function boardFilters() {
  const area = [['all', '東京都全域'], ['23', '23区'], ['tama', '多摩']].map(([k, n]) => `<button class="pill" data-area="${k}" aria-pressed="${st.area === k}">${n}</button>`).join('');
  return `<span class="lab">範囲</span>${area}<div class="sel-wrap"><select data-bsel="mu" aria-label="区市町村">${muOptions()}</select></div><div class="sel-wrap"><select data-bsel="line" aria-label="路線">${lineOptions()}</select></div>
    ${st.rentMax != null ? `<span class="scope-tag">家賃 ${f1(st.rentMax)}万円まで</span>` : ''}${st.dest != null ? `<span class="scope-tag">${esc(model.S[st.dest].n)}まで${st.comMax ? st.comMax + '分以内' : ''}</span>` : ''}`;
}
function renderBoard() {
  $('#board-in').innerHTML = UI.board(model, st, R, { sort: st.boardSort, asc: st.boardAsc, filtersHtml: boardFilters() });
  const bm = $('#board-in [data-bsel="mu"]'); if (bm) bm.value = st.mu == null ? '' : String(st.mu);
  const bl = $('#board-in [data-bsel="line"]'); if (bl) bl.value = st.line == null ? '' : String(st.line);
}
function renderCompareBar() {
  const el = $('#compare');
  if (!st.compare.length) { el.hidden = true; return; }
  const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
  el.innerHTML = `<span class="cmp-l">比較</span>${st.compare.map((i, j) => `<span class="cmp-item"><i style="background:${colors[j]}"></i>${esc(model.S[i].n)}<button data-uncmp="${i}" aria-label="${esc(model.S[i].n)}を比較から外す">${UI.ICON.x}</button></span>`).join('')}
    <button class="btn pri" data-act="open-cmp" ${st.compare.length < 2 ? 'disabled title="2駅以上選ぶと比べられます"' : ''}>くらべる</button>`;
  el.hidden = false;
}
function updateCalc() {
  const r = +$('#calc-rent').value; $('#calc-rent-v').textContent = `${r.toFixed(1)}万円`;
  const sh = +($('#calc [data-shiki][aria-pressed="true"]')?.dataset.shiki ?? 1), re = +($('#calc [data-rei][aria-pressed="true"]')?.dataset.rei ?? 1);
  $('#calc-t').innerHTML = UI.calcTable(r, sh, re);
}
function openFromHash() {
  const h = location.hash.replace('#', '');
  if (['board', 'guide', 'about'].includes(h)) openSheet(h);
}

// ---------- 検索候補 ----------
function suggest(input, box, { stationsOnly = false, onPick }) {
  const q = input.value.trim();
  const res = q ? model.search(q, { stationsOnly }) : [];
  if (!res.length) { box.hidden = true; return; }
  box.innerHTML = res.map((r, k) => {
    if (r.type === 'st') return `<button data-k="${k}">${ruby(r.s.label, r.s.y)}<span class="k">${esc(r.s.m.n)}・駅</span></button>`;
    if (r.type === 'mu') return `<button data-k="${k}">${ruby(r.m.n, r.m.y)}<span class="k">区市町村</span></button>`;
    return `<button data-k="${k}">${UI.sym(r.L)}${esc(r.L.n)}<span class="k">路線</span></button>`;
  }).join('');
  box.hidden = false;
  box.onclick = e => { const b = e.target.closest('button[data-k]'); if (!b) return; box.hidden = true; onPick(res[+b.dataset.k]); };
  box._res = res;
}
function closeSugg() { $('#q-sugg').hidden = true; $('#f-dest-sugg').hidden = true; }

// ---------- 操作の組み立て ----------
function muOptions() {
  const w = model.M.filter(m => m.ward), t = model.M.filter(m => !m.ward && m.stations.length);
  const o = m => `<option value="${m.i}">${esc(m.n)}（${m.stations.length}駅）</option>`;
  return `<option value="">区市町村で絞る</option><optgroup label="東京23区">${w.map(o).join('')}</optgroup><optgroup label="多摩地域">${t.map(o).join('')}</optgroup>`;
}
function lineOptions() {
  const groups = [['jr', 'JR'], ['metro', '東京メトロ'], ['toei', '都営'], ['private', '私鉄・その他']];
  return `<option value="">路線で絞る</option>` + groups.map(([t, n]) => {
    const ls = model.L.filter(L => L.t === t && !L.ctx && L.tst.length >= 2);
    return `<optgroup label="${n}">${ls.map(L => `<option value="${L.i}">${esc(L.n)}（${L.tst.length}駅）</option>`).join('')}</optgroup>`;
  }).join('');
}
function buildControls() {
  $('#lens').innerHTML = LENSES.map(L => `<button class="chip" role="radio" data-lens="${L.key}" aria-checked="${st.lens === L.key}" title="${esc(L.desc)}">${esc(L.label)}</button>`).join('');
  $('#s-mu').innerHTML = muOptions(); $('#s-ln').innerHTML = lineOptions();
  $('#lens').addEventListener('click', e => { const b = e.target.closest('[data-lens]'); if (b) setLens(b.dataset.lens); });
  $('#lens').addEventListener('keydown', e => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const i = LENSES.findIndex(l => l.key === st.lens); const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + LENSES.length) % LENSES.length;
    setLens(LENSES[n].key); $(`#lens [data-lens="${LENSES[n].key}"]`).focus();
  });
  $('#s-mu').addEventListener('change', e => setMuScope(e.target.value === '' ? null : +e.target.value));
  $('#s-ln').addEventListener('change', e => setLineScope(e.target.value === '' ? null : +e.target.value));
  // 検索
  const q = $('#q');
  q.addEventListener('input', () => suggest(q, $('#q-sugg'), {
    onPick: r => {
      q.value = '';
      if (r.type === 'st') selectStation(r.s.i);
      else if (r.type === 'mu') { setMuScope(r.m.i); pickMuni(r.m.i); }
      else setLineScope(r.L.i);
    }
  }));
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter') { const b = $('#q-sugg button'); if (b && !$('#q-sugg').hidden) b.click(); }
    if (e.key === 'Escape') { e.stopPropagation(); if (!$('#q-sugg').hidden) closeSugg(); else if (q.value) clearSearch(); else q.blur(); }
  });
  // 家賃・通勤
  $('#f-rent').addEventListener('input', e => { const v = +e.target.value; st.rentMax = v >= 16 ? null : v; st.listN = 60; apply(); });
  const dest = $('#f-dest');
  dest.addEventListener('input', () => { if (!dest.value.trim()) { setDest(null); return; } suggest(dest, $('#f-dest-sugg'), { stationsOnly: true, onPick: r => setDest(r.s.i) }); });
  dest.addEventListener('keydown', e => { if (e.key === 'Enter') { const b = $('#f-dest-sugg button'); if (b && !$('#f-dest-sugg').hidden) b.click(); } });
  $('#f-com').addEventListener('input', e => { const v = +e.target.value; st.comMax = v >= 90 ? null : v; st.listN = 60; apply(); });
  // 表示
  $('#m-st').onclick = () => setMode('station');
  $('#m-mu').onclick = () => setMode('muni');
  $('#c-3d').onclick = () => setCam(false);
  $('#c-top').onclick = () => setCam(true);
  $('#b-terrain').onclick = () => { st.elev = !st.elev; scene.setElev(st.elev); syncControls(); renderLegend(); };
  $('#b-theme').onclick = toggleTheme;
  $('#b-board').onclick = () => openSheet('board');
  $('#b-guide').onclick = () => openSheet('guide');
  $('#b-about').onclick = () => openSheet('about');
  // 委譲
  document.addEventListener('click', onClick);
  document.addEventListener('input', onInput);
  document.addEventListener('change', onChange);
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const open = ['cmp', 'board', 'guide', 'about'].find(id => !$('#' + id).hidden);
    if (open) closeSheet(open); else if (!$('#detail').hidden) closeDetail();
  });
  document.addEventListener('pointerdown', e => { if (!e.target.closest('.search,.dest')) closeSugg(); });
  // テーマの変化
  const mq = matchMedia('(prefers-color-scheme: dark)');
  mq.addEventListener?.('change', () => { scene.applyTheme(); apply(); });
  new MutationObserver(() => { scene.applyTheme(); apply(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // モバイル配置
  const place = () => { const small = matchMedia('(max-width:760px)').matches; const tgt = small ? $('#mcond') : $('#cond'); $$('.cbox').forEach(b => { if (b.parentElement !== tgt) tgt.appendChild(b); }); };
  place(); matchMedia('(max-width:760px)').addEventListener?.('change', place);
  window.addEventListener('hashchange', openFromHash);
}

// ---------- パネルの開閉 ----------
function saveUi() { try { localStorage.setItem('sumika-ui', JSON.stringify({ dockOff: ui.dockOff, condOff: ui.condOff })); } catch (e) { /* 保存領域なし */ } }
function setDock(off, { focus = false } = {}) {
  const hadFocus = $('#dock').contains(document.activeElement);
  ui.dockOff = off; $('#app').classList.toggle('dock-off', off);
  $('#dock-open').hidden = !off;
  $('#dock-hide').setAttribute('aria-expanded', String(!off)); $('#dock-open').setAttribute('aria-expanded', String(!off));
  if (off) { closeSugg(); if (hadFocus) $('#dock-open').focus({ preventScroll: true }); }
  else if (focus) setTimeout(() => $('#q').focus({ preventScroll: true }), 80);
  saveUi();
}
function setCond(off) {
  const hadFocus = $('#cond').contains(document.activeElement);
  ui.condOff = off; $('#app').classList.toggle('cond-off', off);
  $('#cond-pill').hidden = !off;
  $('#cond-hide').setAttribute('aria-expanded', String(!off)); $('#cond-pill').setAttribute('aria-expanded', String(!off));
  if (off) { closeSugg(); if (hadFocus) $('#cond-pill').focus({ preventScroll: true }); }
  else setTimeout(() => $('#f-rent')?.focus({ preventScroll: true }), 80);
  saveUi();
}
let safeB = 0;
function sheetHeights() {
  const H = window.innerHeight; const tb = document.querySelector('.topbar').getBoundingClientRect().bottom;
  return { peek: Math.round(80 + safeB), half: Math.round(H * 0.46), full: Math.max(Math.round(H * 0.5), Math.round(H - tb - 10)) };
}
function setSheet(state, { animate = true } = {}) {
  const d = $('#dock');
  if (!isMobile()) { d.style.height = ''; delete d.dataset.state; return; }
  const H = sheetHeights(); const h = H[state] ?? H.half;
  ui.sheet = state; d.dataset.state = state;
  if (!animate) d.classList.add('dragging');
  d.style.height = h + 'px'; $('#app').style.setProperty('--sheet', h + 'px');
  if (!animate) requestAnimationFrame(() => d.classList.remove('dragging'));
  if (state === 'peek') { d.scrollTop = 0; closeSugg(); }
  const b = $('#dock-hide');
  b.setAttribute('aria-label', state === 'peek' ? 'パネルを開く' : 'パネルをしまって地図を広く見る'); b.setAttribute('aria-expanded', String(state !== 'peek'));
  b.title = state === 'peek' ? 'パネルを開く' : 'パネルをしまう';
}
function toggleSheet() { setSheet(ui.sheet === 'peek' ? 'half' : ui.sheet === 'half' ? 'peek' : 'half'); }
function clearSearch() { const q = $('#q'); q.value = ''; $('#q-clear').hidden = true; closeSugg(); q.focus(); }
function updateCompass(az) {
  const n = $('#needle'); if (n) n.setAttribute('transform', `rotate(${(az * 180 / Math.PI).toFixed(2)} 20 20)`);
  const deg = Math.round(((az * 180 / Math.PI) % 360 + 360) % 360);
  const turned = deg > 2 && deg < 358;
  const b = $('#b-compass'); if (!b) return;
  b.classList.toggle('turned', turned);
  b.setAttribute('aria-label', turned ? `北を上にする（いまは北から${deg}度回転）` : '北を上にする（いまは北向き）');
}
function initPanels() {
  // 保存された開閉状態（デスクトップ）
  if (ui.dockOff) setDock(true); if (ui.condOff) setCond(true);
  $('#dock-hide').onclick = () => { if (isMobile()) toggleSheet(); else setDock(true); };
  $('#dock-open').onclick = () => setDock(false, { focus: true });
  $('#cond-hide').onclick = () => setCond(true);
  $('#cond-pill').onclick = () => setCond(false);
  $('#b-compass').onclick = () => scene.northUp();
  // 検索欄の消去ボタンと、フォーカスが外れたら候補を閉じる
  const q = $('#q');
  q.addEventListener('input', () => { $('#q-clear').hidden = !q.value; });
  $('#q-clear').onclick = clearSearch;
  q.addEventListener('focus', () => { if (isMobile() && ui.sheet !== 'full') setSheet('full'); if (q.value.trim()) q.dispatchEvent(new Event('input')); });
  q.addEventListener('blur', () => setTimeout(() => { if (!$('.search').contains(document.activeElement)) $('#q-sugg').hidden = true; }, 160));
  const dest = $('#f-dest');
  dest.addEventListener('blur', () => setTimeout(() => { if (!$('.dest').contains(document.activeElement)) $('#f-dest-sugg').hidden = true; }, 160));
  // 「/」キーで検索
  document.addEventListener('keydown', e => {
    if (e.key !== '/' || e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    e.preventDefault(); if (ui.dockOff) setDock(false); if (isMobile()) setSheet('full'); $('#q').focus();
  });
  // モバイル: シートのドラッグ（取っ手）
  const probe = document.createElement('div'); probe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe); safeB = probe.offsetHeight; probe.remove();
  const d = $('#dock'), g = $('#grab'); let drag = null;
  g.addEventListener('pointerdown', e => {
    if (!isMobile()) return;
    drag = { y0: e.clientY, h0: d.getBoundingClientRect().height, y: e.clientY, t: performance.now(), v: 0, moved: false };
    try { g.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベント */ } d.classList.add('dragging');
  });
  g.addEventListener('pointermove', e => {
    if (!drag) return; const now = performance.now(); const dy = e.clientY - drag.y0;
    if (Math.abs(dy) > 5) drag.moved = true;
    drag.v = (e.clientY - drag.y) / Math.max(1, now - drag.t); drag.y = e.clientY; drag.t = now;
    const H = sheetHeights(); const h = Math.min(H.full, Math.max(H.peek, drag.h0 - dy));
    d.style.height = h + 'px'; $('#app').style.setProperty('--sheet', h + 'px');
  });
  const end = () => {
    if (!drag) return; d.classList.remove('dragging');
    const moved = drag.moved, v = drag.v; drag = null;
    if (!moved) { toggleSheet(); return; }
    const H = sheetHeights(); const h = d.getBoundingClientRect().height; const order = ['peek', 'half', 'full'];
    let next;
    if (v < -0.5) next = order.find(k => H[k] > h + 4) || 'full';
    else if (v > 0.5) next = [...order].reverse().find(k => H[k] < h - 4) || 'peek';
    else next = order.reduce((a, k) => Math.abs(H[k] - h) < Math.abs(H[a] - h) ? k : a, 'half');
    setSheet(next);
  };
  g.addEventListener('pointerup', end); g.addEventListener('pointercancel', end);
  g.addEventListener('click', e => { if (e.detail === 0) toggleSheet(); });   // キーボード操作
  // モバイル: 詳細シート（下へスワイプで閉じる・上で全画面）
  const det = $('#detail'); let dd = null;
  det.addEventListener('pointerdown', e => {
    if (!isMobile() || !e.target.closest('.dgrab')) return;
    dd = { y0: e.clientY, y: e.clientY, t: performance.now(), v: 0 }; try { e.target.setPointerCapture(e.pointerId); } catch (err) { /* 合成イベント */ } det.classList.add('dragging');
  });
  det.addEventListener('pointermove', e => {
    if (!dd) return; const now = performance.now(); dd.v = (e.clientY - dd.y) / Math.max(1, now - dd.t); dd.y = e.clientY; dd.t = now;
    const dy = e.clientY - dd.y0; det.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  });
  const dend = () => {
    if (!dd) return; det.classList.remove('dragging');
    const dy = dd.y - dd.y0, v = dd.v; dd = null;
    if (Math.abs(dy) < 6) { det.classList.toggle('full'); det.style.transform = ''; return; }
    if (dy > 110 || v > 0.6) { det.style.transform = `translateY(100%)`; setTimeout(() => closeDetail(), 220); return; }
    if (dy < -40 || v < -0.4) det.classList.add('full');
    else if (dy > 40 && det.classList.contains('full')) det.classList.remove('full');
    det.style.transform = '';
  };
  det.addEventListener('pointerup', dend); det.addEventListener('pointercancel', dend);
  // 画面サイズの変化
  const relayout = () => {
    if (isMobile()) setSheet(ui.sheet, { animate: false }); else { $('#dock').style.height = ''; delete $('#dock').dataset.state; }
    const app = $('#app'), tb = document.querySelector('.topbar');
    app.style.setProperty('--tb', Math.round(tb.getBoundingClientRect().bottom - app.getBoundingClientRect().top) + 'px');
  };
  window.addEventListener('resize', relayout); relayout();
}

function setMode(m) {
  st.mode = m;
  if (m === 'muni') { st.sel = null; $('#detail').hidden = st.selMu == null; $('#app').classList.toggle('detail-open', st.selMu != null); }
  apply();
  if (m === 'muni') { const v = scene.viewNow(); if (v.dist < 520) scene.flyTo({ dist: 620, polar: Math.min(v.polar, 0.9) }); }
}
function setCam(top) { st.top = top; scene.setTop(top); syncControls(); }
function onClick(e) {
  const t = e.target;
  const md = t.closest('[data-mode]'); if (md) { setMode(md.dataset.mode); return; }
  const cm = t.closest('[data-cam]'); if (cm) { setCam(cm.dataset.cam === 'top'); return; }
  const close = t.closest('[data-close]');
  if (close) { const id = close.dataset.close; if (id === 'detail') closeDetail(); else closeSheet(id); return; }
  const clr = t.closest('[data-clear]');
  if (clr) { if (clr.dataset.clear === 'mu') setMuScope(null, false); else setLineScope(null, false); return; }
  const act = t.closest('[data-act]');
  if (act) {
    const a = act.dataset.act;
    if (a === 'more') { st.listN += 120; renderDock(st.mode === 'muni' ? muniValues() : null); return; }
    if (a === 'compare') { const sid = +act.dataset.sid; st.compare = st.compare.includes(sid) ? st.compare.filter(x => x !== sid) : [...st.compare, sid].slice(-3); renderCompareBar(); renderDetail(); return; }
    if (a === 'dest') { const sid = +act.dataset.sid; setDest(st.dest === sid ? null : sid); return; }
    if (a === 'open-cmp') { openSheet('cmp'); return; }
    if (a === 'scope-mu') { const i = +act.dataset.mu; setMuScope(st.mu === i ? null : i); return; }
  }
  const unc = t.closest('[data-uncmp]');
  if (unc) { const sid = +unc.dataset.uncmp; st.compare = st.compare.filter(x => x !== sid); renderCompareBar(); if (!$('#cmp').hidden) { if (st.compare.length < 2) closeSheet('cmp'); else openSheet('cmp'); } if (st.sel != null) renderDetail(); return; }
  const per = t.closest('[data-persona]');
  if (per) { const id = per.dataset.persona; if (id !== 'custom') { st.persona = id; st.weights = { ...PERSONAS.find(p => p.id === id).w }; } else st.persona = 'custom'; st.lens = 'total'; apply(); return; }
  const srt = t.closest('[data-sort]');
  if (srt) { const k = srt.dataset.sort; if (st.boardSort === k) st.boardAsc = !st.boardAsc; else { st.boardSort = k; st.boardAsc = k === 'name'; } renderBoard(); return; }
  const ar = t.closest('[data-area]');
  if (ar) { st.area = ar.dataset.area; if (st.mu != null) { const m = model.M[st.mu]; if (st.area === '23' && !m.ward || st.area === 'tama' && m.ward) st.mu = null; } st.listN = 60; apply(); return; }
  const lens = t.closest('[data-lens]');
  if (lens && !lens.closest('#lens')) { setLens(lens.dataset.lens); if (lens.closest('#board')) closeSheet('board'); return; }
  const line = t.closest('[data-line]');
  if (line) { setLineScope(+line.dataset.line); return; }
  const sidEl = t.closest('[data-sid]');
  if (sidEl && !t.closest('[data-act]')) { const sid = +sidEl.dataset.sid; const sh = t.closest('.sheet'); if (sh) sh.hidden = true; selectStation(sid); return; }
  const mu = t.closest('[data-mu]');
  if (mu) { const i = +mu.dataset.mu; if (st.mode === 'muni') { pickMuni(i); scene.flyToMuni(i); } else { pickMuni(i); scene.flyToMuni(i); } return; }
  const shiki = t.closest('[data-shiki]'), rei = t.closest('[data-rei]');
  if (shiki || rei) { const attr = shiki ? 'data-shiki' : 'data-rei'; $$(`#calc [${attr}]`).forEach(b => b.setAttribute('aria-pressed', String(b === (shiki || rei)))); updateCalc(); return; }
}
function onInput(e) {
  const t = e.target;
  if (t.dataset.w) { st.weights[t.dataset.w] = +t.value; st.persona = 'custom'; st.lens = 'total'; const o = t.parentElement.querySelector('output'); if (o) o.textContent = (+t.value).toFixed(1); clearTimeout(onInput._t); onInput._t = setTimeout(() => apply(), 120); return; }
  if (t.id === 'calc-rent') updateCalc();
}
function onChange(e) {
  const t = e.target;
  if (t.dataset.bsel === 'mu') setMuScope(t.value === '' ? null : +t.value, false);
  if (t.dataset.bsel === 'line') setLineScope(t.value === '' ? null : +t.value, false);
}
function toggleTheme() {
  const root = document.documentElement;
  const cur = root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try { localStorage.setItem('sumika-theme', next); } catch (e) { /* 保存領域なし */ }
}
