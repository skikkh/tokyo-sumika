// データの復号・採点・ランキング・経路探索
import { REGION } from './region.js';
export const KEYS = ['rent', 'access', 'safety', 'child', 'nature', 'shop', 'gourmet', 'quiet', 'elev', 'popular', 'transit'];

export const LENSES = [
  { key: 'total', label: '総合', title: '総合ランキング', desc: '選んだ暮らし方に合わせて、11の視点を重み付けして合成したスコアです。' },
  { key: 'rent', label: '家賃', title: '家賃の手頃さ', desc: '1K・1DKの家賃相場。安いほど上位です。' },
  { key: 'access', label: 'アクセス', title: '都心アクセス', desc: `${REGION.hubsText}への平均所要時間。勤務地を入れるとその駅までの時間で比べます。` },
  { key: 'safety', label: '治安', title: '治安', desc: '市区町村の刑法犯認知件数（人口千人あたり）。少ないほど上位です。都心は昼間人口が多いぶん高く出ます。' },
  { key: 'child', label: '子育て', title: '子育てのしやすさ', desc: '待機児童数と年少人口の割合（市区町村）、駅周辺の公園・保育施設・学校の多さを合わせた指数です。' },
  { key: 'nature', label: '自然', title: '公園・自然', desc: '駅から1km圏にある公園と水辺の面積です。' },
  { key: 'shop', label: '買い物', title: '買い物・生活', desc: '駅から800m圏のスーパー・コンビニ・ドラッグストアの数です。' },
  { key: 'gourmet', label: 'グルメ', title: 'グルメ・カフェ', desc: '駅から800m圏の飲食店・カフェ・バーの数です。' },
  { key: 'quiet', label: '静けさ', title: '静けさ', desc: '夜に開く飲食店の少なさ、乗降客数の少なさ、幹線道路からの距離を合わせた指数です。' },
  { key: 'elev', label: '高台', title: '高台（水害への強さ）', desc: '駅の標高です。高いほど川の氾濫や高潮で浸水しにくい目安になります。' },
  { key: 'popular', label: '人気', title: '人気・評判', desc: '2026年のSUUMO・いい部屋ネット・LIFULL HOME\'Sの各ランキングへの掲載状況です。' },
  { key: 'transit', label: '交通', title: '交通の便', desc: '使える路線の数（徒歩で乗り換えられる駅を含む）と、始発駅かどうかです。' },
];
export const LENS = Object.fromEntries(LENSES.map(l => [l.key, l]));

export const PERSONAS = [
  { id: 'balance', label: 'バランス', w: { rent: 1, access: 1.2, safety: 0.9, child: 0.6, nature: 0.8, shop: 0.9, gourmet: 0.7, quiet: 0.6, elev: 0.5, popular: 0.7, transit: 0.9 } },
  { id: 'single', label: 'ひとり暮らし', w: { rent: 1.8, access: 2.2, safety: 1.0, child: 0, nature: 0.4, shop: 1.4, gourmet: 1.4, quiet: 0.4, elev: 0.4, popular: 0.6, transit: 1.4 } },
  { id: 'student', label: '学生', w: { rent: 2.6, access: 1.6, safety: 0.8, child: 0, nature: 0.3, shop: 1.2, gourmet: 1.2, quiet: 0.3, elev: 0.3, popular: 0.4, transit: 1.0 } },
  { id: 'couple', label: '二人暮らし', w: { rent: 1.2, access: 1.6, safety: 1.2, child: 0.3, nature: 1.2, shop: 1.2, gourmet: 1.4, quiet: 0.8, elev: 0.6, popular: 0.8, transit: 1.0 } },
  { id: 'family', label: '子育て世帯', w: { rent: 1.2, access: 1.0, safety: 2.0, child: 2.4, nature: 1.8, shop: 1.6, gourmet: 0.3, quiet: 1.6, elev: 1.2, popular: 0.5, transit: 0.6 } },
  { id: 'remote', label: '在宅ワーク', w: { rent: 2.0, access: 0.6, safety: 1.0, child: 0.3, nature: 1.8, shop: 1.2, gourmet: 1.2, quiet: 1.8, elev: 0.8, popular: 0.4, transit: 0.5 } },
  { id: 'senior', label: 'シニア', w: { rent: 1.0, access: 0.8, safety: 2.0, child: 0, nature: 1.4, shop: 2.4, gourmet: 0.4, quiet: 1.8, elev: 1.6, popular: 0.4, transit: 1.0 } },
];

