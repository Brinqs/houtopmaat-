// 3D-viewer voor meubelontwerpen (Three.js). Eenheden in de scene: meters; ontwerp in mm.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MATERIAL_BY_SLUG } from './sawlist.js';

const MM = 0.001;
const easeOutBack = t => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeInOut = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Subtiele houtnerf-textuur per materiaal (procedureel, geen externe bestanden).
const texCache = new Map();
function grainTexture(slug) {
  if (texCache.has(slug)) return texCache.get(slug);
  const mat = MATERIAL_BY_SLUG[slug];
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = mat.color; g.fillRect(0, 0, 256, 256);
  if (mat.grain) {
    let seed = [...slug].reduce((a, ch) => a + ch.charCodeAt(0), 7);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 70; i++) {
      const y = rnd() * 256, amp = 0.4 + rnd() * 1.2, freq = 0.02 + rnd() * 0.03, ph = rnd() * 6;
      g.strokeStyle = rnd() > 0.5 ? 'rgba(80,45,15,0.045)' : 'rgba(255,240,220,0.05)';
      g.lineWidth = 0.6 + rnd() * 1.8;
      g.beginPath();
      for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * freq + ph) * amp);
      g.stroke();
    }
  } else {
    const img = g.getImageData(0, 0, 256, 256);
    for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * 8; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; }
    g.putImageData(img, 0, 0);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  texCache.set(slug, t);
  return t;
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);

