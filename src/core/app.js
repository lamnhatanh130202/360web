export async function bootstrap(opts) {
  const {
    dataBaseUrl = './data',
    rootSelector = '#pano',
    fadeSelector = '#fade'
  } = opts || {};

  // 1. Load JSON scene data
  const scenes = await fetch(`${dataBaseUrl}/scenes.json`).then(r => {
    if (!r.ok) throw new Error("Không tải được scenes.json");
    return r.json();
  });

  // 2. Viewer
  const root = document.querySelector(rootSelector);
  if (!root) throw new Error(`Không tìm thấy ${rootSelector}`);
  const fadeEl = document.querySelector(fadeSelector);

  const viewer = new Marzipano.Viewer(root);
  const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
  const limiter = Marzipano.RectilinearView.limit.traditional(
    Marzipano.util.degToRad(20),
    Marzipano.util.degToRad(110)
  );
  const view = new Marzipano.RectilinearView(
    { yaw: 0, pitch: 0, fov: Marzipano.util.degToRad(70) },
    limiter
  );
  const sceneCache = {};
  let currentSceneId = null;

  // ===== Smooth animation helpers =====
  function smoothMove(start, end, duration, updateCallback, callback) {
    const startTime = performance.now();
    function animate(currentTime) {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const value = start + (end - start) * progress;
      updateCallback(value);
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else if (callback) {
        callback();
      }
    }
    requestAnimationFrame(animate);
  }

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

  // ===== Hotspot =====
  function addHotspot(scene, hotspotData) {
    const hotspotElement = document.createElement("div");
    hotspotElement.classList.add("hotspot");

    const iconElement = document.createElement("img");
    iconElement.src = hotspotData.icon || "./assets/icon/vitri.png";
    iconElement.classList.add("hotspot-icon");
    hotspotElement.appendChild(iconElement);

    const labelElement = document.createElement("span");
    labelElement.textContent = hotspotData.label || hotspotData.text || "";
    hotspotElement.appendChild(labelElement);

    hotspotElement.addEventListener("click", async () => {
      await fade(1, 150);
      loadScene(hotspotData.target);
      await fade(0, 150);
    });

    scene.hotspotContainer().createHotspot(hotspotElement, {
      yaw: hotspotData.yaw,
      pitch: hotspotData.pitch
    });
  }

  function createScene(sceneData) {
    const source = Marzipano.ImageUrlSource.fromString(sceneData.url || sceneData.src);
    const view = new Marzipano.RectilinearView(
      { yaw: sceneData.initialView?.yaw || 0,
        pitch: sceneData.initialView?.pitch || 0,
        fov: sceneData.initialView?.hfov || 1.2 },
      limiter
    );
    const scene = viewer.createScene({ source, geometry, view });

    (sceneData.hotspots || []).forEach(h => addHotspot(scene, h));
    return { scene, view };
  }

  function loadScene(id) {
    const sceneData = scenes.find(s => s.id === id);
    if (!sceneData) return console.warn("Scene không tồn tại:", id);

    if (!sceneCache[id]) {
      sceneCache[id] = createScene(sceneData);
    }
    const { scene, view } = sceneCache[id];
    scene.switchTo();

    currentSceneId = id;
    setupControls(view);
    updateTenKhuVuc(id);
  }

  // ===== Update UI =====
  function updateTenKhuVuc(sceneId) {
    const tenKhuVucElement = document.getElementById("tenKhuVuc");
    const scene = scenes.find(s => s.id === sceneId);
    tenKhuVucElement.textContent =
      `Tên khu vực: ${scene?.name?.vi || scene?.name || "Không xác định"}`;
  }

  
  // ===== Controls =====
function setupControls(view) {
  // Tham số tinh chỉnh cho quay
  const MAX_SPEED = 0.015;   // rad/frame
  const ACCEL     = 0.00035; // rad/frame^2
  const DECEL     = 0.0006;  // rad/frame^2

  let vx = 0;     // vận tốc quay
  let dir = 0;    // -1: trái, +1: phải, 0: đứng yên
  let rafId = null;
  let running = false;

  function loop() {
    // tăng/giảm tốc
    if (dir !== 0) {
      vx += dir * ACCEL;
      if (vx >  MAX_SPEED) vx =  MAX_SPEED;
      if (vx < -MAX_SPEED) vx = -MAX_SPEED;
    } else {
      if (vx > 0) { vx = Math.max(0, vx - DECEL); }
      else if (vx < 0) { vx = Math.min(0, vx + DECEL); }
    }

    // cập nhật yaw nếu còn vận tốc
    if (vx !== 0) {
      view.setYaw(view.yaw() + vx);
    }

    if (running) rafId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (!running) { running = true; rafId = requestAnimationFrame(loop); }
  }
  function release() { dir = 0; }
  function stopLoopIfIdle() {
    if (dir === 0 && Math.abs(vx) < 1e-6 && running) {
      running = false;
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  // ========= Nút quay =========
  const leftBtn   = document.getElementById('left');
  const rightBtn  = document.getElementById('right');

  function pressLeft()  { dir = -1; startLoop(); }
  function pressRight() { dir = +1; startLoop(); }

  leftBtn?.addEventListener('mousedown', pressLeft);
  rightBtn?.addEventListener('mousedown', pressRight);
  window.addEventListener('mouseup', release);

  // Mobile touch
  leftBtn?.addEventListener('touchstart', (e) => { e.preventDefault(); pressLeft(); }, { passive:false });
  rightBtn?.addEventListener('touchstart', (e) => { e.preventDefault(); pressRight(); }, { passive:false });
  window.addEventListener('touchend', () => release(), { passive:true });

  // ========= Keyboard =========
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  { dir = -1; startLoop(); }
    if (e.key === 'ArrowRight') { dir = +1; startLoop(); }
  }, { passive:true });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft'  && dir === -1) dir = 0;
    if (e.key === 'ArrowRight' && dir === +1) dir = 0;
  }, { passive:true });

  // ========= Wheel: quay ngang =========
  const panoEl = document.querySelector('#pano');
  panoEl?.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      vx += (e.deltaX * 0.00003);
      vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx));
      startLoop();
    }
  }, { passive:true });

  // ========= Zoom bằng nút =========
  const zoomInBtn  = document.getElementById("zoomIn");
  const zoomOutBtn = document.getElementById("zoomOut");

  function smoothZoom(start, end, duration) {
    const t0 = performance.now();
    function step(t) {
      const p = Math.min(1, (t - t0) / duration);
      const v = start + (end - start) * p;
      view.setFov(v);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  
document.getElementById("zoomIn").onclick = () => {
  const f = view.fov();
  smoothZoom(f, Math.max(Marzipano.util.degToRad(20), f - 0.1), 200);
};

document.getElementById("zoomOut").onclick = () => {
  const f = view.fov();
  smoothZoom(f, Math.min(Marzipano.util.degToRad(110), f + 0.1), 200);
};

  // ========= Zoom bằng chuột (cuộn dọc) =========
  document.getElementById("pano").addEventListener("wheel", e => {
    e.preventDefault();
    const f = view.fov();
    let targetFov = f + (e.deltaY > 0 ? 0.1 : -0.1);
    targetFov = Math.min(Marzipano.util.degToRad(110), Math.max(Marzipano.util.degToRad(20), targetFov));
    view.setFov(targetFov);
  }, { passive: false });
  
}

  

  // ===== Start first scene =====
  loadScene(scenes[0].id);

  return {
    navigateTo: loadScene
  };
}
