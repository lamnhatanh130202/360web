// /src/core/app.js
import { createMinimap } from "./ui/minimap.js";

export async function bootstrap(opts) {
  const {
    dataBaseUrl = './data',
    rootSelector = '#pano',
    fadeSelector = '#fade',
    minimapSelector = '#minimap',
    hotspotsSelector = '#hotspots'
  } = opts || {};




  // ===== Load scenes =====
  const scenes = await fetch(`${dataBaseUrl}/scenes.json`).then(r => {
    if (!r.ok) throw new Error("Không tải được scenes.json");
    return r.json();
  });

  // ===== Viewer =====
  const root = document.querySelector(rootSelector);
  if (!root) throw new Error(`Không tìm thấy ${rootSelector}`);
  const fadeEl = document.querySelector(fadeSelector);

  const viewer = new Marzipano.Viewer(root);
  const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
  const limiter  = Marzipano.RectilinearView.limit.traditional(
    Marzipano.util.degToRad(20),
    Marzipano.util.degToRad(110)
  );



  const sceneCache = {};
  let active = { id: null, scene: null, view: null };

  // ===== Pub/Sub (scenechange) =====
  const _listeners = { scenechange: new Set() };
  function onSceneChange(cb) { _listeners.scenechange.add(cb); return () => _listeners.scenechange.delete(cb); }
  function _emit(type, payload) { _listeners[type]?.forEach(fn => fn(payload)); }

  // ===== Fade helper =====
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


// Tooltip singleton
const tip = document.createElement('div');
tip.className = 'hs-tip';
document.body.appendChild(tip);

function showTip(html, x, y) {
  tip.innerHTML = html;
  tip.style.left = x + 'px';
  tip.style.top  = y + 'px';
  tip.style.display = 'block';
}
function moveTip(x, y) {
  if (tip.style.display !== 'none') {
    tip.style.left = x + 'px';
    tip.style.top  = y + 'px';
  }
}
function hideTip() {
  tip.style.display = 'none';
  tip.innerHTML = '';
}


  // ===== Hotspots =====
  function addHotspot(scene, h) {
    const el = document.createElement("div");
    el.className = "hotspot";
    el.innerHTML = `
      <img class="hotspot-icon" src="${h.icon || "./assets/icon/vitri.png"}" alt="">
      <span>${h.label || h.text || ""}</span>
    `;
  
    // Lấy data cho tooltip
    // Ưu tiên dữ liệu ngay trên hotspot (title/desc/thumb), fallback dùng scene target
    const targetScene = scenes.find(x => x.id === h.target);
    const hsTitle = h.title || h.label || h.text || (targetScene?.name?.vi || targetScene?.name || h.target);
    const hsDesc  = h.desc  || targetScene?.desc || "";     // nếu bạn muốn, thêm "desc" trong scenes.json
    const hsImg   = h.thumb || targetScene?.preview || "";  // nếu muốn, thêm "preview" cho scene
  
    // Build HTML tooltip
    const tipHtml = `
      <div class="row">
        ${hsImg ? `<img src="${hsImg}" alt="">` : ``}
        <div>
          <h4>${hsTitle}</h4>
          ${hsDesc ? `<div class="sub">${hsDesc}</div>` : ``}
        </div>
      </div>
    `;
  
    // Hover (desktop)
    el.addEventListener('mouseenter', (e) => {
      showTip(tipHtml, e.clientX + 8, e.clientY + 8);
    });
    el.addEventListener('mousemove', (e) => {
      moveTip(e.clientX + 8, e.clientY + 8);
    });
    el.addEventListener('mouseleave', () => {
      hideTip();
    });
  
    // Click: chuyển cảnh (đồng thời ẩn tooltip)
    el.addEventListener("click", async () => {
      hideTip();
      userActivity?.(); // nếu có hàm này trong file (từ phần auto-rotate)
      await fade(1, 120);
      loadScene(h.target);
      await fade(0, 120);
    });
  
    // Mobile: tap để toggle tooltip, tap lần 2 hoặc tap chỗ khác để ẩn
    el.addEventListener('touchstart', (e) => {
      // chặn click xuyên
      e.preventDefault();
      const touch = e.touches[0];
      if (tip.style.display === 'block') hideTip();
      else showTip(tipHtml, touch.clientX + 8, touch.clientY + 8);
    }, { passive: false });
  
    // Gắn hotspot lên pano
    scene.hotspotContainer().createHotspot(el, { yaw: +h.yaw, pitch: +h.pitch });
  
    // Tránh kẹt tooltip khi rời viewer
    root.addEventListener('mouseleave', hideTip, { passive: true });
  }
  

  // ===== Create Scene =====
  function createScene(s) {
    const source = Marzipano.ImageUrlSource.fromString(s.url || s.src);
    const view = new Marzipano.RectilinearView(
      {
        yaw:   +(s.initialView?.yaw   ?? 0),
        pitch: +(s.initialView?.pitch ?? 0),
        fov:   +(s.initialView?.hfov  ?? 1.2)
      },
      limiter
    );
    const scene = viewer.createScene({ source, geometry, view });
    (s.hotspots || []).forEach(addHotspot.bind(null, scene));
    return { scene, view };
  }

  // ===== UI title helper (fallback) =====
  function updateTenKhuVuc(sceneId) {
    const el = document.getElementById("tenKhuVuc");
    const s = scenes.find(x => x.id === sceneId);
    if (el) el.textContent = `Tên khu vực: ${s?.name?.vi || s?.name || sceneId}`;
  }

  // ===== Auto-rotate & idle resume =====
  const autoRotate = { on: false, raf: 0, speed: 0.004 }; // rad/frame
  const idle = { timer: 0, delay: 15000 }; // 15s

  function _autoLoop() {
    if (!autoRotate.on) return;
    const v = active.view || viewer.scene()?.view();
    if (v) v.setYaw(v.yaw() + autoRotate.speed);
    autoRotate.raf = requestAnimationFrame(_autoLoop);
  }

  function startAutoRotate() {
    if (autoRotate.on) return true;
    autoRotate.on = true;
    if (!autoRotate.raf) autoRotate.raf = requestAnimationFrame(_autoLoop);
    return true;
  }

  function stopAutoRotate() {
    autoRotate.on = false;
    if (autoRotate.raf) { cancelAnimationFrame(autoRotate.raf); autoRotate.raf = 0; }
    return false;
  }

  function scheduleAutoResume() {
    if (idle.timer) clearTimeout(idle.timer);
    idle.timer = setTimeout(() => { startAutoRotate(); }, idle.delay);
  }

  // gọi mỗi khi có thao tác người dùng
  function userActivity() {
    stopAutoRotate();         // dừng ngay auto
    if (idle.timer) clearTimeout(idle.timer);
    idle.timer = setTimeout(() => { startAutoRotate(); }, idle.delay); // bật lại sau 15s
  }

  // ===== loadScene (emit + minimap + auto-rotate on) =====
  function loadScene(id) {
    const s = scenes.find(x => x.id === id);
    if (!s) return console.warn("Scene không tồn tại:", id);
    if (!sceneCache[id]) sceneCache[id] = createScene(s);

    const { scene, view } = sceneCache[id];
    scene.switchTo();
    active = { id, scene, view };
    updateTenKhuVuc(id);

    minimap?.setActive?.(id);
    _emit('scenechange', { id, name: s?.name || id });

    // yêu cầu: tự động quay khi tạo/đổi scene
    startAutoRotate();
    // nếu ngay sau đó người dùng không động gì → vẫn tiếp tục quay
  }

  // ===== Helpers: yaw/fov =====
  function yawDelta(d=0) {
    const v = active.view || viewer.scene()?.view();
    if (v) v.setYaw(v.yaw() + d);
  }
  function fovDelta(d=0) {
    const v = active.view || viewer.scene()?.view(); if (!v) return;
    const ZMIN = Marzipano.util.degToRad(20), ZMAX = Marzipano.util.degToRad(110);
    v.setFov(Math.min(ZMAX, Math.max(ZMIN, v.fov() + d)));
  }

  // ===== Smooth impulse rotate (mượt có quán tính khi bấm trái/phải) =====
  function impulseRotate(dir = 1, dur = 900) {
    const v = active.view || viewer.scene()?.view(); if (!v) return;
    userActivity(); // dừng auto và hẹn bật lại

    const MAX = 0.012; // tốc độ tối đa (rad/frame)
    const t0 = performance.now();
    let raf = 0;

    function easeInOutQuad(x){ return x < 0.5 ? 2*x*x : 1 - Math.pow(-2*x+2,2)/2; }

    (function loop(t){
      const elapsed = t - t0;
      const p = Math.min(1, elapsed / dur);
      // profile tốc độ: tăng rồi giảm
      const speed = MAX * easeInOutQuad( p < 0.5 ? p*2 : (1-p)*2 );
      v.setYaw(v.yaw() + dir * speed);
      if (p < 1) raf = requestAnimationFrame(loop);
      else scheduleAutoResume(); // hết quán tính → chờ 15s bật lại auto
    })(t0);
  }

  // ===== Controls API =====
  function toggleAutoRotate() {
    const state = autoRotate.on ? stopAutoRotate() : startAutoRotate();
    // nếu user tự bật/tắt bằng nút, vẫn set lại timer bật lại sau 15s khi tắt
    if (!state) scheduleAutoResume();
    return autoRotate.on;
  }

  const controls = {
    // bấm trái/phải: dừng auto và quay mượt theo hướng đã bấm
    left:    () => impulseRotate(-0.5),
    right:   () => impulseRotate(+0.5),
    // zoom cũng coi là thao tác người dùng
    zoomIn:  () => { userActivity(); fovDelta(-0.10); scheduleAutoResume(); },
    zoomOut: () => { userActivity(); fovDelta(+0.10); scheduleAutoResume(); },
    toggleAutoRotate,
    isAutoRotating: () => autoRotate.on
  };

  // ===== Keyboard rotate (giữ phím mượt) =====
  (function setupKeys(){
    const MAX_SPEED = 0.015, ACCEL = 0.00035, DECEL = 0.0006;
    let vx = 0, dir = 0, running = false, rafId = 0;

    function loop(){
      if (dir) { vx += dir*ACCEL; vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx)); }
      else { if (vx>0) vx=Math.max(0,vx-DECEL); else if (vx<0) vx=Math.min(0,vx+DECEL); }
      const v = active.view || viewer.scene()?.view();
      if (v && vx) v.setYaw(v.yaw()+vx);
      if (running) rafId = requestAnimationFrame(loop);
    }
    function start(){ if (!running){ running=true; rafId=requestAnimationFrame(loop);} }
    function stop(){ dir=0; }

    window.addEventListener('keydown', e => {
      if (e.key==='ArrowLeft')  { userActivity(); dir=-1; start(); }
      if (e.key==='ArrowRight') { userActivity(); dir=+1; start(); }
    }, {passive:true});
    window.addEventListener('keyup', e => {
      if (e.key==='ArrowLeft'  && dir===-1) { dir=0; scheduleAutoResume(); }
      if (e.key==='ArrowRight' && dir===+1) { dir=0; scheduleAutoResume(); }
    }, {passive:true});
  })();

  // ===== Minimap (nếu có) =====
  const minimapEl = document.querySelector(minimapSelector);
  const minimap = minimapEl
    ? createMinimap({
        container: minimapEl,
        graph: await (async () => {
          try {
            const seed = await fetch(`${dataBaseUrl}/graph.json`).then(r => r.ok ? r.json() : null);
            return seed || { nodes: [], edges: [] };
          } catch { return { nodes: [], edges: [] }; }
        })(),
        onGotoScene: (id) => { userActivity(); return navigateTo(id); },
        onPathPlay: async (path) => {
          for (const id of path) {
            userActivity();
            await fade(1, 80);
            loadScene(id);
            await fade(0, 80);
            await new Promise(r => setTimeout(r, 60));
          }
        }
      })
    : null;

  // ===== API helpers =====
  function navigateTo(id) {
    return fade(1, 120).then(() => { loadScene(id); return fade(0, 120); });
  }

  // Start at first scene (yêu cầu: tự quay ngay)
  loadScene(scenes[0].id);

  // ===== Return external API =====
  return {
    navigateTo,
    route: (from, to) => minimap?.routeAndPlay?.(from, to),
    onSceneChange,
    controls,
    getActiveScene: () => {
      const s = scenes.find(x => x.id === active.id);
      return { id: active.id, name: s?.name || active.id };
    },
    graph: minimap?.getGraph?.() || null,
    updateSize: () => viewer.updateSize?.()
  };
}
