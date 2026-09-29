// 3D地図（three.js）
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/+esm';
import { MapControls } from 'https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/controls/MapControls.js/+esm';
import { esc } from './model.js';

const U = 100;            // 1単位 = 100m
const SLAB = 0.8;
const MU_MAX = 192, MU_VEC = MU_MAX / 4;   // 区市町村の数の上限（シェーダーの配列）         // 東京都の地面の厚み
const CTX_Y = 0.32;       // 周辺県の地面
const OVER = SLAB + 0.02; // 公園・水面など
const LINE_Y = SLAB + 0.22;
const DOT_Y = SLAB + 0.34;

const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const col = n => new THREE.Color(css(n) || '#888');

function dec(a, stride = 2) {
  const out = new Float32Array(a.length);
  let x = 0, z = 0, l = 0;
  for (let i = 0; i < a.length; i += stride) {
    if (i === 0) { x = a[0]; z = a[1]; if (stride === 3) l = a[2]; }
    else { x += a[i]; z += a[i + 1]; if (stride === 3) l += a[i + 2]; }
    out[i] = x / U; out[i + 1] = z / U; if (stride === 3) out[i + 2] = l / 10;
  }
  return out;
}
function dec4(a) {   // [x, z, lane*10] は差分、区市町村番号(+1)はそのまま
  const out = new Float32Array(a.length); let x = 0, z = 0, l = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (i === 0) { x = a[0]; z = a[1]; l = a[2]; } else { x += a[i]; z += a[i + 1]; l += a[i + 2]; }
    out[i] = x / U; out[i + 1] = z / U; out[i + 2] = l / 10; out[i + 3] = a[i + 3];
  }
  return out;
}
function shapeFrom(poly) {
  const outer = dec(poly[0]);
  const sh = new THREE.Shape();
  for (let i = 0; i < outer.length; i += 2) (i ? sh.lineTo(outer[i], -outer[i + 1]) : sh.moveTo(outer[i], -outer[i + 1]));
  for (let h = 1; h < poly.length; h++) {
    const r = dec(poly[h]); const p = new THREE.Path();
    for (let i = 0; i < r.length; i += 2) (i ? p.lineTo(r[i], -r[i + 1]) : p.moveTo(r[i], -r[i + 1]));
    sh.holes.push(p);
  }
  return sh;
}
// 平面ポリゴン群を1つのジオメトリに
function flatGeometry(polys, y) {
  const pos = [], idx = []; let base = 0;
  for (const poly of polys) {
    const sh = shapeFrom(poly);
    const pts = sh.extractPoints(1);
    const contour = pts.shape, holes = pts.holes;
    if (contour.length < 3) continue;
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, holes); } catch (e) { continue; }
    const all = contour.concat(...holes);
    for (const p of all) pos.push(p.x, y, -p.y);
    // 上向き（+y）になるように三角形の向きをそろえる
    let flip = false;
    if (tris.length) {
      const [a, b, c] = tris[0].map(k => all[k]);
      const ny = (-b.y + a.y) * (c.x - a.x) - (b.x - a.x) * (-c.y + a.y);
      flip = ny < 0;
    }
    for (const t of tris) flip ? idx.push(base + t[0], base + t[2], base + t[1]) : idx.push(base + t[0], base + t[1], base + t[2]);
    base += all.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}
