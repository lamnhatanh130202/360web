// /src/core/app.js
import { createMinimap } from "./ui/minimap.js";

export async function bootstrap(opts) {
  const {
    dataBaseUrl = './data',
    rootSelector = '#pano',
    fadeSelector = '#fade',
    minimapSelector = '#minimap'
  } = opts || {};

  //  Load JSON
  const scenes = await fetch(`${dataBaseUrl}/scenes.json`).then(r => {
    if (!r.ok) throw new Error("Không tải được scenes.json");
    return r.json();
  });

  //  Viewer + Geometry + Limiter
  const root = document.querySelector(rootSelector);
  if (!root) throw new Error(`Không tìm thấy ${rootSelector}`);
  const fadeEl = document.querySelector(fadeSelector);

  const viewer = new Marzipano.Viewer(root);
  const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
  const limiter = Marzipano.RectilinearView.limit.traditional(
    Marzipano.util.degToRad(20),
    Marzipano.util.degToRad(110)
  );

  const sceneCache = {};
  let active = { id: null, scene: null, view: null };

  // === Hiệu ứng fade
  function fade(to = 1, dur = 200) {
    if (!fadeEl) return Promise.resolve();
    const from = +getComputedStyle(fadeEl).opacity || 0;
    return new Promise(res => {
      const t0 = performance.now();
      (function step(t) {
        const p = Math.min(1, (t - t0) / dur);
        fadeEl.style.opacity = String(from + (to - from) * p);
        p < 1 ? requestAnimationFrame(step) : res();
      })(t0);
    });
  }
// >>> ADD: Graph recorder state
let graph = (() => {
  try { return JSON.parse(localStorage.getItem('graph_draft')) || { nodes: [], edges: [] }; }
  catch { return { nodes: [], edges: [] }; }
})();
let needsLayout = false;

function getNode(id)    { return graph.nodes.find(n => n.id === id); }
function getEdge(a, b)  { return graph.edges.find(e => (e.from===a && e.to===b) || (e.from===b && e.to===a)); }
function ensureNode(id, label) {
  let n = getNode(id);
  if (!n) { n = { id, label: label || id, x: null, y: null }; graph.nodes.push(n); needsLayout = true; }
  return n;
}
function ensureEdge(a, b, w = 1) {
  if (!getEdge(a, b)) { graph.edges.push({ from: a, to: b, w }); needsLayout = true; }
}

function autoLayoutIfNeeded() {
  const unplaced = graph.nodes.filter(n => n.x == null || n.y == null);
  if (!unplaced.length) return;
  const cx = 400, cy = 260, R0 = 120, stepR = 60;
  let ring = 0, idx = 0;
  unplaced.forEach(n => {
    const count = 8 + ring * 4;
    const angle = (idx / count) * Math.PI * 2;
    const r = R0 + ring * stepR;
    n.x = Math.round(cx + r * Math.cos(angle));
    n.y = Math.round(cy + r * Math.sin(angle));
    idx++; if (idx >= count) { ring++; idx = 0; }
  });
}

function learnGraphFromScene(sceneId) {
  const s = scenes.find(x => x.id === sceneId);
  if (!s) return;
  ensureNode(s.id, s?.name?.vi || s?.name || s.id);
  (s.hotspots || []).forEach(h => {
    ensureNode(h.target);
    ensureEdge(s.id, h.target, 1);
  });
  if (needsLayout) {
    autoLayoutIfNeeded();
    try { localStorage.setItem('graph_draft', JSON.stringify(graph)); } catch {}
    minimap?.refresh?.(graph);
    needsLayout = false;
  }
}


  // === Hotspot
  function addHotspot(scene, h) {
    const el = document.createElement("div");
    el.className = "hotspot";
    el.innerHTML = `
      <img class="hotspot-icon" src="${h.icon || "./assets/icon/vitri.png"}" alt="">
      <span>${h.label || h.text || ""}</span>
    `;
    el.addEventListener("click", async () => {
      await fade(1, 120);
      loadScene(h.target);
      await fade(0, 120);
    });
    scene.hotspotContainer().createHotspot(el, { yaw: +h.yaw, pitch: +h.pitch });
  }

  // === Tạo scene
  function createScene(s) {
    const source = Marzipano.ImageUrlSource.fromString(s.url || s.src);
    const view = new Marzipano.RectilinearView(
      {
        yaw:  +(s.initialView?.yaw  ?? 0),
        pitch:+(s.initialView?.pitch?? 0),
        fov:  +(s.initialView?.hfov ?? 1.2)
      },
      limiter
    );
    const scene = viewer.createScene({ source, geometry, view });
    (s.hotspots || []).forEach(addHotspot.bind(null, scene));
    return { scene, view };
  }

  // === UI tiêu đề
  function updateTenKhuVuc(sceneId) {
    const el = document.getElementById("tenKhuVuc");
    const s = scenes.find(x => x.id === sceneId);
    if (el) el.textContent = `Tên khu vực: ${s?.name?.vi || s?.name || sceneId}`;
  }

  // === Chuyển cảnh
  function loadScene(id) {
    const s = scenes.find(x => x.id === id);
    if (!s) return console.warn("Scene không tồn tại:", id);
    if (!sceneCache[id]) sceneCache[id] = createScene(s);

    const { scene, view } = sceneCache[id];
    scene.switchTo();
    active = { id, scene, view };
    updateTenKhuVuc(id);

    // báo minimap biết scene đang active
    minimap?.setActive(id);
  }

  // === Controls: đăng ký 1 lần, luôn dùng active.view
  setupControlsOnce();
  function setupControlsOnce() {
    const ZMIN = Marzipano.util.degToRad(20);
    const ZMAX = Marzipano.util.degToRad(110);
    const getView = () => active.view || viewer.scene()?.view();

    // quay mượt
    const MAX_SPEED = 0.015, ACCEL = 0.00035, DECEL = 0.0006;
    let vx = 0, dir = 0, rafId = null, running = false;
    function loop() {
      if (dir) {
        vx += dir * ACCEL; vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx));
      } else {
        if (vx > 0) vx = Math.max(0, vx - DECEL); else if (vx < 0) vx = Math.min(0, vx + DECEL);
      }
      const v = getView(); if (v && vx) v.setYaw(v.yaw() + vx);
      if (running) rafId = requestAnimationFrame(loop);
    }
    function startLoop(){ if (!running) { running = true; rafId = requestAnimationFrame(loop); } }
    function release(){ dir = 0; }

    const leftBtn  = document.getElementById('left');
    const rightBtn = document.getElementById('right');
    leftBtn?.addEventListener('mousedown', () => { dir = -1; startLoop(); });
    rightBtn?.addEventListener('mousedown',() => { dir = +1; startLoop(); });
    window.addEventListener('mouseup', release);
    leftBtn?.addEventListener('touchstart', e=>{ e.preventDefault(); dir=-1; startLoop(); }, {passive:false});
    rightBtn?.addEventListener('touchstart',e=>{ e.preventDefault(); dir=+1; startLoop(); }, {passive:false});
    window.addEventListener('touchend', () => release(), {passive:true});

    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft')  { dir = -1; startLoop(); }
      if (e.key === 'ArrowRight') { dir = +1; startLoop(); }
    }, { passive:true });
    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowLeft'  && dir === -1) dir = 0;
      if (e.key === 'ArrowRight' && dir === +1) dir = 0;
    }, { passive:true });

    // zoom mượt
    function smoothZoomTo(target, dur = 160) {
      const v = getView(); if (!v) return;
      const start = v.fov();
      const end = Math.min(ZMAX, Math.max(ZMIN, target));
      const t0 = performance.now();
      (function step(t){
        const p = Math.min(1, (t - t0) / dur);
        v.setFov(start + (end - start) * p);
        if (p < 1) requestAnimationFrame(step);
      })(t0);
    }
    document.getElementById("zoomIn") ?.addEventListener("click", () => {
      const v = getView(); if (!v) return; smoothZoomTo(v.fov() - 0.10);
    });
    document.getElementById("zoomOut")?.addEventListener("click", () => {
      const v = getView(); if (!v) return; smoothZoomTo(v.fov() + 0.10);
    });

    const panoEl = document.getElementById("pano");
    panoEl?.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        e.preventDefault();
        const v = getView(); if (!v) return;
        smoothZoomTo(v.fov() + (e.deltaY > 0 ? 0.10 : -0.10), 120);
      } else {
        vx += (e.deltaX * 0.00003);
        vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx));
        startLoop();
      }
    }, { passive: false });
  }

  // === Mini-map + Dijkstra
  // === Mini-map + Dijkstra