export const POI_KEYS = ['super', 'conv', 'drug', 'rest', 'cafe', 'bar', 'med', 'child', 'school', 'lib', 'bath'];
export const HUB_NAMES = REGION.hubs;
// 地域（絞り込みの単位）
export const REGIONS = REGION.regions;
export const REG_NAME = REGION.regName;

// ---------- 文字列 ----------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function ruby(name, yomi) {
  return yomi ? `<ruby>${esc(name)}<rt>${esc(yomi)}</rt></ruby>` : esc(name);
}
const KANA = s => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
export function norm(s) { return KANA(String(s || '').normalize('NFKC').toLowerCase()).replace(/[ヶケ]/g, 'け').replace(/[\s・･]/g, ''); }
export const f1 = v => (v == null || isNaN(v)) ? '—' : (Math.round(v * 10) / 10).toFixed(1);
export const fint = v => (v == null || isNaN(v)) ? '—' : Math.round(v).toLocaleString('ja-JP');
export function fman(n) {
  if (n == null) return '—';
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  return n.toLocaleString('ja-JP');
}

// ---------- 最小ヒープ ----------
class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0], tk = k[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0; const n = k.length;
      while (true) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    this.lastKey = tk; return top;
  }
  get size() { return this.k.length; }
}

export class Model {
  constructor(data) {
    this.data = data;
    this.S = data.stations; this.M = data.munis; this.L = data.lines; this.G = data.graph; this.meta = data.meta;
    this.S.forEach((s, i) => { s.idx = i; });
    this.T = this.S.filter(s => s.tk);
    for (const m of this.M) { m.pf = m.pf || '13'; m.reg = REGION.regOf(m); m.stations = []; }
    for (const s of this.T) {
      s.m = this.M[s.mu];
      s.m.stations.push(s);
      s.lines = s.L.filter(l => !this.L[l].ctx);
      const tt = s.t.filter(v => v != null);
      s.avg = tt.length ? tt.reduce((a, b) => a + b, 0) / tt.length : null;
      s.key = norm(s.n) + ' ' + norm(s.y);
      s.poiO = Object.fromEntries(POI_KEYS.map((k, i) => [k, s.poi[i]]));
    }
    // 同名駅の区別
    const cnt = {};
    for (const s of this.T) cnt[s.n] = (cnt[s.n] || 0) + 1;
    for (const s of this.T) s.label = cnt[s.n] > 1 ? `${s.n}（${this.L[s.lines[0]]?.s || ''}）` : s.n;
    for (const L of this.L) L.tst = L.st.filter(i => this.S[i].tk);
    this.lensOrder = {};
    this.buildGraph();
    this.commute = null;
    this.surveys = this.meta.surveys;
  }