export class Viewer {
  constructor(container, { interactive = true, autoRotate = false } = {}) {
    this.el = container;
    this.parts = new Map(); // id -> { group, mesh, data, anim }
    this.explode = 0; this.explodeTarget = 0;
    this.showDims = true;
    this.hoverId = null;
    this.highlighted = new Set();
    this.onHover = null;
    this.spawnClock = 0;

    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'viewer-labels';
    container.appendChild(this.labels.domElement);

    const scene = this.scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.camera.position.set(2.2, 1.6, 3.2);

    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2.5, 4, 3);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 6; sun.shadow.bias = -0.0004;
    scene.add(sun, sun.target);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe9dccb, 0.5));

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ opacity: 0.14 }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    scene.add(ground);
    const grid = this.grid = new THREE.GridHelper(20, 80, 0xd9cfc2, 0xebe4da);
    grid.material.transparent = true; grid.material.opacity = 0.55; grid.position.y = 0.0005;
    scene.add(grid);

    this.root = new THREE.Group(); scene.add(this.root);
    this.dimGroup = new THREE.Group(); scene.add(this.dimGroup);

    const ctl = this.controls = new OrbitControls(this.camera, r.domElement);
    ctl.enableDamping = true; ctl.dampingFactor = 0.08;
    ctl.minDistance = 0.3; ctl.maxDistance = 15; ctl.maxPolarAngle = Math.PI * 0.495;
    ctl.autoRotate = autoRotate; ctl.autoRotateSpeed = 0.9;
    ctl.enabled = interactive;
    ctl.target.set(0, 0.6, 0);
    this.camAnim = null;

    if (interactive) {
      this.ray = new THREE.Raycaster(); this.pointer = new THREE.Vector2();
      r.domElement.addEventListener('pointermove', e => this._pick(e));
      r.domElement.addEventListener('pointerleave', () => this._setHover(null));
      ctl.addEventListener('start', () => { ctl.autoRotate = false; this.camAnim = null; });
    }

    new ResizeObserver(() => this._resize()).observe(container);
    this._resize();
    this.clock = new THREE.Clock();
    r.setAnimationLoop(() => this._tick());
  }

  _resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    this.renderer.setSize(w, h); this.labels.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
  }

  // ---------- ontwerp bijwerken ----------
  /** Voegt een onderdeel toe of werkt het bij (met animatie). */
  upsertPart(p) {
    const target = {
      pos: new THREE.Vector3((p.x + p.w / 2) * MM, (p.y + p.h / 2) * MM, (p.z + p.d / 2) * MM),
      size: new THREE.Vector3(p.w * MM, p.h * MM, p.d * MM),
    };
    let entry = this.parts.get(p.id);
    if (!entry) {
      const material = new THREE.MeshStandardMaterial({ map: grainTexture(p.mat), roughness: 0.72, metalness: 0, transparent: true, opacity: 0 });
      const mesh = new THREE.Mesh(UNIT_BOX, material);
      mesh.castShadow = true; mesh.receiveShadow = true;
      const edges = new THREE.LineSegments(UNIT_EDGES, new THREE.LineBasicMaterial({ color: 0x1d2327, transparent: true, opacity: 0 }));
      mesh.add(edges);
      mesh.userData.id = p.id;
      this.root.add(mesh);
      const now = performance.now();
      this.spawnClock = Math.max(this.spawnClock, now);
      entry = { mesh, edges, data: p, target, removing: false,
        from: { pos: target.pos.clone().add(new THREE.Vector3(0, 0.25, 0)), size: target.size.clone().multiplyScalar(0.6) },
        t0: this.spawnClock, dur: 520, kind: 'spawn' };
      this.spawnClock += 55; // gestaffeld opbouwen
      mesh.position.copy(entry.from.pos); mesh.scale.copy(entry.from.size);
      this.parts.set(p.id, entry);
    } else {
      const changed = !entry.target.pos.equals(target.pos) || !entry.target.size.equals(target.size) || entry.data.mat !== p.mat;
      if (entry.data.mat !== p.mat) entry.mesh.material.map = grainTexture(p.mat);
      entry.removing = false;
      if (changed) Object.assign(entry, { from: { pos: entry.mesh.position.clone(), size: entry.mesh.scale.clone() }, t0: performance.now(), dur: 600, kind: 'move' });
      entry.target = target; entry.data = p;
    }
    this._dirtyDims = true;
  }

  /** Zet het volledige ontwerp; onderdelen die niet meer bestaan verdwijnen. */
  setDesign(parts, { fit = 'auto' } = {}) {
    const ids = new Set(parts.map(p => p.id));
    for (const [id, e] of this.parts) if (!ids.has(id) && !e.removing) Object.assign(e, { removing: true, t0: performance.now(), dur: 350 });
    parts.forEach(p => this.upsertPart(p));
    const box = this.bounds();
    if (fit === true || (fit === 'auto' && this._needsFit(box))) this.fit(box);
  }

  clear() {
    for (const e of this.parts.values()) this._dispose(e);
    this.parts.clear(); this._dirtyDims = true; this.spawnClock = 0;
  }

  bounds() {
    const b = new THREE.Box3();
    for (const e of this.parts.values()) {
      if (e.removing) continue;
      const half = e.target.size.clone().multiplyScalar(0.5);
      b.expandByPoint(e.target.pos.clone().sub(half)); b.expandByPoint(e.target.pos.clone().add(half));
    }
    return b;
  }

  _needsFit(box) {
    if (box.isEmpty()) return false;
    const size = box.getSize(new THREE.Vector3()).length();
    if (!this._lastFit || Math.abs(size - this._lastFit) / this._lastFit > 0.25) return true;
    return false;
  }

  fit(box = this.bounds(), animate = true) {
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
    this._lastFit = size.length();
    const radius = size.length() / 2;
    const dist = radius / Math.sin((this.camera.fov * Math.PI / 180) / 2) * 1.05;
    const dir = new THREE.Vector3(0.75, 0.55, 1.25).normalize();
    const pos = center.clone().add(dir.multiplyScalar(dist));
    // schaduwcamera afstemmen op meubelgrootte
    const s = Math.max(size.x, size.y, size.z) * 1.2 + 0.5;
    Object.assign(this.sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 0.1, far: 20 });
    this.sun.shadow.camera.updateProjectionMatrix();
    this.sun.position.copy(center).add(new THREE.Vector3(2.5, 4, 3));
    this.sun.target.position.copy(center);
    if (!animate) { this.camera.position.copy(pos); this.controls.target.copy(center); return; }
    this.camAnim = { t0: performance.now(), dur: 900, fromPos: this.camera.position.clone(), toPos: pos, fromT: this.controls.target.clone(), toT: center };
  }

  setExplode(on) { this.explodeTarget = on ? 1 : 0; }
  setDims(on) { this.showDims = on; this.dimGroup.visible = on; }

  highlight(ids) {
    this.highlighted = new Set(ids || []);
    this._applyEmphasis();
  }

  // ---------- interactie ----------
  _pick(e) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.pointer, this.camera);
    const hit = this.ray.intersectObjects([...this.parts.values()].filter(p => !p.removing).map(p => p.mesh), false)[0];
    this._setHover(hit ? hit.object.userData.id : null, e);
  }
  _setHover(id, e) {
    if (id !== this.hoverId) { this.hoverId = id; this._applyEmphasis(); }
    this.onHover?.(id ? this.parts.get(id)?.data : null, e);
    this.renderer.domElement.style.cursor = id ? 'pointer' : '';
  }
  _applyEmphasis() {
    const focus = new Set(this.highlighted); if (this.hoverId) focus.add(this.hoverId);
    for (const [id, e] of this.parts) {
      const on = focus.has(id);
      e.mesh.material.emissive.setHex(on ? 0xbd5c17 : 0x000000);
      e.mesh.material.emissiveIntensity = on ? 0.35 : 0;
      e.edges.material.color.setHex(on ? 0x9b4a13 : 0x1d2327);
      e.dim = focus.size > 0 && !on;
    }
  }

  // ---------- maatvoering ----------
  _buildDims() {
    this._dirtyDims = false;
    this._dimsOn = undefined; // zichtbaarheid opnieuw toepassen op nieuwe labels
    for (const c of [...this.dimGroup.children]) { this.dimGroup.remove(c); c.geometry?.dispose(); if (c.element) c.element.remove(); }
    const b = this.bounds();
    if (b.isEmpty()) return;
    const { min, max } = b, off = 0.06;
    const mat = new THREE.LineBasicMaterial({ color: 0x9b4a13 });
    const line = (a, z, label, at) => {
      const g = new THREE.BufferGeometry().setFromPoints([a, z]);
      this.dimGroup.add(new THREE.Line(g, mat));
      const el = document.createElement('div'); el.className = 'dim-label'; el.textContent = label;
      const o = new CSS2DObject(el); o.position.copy(at); this.dimGroup.add(o);
    };
    const tick = (p, dir) => {
      const g = new THREE.BufferGeometry().setFromPoints([p.clone().addScaledVector(dir, -0.02), p.clone().addScaledVector(dir, 0.02)]);
      this.dimGroup.add(new THREE.Line(g, mat));
    };
    const mm = v => `${Math.round(v / MM)} mm`;
    // breedte: onderkant voorzijde
    const wA = new THREE.Vector3(min.x, min.y + 0.001, max.z + off), wB = new THREE.Vector3(max.x, min.y + 0.001, max.z + off);
    line(wA, wB, mm(max.x - min.x), wA.clone().lerp(wB, 0.5)); tick(wA, new THREE.Vector3(0, 0, 1)); tick(wB, new THREE.Vector3(0, 0, 1));
    // hoogte: linksvoor
    const hA = new THREE.Vector3(min.x - off, min.y, max.z), hB = new THREE.Vector3(min.x - off, max.y, max.z);
    line(hA, hB, mm(max.y - min.y), hA.clone().lerp(hB, 0.5)); tick(hA, new THREE.Vector3(1, 0, 0)); tick(hB, new THREE.Vector3(1, 0, 0));
    // diepte: rechtsonder
    const dA = new THREE.Vector3(max.x + off, min.y + 0.001, min.z), dB = new THREE.Vector3(max.x + off, min.y + 0.001, max.z);
    line(dA, dB, mm(max.z - min.z), dA.clone().lerp(dB, 0.5)); tick(dA, new THREE.Vector3(1, 0, 0)); tick(dB, new THREE.Vector3(1, 0, 0));
  }

  // ---------- render loop ----------
  _tick() {
    const now = performance.now();
    this.explode += (this.explodeTarget - this.explode) * 0.12;
    const b = this.bounds(); const center = b.isEmpty() ? new THREE.Vector3() : b.getCenter(new THREE.Vector3());

    for (const [id, e] of this.parts) {
      const t = Math.min(1, Math.max(0, (now - e.t0) / e.dur));
      if (e.removing) {
        const k = 1 - t;
        e.mesh.material.opacity = k; e.edges.material.opacity = 0.22 * k;
        e.mesh.scale.copy(e.target.size).multiplyScalar(0.85 + 0.15 * k);
        if (t >= 1) { this._dispose(e); this.parts.delete(id); this._dirtyDims = true; }
        continue;
      }
      const k = e.kind === 'spawn' ? easeOutBack(t) : easeInOut(t);
      const pos = e.from.pos.clone().lerp(e.target.pos, k);
      e.mesh.scale.copy(e.from.size.clone().lerp(e.target.size, Math.min(1, k)));
      if (this.explode > 0.001) pos.add(e.target.pos.clone().sub(center).multiplyScalar(0.45 * this.explode));
      e.mesh.position.copy(pos);
      const vis = e.kind === 'spawn' ? Math.min(1, t * 2.5) : 1;
      const dimF = e.dim ? 0.35 : 1;
      e.mesh.material.opacity = vis * dimF;
      e.mesh.material.transparent = vis * dimF < 1;
      e.mesh.material.depthWrite = vis * dimF > 0.5;
      e.edges.material.opacity = 0.22 * vis * dimF;
    }
    if (this._dirtyDims) this._buildDims();
    const dimsOn = this.showDims && this.explode < 0.05 && this.parts.size > 0;
    if (dimsOn !== this._dimsOn) { // CSS2D-labels erven zichtbaarheid niet van hun groep
      this._dimsOn = dimsOn; this.dimGroup.visible = dimsOn;
      this.dimGroup.children.forEach(c => { c.visible = dimsOn; if (c.element) c.element.style.display = dimsOn ? '' : 'none'; });
    }

    if (this.camAnim) {
      const a = this.camAnim, t = Math.min(1, (now - a.t0) / a.dur), k = easeInOut(t);
      this.camera.position.lerpVectors(a.fromPos, a.toPos, k);
      this.controls.target.lerpVectors(a.fromT, a.toT, k);
      if (t >= 1) this.camAnim = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  _dispose(e) { this.root.remove(e.mesh); e.mesh.material.dispose(); e.edges.material.dispose(); }
}