// (1) seed graph recorder bằng file graph.json nếu recorder đang trống
try {
  const seed = await fetch(`${dataBaseUrl}/graph.json`).then(r => r.ok ? r.json() : null).catch(() => null);
  if (seed) {
    if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) graph = { nodes: [], edges: [] };
    if ((graph.nodes?.length || 0) === 0 && (graph.edges?.length || 0) === 0) {
      graph = seed; // seed lần đầu
    } else {
      // merge nhẹ nhàng (tránh trùng)
      const seenNode = new Set(graph.nodes.map(n => n.id));
      for (const n of (seed.nodes || [])) if (!seenNode.has(n.id)) graph.nodes.push(n);
      const seenEdge = new Set(graph.edges.map(e => `${e.from}|${e.to}`));
      for (const e of (seed.edges || [])) {
        const k1 = `${e.from}|${e.to}`, k2 = `${e.to}|${e.from}`;
        if (!seenEdge.has(k1) && !seenEdge.has(k2)) graph.edges.push(e);
      }
    }
  }
} catch { /* bỏ qua */ }

// (2) tạo minimap từ graph recorder hiện tại
const minimapEl = document.querySelector(minimapSelector);
const minimap = minimapEl
  ? createMinimap({
      container: minimapEl,
      graph,
      onGotoScene: (id) => navigateTo(id),
      onPathPlay: async (path) => {
        for (const id of path) {
          await fade(1, 100);
          loadScene(id);
          await fade(0, 100);
          await new Promise(r => setTimeout(r, 60));
        }
      }
    })
  : null;

  function loadScene(id) {
    const s = scenes.find(x => x.id === id);
    if (!s) return console.warn("Scene không tồn tại:", id);
    if (!sceneCache[id]) sceneCache[id] = createScene(s);
  
    const { scene, view } = sceneCache[id];
    scene.switchTo();
    active = { id, scene, view };
    updateTenKhuVuc(id);
  
    // học graph từ scene + refresh minimap nếu có thay đổi
    learnGraphFromScene(id);          // đảm bảo bạn đã thêm lời gọi này
    minimap?.setActive(id);           // highlight node đang đứng
  }
  
  
  function navigateTo(id) {
    fade(1, 120).then(() => { loadScene(id); return fade(0, 120); });
  }

  // === Start
  loadScene(scenes[0].id);

  return {
    navigateTo,
    route: (from, to) => minimap?.routeAndPlay(from, to)
  };
}