  // ---------- 経路グラフ ----------
  buildGraph() {
    const G = this.G, nS = this.S.length;
    const ids = new Map(); const adj = [];
    const id = n => { let i = ids.get(n); if (i === undefined) { i = adj.length; ids.set(n, i); adj.push([]); } return i; };
    this.nodeIds = ids;
    for (let s = 0; s < nS; s++) id(s);
    const add = (a, b, w) => { const ia = id(a), ib = id(b); adj[ia].push(ib, w); adj[ib].push(ia, w); };
    const NODE = (l, s) => (l + 1) * 10000 + s;
    const board = G.board;
    for (const s of this.S) for (const l of s.L) add(NODE(l, s.i), s.i, board);
    const expSt = new Set();
    for (const [k, a, b, t] of G.xe) {
      add(NODE(k, a), NODE(k, b), t);
      for (const x of [a, b]) { const key = k * 10000 + x; if (!expSt.has(key)) { expSt.add(key); add(NODE(k, x), x, board); } }
    }
    for (const [l, a, b, t] of G.le) add(NODE(l, a), NODE(l, b), t);
    for (const [u, v, w] of G.ee) add(u, v, w);
    for (const [a, b, t] of G.we) add(a, b, t);
    this.adj = adj; this.nNodes = adj.length;
    // 駅ごとのノード（改札の外＝ハブ、各路線のホーム）
    this.stNodes = this.S.map(() => []);
    for (const [n, i] of ids) { const s = n % 10000; this.stNodes[s].push(i); }
  }
  timesFrom(sid) {
    const n = this.nNodes, dist = new Float64Array(n).fill(Infinity), adj = this.adj;
    const h = new Heap();
    for (const i of this.stNodes[sid]) { dist[i] = 0; h.push(0, i); }
    while (h.size) {
      const u = h.pop(); const d = h.lastKey;
      if (d > dist[u]) continue;
      const a = adj[u];
      for (let j = 0; j < a.length; j += 2) {
        const v = a[j], nd = d + a[j + 1];
        if (nd < dist[v]) { dist[v] = nd; h.push(nd, v); }
      }
    }
    const out = new Float32Array(this.S.length);
    for (let s = 0; s < this.S.length; s++) { let m = Infinity; for (const i of this.stNodes[s]) if (dist[i] < m) m = dist[i]; out[s] = m; }
    return out;
  }
  setCommute(sid) {
    if (sid == null) { this.commute = null; return; }
    const t = this.timesFrom(sid);
    const vals = this.T.map(s => t[s.i]).filter(v => isFinite(v)).sort((a, b) => a - b);
    const pct = v => {
      if (!isFinite(v)) return 0;
      let lo = 0, hi = vals.length; while (lo < hi) { const m = (lo + hi) >> 1; if (vals[m] < v) lo = m + 1; else hi = m; }
      let hi2 = lo; while (hi2 < vals.length && vals[hi2] === v) hi2++;
      const r = (lo + hi2 - 1) / 2; return 100 - r / (vals.length - 1) * 100;
    };
    this.commute = { sid, t, p: new Float32Array(this.S.length) };
    for (const s of this.T) this.commute.p[s.i] = pct(t[s.i]);
  }

  // ---------- 採点 ----------
  p(s, key) {
    if (key === 'access' && this.commute) return this.commute.p[s.i];
    const i = KEYS.indexOf(key); const v = s.p[i];
    return v == null ? 0 : v;
  }
  total(s, w) {
    let a = 0, b = 0;
    for (const k of KEYS) { const wk = w[k] || 0; if (!wk) continue; a += wk * this.p(s, k); b += wk; }
    return b ? a / b : 0;
  }
  score(s, st) { return st.lens === 'total' ? this.total(s, st.weights) : this.p(s, st.lens); }

