// 画面の部品（HTML文字列を返す）
import { KEYS, LENSES, LENS, PERSONAS, HUB_NAMES, esc, ruby, f1, fint, fman } from './model.js';

const ICON = {
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/></svg>',
  bad: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  x: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};
export { ICON };

export function sym(L, withName = false) {
  const inner = L.sym ? `<span class="sym" style="color:${esc(L.c)}"><b>${esc(L.sym)}</b></span>` : `<span class="sym dot" style="color:${esc(L.c)}"></span>`;
  return withName ? `${inner}${esc(L.s)}` : inner;
}
export function dots(model, s, max = 6) {
  return `<span class="dots" aria-hidden="true">${s.lines.slice(0, max).map(l => `<i style="background:${esc(model.L[l].c)}"></i>`).join('')}</span>`;
}

// ---------- ランキング（左ドック） ----------
export function rankRow(model, s, R, st, rank) {
  const sc = R.score[s.i];
  const val = st.lens === 'total' ? `<b>${Math.round(sc)}</b><small>点</small>` : `<b>${esc(model.value(s, st.lens, { short: true }))}</b><small>${Math.round(sc)}点</small>`;
  return `<button class="rrow${st.sel === s.i ? ' act' : ''}" data-sid="${s.i}" role="listitem">
    <span class="rn num${rank <= 3 ? ' top' : ''}">${rank}</span>
    <span><span class="nm">${ruby(s.label, s.y)}</span><span class="sub">${dots(model, s)}<span class="mu">${esc(s.m.n)}</span></span>
      <span class="bar"><i style="width:${Math.max(2, sc).toFixed(1)}%"></i></span></span>
    <span class="vv">${val}</span></button>`;
}
export function muniRow(m, v, rank, active) {
  return `<button class="rrow${active ? ' act' : ''}" data-mu="${m.i}" role="listitem">
    <span class="rn num${rank <= 3 ? ' top' : ''}">${rank}</span>
    <span><span class="nm">${ruby(m.n, m.y)}</span><span class="sub"><span class="mu">${m.stations.length}駅</span></span>
      <span class="bar"><i style="width:${Math.max(2, v.t * 100).toFixed(1)}%"></i></span></span>
    <span class="vv"><b>${esc(v.label)}</b></span></button>`;
}


// 駅のまとめ（強み・弱みを文章に）
const PHRASE = {
  rent: { good: v => `家賃の安さ（${v}）`, bad: v => `家賃の高さ（${v}）` },
  access: { good: v => `都心への近さ（${v}）`, bad: v => `都心までの時間（${v}）` },
  safety: { good: v => `犯罪の少なさ（${v}）`, bad: v => `犯罪件数の多さ（${v}）` },
  child: { good: () => '子育て環境の充実', bad: () => '子育て施設の少なさ' },
  nature: { good: v => `公園・水辺の近さ（${v}）`, bad: () => '大きな公園の少なさ' },
  shop: { good: v => `買い物の便利さ（${v}）`, bad: () => '買い物施設の少なさ' },
  gourmet: { good: v => `飲食店の多さ（${v}）`, bad: () => '飲食店の少なさ' },
  quiet: { good: () => '落ち着いた住環境', bad: () => '人通りの多さ・にぎやかさ' },
  elev: { good: v => `高台の立地（${v}）`, bad: v => `低地の立地（${v}）` },
  popular: { good: v => `ランキングでの人気（${v}）`, bad: () => '' },
  transit: { good: v => `路線の多さ（${v}）`, bad: () => '' },
};
export function summaryText(model, s) {
  const rows = KEYS.map(k => ({ k, p: model.p(s, k) }));
  const good = rows.filter(r => r.p >= 75).sort((a, b) => b.p - a.p).slice(0, 3);
  const bad = rows.filter(r => r.p <= 25 && PHRASE[r.k].bad(model.value(s, r.k))).sort((a, b) => a.p - b.p).slice(0, 2);
  const g = good.map(r => PHRASE[r.k].good(esc(model.value(s, r.k)))).filter(Boolean);
  const b = bad.map(r => PHRASE[r.k].bad(esc(model.value(s, r.k)))).filter(Boolean);
  let txt = g.length ? `<b>強み</b>は${g.join('、')}。` : '突出した強みはなく、各視点のバランスで選ぶ駅です。';
  if (b.length) txt += `<b>気になる点</b>は${b.join('、')}。`;
  return txt;
}