function lineGeometry(list, y) {
  const pos = [];
  for (const a of list) {
    const p = dec(a);
    for (let i = 0; i + 3 < p.length; i += 2) pos.push(p[i], y, p[i + 1], p[i + 2], y, p[i + 3]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return g;
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export class MapScene {
  constructor(el, labelsEl, geo, model, cb) {
    this.el = el; this.labelsEl = labelsEl; this.geo = geo; this.model = model; this.cb = cb;
    this.dirty = true; this.anim = null; this.mode = 'station'; this.elevOn = false;
    this.promo = /[?&]promo/.test(location.search);   // 動画の撮影用（1コマずつ描く）
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: this.promo });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(el.clientWidth, el.clientHeight, false);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, el.clientWidth / Math.max(1, el.clientHeight), 1, 6000);
    this.scene.fog = new THREE.Fog(0xffffff, 600, 2400);
    // 共有ユニフォーム
    const d = geo.dem;
    this.u = {
      uHill: { value: null }, uElev: { value: null }, uDem: { value: new THREE.Vector4(d.x0 / U, d.z0 / U, d.W * d.cell / U, d.H * d.cell / U) },
      uHillK: { value: 1.0 }, uElevOn: { value: 0 }, uPaper: { value: new THREE.Color() },
      uFade: { value: new THREE.Vector4(d.x0 / U - 40, d.z0 / U - 40, (d.x0 + d.W * d.cell) / U + 40, (d.z0 + d.H * d.cell) / U + 40) },
      uRamp: { value: Array.from({ length: 8 }, () => new THREE.Color()) },
    };
    this.buildLights();
    this.buildGround();
    this.buildBasemap();
    this.buildRibbons();
    this.buildStations();
    this.buildMuniLabels();
    this.buildLandmarks();
    this.buildControls();
    this.applyTheme();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindPointer();
    this.bindTouch();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  async loadTextures(hill, elev) {
    const ld = new THREE.TextureLoader();
    const load = url => new Promise((res, rej) => ld.load(url, t => { t.colorSpace = THREE.NoColorSpace; t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.magFilter = THREE.LinearFilter; res(t); }, undefined, rej));
    const [h, e] = await Promise.all([load(hill), load(elev)]);
    this.u.uHill.value = h; this.u.uElev.value = e; this.dirty = true;
  }

  // ---------- マテリアル ----------
  landMaterial(opts = {}) {
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff, ...(opts.params || {}) });
    const u = this.u; const hill = opts.hill !== false; const fade = !!opts.fade;
    m.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = `uniform sampler2D uHill; uniform sampler2D uElev; uniform vec4 uDem; uniform float uHillK; uniform float uElevOn; uniform vec3 uPaper; uniform vec4 uFade;
varying vec3 vWP;
vec3 elevTint(float c){
  float e = c < 210.0 ? c * 0.5 - 5.0 : 100.0 + (c - 210.0) * 45.0;
  vec3 a = vec3(0.47,0.62,0.80), b = vec3(0.66,0.80,0.89), cc = vec3(0.84,0.91,0.83), dd = vec3(0.93,0.93,0.80), ee = vec3(0.94,0.86,0.72), ff = vec3(0.86,0.74,0.60), gg = vec3(0.72,0.62,0.52);
  if (e < 0.0) return a;
  if (e < 3.0) return mix(a, b, e / 3.0);
  if (e < 10.0) return mix(b, cc, (e - 3.0) / 7.0);
  if (e < 20.0) return mix(cc, dd, (e - 10.0) / 10.0);
  if (e < 40.0) return mix(dd, ee, (e - 20.0) / 20.0);
  if (e < 150.0) return mix(ee, ff, (e - 40.0) / 110.0);
  return mix(ff, gg, clamp((e - 150.0) / 900.0, 0.0, 1.0));
}
` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
${hill ? `vec2 duv = vec2((vWP.x - uDem.x) / uDem.z, 1.0 - (vWP.z - uDem.y) / uDem.w);
if (duv.x > 0.001 && duv.x < 0.999 && duv.y > 0.001 && duv.y < 0.999) {
  float hs = texture2D(uHill, duv).r;
  float k = clamp(0.5 + hs, 0.62, 1.22);
  if (uElevOn > 0.5) {
    vec3 t = elevTint(texture2D(uElev, duv).r * 255.0);
    diffuseColor.rgb = mix(diffuseColor.rgb, t * t, 0.9);
  }
  diffuseColor.rgb *= mix(1.0, k, uHillK);
}` : ''}
${fade ? `float fx = min(vWP.x - uFade.x, uFade.z - vWP.x); float fz = min(vWP.z - uFade.y, uFade.w - vWP.z);
float fe = smoothstep(0.0, 42.0, min(fx, fz));
diffuseColor.rgb = mix(uPaper, diffuseColor.rgb, fe);` : ''}`);
    };
    m.customProgramCacheKey = () => `land-${hill}-${fade}`;
    return m;
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xdde2da, 1.95);
    this.scene.add(this.hemi);
    const dl = this.sun = new THREE.DirectionalLight(0xffffff, 1.45);
    dl.castShadow = true; dl.shadow.mapSize.set(2048, 2048); dl.shadow.bias = -0.0006; dl.shadow.normalBias = 0.02;
    this.scene.add(dl); this.scene.add(dl.target);
  }

  buildGround() {
    const g = this.geo;
    // 海（東京湾）
    const dm = this.geo.dem, sx = (dm.x0 + dm.W * dm.cell / 2) / U, sz = (dm.z0 + dm.H * dm.cell / 2) / U;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(dm.W * dm.cell / U + 1600, dm.H * dm.cell / U + 1600).rotateX(-Math.PI / 2).translate(sx, 0, sz), this.seaMat = this.landMaterial({ hill: false, fade: true }));
    sea.position.set(-30, 0, -20); sea.receiveShadow = true; this.scene.add(sea);
    // 周辺県
    const ctxPolys = g.context.map(c => c.rings);
    this.ctxMat = this.landMaterial({ fade: true });
    const ctx = new THREE.Mesh(flatGeometry(ctxPolys, CTX_Y), this.ctxMat); ctx.receiveShadow = true; this.scene.add(ctx);
    // 東京都の未所属地（埋立地）
    this.otherMat = this.landMaterial({});
    if (g.other.length) { const o = new THREE.Mesh(flatGeometry(g.other, CTX_Y + 0.05), this.otherMat); o.receiveShadow = true; this.scene.add(o); }
    // 区市町村（押し出し）
    this.sideMat = new THREE.MeshLambertMaterial({ color: 0xcccccc });
    this.muniMeshes = [];
    this.muniGroup = new THREE.Group(); this.scene.add(this.muniGroup);
    const borderPos = [];
    g.munis.forEach((m, i) => {
      const shapes = m.polys.map(shapeFrom);
      const geom = new THREE.ExtrudeGeometry(shapes, { depth: SLAB, bevelEnabled: false, curveSegments: 1 });
      geom.rotateX(-Math.PI / 2);
      const cap = this.landMaterial({});
      const mesh = new THREE.Mesh(geom, [cap, this.sideMat]);
      mesh.receiveShadow = true; mesh.castShadow = false; mesh.userData.muni = i;
      this.muniGroup.add(mesh); this.muniMeshes.push({ mesh, cap, h: 1, th: 1 });
      // 境界線
      const lp = [];
      for (const poly of m.polys) {
        const r = dec(poly[0]);
        for (let k = 0; k < r.length; k += 2) {
          const a = k, b = (k + 2) % r.length;
          lp.push(r[a], SLAB + 0.015, r[a + 1], r[b], SLAB + 0.015, r[b + 1]);
        }
      }
      const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      const bl = new THREE.LineSegments(bg, this.borderMat || (this.borderMat = new THREE.LineBasicMaterial({ color: 0x999999, transparent: true, opacity: 0.9 })));
      bl.position.y = 0; mesh.add(bl);
      mesh.userData.border = bl;
    });
  }

  buildBasemap() {
    const g = this.geo;
    this.basemap = new THREE.Group(); this.scene.add(this.basemap);
    const po = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 };
    this.parkMat = new THREE.MeshLambertMaterial({ color: 0xcfe2c0, ...po });
    const parks = new THREE.Mesh(flatGeometry(g.parks.map(p => p.r), OVER), this.parkMat); parks.receiveShadow = true; this.basemap.add(parks);
    this.waterMat = new THREE.MeshLambertMaterial({ color: 0xc6d5db, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    const water = new THREE.Mesh(flatGeometry(g.water.map(p => p.r), OVER + 0.005), this.waterMat); water.receiveShadow = true; this.basemap.add(water);
    this.riverMat = new THREE.LineBasicMaterial({ color: 0x9fbac5, transparent: true, opacity: 0.85 });
    this.basemap.add(new THREE.LineSegments(lineGeometry(g.rivers.map(r => r.p), OVER + 0.01), this.riverMat));
    this.roadMats = {};
    for (const [k, op] of [['primary', 0.55], ['trunk', 0.8], ['motorway', 0.95]]) {
      const m = this.roadMats[k] = new THREE.LineBasicMaterial({ color: 0xcccccc, transparent: true, opacity: op });
      const ls = new THREE.LineSegments(lineGeometry(g.roads[k] || [], OVER + 0.012 + (k === 'motorway' ? 0.004 : 0)), m);
      this.basemap.add(ls);
    }
  }

  // ---------- 路線（画面上の太さが一定のリボン） ----------
  buildRibbons() {
    const L = this.model.L, rib = this.geo.ribbons;
    const make = (ctx) => {
      const pos = [], nrm = [], side = [], lane = [], color = [], line = [], mu = [], idx = []; let base = 0;
      rib.forEach((chains, li) => {
        const Lm = L[li]; if (!!Lm.ctx !== ctx) return;
        const c = new THREE.Color(ctx ? '#aab2b6' : Lm.c);
        for (const ch of chains) {
          const p = dec4(ch); const n = p.length / 4; if (n < 2) continue;
          for (let i = 0; i < n; i++) {
            const x = p[i * 4], z = p[i * 4 + 1], ln = p[i * 4 + 2], m = p[i * 4 + 3];
            const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
            let ax = x - p[i0 * 4], az = z - p[i0 * 4 + 1], bx = p[i1 * 4] - x, bz = p[i1 * 4 + 1] - z;
            const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; ax /= la; az /= la; bx /= lb; bz /= lb;
            if (i === 0) { ax = bx; az = bz; } if (i === n - 1) { bx = ax; bz = az; }
            let tx = ax + bx, tz = az + bz; const lt = Math.hypot(tx, tz) || 1; tx /= lt; tz /= lt;
            let nx = -tz, nz = tx;
            const dot = nx * (-az) + nz * ax; const mit = 1 / Math.max(0.4, Math.abs(dot));
            nx *= mit; nz *= mit;
            for (const sd of [-1, 1]) { pos.push(x, LINE_Y, z); nrm.push(nx, nz); side.push(sd); lane.push(ln); color.push(c.r, c.g, c.b); line.push(li); mu.push(m); }
            if (i < n - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
          }
          base += n * 2;
        }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aN', new THREE.Float32BufferAttribute(nrm, 2));
      g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
      g.setAttribute('aLane', new THREE.Float32BufferAttribute(lane, 1));
      g.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
      g.setAttribute('aLine', new THREE.Float32BufferAttribute(line, 1));
      g.setAttribute('aMu', new THREE.Float32BufferAttribute(mu, 1));
      g.setIndex(idx);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 2000);
      return g;
    };
    this.ru = { uWpp: { value: 0.001 }, uWidth: { value: 3.2 }, uLanePx: { value: 3.6 }, uMinW: { value: 0.09 }, uSel: { value: -1 }, uCasing: { value: 0 }, uPaper: { value: new THREE.Color() }, uCase: { value: new THREE.Color() }, uDimK: { value: 0.78 }, uHiW: { value: 2.0 }, uCtx: { value: 0 }, uMuH: { value: this.muLift = new Float32Array(MU_MAX) }, uFocusMu: { value: -1 }, uOutK: { value: 0.42 } };
    const vs = `#define MU_MAX ${MU_MAX}
#define MU_VEC ${MU_VEC}
attribute vec2 aN; attribute float aSide; attribute float aLane; attribute vec3 aColor; attribute float aLine; attribute float aMu;
uniform float uWpp; uniform float uWidth; uniform float uLanePx; uniform float uMinW; uniform float uSel; uniform float uCasing; uniform float uHiW;
uniform vec4 uMuH[MU_VEC]; uniform float uFocusMu;
varying vec3 vColor; varying float vKeep; varying float vOut;
#include <fog_pars_vertex>
void main(){
  vec4 mv0 = modelViewMatrix * vec4(position, 1.0);
  float wpp = max(-mv0.z, 0.1) * uWpp;
  bool sel = abs(aLine - uSel) < 0.5;
  float keep = (uSel < -0.5 || sel) ? 1.0 : 0.0;
  float w = uWidth * (sel ? uHiW : (uSel > -0.5 ? 0.7 : 1.0));
  float halfW = max(w * wpp * 0.5, uMinW) + uCasing * wpp * 1.3;
  float lane = aLane * max(uLanePx * wpp, uMinW * 2.3);
  vec3 p = position + vec3(aN.x, 0.0, aN.y) * (aSide * halfW + lane);
  p.y += (sel ? 0.05 : 0.0) + (1.0 - uCasing) * 0.006;
  int mi = int(aMu + 0.5) - 1;
  if (mi >= 0 && mi < MU_MAX) { int q = mi / 4; p.y += uMuH[q][mi - q * 4]; }   // 区市町村の立体の上に載せる
  vColor = aColor; vKeep = keep;
  vOut = (uFocusMu > -0.5 && abs(aMu - 1.0 - uFocusMu) > 0.5) ? 1.0 : 0.0;   // 絞り込んだ区の外
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
    const fs = `uniform vec3 uPaper; uniform vec3 uCase; uniform float uCasing; uniform float uDimK; uniform float uOutK;
varying vec3 vColor; varying float vKeep; varying float vOut;
#include <fog_pars_fragment>
void main(){
  vec3 c = uCasing > 0.5 ? uCase : vColor;
  if (vKeep < 0.5) c = mix(c, uPaper, uDimK);
  c = mix(c, uPaper, uOutK * vOut);
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
    const mk = (casing) => new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.ru, { uCasing: { value: casing } }]),
      vertexShader: vs, fragmentShader: fs, fog: true,
      polygonOffset: true, polygonOffsetFactor: casing ? -3 : -4, polygonOffsetUnits: casing ? -6 : -8,
    });
    this.ribVS = vs; this.ribFS = fs;
    const gMain = make(false), gCtx = make(true);
    this.ribMats = [mk(1), mk(0), mk(1), mk(0)];
    this.ribbons = new THREE.Group(); this.scene.add(this.ribbons);
    const add = (g, m, ro) => { const o = new THREE.Mesh(g, m); o.renderOrder = ro; o.frustumCulled = false; this.ribbons.add(o); return o; };
    add(gCtx, this.ribMats[2], 2); add(gCtx, this.ribMats[3], 3);
    add(gMain, this.ribMats[0], 4); add(gMain, this.ribMats[1], 5);
    this.ribMats[2].uniforms.uWidth.value = 2.0; this.ribMats[3].uniforms.uWidth.value = 2.0;
  }
  ribUniform(name, v) { for (const m of this.ribMats) { if (m.uniforms[name]) { if (m.uniforms[name].value?.copy && v?.isColor) m.uniforms[name].value.copy(v); else m.uniforms[name].value = v; } } }

  // ---------- 駅（柱・足元の点） ----------
  buildStations() {
    const T = this.model.T; const n = T.length;
    this.st = T; this.stIndex = new Map(T.map((s, i) => [s.i, i]));
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false); cyl.translate(0, 0.5, 0);
    this.pillarMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const pm = this.pillars = new THREE.InstancedMesh(cyl, this.pillarMat, n);
    pm.castShadow = true; pm.receiveShadow = true; pm.frustumCulled = false;
    pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.hCur = new Float32Array(n).fill(0.1); this.hTgt = new Float32Array(n).fill(0.1);
    this.cCur = new Float32Array(n * 3); this.cTgt = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pm.setColorAt(i, new THREE.Color(0xdddddd));
    this.scene.add(pm);
    // 足元の点
    const disc = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    this.dotOuterMat = new THREE.MeshBasicMaterial({ color: 0x333333 });
    this.dotInnerMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.dotO = new THREE.InstancedMesh(disc, this.dotOuterMat, n); this.dotI = new THREE.InstancedMesh(disc, this.dotInnerMat, n);
    for (const d of [this.dotO, this.dotI]) { d.frustumCulled = false; d.renderOrder = 6; this.scene.add(d); }
    this.dotInnerMat.polygonOffset = true; this.dotInnerMat.polygonOffsetFactor = -6; this.dotInnerMat.polygonOffsetUnits = -12;
    this.dotOuterMat.polygonOffset = true; this.dotOuterMat.polygonOffsetFactor = -5; this.dotOuterMat.polygonOffsetUnits = -10;
    // 選択リング
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.28, 48).rotateX(-Math.PI / 2), this.ringMat = new THREE.MeshBasicMaterial({ color: 0x26437e, transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.visible = false; this.ring.renderOrder = 7; this.scene.add(this.ring);
    this.sel = null; this.hover = null;
    // ラベル
    this.labels = T.map((s, i) => {
      // ラベルは操作を受け取らない（ピンチ・ホイールを地図へ通す）。クリック判定は pick() で行う
      const el = document.createElement('div'); el.className = 'lbl'; el.dataset.i = i; el.setAttribute('aria-hidden', 'true');
      this.labelsEl.appendChild(el);
      return { el, w: 0, h: 0, on: false, html: '' };
    });
    this.labelOrder = [];
    this.labelHits = [];   // 表示中ラベルの画面上の矩形 [x0, y0, x1, y1, 駅index]
    this.v3 = new THREE.Vector3();
  }

  // ---------- 区市町村名（地面に置く文字） ----------
  buildMuniLabels() {
    this.muLabels = this.geo.munis.map((m, i) => {
      const [x, z, r] = this.geo.labels[i];
      const tex = new THREE.CanvasTexture(document.createElement('canvas'));
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat);
      mesh.position.set(x / U, OVER + 0.03, z / U); mesh.renderOrder = 8;
      this.scene.add(mesh);
      return { mesh, tex, mat, x: x / U, z: z / U, r: r / U, name: m.name, yomi: this.model.M[i].y, value: '' };
    });
  }
  drawMuniLabel(L) {
    const c = L.tex.image; const ctx = c.getContext('2d');
    const fs = 64, rs = 26, pad = 12;
    const f = `700 ${fs}px "Zen Kaku Gothic New","BIZ UDPGothic",sans-serif`;
    ctx.font = f; const w1 = ctx.measureText(L.name).width;
    ctx.font = `700 ${rs}px "BIZ UDPGothic",sans-serif`; const w2 = ctx.measureText(L.yomi).width;
    ctx.font = `700 ${Math.round(fs * 0.62)}px "Barlow","BIZ UDPGothic",sans-serif`; const w3 = L.value ? ctx.measureText(L.value).width : 0;
    const W = Math.ceil(Math.max(w1, w2, w3) + pad * 2), H = Math.ceil(rs + fs + (L.value ? fs * 0.78 : 0) + pad * 2);
    if (c.width !== W || c.height !== H) {
      // WebGLのテクスチャはサイズ固定なので、寸法が変わるときは作り直す
      const nc = document.createElement('canvas'); nc.width = W; nc.height = H;
      const nt = new THREE.CanvasTexture(nc); nt.colorSpace = THREE.SRGBColorSpace; nt.anisotropy = 8;
      L.tex.dispose(); L.tex = nt; L.mat.map = nt; L.mat.needsUpdate = true;
      return this.drawMuniLabel(L);
    }
    ctx.clearRect(0, 0, W, H); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round';
    const halo = (text, x, y, font, fill, lw) => { ctx.font = font; ctx.strokeStyle = this.muHalo; ctx.lineWidth = lw; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y); };
    halo(L.yomi, W / 2, pad, `700 ${rs}px "BIZ UDPGothic",sans-serif`, L.sel ? this.muSel : this.muInk2, 6);
    halo(L.name, W / 2, pad + rs + 2, f, L.sel ? this.muSel : this.muInk, 10);
    if (L.value) halo(L.value, W / 2, pad + rs + fs + 6, `700 ${Math.round(fs * 0.62)}px "Barlow","BIZ UDPGothic",sans-serif`, this.muInk, 8);
    L.tex.needsUpdate = true;
    const s = Math.min(9, Math.max(3.2, L.r * 0.55)) / fs;   // 1px あたりの単位
    L.mesh.scale.set(W * s, 1, H * s); L.baseScale = s;
  }

  buildLandmarks() {
    const g = this.lm = new THREE.Group(); this.scene.add(g);
    const P = (lon, lat) => { const LON0 = 139.45, LAT0 = 35.69; return [(lon - LON0) * 90510.7 / U, -(lat - LAT0) * 110953 / U]; };
    const white = new THREE.MeshLambertMaterial({ color: 0xf2f2ef }), red = new THREE.MeshLambertMaterial({ color: 0xe0562b }), grey = new THREE.MeshLambertMaterial({ color: 0xc8ccd0 });
    const add = (m, x, z) => { m.position.set(x, SLAB, z); m.castShadow = true; g.add(m); return m; };
    let [x, z] = P(139.8107, 35.7101);
    const tree = new THREE.CylinderGeometry(0.12, 0.62, 12.6, 12); tree.translate(0, 6.3, 0); add(new THREE.Mesh(tree, white), x, z);
    [x, z] = P(139.7454, 35.6586);
    const tower = new THREE.ConeGeometry(0.85, 6.6, 4); tower.translate(0, 3.3, 0); add(new THREE.Mesh(tower, red), x, z);
    [x, z] = P(139.6917, 35.6896);
    const t1 = new THREE.BoxGeometry(0.6, 4.8, 0.7); t1.translate(-0.4, 2.4, 0); const t2 = new THREE.BoxGeometry(0.6, 4.8, 0.7); t2.translate(0.4, 2.4, 0);
    add(new THREE.Mesh(t1, grey), x, z); add(new THREE.Mesh(t2, grey), x, z);
    const names = [['東京スカイツリー', 'とうきょうすかいつりー', 139.8107, 35.7101, 12.8], ['東京タワー', 'とうきょうたわー', 139.7454, 35.6586, 6.8], ['東京都庁', 'とうきょうとちょう', 139.6917, 35.6896, 5.0],
      ['皇居', 'こうきょ', 139.7528, 35.6852, 0.3], ['羽田空港', 'はねだくうこう', 139.7798, 35.5494, 0.3], ['高尾山', 'たかおさん', 139.2437, 35.6251, 0.3], ['奥多摩湖', 'おくたまこ', 139.0490, 35.7870, 0.3], ['国営昭和記念公園', 'こくえいしょうわきねんこうえん', 139.3933, 35.7033, 0.3], ['お台場', 'おだいば', 139.7750, 35.6290, 0.3]];
    this.lmLabels = names.map(([n, y, lon, lat, h]) => {
      const [lx, lz] = P(lon, lat);
      const el = document.createElement('div'); el.className = 'lbl lm on'; el.innerHTML = `<ruby>${esc(n)}<rt>${esc(y)}</rt></ruby>`;
      this.labelsEl.appendChild(el);
      return { el, x: lx, z: lz, y: SLAB + h, w: 0, h: 0 };
    });
  }

  buildControls() {
    const c = this.controls = new MapControls(this.camera, this.renderer.domElement);
    c.enableDamping = true; c.dampingFactor = 0.1; c.screenSpacePanning = false;
    c.maxPolarAngle = 1.18; c.minDistance = 6; c.maxDistance = 2300; c.zoomToCursor = true; c.zoomSpeed = 1.15; c.rotateSpeed = 0.55;
    c.touches = { ONE: -1, TWO: -1 };   // タッチは bindTouch() で独自に処理（Googleマップ風）
    c.addEventListener('change', () => { this.dirty = true; });
    c.addEventListener('start', () => { this.anim = null; this.inertia = null; this.userMoving = true; this.cb.userMove?.(); });
    c.addEventListener('end', () => { this.userMoving = false; });
    const narrow = matchMedia('(max-width:760px)').matches;
    this.home = narrow ? { tx: 255, tz: 18, dist: 520, polar: 0.86, az: 0 } : { tx: 214, tz: 4, dist: 430, polar: 0.92, az: 0 };
    this.setView(this.home);
  }
  setView(v) {
    if (![v.tx, v.tz, v.dist, v.polar, v.az].every(Number.isFinite)) return;
    const c = this.controls; c.target.set(v.tx, SLAB, v.tz);
    const sp = new THREE.Spherical(v.dist, v.polar, v.az);
    this.camera.position.setFromSpherical(sp).add(c.target); c.update(); this.dirty = true;
  }
  viewNow() {
    const c = this.controls; const off = this.camera.position.clone().sub(c.target); const sp = new THREE.Spherical().setFromVector3(off);
    return { tx: c.target.x, tz: c.target.z, dist: sp.radius, polar: sp.phi, az: sp.theta };
  }
  flyTo(v, ms = 1100) {
    const a = this.viewNow(); const b = { ...a, ...v };
    let dAz = b.az - a.az; while (dAz > Math.PI) dAz -= 2 * Math.PI; while (dAz < -Math.PI) dAz += 2 * Math.PI; b.az = a.az + dAz;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) ms = 1;
    this.anim = { a, b, t0: performance.now(), ms };
  }
  flyHome() { this.flyTo({ ...this.home, polar: this.top ? 0.02 : this.home.polar }); }
  flyToXZ(x, z, dist) { const v = this.viewNow(); this.flyTo({ tx: x, tz: z, dist: dist ?? Math.min(v.dist, 150), polar: this.top ? 0.02 : Math.min(v.polar, 0.95) }); }
  flyToStation(sid, { upShift = 0 } = {}) {
    const s = this.model.S[sid]; const v = this.viewNow();
    const dist = Math.min(Math.max(v.dist * 0.6, 70), 140); const polar = this.top ? 0.02 : Math.min(v.polar, 0.95);
    // 画面下をシートが覆うときは、駅が画面の上寄りに来るよう注視点を手前にずらす
    const d = upShift * 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) / Math.max(0.35, Math.cos(polar));
    this.flyTo({ tx: s.x / U + Math.sin(v.az) * d, tz: s.z / U + Math.cos(v.az) * d, dist, polar });
  }
  flyToMuni(i) { const L = this.muLabels[i]; const r = this.geo.labels[i][2] / U; this.flyToXZ(L.x, L.z, Math.max(90, Math.min(420, r * 16))); }
  flyToLine(li) {
    const ids = this.model.L[li].tst; if (!ids.length) return;
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const i of ids) { const s = this.model.S[i]; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
    const span = Math.max(x1 - x0, z1 - z0) / U;
    this.flyToXZ((x0 + x1) / 2 / U, (z0 + z1) / 2 / U, Math.max(90, Math.min(700, span * 1.9)));
  }
  setTop(on) { this.top = on; const v = this.viewNow(); this.flyTo({ polar: on ? 0.02 : 0.92, dist: v.dist }); }
  northUp() { this.flyTo({ az: 0 }, 700); }
  // 画面上の点 (x0,y0) の地面が (x1,y1) に来るように平行移動
  panScreen(x0, y0, x1, y1) { const a = this.groundAt(x0, y0), b = this.groundAt(x1, y1); if (!a || !b) return; const v = this.viewNow(); this.flyTo({ tx: v.tx + (a.x - b.x), tz: v.tz + (a.z - b.z) }, 650); }

  // ---------- テーマ ----------
  applyTheme() {
    const paper = col('--paper');
    this.renderer.setClearColor(paper, 1);
    this.scene.fog.color.copy(paper);
    this.u.uPaper.value.copy(paper);
    this.seaMat.color.copy(col('--water'));
    this.ctxMat.color.copy(col('--land-ctx'));
    this.otherMat.color.copy(col('--land-ctx'));
    this.sideMat.color.copy(col('--land-side'));
    this.landCol = col('--land');
    for (const m of this.muniMeshes) m.cap.color.copy(this.landCol);
    this.borderMat.color.copy(col('--border'));
    this.parkMat.color.copy(col('--park'));
    this.waterMat.color.copy(col('--water'));
    this.riverMat.color.copy(col('--water-line'));
    this.roadMats.primary.color.copy(col('--road')); this.roadMats.trunk.color.copy(col('--road')); this.roadMats.motorway.color.copy(col('--road-major'));
    this.ribUniform('uPaper', paper); this.ribUniform('uCase', col('--land'));
    this.dotOuterMat.color.copy(col('--ink-2')); this.dotInnerMat.color.copy(col('--card'));
    this.ringMat.color.copy(col('--accent'));
    const dark = document.documentElement.dataset.theme === 'dark' || (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    this.dark = dark;
    this.hemi.color.set(dark ? 0xb8c4d6 : 0xffffff); this.hemi.groundColor.copy(paper); this.hemi.intensity = dark ? 1.7 : 1.95;
    this.sun.intensity = dark ? 1.05 : 1.45;
    this.u.uHillK.value = dark ? 0.75 : 1.0;
    this.pillarMat.emissive.set(dark ? 0x16233c : 0x000000);
    this.ramp = ['--r0', '--r1', '--r2', '--r3', '--r4', '--r5', '--r6', '--r7'].map(col);
    this.stub = col('--land-side'); this.accent = col('--accent');
    this.muInk = css('--ink-2'); this.muInk2 = css('--ink-3'); this.muHalo = css('--land'); this.muSel = css('--accent');
    for (const L of this.muLabels) this.drawMuniLabel(L);
    this.outlineCase = dark ? paper.clone() : new THREE.Color(0xffffff);
    this.applyMaskTheme();
    if (this.outlineFor != null) this.setOutline(this.outlineFor, true);
    this.dirty = true;
  }
  rampColor(t, out) {
    t = Math.min(1, Math.max(0, t)) * 7; const i = Math.min(6, Math.floor(t)); const f = t - i;
    return out.copy(this.ramp[i]).lerp(this.ramp[i + 1], f);
  }

  // ---------- 状態の反映 ----------
  // items: { score: Float32Array(0..100 / -1), flag, rank }, labelFn(s) -> html, focus: {line, muni}
  setStations(R, opts) {
    const T = this.st; const tmp = new THREE.Color();
    this.R = R; this.opts = opts;
    // 範囲内の分布で伸ばす（上位ほど目立つように）
    const vals = []; for (const s of T) if (R.flag[s.i] === 3) vals.push(R.score[s.i]);
    vals.sort((a, b) => a - b);
    const lo = vals.length ? vals[Math.floor(vals.length * 0.04)] : 0, hi = vals.length ? vals[vals.length - 1] : 100;
    const span = Math.max(8, hi - lo);
    for (let i = 0; i < T.length; i++) {
      const s = T[i]; const f = R.flag[s.i]; const sc = R.score[s.i];
      const ok = f === 3;
      const t = Math.min(1, Math.max(0, (sc - lo) / span));
      this.hTgt[i] = opts.mode === 'muni' ? 0 : ok ? 0.03 + Math.pow(t, 3.0) : (f & 1 ? 0.025 : 0.02);
      if (ok) this.rampColor(0.02 + Math.pow(t, 2.0) * 0.98, tmp); else tmp.copy(this.stub);
      this.cTgt[i * 3] = tmp.r; this.cTgt[i * 3 + 1] = tmp.g; this.cTgt[i * 3 + 2] = tmp.b;
    }
    // ラベル
    for (let i = 0; i < T.length; i++) {
      const s = T[i]; const L = this.labels[i];
      const html = opts.labelFn(s);
      if (html !== L.html) { L.html = html; L.el.innerHTML = html; L.w = 0; }
      L.el.classList.toggle('sel', this.sel === i);
    }
    const order = T.map((s, i) => i).filter(i => R.flag[T[i].i] === 3).sort((a, b) => R.score[T[b].i] - R.score[T[a].i]);
    this.labelOrder = order;
    this.ribUniform('uSel', opts.line == null ? -1 : opts.line);
    this.setMuniFocus(opts.muni, opts.mode, opts.muniValues);
    this.pillars.visible = opts.mode !== 'muni'; this.dotO.visible = this.dotI.visible = opts.mode !== 'muni';
    this.basemap.visible = opts.mode !== 'muni';
    this.animStart = performance.now();
    this.dirty = true;
  }
  setMuniFocus(mi, mode, values) {
    const tmp = new THREE.Color(); const paper = this.u.uPaper.value;
    this.focusMu = mi; this.focusMode = mode;
    this.muniMeshes.forEach((m, i) => {
      if (mode === 'muni' && values) {
        const v = values[i];
        m.th = v == null ? 1 : 1.5 + v.t * 22;
        this.rampColor(v == null ? 0 : v.t, tmp);
        if (mi != null && mi !== i) tmp.lerp(paper, this.dark ? 0.6 : 0.62);   // 選んだ区以外は淡く
        m.cap.color.copy(tmp);
        this.muLabels[i].value = v?.label || '';
      } else {
        m.th = 1;
        m.cap.color.copy(this.landCol);
        if (mi === i && this.dark) m.cap.color.lerp(this.accent, 0.16);   // 暗い地図では区の中を少し明るく
        this.muLabels[i].value = '';
      }
      m.mesh.userData.border.material = this.borderMat;
    });
    this.muLabels.forEach((L, i) => {
      const sel = mi === i && mode !== 'muni';   // 区市で見るときは塗り色の上なので通常色のまま
      if (L.value !== L.drawn || sel !== L.sel) { L.drawn = L.value; L.sel = sel; this.drawMuniLabel(L); }
    });
    this.ribUniform('uFocusMu', mode === 'muni' || mi == null ? -1 : mi);
    this.setOutline(mi);
    this.setMask(mode === 'muni' ? null : mi);
    this.dirty = true;
  }
  // 選んだ区市町村の輪郭（画面上の太さが一定の線＋縁取り）。区市で見るときは立体の上に載せる
  setOutline(mi, force = false) {
    if (!force && this.outlineFor === mi) return;
    this.outlineFor = mi;
    for (const o of this.outlines || []) { this.scene.remove(o); }
    if (this.outlineGeo) { this.outlineGeo.dispose(); this.outlineGeo = null; }
    this.outlines = [];
    if (mi == null) return;
    const pos = [], nrm = [], side = [], lane = [], color = [], line = [], mu = [], idx = []; let base = 0;
    const c = this.accent; const y = SLAB + 0.055;
    for (const poly of this.geo.munis[mi].polys) {
      for (const ring of poly) {
        const r = dec(ring); const pts = [];
        for (let k = 0; k < r.length; k += 2) pts.push([r[k], r[k + 1]]);
        if (pts.length < 3) continue;
        pts.push(pts[0]);
        const n = pts.length;
        for (let i = 0; i < n; i++) {
          const [x, z] = pts[i];
          const pv = pts[i === 0 ? n - 2 : i - 1], nx0 = pts[i === n - 1 ? 1 : i + 1];
          let ax = x - pv[0], az = z - pv[1], bx = nx0[0] - x, bz = nx0[1] - z;
          const la = Math.hypot(ax, az) || 1, lb = Math.hypot(bx, bz) || 1; ax /= la; az /= la; bx /= lb; bz /= lb;
          let tx = ax + bx, tz = az + bz; const lt = Math.hypot(tx, tz) || 1; tx /= lt; tz /= lt;
          let nx = -tz, nz = tx; const mit = 1 / Math.max(0.45, Math.abs(nx * (-az) + nz * ax)); nx *= mit; nz *= mit;
          for (const sd of [-1, 1]) { pos.push(x, y, z); nrm.push(nx, nz); side.push(sd); lane.push(0); color.push(c.r, c.g, c.b); line.push(-5); mu.push(mi + 1); }
          if (i < n - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
        base += n * 2;
      }
    }
    const g = this.outlineGeo = new THREE.BufferGeometry();
    g.setAttribute('aMu', new THREE.Float32BufferAttribute(mu, 1));
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aN', new THREE.Float32BufferAttribute(nrm, 2));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aLane', new THREE.Float32BufferAttribute(lane, 1));
    g.setAttribute('aColor', new THREE.Float32BufferAttribute(color, 3));
    g.setAttribute('aLine', new THREE.Float32BufferAttribute(line, 1));
    g.setIndex(idx);
    if (!this.outlineMats) {
      const mk = (casing) => new THREE.ShaderMaterial({
        uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uWpp: { value: 0.001 }, uWidth: { value: 4.2 }, uLanePx: { value: 0 }, uMinW: { value: 0.03 }, uSel: { value: -1 }, uCasing: { value: casing }, uPaper: { value: new THREE.Color() }, uCase: { value: new THREE.Color() }, uDimK: { value: 0 }, uHiW: { value: 1 }, uFocusMu: { value: -1 }, uOutK: { value: 0 } }]),
        vertexShader: this.ribVS, fragmentShader: this.ribFS, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -5,
      });
      this.outlineMats = [mk(1), mk(0)];
      for (const m of this.outlineMats) m.uniforms.uMuH = { value: this.muLift };   // 区市で見るときの高さを共有
    }
    this.outlineMats[0].uniforms.uCase.value.copy(this.outlineCase || this.u.uPaper.value);
    for (const m of this.outlineMats) { const o = new THREE.Mesh(g, m); o.renderOrder = 3; o.frustumCulled = false; this.scene.add(o); this.outlines.push(o); }
  }
  // 絞り込んだ区の外側にかける薄い幕（区の中だけが明るく見える）
  setMask(mi) {
    if (this.maskFor === mi && this.mask) { this.mask.visible = mi != null; return; }
    this.maskFor = mi;
    if (this.mask) { this.scene.remove(this.mask); this.mask.geometry.dispose(); this.mask = null; }
    if (mi == null) return;
    const E = 4000; const sh = new THREE.Shape();
    sh.moveTo(-E, -E); sh.lineTo(E, -E); sh.lineTo(E, E); sh.lineTo(-E, E); sh.lineTo(-E, -E);
    for (const poly of this.geo.munis[mi].polys) {
      const r = dec(poly[0]); const h = new THREE.Path();
      for (let i = 0; i < r.length; i += 2) (i ? h.lineTo(r[i], -r[i + 1]) : h.moveTo(r[i], -r[i + 1]));
      sh.holes.push(h);
    }
    const g = new THREE.ShapeGeometry(sh, 1); g.rotateX(-Math.PI / 2);
    if (!this.maskMat) this.maskMat = new THREE.MeshBasicMaterial({ color: 0xd8dcd3, transparent: true, opacity: 0.55, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.applyMaskTheme();
    const m = this.mask = new THREE.Mesh(g, this.maskMat); m.position.y = SLAB + 0.045; m.renderOrder = 2; m.frustumCulled = false;
    this.scene.add(m);
  }
  applyMaskTheme() {
    if (!this.maskMat) return;
    this.maskMat.color.copy(col('--mask')); this.maskMat.opacity = this.dark ? 0.6 : 0.68;
  }
  // 区全体が、パネルに隠れない画面の範囲 rect {l,t,r,b} に収まるようにカメラを動かす
  fitMuni(i, rect) {
    const W = this.el.clientWidth, H = this.el.clientHeight; if (!W || !H) return this.flyToMuni(i);
    const R = rect || { l: 0, t: 0, r: W, b: H };
    const pad = Math.min(36, (R.r - R.l) * 0.06), rw = Math.max(60, R.r - R.l - pad * 2), rh = Math.max(60, R.b - R.t - pad * 2);
    const pts = [];
    for (const poly of this.geo.munis[i].polys) { const r = dec(poly[0]); const st = Math.max(2, Math.floor(r.length / 240) * 2); for (let k = 0; k < r.length; k += st) pts.push([r[k], r[k + 1]]); }
    if (!pts.length) return this.flyToMuni(i);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const v0 = this.viewNow(); const polar = this.top ? 0.02 : Math.min(v0.polar, 0.95);
    let v = { tx: cx, tz: cz, dist: Math.max(60, Math.hypot(x1 - x0, z1 - z0) * 1.6), polar, az: v0.az };
    const p = new THREE.Vector3();
    for (let k = 0; k < 5; k++) {
      this.setView(v); this.camera.updateMatrixWorld();
      const g = this.groundAt((R.l + R.r) / 2, (R.t + R.b) / 2);
      if (g) { v = { ...v, tx: v.tx + (cx - g.x), tz: v.tz + (cz - g.z) }; this.setView(v); this.camera.updateMatrixWorld(); }
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (const [x, z] of pts) { p.set(x, SLAB, z).project(this.camera); const px = (p.x + 1) / 2 * W, py = (1 - p.y) / 2 * H; a = Math.min(a, px); b = Math.max(b, px); c = Math.min(c, py); d = Math.max(d, py); }
      const f = Math.max((b - a) / rw, (d - c) / rh);
      if (!isFinite(f) || f <= 0) break;
      if (Math.abs(f - 1) < 0.05) break;
      v = { ...v, dist: Math.min(1500, Math.max(40, v.dist * f)) };
    }
    this.setView(v0); this.camera.updateMatrixWorld();
    this.flyTo(v);
  }
  select(sid) {
    const i = sid == null ? null : this.stIndex.get(sid);
    this.sel = i ?? null;
    this.labels.forEach((L, k) => L.el.classList.toggle('sel', k === this.sel));
    this.dirty = true;
  }
  setHover(i, fromLabel) {
    if (this.hover === i) return;
    this.hover = i; this.dirty = true;
    if (!fromLabel) this.renderer.domElement.style.cursor = i == null ? '' : 'pointer';
    this.cb.hover?.(i == null ? null : this.st[i].i, this.lastPointer);
  }
  setElev(on) { this.elevOn = on; this.u.uElevOn.value = on ? 1 : 0; this.dirty = true; }

  // ---------- ポインタ ----------
  bindPointer() {
    const el = this.renderer.domElement; let down = null;
    el.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    el.addEventListener('pointermove', e => {
      const r = el.getBoundingClientRect(); this.lastPointer = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (e.buttons || e.pointerType === 'touch') return;   // タッチではホバー表示を出さない
      if (this.mode === 'muni') { this.setHover(null); return; }
      this.setHover(this.pick(this.lastPointer.x, this.lastPointer.y));
    });
    el.addEventListener('pointerleave', () => this.setHover(null));
    el.addEventListener('pointerup', e => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); const dt = performance.now() - down.t; down = null;
      if (moved > 6 || dt > 600) return;
      if (e.pointerType === 'touch' && this.multiTouched) return;   // ピンチ・回転のあとは駅を選ばない
      const r = el.getBoundingClientRect(); const x = e.clientX - r.left, y = e.clientY - r.top;
      const i = this.opts?.mode === 'muni' ? null : this.pick(x, y, e.pointerType === 'touch' ? 26 : 16);
      if (i != null) { this.cb.pickStation?.(this.st[i].i); return; }
      const mu = this.pickMuni(x, y);
      this.cb.pickMuni?.(mu, x, y);
    });
  }

  // ---------- タッチ（Googleマップ風）----------
  // 1本指: 移動（慣性つき） / 2本指: ピンチで拡大縮小＋移動。
  // 回転はひねりが15°を超えてから、傾きは2本指をそろえて縦に動かしたときだけ効く。
  groundAt(px, py) {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    if (!W || !H || !isFinite(px) || !isFinite(py)) return null;
    const ray = this._ray || (this._ray = new THREE.Raycaster());
    ray.setFromCamera(new THREE.Vector2(px / W * 2 - 1, -(py / H) * 2 + 1), this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (Math.abs(d.y) < 1e-4) return null;
    const t = (SLAB - o.y) / d.y; if (t <= 0) return null;
    return new THREE.Vector3(o.x + d.x * t, SLAB, o.z + d.z * t);
  }
  moveBy(dx, dz) {
    if (!isFinite(dx) || !isFinite(dz)) return;
    const c = this.controls; c.target.x += dx; c.target.z += dz; this.camera.position.x += dx; this.camera.position.z += dz;
    c.update(); this.dirty = true;
  }
  bindTouch() {
    const el = this.renderer.domElement; const pts = new Map(); let g = null;
    this.touchCount = 0; this.multiTouched = false;
    const P = e => { const r = el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
    const begin = () => {
      const arr = [...pts.values()];
      this.anim = null; this.inertia = null; this.cb.userMove?.();
      if (arr.length === 1) g = { mode: 'pan', last: arr[0], v: { x: 0, z: 0 }, t: performance.now() };
      else if (arr.length >= 2) {
        const [a, b] = arr;
        g = { mode: 'two', a0: { ...a }, b0: { ...b }, d0: Math.hypot(b.x - a.x, b.y - a.y), twist: 0, rot: false, tilt: false,
              last: { m: mid(a, b), d: Math.hypot(b.x - a.x, b.y - a.y), ang: Math.atan2(b.y - a.y, b.x - a.x) } };
      }
    };
    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      if (pts.size === 0) this.multiTouched = false;
      pts.set(e.pointerId, P(e)); this.touchCount = pts.size;
      if (pts.size >= 2) this.multiTouched = true;
      begin();
    });
    el.addEventListener('pointermove', e => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId) || !g) return;
      pts.set(e.pointerId, P(e));
      const arr = [...pts.values()];
      if (g.mode === 'pan' && arr.length === 1) {
        const p = arr[0]; const A = this.groundAt(g.last.x, g.last.y), B = this.groundAt(p.x, p.y);
        if (A && B) {
          const dx = A.x - B.x, dz = A.z - B.z; this.moveBy(dx, dz);
          const now = performance.now(), dt = Math.max(1, now - g.t);
          g.v.x = g.v.x * 0.7 + (dx / dt) * 0.3; g.v.z = g.v.z * 0.7 + (dz / dt) * 0.3; g.t = now;
        }
        g.last = p; return;
      }
      if (g.mode !== 'two' || arr.length < 2) return;
      const [a, b] = arr; const m = mid(a, b);
      const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), ang = Math.atan2(b.y - a.y, b.x - a.x);
      let dAng = wrap(ang - g.last.ang); g.twist += dAng;
      if (!g.rot && !g.tilt && Math.abs(g.twist) > 0.26) { g.rot = true; dAng = 0; }   // 15°を超えたら回転を解禁
      if (!g.rot && !g.tilt) {
        const dyA = a.y - g.a0.y, dyB = b.y - g.b0.y, dxA = a.x - g.a0.x, dxB = b.x - g.b0.x;
        const pinch = Math.abs(d / g.d0 - 1);
        if (Math.sign(dyA) === Math.sign(dyB) && Math.abs(dyA) > 24 && Math.abs(dyB) > 24 &&
            Math.abs(dxA) < Math.abs(dyA) * 0.6 && Math.abs(dxB) < Math.abs(dyB) * 0.6 && pinch < 0.1) g.tilt = true;
      }
      if (g.tilt) {
        const v = this.viewNow(); const dy = m.y - g.last.m.y;
        this.setView({ ...v, polar: Math.min(this.controls.maxPolarAngle, Math.max(0.02, v.polar - dy * 0.005)) });
        this.top = false;
      } else {
        const A = this.groundAt(g.last.m.x, g.last.m.y);
        const v = this.viewNow(); const c = this.controls;
        const dist = Math.min(c.maxDistance, Math.max(c.minDistance, v.dist * g.last.d / d));
        this.setView({ ...v, dist, az: v.az + (g.rot ? dAng : 0) });
        const B = this.groundAt(m.x, m.y);
        if (A && B) this.moveBy(A.x - B.x, A.z - B.z);   // 指の中点の下の地点を動かさない
      }
      g.last = { m, d, ang };
    });
    const end = e => {
      if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
      pts.delete(e.pointerId); this.touchCount = pts.size;
      if (pts.size === 0) {
        if (g?.mode === 'pan' && performance.now() - g.t < 80 && Math.hypot(g.v.x, g.v.z) > 0.002) this.inertia = { v: { ...g.v }, t: performance.now() };
        g = null;
      } else begin();   // 2本→1本に戻ったら移動を続ける
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }

  pick(px, py, rad = 16) {
    // 表示中のラベルの上なら、その駅
    for (const [x0, y0, x1, y1, i] of this.labelHits) if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return i;
    const cam = this.camera, W = this.el.clientWidth, H = this.el.clientHeight; const v = this.v3;
    let best = null, bd = rad * rad;
    for (let i = 0; i < this.st.length; i++) {
      const s = this.st[i]; if (!this.R || this.R.flag[s.i] !== 3) continue;
      const x = s.x / U, z = s.z / U;
      v.set(x, SLAB, z).project(cam); if (v.z > 1) continue;
      const ax = (v.x + 1) / 2 * W, ay = (1 - v.y) / 2 * H;
      v.set(x, SLAB + this.hCur[i] * this.hMax, z).project(cam);
      const bx = (v.x + 1) / 2 * W, by = (1 - v.y) / 2 * H;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
      let t = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
      const qx = ax + t * dx - px, qy = ay + t * dy - py; const d = qx * qx + qy * qy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  pickMuni(px, py) {
    const W = this.el.clientWidth, H = this.el.clientHeight;
    const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(px / W * 2 - 1, -(py / H) * 2 + 1), this.camera);
    const hit = ray.intersectObjects(this.muniMeshes.map(m => m.mesh), false)[0];
    return hit ? hit.object.userData.muni : null;
  }

  resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / Math.max(1, h); this.camera.updateProjectionMatrix(); this.dirty = true;
  }

  // ---------- 毎フレーム ----------
  loop(now) {
    if (this.manual) return;   // 撮影中は step() を外から呼ぶ
    requestAnimationFrame(this.loop);
    this.step(now);
  }
  // 1コマ分の更新と描画（撮影モードでは外部から時刻を渡して呼ぶ）
  step(now) {
    if (this.manual) this.dirty = true;
    if (this.anim) {
      const { a, b, t0, ms } = this.anim; const t = Math.min(1, (now - t0) / ms); const k = ease(t);
      const lerp = (p, q) => p + (q - p) * k;
      this.setView({ tx: lerp(a.tx, b.tx), tz: lerp(a.tz, b.tz), dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist))), polar: lerp(a.polar, b.polar), az: lerp(a.az, b.az) });
      if (t >= 1) this.anim = null;
    }
    if (this.inertia) {
      const it = this.inertia; const dt = Math.min(48, now - it.t); it.t = now;
      this.moveBy(it.v.x * dt, it.v.z * dt);
      const f = Math.exp(-dt / 300); it.v.x *= f; it.v.z *= f;
      if (Math.hypot(it.v.x, it.v.z) < 0.0006) this.inertia = null;
    }
    const moved = this.controls.update();
    const cam = this.camera, dist = cam.position.distanceTo(this.controls.target);
    // 柱のアニメーション
    let animating = false;
    const n = this.st.length;
    for (let i = 0; i < n; i++) {
      const dh = this.hTgt[i] - this.hCur[i];
      if (Math.abs(dh) > 0.0005) { this.hCur[i] += dh * 0.16; animating = true; } else this.hCur[i] = this.hTgt[i];
      for (let c = 0; c < 3; c++) { const j = i * 3 + c; const dc = this.cTgt[j] - this.cCur[j]; if (Math.abs(dc) > 0.002) { this.cCur[j] += dc * 0.2; animating = true; } else this.cCur[j] = this.cTgt[j]; }
    }
    for (const m of this.muniMeshes) { const d = m.th - m.h; if (Math.abs(d) > 0.002) { m.h += d * 0.14; animating = true; } else m.h = m.th; }
    const zoomKey = Math.round(Math.log(dist) * 40);
    if (!(this.dirty || moved || animating || this.anim || zoomKey !== this.zoomKey)) return;
    this.zoomKey = zoomKey;
    // 画面上のサイズ換算
    const wpp = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / Math.max(1, this.el.clientHeight);
    this.ribUniform('uWpp', wpp);
    for (const m of this.outlineMats || []) m.uniforms.uWpp.value = wpp;
    const wppT = wpp * dist;
    const rad = Math.min(1.25, Math.max(0.18, 2.7 * wppT));
    this.hMax = Math.min(46, Math.max(2.8, dist * 0.1));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), tmp = new THREE.Color();
    const dotR = Math.min(0.85, Math.max(0.1, 4.2 * wppT));
    for (let i = 0; i < n; i++) {
      const s = this.st[i]; const x = s.x / U, z = s.z / U;
      const h = Math.max(0.02, this.hCur[i] * this.hMax);
      const r = (i === this.sel || i === this.hover) ? rad * 1.35 : rad;
      p.set(x, SLAB, z); sc.set(r, h, r); m4.compose(p, q, sc); this.pillars.setMatrixAt(i, m4);
      tmp.setRGB(this.cCur[i * 3], this.cCur[i * 3 + 1], this.cCur[i * 3 + 2]);
      if (i === this.hover && i !== this.sel) tmp.lerp(this.accent, 0.35);
      if (i === this.sel) tmp.copy(this.accent);
      this.pillars.setColorAt(i, tmp);
      const ok = this.R && this.R.flag[s.i] === 3;
      p.set(x, DOT_Y, z); sc.set(dotR * (ok ? 1 : 0.7), 1, dotR * (ok ? 1 : 0.7)); m4.compose(p, q, sc); this.dotO.setMatrixAt(i, m4);
      p.y = DOT_Y + 0.004; sc.set(dotR * 0.58 * (ok ? 1 : 0.7), 1, dotR * 0.58 * (ok ? 1 : 0.7)); m4.compose(p, q, sc); this.dotI.setMatrixAt(i, m4);
    }
    this.pillars.instanceMatrix.needsUpdate = true; if (this.pillars.instanceColor) this.pillars.instanceColor.needsUpdate = true;
    this.dotO.instanceMatrix.needsUpdate = true; this.dotI.instanceMatrix.needsUpdate = true;
    // 区市町村の高さ（路線もその上に載せる）
    this.muniMeshes.forEach((m, i) => { m.mesh.scale.y = m.h; if (i < MU_MAX) this.muLift[i] = SLAB * (m.h - 1); });
    for (let i = 0; i < this.muLabels.length; i++) {
      const L = this.muLabels[i]; const mh = this.muniMeshes[i].h;
      L.mesh.position.y = SLAB * mh + (this.opts?.mode === 'muni' ? 0.4 : 0.07);
      const vis = this.opts?.mode === 'muni' ? 1 : THREE.MathUtils.smoothstep(dist, 40, 120) * (1 - THREE.MathUtils.smoothstep(dist, 900, 1300));
      const dim = this.focusMu != null && this.focusMu !== i ? 0.5 : 1;   // 選んだ区以外の名前は控えめに
      L.mat.opacity = vis * (this.opts?.mode === 'muni' ? 0.95 : 0.8) * dim; L.mesh.visible = vis > 0.02;
      const k = this.opts?.mode === 'muni' ? Math.min(1.15, Math.max(0.6, dist / 560)) : Math.min(1, Math.max(0.3, dist / 260));
      if (L.baseScale) L.mesh.scale.set(L.tex.image.width * L.baseScale * k, 1, L.tex.image.height * L.baseScale * k);
    }
    // 選択リング
    if (this.sel != null) {
      const s = this.st[this.sel]; const rr = rad * 2.6 * (1 + 0.08 * Math.sin(now / 260));
      this.ring.visible = this.opts?.mode !== 'muni'; this.ring.position.set(s.x / U, DOT_Y + 0.01, s.z / U); this.ring.scale.set(rr, 1, rr);
      animating = true;
    } else this.ring.visible = false;
    // カメラの近・遠クリップと霧、影
    cam.near = Math.max(0.4, dist / 70); cam.far = dist * 14 + 900; cam.updateProjectionMatrix();
    this.scene.fog.near = dist * 1.25 + 120; this.scene.fog.far = dist * 3.4 + 700;
    const t = this.controls.target;
    const sd = Math.min(700, Math.max(40, dist * 0.95));
    this.sun.position.set(t.x - sd * 0.55, sd * 1.25, t.z + sd * 0.45); this.sun.target.position.copy(t);
    const sc2 = this.sun.shadow.camera; sc2.left = -sd; sc2.right = sd; sc2.top = sd; sc2.bottom = -sd; sc2.near = sd * 0.2; sc2.far = sd * 4; sc2.updateProjectionMatrix();
    this.renderer.render(this.scene, cam);
    this.updateLabels(dist);
    // 方角（コンパス用）: 画面の上方向に対する北の向き
    const off = cam.position.clone().sub(t); const az = Math.atan2(off.x, off.z);
    if (this.lastAz === undefined || Math.abs(az - this.lastAz) > 0.002) { this.lastAz = az; this.cb.bearing?.(az); }
    this.dirty = animating;
  }

  updateLabels(dist) {
    const cam = this.camera, W = this.el.clientWidth, H = this.el.clientHeight, v = this.v3;
    // 寸法の計測（まとめて）
    const need = this.labels.filter(L => !L.w && L.html);
    if (need.length) {
      for (const L of need) { L.el.style.transform = 'translate(-9999px,-9999px)'; L.el.classList.add('on'); }
      for (const L of need) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      for (const L of need) { if (!L.on) L.el.classList.remove('on'); }
    }
    const placed = []; const hit = (x0, y0, x1, y1) => { for (const r of placed) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true; return false; };
    const hits = [];
    const show = new Set();
    const maxN = this.opts?.mode === 'muni' ? 0 : Math.round(Math.min(90, Math.max(14, 14 + 5200 / Math.max(40, dist))));
    const pri = [];
    if (this.sel != null) pri.push(this.sel);
    if (this.hover != null && this.hover !== this.sel) pri.push(this.hover);
    for (const i of this.labelOrder) { if (i !== this.sel && i !== this.hover) pri.push(i); }
    let count = 0;
    for (const i of pri) {
      if (count >= maxN && i !== this.sel && i !== this.hover) break;
      const s = this.st[i], L = this.labels[i];
      const h = this.hCur[i] * this.hMax;
      v.set(s.x / U, SLAB + h + 0.2, s.z / U).project(cam);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H;
      const x0 = sx - L.w / 2, y0 = sy - L.h - 9, x1 = x0 + L.w, y1 = y0 + L.h;
      const force = i === this.sel || i === this.hover;
      if (!force && hit(x0 - 3, y0 - 2, x1 + 3, y1 + 2)) continue;
      placed.push([x0, y0, x1, y1]); hits.push([x0 - 2, y0 - 2, x1 + 2, y1 + 8, i]); show.add(i); count++;
      L.el.style.transform = `translate(${x0.toFixed(1)}px,${y0.toFixed(1)}px)`;
      L.el.style.zIndex = force ? 5 : 2;
    }
    for (let i = 0; i < this.labels.length; i++) {
      const L = this.labels[i]; const on = show.has(i);
      if (on !== L.on) { L.on = on; L.el.classList.toggle('on', on); }
    }
    this.labelHits = hits;
    // ランドマーク
    for (const L of this.lmLabels) {
      v.set(L.x, L.y + 0.4, L.z).project(cam);
      const vis = this.opts?.mode !== 'muni' && v.z < 1 && dist < 900;
      if (!vis) { L.el.style.display = 'none'; continue; }
      if (!L.w) { L.el.style.display = 'flex'; L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      const sx = (v.x + 1) / 2 * W, sy = (1 - v.y) / 2 * H; const x0 = sx - L.w / 2, y0 = sy - L.h - 4;
      if (hit(x0, y0, x0 + L.w, y0 + L.h)) { L.el.style.display = 'none'; continue; }
      L.el.style.display = 'flex'; L.el.style.transform = `translate(${x0.toFixed(1)}px,${y0.toFixed(1)}px)`;
    }
  }
  screenPos(sid) {
    const i = this.stIndex.get(sid); if (i == null) return null;
    const s = this.st[i]; const v = this.v3.set(s.x / U, SLAB + this.hCur[i] * (this.hMax || 10), s.z / U).project(this.camera);
    return { x: (v.x + 1) / 2 * this.el.clientWidth, y: (1 - v.y) / 2 * this.el.clientHeight };
  }
}