  inScope(s, st) {
    if (st.area !== 'all' && s.m.reg !== st.area) return false;
    if (st.mu != null && s.mu !== st.mu) return false;
    if (st.line != null && !s.lines.includes(st.line)) return false;
    return true;
  }
  passes(s, st) {
    if (st.rentMax != null && (s.rent[0] == null || s.rent[0] > st.rentMax)) return false;
    if (this.commute && st.comMax != null && this.commute.t[s.i] > st.comMax) return false;
    return true;
  }
  evaluate(st) {
    const score = new Float32Array(this.S.length).fill(-1);
    const total = new Float32Array(this.S.length).fill(-1);
    const flag = new Uint8Array(this.S.length);   // 1:範囲内, 2:条件を満たす
    for (const s of this.T) {
      total[s.i] = this.total(s, st.weights);
      score[s.i] = st.lens === 'total' ? total[s.i] : this.p(s, st.lens);
      const sc = this.inScope(s, st); const ps = this.passes(s, st);
      flag[s.i] = (sc ? 1 : 0) | (ps ? 2 : 0);
    }
    const list = this.T.filter(s => flag[s.i] === 3).sort((a, b) => (score[b.i] - score[a.i]) || (total[b.i] - total[a.i]));
    const rank = new Int32Array(this.S.length).fill(0);
    // 同順位: 総合は表示する整数点が同じとき、各視点は元の値が同じとき
    const tk = st.lens === 'total' ? Math.round : v => v;
    let r = 0, prev = null;
    list.forEach((s, i) => { const v = tk(score[s.i]); if (v !== prev) { r = i + 1; prev = v; } rank[s.i] = r; });
    const scoped = this.T.filter(s => flag[s.i] & 1).length;
    return { score, total, flag, list, rank, scoped };
  }
  // 全駅の中での順位（視点ごと）
  globalRank(s, key, weights) {
    const val = x => key === 'total' ? Math.round(this.total(x, weights)) : Math.fround(this.p(x, key));
    const v = val(s);
    let r = 1; for (const x of this.T) if (val(x) > v) r++;
    return r;
  }
  rankWithin(s, key, weights, pred) {
    const val = x => key === 'total' ? Math.round(this.total(x, weights)) : Math.fround(this.p(x, key));
    const v = val(s);
    let r = 1, n = 0; for (const x of this.T) { if (!pred(x)) continue; n++; if (val(x) > v) r++; }
    return [r, n];
  }