// ---------- 駅の詳細 ----------
export function stationDetail(model, s, st, R) {
  const m = s.m; const w = st.weights;
  const total = model.total(s, w);
  const gr = model.globalRank(s, 'total', w); const nT = model.T.length;
  const [mr, mn] = model.rankWithin(s, 'total', w, x => x.mu === s.mu);
  const persona = PERSONAS.find(p => p.id === st.persona)?.label || 'カスタム';
  // 視点別の順位
  const rows = KEYS.map(k => ({ k, r: model.globalRank(s, k, w), p: model.p(s, k) }));
  const strong = [...rows].sort((a, b) => b.p - a.p).slice(0, 3).map(r => r.k);
  const weak = [...rows].sort((a, b) => a.p - b.p).slice(0, 2).map(r => r.k);
  const lensRows = rows.map(({ k, r, p }) => `<button class="lr${st.lens === k ? ' cur' : ''}" data-lens="${k}">
      <span class="ln">${esc(LENS[k].label)}${strong.includes(k) ? '<span class="tag st">強み</span>' : weak.includes(k) ? '<span class="tag wk">弱め</span>' : ''}</span>
      <span class="lk">${r}<small>位</small></span>
      <span class="lv"><span>${esc(model.value(s, k))}</span><span class="bar"><i style="width:${Math.max(2, p).toFixed(1)}%"></i></span></span></button>`).join('');
  // 家賃
  const rentSrc = s.rs ? '<span class="src">SUUMO掲載相場</span>' : '<span class="src">当サイト推計</span>';
  const rent = `<div class="kv">${['1K・1DK', '1LDK・2DK', '2LDK・3DK'].map((k, i) => `<div><div class="k">${k}</div><div class="v">${s.rent[i] == null ? '—' : `${f1(s.rent[i])}<small>万円</small>`}</div></div>`).join('')}</div>
    <p class="note">${rentSrc}${s.rs ? ' 2026年9月時点。複数路線は平均。' : ' 市区町村の相場と近くの駅の実績から推計した目安です。'}市区町村の1K相場は ${m.rent?.['1K'] ? `${f1(m.rent['1K'])}万円` : '—'}。</p>`;
  // 所要時間
  const hubs = model.G.hubs.map((hid, i) => `<div><div class="k">${esc(HUB_NAMES[i])}</div><div class="v">${s.t[i] == null ? '—' : `${s.t[i]}<small>分</small>`}</div></div>`).join('');
  const com = model.commute ? `<p class="note"><b>${esc(model.S[model.commute.sid].n)}</b>まで 約<b>${Math.round(model.commute.t[s.i])}</b>分（設定中の勤務地・通学先）</p>` : '';
  // 施設
  const o = s.poiO;
  const fac = [['スーパー', o.super], ['コンビニ', o.conv], ['飲食店', o.rest], ['カフェ', o.cafe], ['バー・居酒屋', o.bar], ['病院・診療所', o.med], ['保育・幼稚園', o.child], ['学校', o.school], ['図書館', o.lib]]
    .map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${v == null ? '—' : fint(v)}</div></div>`).join('');
  // 自然
  const bp = s.bp ? `最寄りの大きな公園は<b>${esc(s.bp[0])}</b>（${f1(s.bp[1])}ha、駅から約${s.bp[2] < 100 ? '0.1' : f1(s.bp[2] / 1000)}km）。` : '';
  // 災害
  const band = model.elevBand(s.el);
  const k5 = m.k5 ? `<div class="flag bad">${ICON.bad}<span><b>江東5区</b>に含まれます。荒川・江戸川の氾濫や高潮では区のほぼ全域が浸水する想定で、広域避難の計画があります。</span></div>` : '';
  const q5 = m.q5 ? `<p class="note">東京都の地震の地域危険度（第9回）で、総合危険度が最も高いランク5の町丁目がこの区に${m.q5}か所あります（都内全体で85か所）。</p>` : '';
  // 混雑
  const cong = s.cg.length ? s.cg.map(([l, r]) => { const c = model.meta.cong[String(l)]; return `<div class="minilist"><button data-line="${l}">${sym(model.L[l])}<span>${esc(model.L[l].s)}<small style="display:block;color:var(--ink-3);font-size:10.5px">最混雑 ${esc(c?.section || '')} ${esc(c?.time || '')}</small></span><span class="ms">${r}%</span></button></div>`; }).join('')
    : '<p class="note">対象路線の混雑率データはありません。</p>';
  // 住む人
  const people = `<div class="kv">
    <div><div class="k">人口</div><div class="v">${m.pop ? fman(m.pop) : '—'}<small>人</small></div></div>
    <div><div class="k">一人暮らし世帯</div><div class="v">${m.sh == null ? '—' : f1(m.sh)}<small>%</small></div></div>
    <div><div class="k">子ども(0〜14歳)</div><div class="v">${m.cd == null ? '—' : f1(m.cd)}<small>%</small></div></div>
    <div><div class="k">65歳以上</div><div class="v">${m.el == null ? '—' : f1(m.el)}<small>%</small></div></div>
    <div><div class="k">平均年齢</div><div class="v">${m.age == null ? '—' : f1(m.age)}<small>歳</small></div></div>
    <div><div class="k">外国人住民</div><div class="v">${m.fr == null ? '—' : f1(m.fr)}<small>%</small></div></div>
    <div><div class="k">刑法犯/千人</div><div class="v">${m.cr == null ? '—' : f1(m.cr)}<small>件</small></div></div>
    <div><div class="k">待機児童</div><div class="v">${m.wc == null ? '—' : fint(m.wc)}<small>人</small></div></div>
    <div><div class="k">昼夜間人口比</div><div class="v">${m.dn == null ? '—' : f1(m.dn)}<small>%</small></div></div></div>
    <p class="note">いずれも${esc(m.n)}全体の値です。一人暮らし世帯と昼夜間人口比は2020年国勢調査、年齢構成・外国人は2026年1月の住民基本台帳、刑法犯は${m.cry || 2025}年の警視庁統計、待機児童は2025年4月時点。</p>`;
  const feats = (m.ft && m.ft.length) ? `<ul class="feat">${m.ft.map(f => `<li>${esc(f)}</li>`).join('')}</ul>` : '';
  // 調査ランキング
  const svs = s.sv.length ? `<div class="badges">${s.sv.map(([i, r]) => { const sv = model.surveys[i]; return `<div class="badge"><span class="br num">${r}<small style="font-size:11px">位</small></span><span class="bt">${esc(sv.title)}<small>${esc(sv.cat)}（${esc(sv.pub)}公表）</small></span></div>`; }).join('')}</div>`
    : '<p class="note">2026年の主要ランキング（SUUMO・いい部屋ネット・LIFULL HOME\'S）の上位には入っていません。</p>';
  // 同じ区・同じ路線
  const same = m.stations.filter(x => x.i !== s.i).map(x => [x, model.total(x, w)]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const sameHtml = same.map(([x, v], k) => `<button data-sid="${x.i}"><span class="mr">${k + 1}</span>${ruby(x.label, x.y)}<span class="ms">${Math.round(v)}</span></button>`).join('');
  return `<div class="d-head">
      <button class="d-close" data-close="detail" aria-label="閉じる">${ICON.close}</button>
      <div class="d-eyebrow"><button data-mu="${m.i}">${ruby(m.n, m.y)}</button><span>${s.og ? '始発駅あり' : ''}</span></div>
      <h2 class="d-name">${ruby(s.n, s.y)}</h2>
      <div class="d-en">${esc(s.en || '')}</div>
      <div class="lchips">${s.lines.map(l => `<button class="lchip" data-line="${l}">${sym(model.L[l], true)}</button>`).join('')}</div>
    </div>
    <div class="d-body">
      <section class="sec"><h3>この駅のまとめ</h3><p class="summary">${summaryText(model, s)}</p></section>
      <section class="sec"><h3>総合スコア（${esc(persona)}）</h3>
        <div class="score"><div class="big num">${Math.round(total)}<small>点</small></div>
        <div class="rk">東京都内 <b>${gr}</b>位 / ${nT}駅<br>${esc(m.n)}内 <b>${mr}</b>位 / ${mn}駅</div></div></section>
      <section class="sec"><h3>視点別の順位（東京都内${nT}駅中）</h3><div class="lensrank">${lensRows}</div>
        <p class="note">順位をクリックすると、その視点で地図とランキングを切り替えます。</p></section>
      <section class="sec"><h3>家賃相場</h3>${rent}</section>
      <section class="sec"><h3>主要駅までの時間</h3><div class="tl">${hubs}</div>${com}
        <p class="note">乗車時間と乗り換え時間の目安です（待ち時間は含みません）。急行・快速を使える区間はその速さで計算しています。</p></section>
      <section class="sec"><h3>駅の規模</h3><div class="kv two">
        <div><div class="k">1日の乗降客数</div><div class="v">${s.rid ? fman(s.rid) : '—'}<small>人</small></div></div>
        <div><div class="k">使える路線</div><div class="v">${s.nl}<small>路線${s.nn ? ` ＋徒歩乗換${s.nn}` : ''}</small></div></div></div>
        <p class="note">乗降客数は国土数値情報（2023年度、各社合計）。JRは乗車人員を2倍した値です。</p></section>
      <section class="sec"><h3>駅から800m圏の施設</h3><div class="kv">${fac}</div>
        <p class="note">OpenStreetMapに登録された施設の数です。登録の粗密があるため、目安として比較にお使いください。</p></section>
      <section class="sec"><h3>公園・自然</h3><div class="kv two">
        <div><div class="k">1km圏の公園</div><div class="v">${f1(s.park)}<small>ha</small></div></div>
        <div><div class="k">1km圏の水辺</div><div class="v">${f1(s.water)}<small>ha</small></div></div></div>
        <p class="note">${bp}</p></section>
      <section class="sec"><h3>災害への備え</h3><div class="kv two">
        <div><div class="k">駅の標高</div><div class="v">${s.el == null ? '—' : f1(s.el)}<small>m</small></div></div>
        <div><div class="k">幹線道路まで</div><div class="v">${s.road >= 3000 ? '3km超' : fint(s.road)}<small>${s.road >= 3000 ? '' : 'm'}</small></div></div></div>
        <div class="flag ${band.cls}">${ICON[band.cls]}<span>${esc(band.text)}</span></div>${k5}${q5}
        <p class="note">標高は国土地理院の数値標高モデルから。物件の場所ごとの浸水想定は<a href="https://disaportal.gsi.go.jp/" target="_blank" rel="noopener">ハザードマップポータルサイト</a>で確認できます。</p></section>
      <section class="sec"><h3>通勤ラッシュの混雑率（2024年度）</h3>${cong}</section>
      <section class="sec"><h3>${esc(m.n)}に住む人</h3>${people}${feats ? `<h3 style="margin-top:14px">${esc(m.n)}の特色</h3>${feats}` : ''}${m.chr ? `<p class="note">${esc(m.chr)}</p>` : ''}</section>
      <section class="sec"><h3>有名ランキングでの評価</h3>${svs}</section>
      ${sameHtml ? `<section class="sec"><h3>${esc(m.n)}の総合上位</h3><div class="minilist">${sameHtml}</div></section>` : ''}
    </div>
    <div class="d-actions">
      <button class="btn wide" data-act="compare" data-sid="${s.i}">${st.compare.includes(s.i) ? '比較から外す' : '比較に追加'}</button>
      <button class="btn wide" data-act="dest" data-sid="${s.i}">${st.dest === s.i ? '勤務地の設定を外す' : 'ここを勤務地にする'}</button>
    </div>`;
}

export function muniDetail(model, m, st) {
  const w = st.weights;
  const list = m.stations.map(s => [s, model.total(s, w)]).sort((a, b) => b[1] - a[1]);
  const rows = list.map(([s, v], k) => `<button data-sid="${s.i}"><span class="mr">${k + 1}</span>${ruby(s.label, s.y)}<span style="margin-left:6px">${dots(model, s, 4)}</span><span class="ms">${Math.round(v)}</span></button>`).join('');
  const mr = model.meta.surveys;
  const ranks = (m.mr || []).map(([id, r]) => `<div class="badge"><span class="br num">${r}<small style="font-size:11px">位</small></span><span class="bt">${id.includes('suumo') ? 'SUUMO 住みたい自治体ランキング2026 首都圏版' : 'いい部屋ネット 住みここち（自治体）ランキング2026 首都圏版'}</span></div>`).join('');
  return `<div class="d-head">
      <button class="d-close" data-close="detail" aria-label="閉じる">${ICON.close}</button>
      <div class="d-eyebrow">${m.ward ? '東京23区' : '多摩地域'}</div>
      <h2 class="d-name">${ruby(m.n, m.y)}</h2>
      ${m.chr ? `<p class="note" style="margin:6px 0 0;color:var(--ink-2);font-size:13px">${esc(m.chr)}</p>` : ''}
    </div>
    <div class="d-body">
      <section class="sec"><h3>基本データ</h3><div class="kv">
        <div><div class="k">人口</div><div class="v">${m.pop ? fman(m.pop) : '—'}<small>人</small></div></div>
        <div><div class="k">面積</div><div class="v">${m.area == null ? '—' : f1(m.area)}<small>km²</small></div></div>
        <div><div class="k">1K家賃相場</div><div class="v">${m.rent?.['1K'] ? f1(m.rent['1K']) : '—'}<small>万円</small></div></div>
        <div><div class="k">1LDK相場</div><div class="v">${m.rent?.['1LDK'] ? f1(m.rent['1LDK']) : '—'}<small>万円</small></div></div>
        <div><div class="k">2LDK相場</div><div class="v">${m.rent?.['2LDK'] ? f1(m.rent['2LDK']) : '—'}<small>万円</small></div></div>
        <div><div class="k">刑法犯/千人</div><div class="v">${m.cr == null ? '—' : f1(m.cr)}<small>件</small></div></div>
        <div><div class="k">待機児童</div><div class="v">${m.wc == null ? '—' : fint(m.wc)}<small>人</small></div></div>
        <div><div class="k">一人暮らし世帯</div><div class="v">${m.sh == null ? '—' : f1(m.sh)}<small>%</small></div></div>
        <div><div class="k">平均年齢</div><div class="v">${m.age == null ? '—' : f1(m.age)}<small>歳</small></div></div></div>
        ${m.k5 ? `<div class="flag bad">${ICON.bad}<span><b>江東5区</b>に含まれます。大規模水害時は区外への広域避難が計画されています。</span></div>` : ''}
        ${m.q5 ? `<p class="note">地震の地域危険度（第9回）ランク5の町丁目: ${m.q5}か所</p>` : ''}</section>
      ${m.ft?.length ? `<section class="sec"><h3>特色</h3><ul class="feat">${m.ft.map(f => `<li>${esc(f)}</li>`).join('')}</ul></section>` : ''}
      ${ranks ? `<section class="sec"><h3>自治体ランキング</h3><div class="badges">${ranks}</div></section>` : ''}
      <section class="sec"><h3>${esc(m.n)}の駅 総合ランキング（${list.length}駅）</h3>${rows ? `<div class="minilist">${rows}</div>` : '<p class="note">鉄道駅がありません。</p>'}</section>
    </div>
    <div class="d-actions"><button class="btn pri wide" data-act="scope-mu" data-mu="${m.i}">${st.mu === m.i ? '絞り込みを解除' : `${esc(m.n)}だけで比べる`}</button></div>`;
}

// ---------- 視点別ランキング一覧 ----------
export function board(model, st, R, opt) {
  const scopeName = scopeLabel(model, st);
  const inScope = model.T.filter(s => R.flag[s.i] === 3);
  const cards = LENSES.map(L => {
    const k = L.key;
    const arr = inScope.map(s => [s, k === 'total' ? model.total(s, st.weights) : model.p(s, k)]).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return `<article class="lcard"><header><h4>${esc(L.label === '総合' ? '総合' : L.title)}</h4>${k === 'total' ? `<span class="tag st">${esc(PERSONAS.find(p => p.id === st.persona)?.label || 'カスタム')}</span>` : ''}</header>
      <p>${esc(L.desc)}</p>
      <ol>${arr.map(([s, v], i) => `<li><button data-sid="${s.i}"><span class="r num">${i + 1}</span><span class="n">${ruby(s.label, s.y)}<small>${esc(s.m.n)}</small></span><span class="v">${k === 'total' ? `${Math.round(v)}点` : esc(model.value(s, k, { short: true }))}</span></button></li>`).join('')}</ol>
      <button class="more" data-lens="${k}">この視点で地図を見る →</button></article>`;
  }).join('');
  const weights = KEYS.map(k => `<label>${esc(LENS[k].label)}<input type="range" min="0" max="3" step="0.1" value="${st.weights[k] ?? 0}" data-w="${k}" aria-label="${esc(LENS[k].label)}の重み"><output>${(st.weights[k] ?? 0).toFixed(1)}</output></label>`).join('');
  const sortKey = opt.sort || 'total';
  const val = (s, k) => k === 'total' ? model.total(s, st.weights) : k === 'name' ? 0 : model.p(s, k);
  const rows = [...inScope].sort((a, b) => sortKey === 'name' ? a.y.localeCompare(b.y, 'ja') : (val(b, sortKey) - val(a, sortKey)) * (opt.asc ? -1 : 1));
  const cols = [['total', '総合'], ...KEYS.map(k => [k, LENS[k].label])];
  const table = `<div class="tablewrap"><table class="rt"><thead><tr><th class="l" data-sort="name">駅</th><th class="l">区市町村</th>${cols.map(([k, n]) => `<th data-sort="${k}"${sortKey === k ? ` aria-sort="${opt.asc ? 'ascending' : 'descending'}"` : ''}>${esc(n)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(s => `<tr data-sid="${s.i}"><td class="l"><span class="stn">${ruby(s.label, s.y)}</span></td><td class="l">${esc(s.m.n)}</td>${cols.map(([k]) => k === 'total' ? `<td><span class="num">${Math.round(model.total(s, st.weights))}</span></td>` : `<td><span class="num">${esc(model.value(s, k, { short: true }))}</span><small>${Math.round(model.p(s, k))}</small></td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<button class="ibtn sheet-close" data-close="board" aria-label="閉じる">${ICON.close}</button>
    <h2>視点別ランキング</h2>
    <p class="lead">同じ駅でも、何を重視するかで順位は大きく変わります。${esc(scopeName)}の${inScope.length}駅を、12の視点それぞれで並べました。駅名を押すと地図でその駅を開きます。</p>
    <div class="filters">${opt.filtersHtml}</div>
    <div class="lgrid">${cards}</div>
    <h3>総合スコアの重み（暮らし方）</h3>
    <div class="persona" data-persona-board>${PERSONAS.map(p => `<button class="pill" data-persona="${p.id}" aria-pressed="${st.persona === p.id}">${esc(p.label)}</button>`).join('')}<button class="pill" data-persona="custom" aria-pressed="${st.persona === 'custom'}">カスタム</button></div>
    <div class="weights">${weights}</div>
    <h3>全駅の一覧（${inScope.length}駅）</h3>
    <p class="lead" style="font-size:12.5px">各列の値と、東京都内でのパーセンタイル（100に近いほど良い）を並べています。見出しを押すと並び替えます。</p>
    ${table}`;
}
export function scopeLabel(model, st) {
  const parts = [];
  if (st.mu != null) parts.push(model.M[st.mu].n);
  else parts.push(st.area === '23' ? '東京23区' : st.area === 'tama' ? '多摩地域' : '東京都');
  if (st.line != null) parts.push(model.L[st.line].s + '沿線');
  return parts.join('・');
}

// ---------- 比較 ----------
export function compareSheet(model, st) {
  const ss = st.compare.map(i => model.S[i]);
  const colors = ['var(--s1)', 'var(--s2)', 'var(--s3)'];
  const N = KEYS.length, cx = 210, cy = 200, R = 150;
  const ang = i => -Math.PI / 2 + i * 2 * Math.PI / N;
  const pt = (i, v) => [cx + Math.cos(ang(i)) * R * v / 100, cy + Math.sin(ang(i)) * R * v / 100];
  const grid = [25, 50, 75, 100].map(g => `<polygon points="${KEYS.map((_, i) => pt(i, g).join(',')).join(' ')}" fill="none" stroke="var(--hair-2)" stroke-width="1"/>`).join('');
  const axes = KEYS.map((k, i) => { const [x, y] = pt(i, 100); const [lx, ly] = pt(i, 118); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--hair)" stroke-width="1"/><text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="var(--ink-2)">${esc(LENS[k].label)}</text>`; }).join('');
  const polys = ss.map((s, j) => `<polygon points="${KEYS.map((k, i) => pt(i, model.p(s, k)).join(',')).join(' ')}" fill="${colors[j]}" fill-opacity=".10" stroke="${colors[j]}" stroke-width="2" stroke-linejoin="round"/>${KEYS.map((k, i) => { const [x, y] = pt(i, model.p(s, k)); return `<circle cx="${x}" cy="${y}" r="4" fill="${colors[j]}" stroke="var(--card)" stroke-width="2"><title>${esc(s.n)} ${esc(LENS[k].label)}: ${Math.round(model.p(s, k))}</title></circle>`; }).join('')}`).join('');
  const rowsDef = [['総合', s => `${Math.round(model.total(s, st.weights))}点`], ...KEYS.map(k => [LENS[k].label, s => model.value(s, k)]),
    ['1LDK相場', s => s.rent[1] == null ? '—' : `${f1(s.rent[1])}万円`], ['乗降客数', s => `${fman(s.rid)}人/日`], ['区市町村', s => s.m.n]];
  const table = `<div class="tablewrap" style="max-height:none"><table class="rt" style="min-width:520px"><thead><tr><th class="l">項目</th>${ss.map((s, j) => `<th class="l"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colors[j]};margin-right:6px"></span>${esc(s.n)}</th>`).join('')}</tr></thead>
    <tbody>${rowsDef.map(([n, fn]) => `<tr style="cursor:default"><td class="l">${esc(n)}</td>${ss.map(s => `<td class="l">${esc(fn(s))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  return `<button class="ibtn sheet-close" data-close="cmp" aria-label="閉じる">${ICON.close}</button>
    <h2>駅をくらべる</h2><p class="lead">11の視点のパーセンタイル（東京都内${model.T.length}駅中、100に近いほど良い）を重ねています。</p>
    <div class="legend-row" style="margin-top:14px">${ss.map((s, j) => `<span><i style="background:${colors[j]}"></i>${esc(s.n)}</span>`).join('')}</div>
    <div class="radar-wrap"><svg class="radar" viewBox="0 0 420 400" role="img" aria-label="視点別スコアのレーダーチャート">${grid}${axes}${polys}</svg>${table}</div>`;
}

// ---------- 引っ越しガイド ----------
export function guideSheet(g) {
  const steps = g.procedures.map(p => `<div class="step"><div class="when">${esc(p.when)}</div><h4>${esc(p.title)}</h4>
    <p>${esc(p.deadline)}</p>
    <dl><dt>窓口</dt><dd>${esc(p.where)}</dd><dt>持ち物</dt><dd>${esc(p.bring)}</dd>${p.note ? `<dt>注意</dt><dd>${esc(p.note)}</dd>` : ''}<dt>出典</dt><dd><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(new URL(p.url).hostname)}</a></dd></dl></div>`).join('');
  const costs = g.initial_costs.map(c => `<div><h5>${esc(c.item)}</h5><p><b>${esc(c.typical)}</b></p><p>${esc(c.note)}</p></div>`).join('');
  const checks = g.checkpoints.map(c => `<div><h5>${esc(c.title)}</h5><p>${esc(c.text)}</p></div>`).join('');
  const mc = g.moving_cost;
  return `<button class="ibtn sheet-close" data-close="guide" aria-label="閉じる">${ICON.close}</button>
    <h2>引っ越しガイド</h2>
    <p class="lead">東京都内へ引っ越すときの手続き・お金・時期を、公的機関の案内を中心にまとめました。期限は法令や各機関の案内に基づきます。最新の情報は各窓口で確認してください。</p>
    <div class="cols" style="margin-top:22px">
      <div><h3 style="margin-top:0">手続きの流れ</h3><div class="steps">${steps}</div></div>
      <div>
        <h3 style="margin-top:0">初期費用を見積もる</h3>
        <div class="calc" id="calc">
          <label for="calc-rent" style="font-size:12px;font-weight:700;color:var(--ink-3)">家賃（管理費込み）</label>
          <div class="crow"><input type="range" id="calc-rent" min="4" max="30" step="0.5" value="9"><span class="val num" id="calc-rent-v" style="font-size:20px;font-weight:700;white-space:nowrap">9.0万円</span></div>
          <div class="row2" style="margin-bottom:8px"><span style="font-size:12px;color:var(--ink-3);font-weight:700">敷金</span>${[0, 1, 2].map(n => `<button class="pill" data-shiki="${n}" aria-pressed="${n === 1}">${n}か月</button>`).join('')}
            <span style="font-size:12px;color:var(--ink-3);font-weight:700;margin-left:8px">礼金</span>${[0, 1, 2].map(n => `<button class="pill" data-rei="${n}" aria-pressed="${n === 1}">${n}か月</button>`).join('')}</div>
          <table id="calc-t"></table>
          <p class="note">${esc(g.initial_total.text)}（<a href="${esc(g.initial_total.url)}" target="_blank" rel="noopener">出典</a>）。仲介手数料の上限は法律で家賃1か月分＋消費税と決まっています。</p>
        </div>
        <h3>引っ越しの時期と料金</h3>
        <p style="font-size:13px;color:var(--ink-2);line-height:1.7;margin:0">${esc(mc.busy_months)}</p>
        <div class="kv two" style="margin-top:10px">
          <div><div class="k">単身・通常期</div><div class="v" style="font-size:14px">${esc(mc.single.normal)}</div></div>
          <div><div class="k">単身・繁忙期</div><div class="v" style="font-size:14px">${esc(mc.single.busy)}</div></div>
          <div><div class="k">家族・通常期</div><div class="v" style="font-size:14px">${esc(mc.family.normal)}</div></div>
          <div><div class="k">家族・繁忙期</div><div class="v" style="font-size:14px">${esc(mc.family.busy)}</div></div></div>
        <p class="note">料金は<a href="${esc(mc.url)}" target="_blank" rel="noopener">SUUMO引越し見積もり</a>の集計値。${esc(g.search_timing.text)}</p>
        <p class="note">更新料: ${esc(g.renewal_fee.text)}</p>
      </div>
    </div>
    <h3>初期費用の内訳の目安</h3><div class="checks">${costs}</div>
    <h3>内見・契約で確認したいこと</h3><div class="checks">${checks}</div>
    <p class="note" style="margin-top:18px">災害リスクは<a href="${esc(g.hazard_portal.url)}" target="_blank" rel="noopener">${esc(g.hazard_portal.name)}</a>で住所ごとに確認できます。</p>`;
}
export function calcTable(rent, shiki, rei) {
  const items = [['敷金', rent * shiki], ['礼金', rent * rei], ['仲介手数料（上限）', rent * 1.1], ['前家賃（1か月）', rent], ['日割り家賃（半月の場合）', rent * 0.5], ['保証会社の初回保証料（50%）', rent * 0.5], ['火災保険（2年）', 1.5], ['鍵交換', 2.2]];
  const tot = items.reduce((a, b) => a + b[1], 0);
  return items.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.toFixed(1)}万円</td></tr>`).join('') + `<tr class="tot"><td><b>合計の目安</b></td><td>${tot.toFixed(1)}万円<small style="font-family:var(--f-ui);font-weight:400;color:var(--ink-3);margin-left:4px">家賃の${(tot / rent).toFixed(1)}か月分</small></td></tr>`;
}

// ---------- データについて ----------
export function aboutSheet(model) {
  const m = model.meta;
  const sv = m.surveys.map(s => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}（${esc(s.cat)}）</a> ${esc(s.pub)}公表</li>`).join('');
  const method = LENSES.filter(l => l.key !== 'total').map(l => `<div><h5>${esc(l.title)}</h5><p>${esc(l.desc)}</p></div>`).join('');
  return `<button class="ibtn sheet-close" data-close="about" aria-label="閉じる">${ICON.close}</button>
    <h2>データと計算方法</h2>
    <p class="lead">この図鑑は、公的な統計・オープンデータと主要な住まいランキングを組み合わせ、東京都（島しょ部を除く）の${model.T.length}駅を同じ物差しで比べられるようにしたものです。スコアは各指標を都内全駅の中でのパーセンタイル（0〜100、良いほど高い）に直した値で、総合スコアは選んだ暮らし方の重みで平均しています。</p>
    <h3>各視点の作り方</h3><div class="method">${method}</div>
    <h3>所要時間の計算</h3>
    <p class="lead" style="font-size:13px">国土数値情報の線路形状から駅間の距離を測り、路線の種類ごとの平均速度と停車時間で乗車時間を見積もっています。乗り換えは1回5分、直通運転の駅は30秒、急行・快速への乗り換えは1.5分、500m以内の別駅への徒歩は距離に応じて加算しています。待ち時間は含みません。実際の所要時間は時間帯やダイヤで変わります。</p>
    <h3>家賃について</h3>
    <p class="lead" style="font-size:13px">SUUMOの路線別家賃相場（${esc(m.rent_date)}取得）に載っている駅はその値（複数路線の場合は平均）を、載っていない駅は市区町村の相場に近くの駅の傾向を加えて推計しています。推計値は駅の詳細で「当サイト推計」と表示しています。</p>
    <h3>出典</h3>
    <ul class="srcs">
      <li>国土交通省 国土数値情報「行政区域（2025年）」「鉄道（2024年）」「駅別乗降客数（2023年度）」（CC BY 4.0）</li>
      <li>国土地理院「標高タイル（数値標高モデル）」</li>
      <li>© OpenStreetMap contributors（ODbL）: 駅名のよみ、公園・水面・河川・道路、生活施設</li>
      <li>警視庁「区市町村の町丁別、罪種別及び手口別認知件数」（${esc(String(model.M[0].cry || 2025))}年）</li>
      <li>東京都「住民基本台帳による世帯と人口」（2026年1月）、総務省「令和2年国勢調査」</li>
      <li>東京都 待機児童数（2025年4月1日）、各区市町村の公式サイト（特色）</li>
      <li><a href="${esc(m.cong_src.url)}" target="_blank" rel="noopener">${esc(m.cong_src.src)}</a>（${esc(String(m.cong_src.fy))}年度）</li>
      <li><a href="${esc(m.quake_src.url)}" target="_blank" rel="noopener">東京都「${esc(m.quake_src.survey)}」</a>（${esc(m.quake_src.pub)}）</li>
      <li><a href="${esc(m.koto5.url)}" target="_blank" rel="noopener">${esc(m.koto5.plan_name)}</a>（${esc(m.koto5.published)}）</li>
      <li>SUUMO 路線別の家賃相場（${esc(m.rent_date)}取得）${m.ward_rent_src?.name ? `、${esc(m.ward_rent_src.name)}` : ''}、LIFULL HOME'S 市区町村別の家賃相場</li>
      ${sv}
    </ul>
    <p class="note" style="margin-top:14px">スコアと推計値は物件探しの入り口として使うための目安です。実際の家賃・治安・災害リスクは物件の場所や条件で大きく変わります。契約前に現地と公式情報で確認してください。</p>`;
}