  // ---------- 表示用の値 ----------
  accessMin(s) { return this.commute ? this.commute.t[s.i] : s.avg; }
  bestSurvey(s) {
    if (!s.sv || !s.sv.length) return null;
    const pr = id => id.includes('suumo') && !id.includes('anaba') ? 0 : id.includes('sumicoco') ? 1 : id.includes('lifull') ? 2 : 3;
    return [...s.sv].sort((a, b) => pr(this.surveys[a[0]].id) - pr(this.surveys[b[0]].id) || a[1] - b[1])[0];
  }
  surveyShort(id) {
    if (id.includes('anaba')) return 'SUUMO穴場';
    if (id.includes('suumo')) return 'SUUMO住みたい街';
    if (id.includes('sumicoco')) return '住みここち';
    if (id.includes('lifull') && id.includes('rent')) return 'HOME\'S借りて住みたい';
    if (id.includes('lifull')) return 'HOME\'S買って住みたい';
    return 'ランキング';
  }
  value(s, key, { short = false } = {}) {
    const o = s.poiO;
    switch (key) {
      case 'total': return null;
      case 'rent': return s.rent[0] == null ? '—' : (short ? `${f1(s.rent[0])}万` : `1K ${f1(s.rent[0])}万円`);
      case 'access': {
        const t = this.accessMin(s); if (t == null || !isFinite(t)) return '—';
        if (this.commute) return short ? `${Math.round(t)}分` : `${this.S[this.commute.sid].n}まで ${Math.round(t)}分`;
        return short ? `${Math.round(t)}分` : `${REGION.hubsShort}へ平均 ${Math.round(t)}分`;
      }
      case 'safety': return s.m.cr == null ? '—' : (short ? `${f1(s.m.cr)}件` : `刑法犯 ${f1(s.m.cr)}件/千人`);
      case 'child': return short ? `${Math.round(s.ch ?? 0)}` : `指数 ${Math.round(s.ch ?? 0)}（保育・学校 ${(o.child || 0) + (o.school || 0)}か所）`;
      case 'nature': return short ? `${Math.round(s.park || 0)}ha` : `公園 ${f1(s.park)}ha・水辺 ${f1(s.water)}ha`;
      case 'shop': return short ? `${o.super || 0}店` : `スーパー ${o.super || 0}・コンビニ ${o.conv || 0}`;
      case 'gourmet': return short ? `${(o.rest || 0) + (o.cafe || 0) + (o.bar || 0)}` : `飲食店 ${o.rest || 0}・カフェ ${o.cafe || 0}・バー ${o.bar || 0}`;
      case 'quiet': return short ? `${Math.round(s.q ?? 0)}` : `指数 ${Math.round(s.q ?? 0)}${s.rid ? `（1日の乗降 ${fman(s.rid)}人）` : '（乗降客数のデータなし）'}`;
      case 'elev': return s.el == null ? '—' : (short ? `${Math.round(s.el)}m` : `標高 ${f1(s.el)}m`);
      case 'popular': {
        const b = this.bestSurvey(s); if (!b) return short ? '—' : '掲載なし';
        const sv = this.surveys[b[0]];
        return short ? `${b[1]}位` : `${this.surveyShort(sv.id)} ${b[1]}位${s.sv.length > 1 ? ` ほか${s.sv.length - 1}件` : ''}`;
      }
      case 'transit': return short ? `${s.nl}路線` : `${s.nl}路線${s.nn ? `（徒歩乗換 +${s.nn}）` : ''}${s.og ? '・始発あり' : ''}`;
    }
    return '';
  }
  elevBand(el) {
    if (el == null) return { cls: 'warn', text: '標高データがありません' };
    if (el < 0) return { cls: 'bad', text: '海抜ゼロメートル地帯（満潮時の海面より低い土地）です。ハザードマップで浸水想定を必ず確認してください。' };
    if (el < 3) return { cls: 'bad', text: '標高3m未満の低地です。大きな川の氾濫や高潮で浸水が想定されやすい地域です。' };
    if (el < 10) return { cls: 'warn', text: '標高10m未満のやや低い土地です。ハザードマップで浸水の深さを確認しておきましょう。' };
    if (el < 20) return { cls: 'warn', text: '標高10〜20m。台地のへりや谷あいでは内水氾濫（下水があふれる浸水）に注意が必要です。' };
    return { cls: 'ok', text: '標高20m以上の台地・丘陵です。大きな川の氾濫による浸水リスクは比較的低めです（崖や谷の地形は別途確認を）。' };
  }

  // ---------- 検索 ----------
  search(q, { stationsOnly = false, limit = 8 } = {}) {
    const k = norm(q); if (!k) return [];
    const out = [];
    for (const s of this.T) {
      const a = norm(s.n), b = norm(s.y), c = (s.en || '').toLowerCase().replace(/[^a-z]/g, '');
      let sc = -1;
      if (a === k || b === k) sc = 100; else if (a.startsWith(k) || b.startsWith(k)) sc = 80; else if (c && c.startsWith(k)) sc = 70; else if (a.includes(k) || b.includes(k)) sc = 50;
      if (sc >= 0) out.push({ type: 'st', s, sc: sc + Math.min(9, Math.log10(1 + s.rid)) });
    }
    if (!stationsOnly) {
      for (const m of this.M) {
        const a = norm(m.n), b = norm(m.y);
        if (a.startsWith(k) || b.startsWith(k) || a.includes(k)) out.push({ type: 'mu', m, sc: a.startsWith(k) || b.startsWith(k) ? 85 : 45 });
      }
      for (const L of this.L) {
        if (L.ctx || !L.tst.length) continue;
        const a = norm(L.n), b = norm(L.s);
        if (a.includes(k) || b.includes(k)) out.push({ type: 'ln', L, sc: b.startsWith(k) ? 75 : 40 });
      }
    }
    return out.sort((a, b) => b.sc - a.sc).slice(0, limit);
  }
}
