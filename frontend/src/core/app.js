// /src/core/app.js
import { createMinimap } from "./ui/minimap.js";
import { createVoiceBot } from "../bot/voiceBot.js";
import { createFPSCounter } from "./ui/fpsCounter.js"; 

export async function bootstrap(opts) {
  const {
    dataBaseUrl = '/api',
    rootSelector = '#pano',
    fadeSelector = '#fade',
    minimapSelector = '#minimap',
    hotspotsSelector = '#hotspots',
  } = opts || {};

  let currentGraph = { nodes: [], edges: [] };
  let currentSceneId = null;

  // ===== Load scenes =====
  const scenes = await fetch(`${dataBaseUrl}/scenes`).then(r => {
    if (!r.ok) throw new Error('Không tải được scenes');
    return r.json();
  }).catch(err => {
    console.error('Lỗi khi tải scenes:', err);
    return [];
  });
  
  console.log('[App] Loaded scenes:', scenes.length);
  if (scenes.length > 0) {
    console.log('[App] First scene:', { id: scenes[0].id, url: scenes[0].url, name: scenes[0].name });
  }

  // ===== Viewer setup =====
  const root = document.querySelector(rootSelector);
  if (!root) throw new Error(`Không tìm thấy ${rootSelector}`);
  const fadeEl = document.querySelector(fadeSelector);

  // Đảm bảo element có kích thước trước khi khởi tạo viewer
  const ensureElementSize = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn('[App] Element has zero size, setting default dimensions');
      // Đảm bảo element có kích thước
      if (!el.style.width || el.style.width === '0px') {
        el.style.width = '100vw';
      }
      if (!el.style.height || el.style.height === '0px') {
        el.style.height = '100vh';
      }
      // Force reflow
      el.offsetHeight;
    }
    console.log('[App] Element size:', { width: rect.width, height: rect.height, computed: el.getBoundingClientRect() });
  };
  
  ensureElementSize(root);
  
  // Đợi DOM và styles đã render
  await new Promise(resolve => {
    if (document.readyState === 'complete') {
      requestAnimationFrame(resolve);
    } else {
      window.addEventListener('load', () => requestAnimationFrame(resolve));
    }
  });
  
  // Đảm bảo lại kích thước sau khi load
  ensureElementSize(root);
  
  // Kiểm tra Marzipano có được load không
  if (typeof Marzipano === 'undefined') {
    throw new Error('Marzipano library not loaded. Please check if /marzipano.js is accessible.');
  }
  
  // Kiểm tra WebGL support chi tiết hơn
  const checkWebGLSupport = () => {
    try {
      const canvas = document.createElement('canvas');
      // Thử các context khác nhau
      const gl = canvas.getContext('webgl2') || 
                 canvas.getContext('webgl') || 
                 canvas.getContext('experimental-webgl');
      
      if (gl) {
        // Kiểm tra xem context có thực sự hoạt động không
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
          console.log('[App] WebGL support detected:', { vendor, renderer });
        } else {
          console.log('[App] WebGL support detected (basic check)');
        }
        return true;
      }
      
      // Kiểm tra xem có bị block không
      const blocked = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: false });
      if (!blocked) {
        console.warn('[App] WebGL context creation failed - may be blocked or unsupported');
      }
      return false;
    } catch (e) {
      console.warn('[App] WebGL check failed:', e);
      return false;
    }
  };
  
  const hasWebGL = checkWebGLSupport();
  if (!hasWebGL) {
    console.warn('[App] WebGL not available - will use CSS fallback');
  }
  
  let viewer;
  const viewerOptions = {
    controls: {
      mouseViewMode: 'drag'
    }
  };
  
  // Chọn stageType dựa trên WebGL support
  if (hasWebGL) {
    viewerOptions.stageType = "webgl";
  } else {
    // Sử dụng CSS transforms nếu WebGL không khả dụng
    viewerOptions.stageType = "css";
    console.log('[App] Using CSS stage type as WebGL fallback');
  }
  
  try {
    viewer = new Marzipano.Viewer(root, viewerOptions);
    console.log('[App] Marzipano Viewer initialized successfully', hasWebGL ? 'with WebGL' : 'with CSS fallback');
  } catch (error) {
    console.error('[App] Failed to initialize Marzipano Viewer:', error);
    
    // Retry với CSS nếu lần đầu dùng WebGL
    if (hasWebGL && error.message && error.message.includes('WebGL')) {
      console.log('[App] WebGL failed, retrying with CSS stage type');
      ensureElementSize(root);
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        viewer = new Marzipano.Viewer(root, {
          stageType: "css",
          controls: {
            mouseViewMode: 'drag'
          }
        });
        console.log('[App] Marzipano Viewer initialized with CSS fallback');
      } catch (cssError) {
        console.error('[App] Failed to initialize with CSS fallback:', cssError);
        // Fall through to final error handling
        throw cssError;
      }
    } else {
      // Retry với cấu hình đơn giản hơn
      ensureElementSize(root);
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        // Thử không chỉ định stageType (để Marzipano tự chọn)
        viewer = new Marzipano.Viewer(root, {
          controls: {
            mouseViewMode: 'drag'
          }
        });
        console.log('[App] Marzipano Viewer initialized on retry (Marzipano auto-selected stage type)');
      } catch (retryError) {
        console.error('[App] Failed to initialize Marzipano Viewer after retry:', retryError);
        throw retryError;
      }
    }
  }
  
  // Final error handling nếu tất cả đều fail
  if (!viewer) {
    const isWebGLError = true; // Assume WebGL error if we got here
    const errorMsg = 'WebGL không được hỗ trợ. Vui lòng kiểm tra cài đặt trình duyệt hoặc thử trình duyệt khác.';
    
    if (root) {
      root.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: red; font-size: 18px; padding: 20px; text-align: center;">
        <div style="margin-bottom: 10px;">${errorMsg}</div>
        <div style="font-size: 14px; color: #666; margin-top: 10px;">Nếu vấn đề vẫn tiếp tục, vui lòng thử:</div>
        <ul style="font-size: 14px; color: #666; text-align: left; margin-top: 10px;">
          <li>Kiểm tra WebGL có được bật trong cài đặt trình duyệt</li>
          <li>Cập nhật driver đồ họa</li>
          <li>Thử trình duyệt khác (Chrome, Firefox, Edge)</li>
          <li>Kiểm tra tại: <a href="https://webglreport.com/" target="_blank" style="color: #0066cc;">webglreport.com</a></li>
        </ul>
      </div>`;
    }
    throw new Error(errorMsg);
  }
  const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
  const limiter = Marzipano.RectilinearView.limit.traditional(
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

  // Tooltip singleton for hotspots
  const tip = document.createElement('div');
  tip.className = 'hs-tip';
  document.body.appendChild(tip);

  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
    tip.style.display = 'block';
  }
  function moveTip(x, y) {
    if (tip.style.display !== 'none') {
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
  }
  function hideTip() {
    tip.style.display = 'none';
    tip.innerHTML = '';
  }

  // ===== Hotspots =====
  function addHotspot(scene, h) {
    const el = document.createElement('div');
    el.className = 'hotspot';
    el.innerHTML = `
      <img class="hotspot-icon" src="${h.icon || '/assets/icon/vitri.png'}" alt="">
    `;
    // Text đã được hiển thị trong tooltip khi hover, không cần hiển thị dưới icon

    const targetScene = scenes.find(x => x.id === h.target);
    const hsTitle = h.title || h.label || h.text || (targetScene?.name?.vi || targetScene?.name || h.target);
    const hsDesc = h.desc || targetScene?.desc || '';
    const hsImg = h.thumb || targetScene?.preview || '';

    const tipHtml = `
      <div class="row">
        ${hsImg ? `<img src="${hsImg}" alt="">` : ''}
        <div>
          <h4>${hsTitle}</h4>
          ${hsDesc ? `<div class="sub">${hsDesc}</div>` : ''}
        </div>
        </div>
    `;

    el.addEventListener('mouseenter', (e) => {
      showTip(tipHtml, e.clientX + 8, e.clientY + 8);
    });
    el.addEventListener('mousemove', (e) => {
      moveTip(e.clientX + 8, e.clientY + 8);
    });
    el.addEventListener('mouseleave', () => { hideTip(); });

    el.addEventListener('click', async () => {
      hideTip();
      const fromId = active.id;
      const toId = h.target;
      await fade(1, 120);
      await loadScene(toId, fromId);
      await fade(0, 120);
    });

    // Mobile touch handling - cho phép pan khi drag, chỉ xử lý tap khi không drag
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let touchStartTime = 0;
    let isDraggingHotspot = false;
    const TAP_THRESHOLD = 10; // pixels
    const TAP_DURATION = 300; // ms

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) return; // Bỏ qua multi-touch
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchMoved = false;
      touchStartTime = Date.now();
      isDraggingHotspot = false;
      // Không preventDefault để cho phép event lan truyền đến viewer
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
        if (!touchMoved) {
          // Lần đầu phát hiện drag - cho phép event đi qua đến viewer
          touchMoved = true;
          isDraggingHotspot = true;
          hideTip(); // Ẩn tooltip khi đang drag
          
          // Tắt pointer-events để các touch event tiếp theo có thể đi qua đến viewer
          // và viewer có thể bắt đầu pan gesture từ các touchmove/touchend tiếp theo
          el.style.pointerEvents = 'none';
          // Force reflow để đảm bảo style được áp dụng ngay
          void el.offsetHeight;
        }
      }
      // Không preventDefault để viewer có thể nhận được touchmove
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      // Bật lại pointer-events
      el.style.pointerEvents = 'auto';
      
      if (e.touches.length > 0) return; // Nếu vẫn còn touch khác, bỏ qua
      const touchDuration = Date.now() - touchStartTime;
      
      // Nếu đã drag, không xử lý tap - để viewer xử lý pan
      if (touchMoved || isDraggingHotspot) {
        touchMoved = false;
        isDraggingHotspot = false;
        return;
      }
      
      // Chỉ xử lý nếu là tap (không phải drag) và thời gian ngắn
      if (touchDuration < TAP_DURATION) {
        e.preventDefault();
        e.stopPropagation(); // Ngăn click event sau đó
        const touch = e.changedTouches[0];
        if (tip.style.display === 'block') {
          // Tap lần 2: điều hướng
          hideTip();
          const fromId = active.id;
          const toId = h.target;
          fade(1, 120).then(() => loadScene(toId, fromId)).then(() => fade(0, 120));
        } else {
          // Tap lần 1: hiển thị tooltip
          showTip(tipHtml, touch.clientX + 8, touch.clientY + 8);
        }
      }
      touchMoved = false;
      isDraggingHotspot = false;
    }, { passive: false });
    
    // Xử lý touchcancel để đảm bảo reset state
    el.addEventListener('touchcancel', () => {
      el.style.pointerEvents = 'auto';
      touchMoved = false;
      isDraggingHotspot = false;
      hideTip();
    }, { passive: true });

    scene.hotspotContainer().createHotspot(el, { yaw: +h.yaw, pitch: +h.pitch });
    root.addEventListener('mouseleave', hideTip, { passive: true });
  }

  // ===== Create Scene =====
  function createScene(s) {
    const source = Marzipano.ImageUrlSource.fromString(s.url || s.src);
    const view = new Marzipano.RectilinearView({
      yaw: +(s.initialView?.yaw ?? 0),
      pitch: +(s.initialView?.pitch ?? 0),
      fov: +(s.initialView?.hfov ?? 1.2)
    }, limiter);
    const scene = viewer.createScene({ source, geometry, view });
    (s.hotspots || []).forEach(addHotspot.bind(null, scene));
    return { scene, view };
  }

// ===== UI title helper =====
function updateTenKhuVuc(sceneId) {
  const el = document.getElementById('tenKhuVuc');
  const s = scenes.find(x => x.id === sceneId);
  if (el) {
    const currentLang = localStorage.getItem('lang') || 'vi';
    const sceneName = (s?.name?.[currentLang]) || s?.name?.vi || s?.name || sceneId;
    
    el.textContent = sceneName; 
  }
}

  // ===== Auto-rotate & idle resume =====
  const autoRotate = { on: false, raf: 0, speed: 0.004 };
  const idle = { timer: 0, delay: 7500 }; // 7.5 giây
  
  // Detect user interaction với viewer (drag, touch) để reset timer
  // KHÔNG trigger khi click vào các nút controls
  let isInteracting = false;
  root.addEventListener('mousedown', (e) => {
    // Bỏ qua nếu click vào nút controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      return;
    }
    isInteracting = true;
    userActivity();
  }, { passive: true });
  root.addEventListener('mousemove', (e) => {
    // Bỏ qua nếu đang hover vào nút controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      return;
    }
    if (isInteracting) {
      userActivity();
    }
  }, { passive: true });
  root.addEventListener('mouseup', (e) => {
    // Bỏ qua nếu click vào nút controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      isInteracting = false;
      return;
    }
    isInteracting = false;
    userActivity(); // Reset timer khi thả chuột
  }, { passive: true });
  root.addEventListener('touchstart', (e) => {
    // Bỏ qua nếu touch vào nút controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      return;
    }
    isInteracting = true;
    userActivity();
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    // Bỏ qua nếu touch vào nút controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      return;
    }
    if (isInteracting) {
      userActivity();
    }
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    // Bỏ qua nếu touch vào nút controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      isInteracting = false;
      return;
    }
    isInteracting = false;
    userActivity(); // Reset timer khi thả tay
  }, { passive: true });

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
  // [FIXED] Không xóa timer idle ở đây, userActivity sẽ lo việc đó
  return false;
} 
function userActivity() {
  // Dừng xoay tự động ngay lập tức khi user tương tác
  stopAutoRotate();
  if (idle.timer) clearTimeout(idle.timer); // Xóa bộ đếm cũ
  // Đặt lại bộ đếm để tự xoay lại sau 7.5 giây không có tương tác
  idle.timer = setTimeout(() => { 
    console.log('[AutoRotate] Resuming after 7.5s idle');
    startAutoRotate();
  }, idle.delay);
}

// Hàm scheduleAutoResume - tương tự userActivity nhưng có thể gọi khi đã dừng
function scheduleAutoResume() {
  if (idle.timer) clearTimeout(idle.timer); // Xóa bộ đếm cũ
  // Đặt lại bộ đếm để tự xoay lại sau 7.5 giây
  idle.timer = setTimeout(() => { 
    console.log('[AutoRotate] Resuming after 7.5s idle (scheduled)');
    startAutoRotate();
  }, idle.delay);
}

  // ===== loadScene =====
  async function loadScene(id, previousSceneId = null) {
    const s = scenes.find(x => x.id === id);
    if (!s) {
      console.warn('[App] Scene không tồn tại:', id);
      return;
    }
    console.log('[App] Loading scene:', { id, url: s.url, name: s.name });
    if (!sceneCache[id]) {
      try {
        sceneCache[id] = createScene(s);
        console.log('[App] Scene created successfully:', id);
      } catch (e) {
        console.error('[App] Error creating scene:', id, e);
        return;
      }
    }

    const { scene, view } = sceneCache[id];
    try {
      await scene.switchTo({ transitionDuration: 0 });
      console.log('[App] Scene switched successfully:', id);
    } catch (e) {
      console.error('[App] Error switching to scene:', id, e);
      return;
    }

    active = { id, scene, view };
    currentSceneId = id;
    updateTenKhuVuc(id);

    // update currentGraph
    let graphChanged = false;
    if (!currentGraph.nodes.find(node => node.id === id)) {
      currentGraph.nodes.push({
        id: id,
        label: s?.name?.vi || s?.name || id,
        x: Math.random() * 100 - 50,
        y: Math.random() * 100 - 50,
        floor: s.floor ?? 0
      });
      graphChanged = true;
    }

    if (previousSceneId) {
      const edgeExists = currentGraph.edges.some(edge =>
        (edge.from === previousSceneId && edge.to === id) ||
        (edge.from === id && edge.to === previousSceneId)
      );
      if (!edgeExists && currentGraph.nodes.find(node => node.id === previousSceneId)) {
        currentGraph.edges.push({ from: previousSceneId, to: id, w: 1 });
        graphChanged = true;
      }
    }

    if (graphChanged) {
      if (minimap?.refresh) {
        minimap.refresh(currentGraph);
        console.log('[App] Minimap refreshed after scene change, graph nodes:', currentGraph.nodes?.length);
      }
      handleGraphChange(currentGraph);
    }

    startAutoRotate();
    _emit('scenechange', { id, name: s?.name || id });
  }

  // ===== Helpers: yaw/fov =====
  function yawDelta(d = 0) {
    const v = active.view || viewer.scene()?.view();
    if (v) v.setYaw(v.yaw() + d);
  }
  function fovDelta(d = 0) {
    const v = active.view || viewer.scene()?.view(); if (!v) return;
    const ZMIN = Marzipano.util.degToRad(20), ZMAX = Marzipano.util.degToRad(110);
    v.setFov(Math.min(ZMAX, Math.max(ZMIN, v.fov() + d)));
  }

  // ===== Smooth impulse rotate =====
  function impulseRotate(dir = 1, dur = 900) {
    const v = active.view || viewer.scene()?.view(); if (!v) return;
    userActivity();
    const MAX = 0.012;
    const t0 = performance.now();
    let raf = 0;
    function easeInOutQuad(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
    (function loop(t) {
      const elapsed = t - t0;
      const p = Math.min(1, elapsed / dur);
      const speed = MAX * easeInOutQuad(p < 0.5 ? p * 2 : (1 - p) * 2);
      v.setYaw(v.yaw() + dir * speed);
      if (p < 1) raf = requestAnimationFrame(loop);
      else scheduleAutoResume();
    })(t0);
  }

  // ===== Controls API =====
  const controls = {
    left: () => {
      console.log('[Controls] left() called');
      userActivity();
      try {
        const v = active.view || viewer.scene()?.view();
        if (!v) {
          console.warn('[Controls] left() - No view available');
          return;
        }
        impulseRotate(-0.5);
      } catch (e) {
        console.error("[Controls] left() error:", e);
      }
    },
    right: () => {
      console.log('[Controls] right() called');
      userActivity();
      try {
        const v = active.view || viewer.scene()?.view();
        if (!v) {
          console.warn('[Controls] right() - No view available');
          return;
        }
        impulseRotate(+0.5);
      } catch (e) {
        console.error("[Controls] right() error:", e);
      }
    },
    zoomIn: () => {
      console.log('[Controls] zoomIn() called');
      userActivity();
      try {
        const v = active.view || viewer.scene()?.view();
        if (!v) {
          console.warn('[Controls] zoomIn() - No view available');
          return;
        }
        fovDelta(-0.10);
        scheduleAutoResume();
      } catch (e) {
        console.error("[Controls] zoomIn() error:", e);
      }
    },
    zoomOut: () => {
      console.log('[Controls] zoomOut() called');
      userActivity();
      try {
        const v = active.view || viewer.scene()?.view();
        if (!v) {
          console.warn('[Controls] zoomOut() - No view available');
          return;
        }
        fovDelta(+0.10);
        scheduleAutoResume();
      } catch (e) {
        console.error("[Controls] zoomOut() error:", e);
      }
    },
    isAutoRotating: () => autoRotate.on
  };
  // ===== Keyboard handling =====
  (function setupKeys() {
    const MAX_SPEED = 0.015, ACCEL = 0.00035, DECEL = 0.0006;
    let vx = 0, dir = 0, running = false, rafId = 0;
    function loop() {
      if (dir) { vx += dir * ACCEL; vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vx)); }
      else { if (vx > 0) vx = Math.max(0, vx - DECEL); else if (vx < 0) vx = Math.min(0, vx + DECEL); }
      const v = active.view || viewer.scene()?.view();
      if (v && vx) v.setYaw(v.yaw() + vx);
      if (running) rafId = requestAnimationFrame(loop);
    }
    function start() { if (!running) { running = true; rafId = requestAnimationFrame(loop); } }

    function stop() { dir = 0; }
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { userActivity(); dir = -1; start(); }
      if (e.key === 'ArrowRight') { userActivity(); dir = +1; start(); }
    }, { passive: true });
    window.addEventListener('keyup', e => {
      if (e.key === 'ArrowLeft' && dir === -1) { dir = 0; scheduleAutoResume(); }
      if (e.key === 'ArrowRight' && dir === +1) { dir = 0; scheduleAutoResume(); }
    }, { passive: true });
  })();

  // ===== Minimap =====
  const minimapEl = document.querySelector(minimapSelector);
  // Ensure minimap (and its panel wrapper) live as a top-level child so they aren't trapped
  // inside a lower stacking context. This prevents overlays like footer from covering it.
  if (minimapEl) {
    const minimapPanel = minimapEl.closest('.minimap-panel');
    try {
      if (minimapPanel && minimapPanel.parentElement !== document.body) {
        document.body.appendChild(minimapPanel);
        console.log('[App] Moved .minimap-panel to document.body to avoid stacking-context issues');
      } else if (!minimapPanel && minimapEl.parentElement !== document.body) {
        document.body.appendChild(minimapEl);
        console.log('[App] Moved #minimap to document.body to avoid stacking-context issues');
      }
    } catch (e) {
      console.warn('[App] Failed to move minimap panel to body:', e);
    }
  }

  async function handleGraphChange(newGraph) {
    try {
      await fetch(`${dataBaseUrl}/graph`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGraph),
      });
    } catch (err) {
      console.error('Lỗi khi lưu graph:', err);
    }
  }

  // load current graph
  currentGraph = await fetch(`${dataBaseUrl}/graph`).then(r => r.ok ? r.json() : { nodes: [], edges: [] }).catch(err => { console.error('Lỗi khi tải graph ban đầu:', err); return { nodes: [], edges: [] }; });
  
  // ===== FPS Counter =====
  const fpsCounter = createFPSCounter({
    container: document.body,
    position: 'bottom-left', 
    targetFPS: 60,
    showGraph: false, // Set to true to show FPS graph
  });
  
  // Log graph data để debug
  console.log('[App] Graph loaded:', {
    nodeCount: currentGraph.nodes?.length || 0,
    edgeCount: currentGraph.edges?.length || 0,
    sampleNodes: currentGraph.nodes?.slice(0, 3).map(n => ({
      id: n.id,
      floor: n.floor ?? 0,
      x: n.x,
      y: n.y,
      hasPositions: !!n.positions,
      positionsKeys: n.positions ? Object.keys(n.positions) : []
    })) || []
  });

  // ===== safeNavigator: non-blocking wrapper around navigateTo =====
  function safeNavigateTo(sceneId) {
    try {
      setTimeout(() => {
        (async () => {
          try { await navigateTo(sceneId); } catch (e) { console.error('safeNavigateTo navigateTo failed', e); }
        })();
      }, 0);
    } catch (e) { console.error('safeNavigateTo error', e); }
    return Promise.resolve();
  }

  // Inject Google Maps API key to window for minimap (if available)
  // Frontend có thể nhận API key từ window hoặc config
  // Có thể set từ backend config hoặc environment variable
  if (typeof window !== 'undefined') {
    // Có thể lấy từ backend config hoặc env variable
    // window.__GOOGLE_MAPS_API_KEY__ = dataBaseUrl.includes('localhost') ? '' : (process.env.VITE_GOOGLE_MAPS_API_KEY || '');
    // Tạm thời để empty, có thể set sau từ config
  }

  // Kiểm tra nếu là mobile (width < 768px) thì không khởi tạo minimap
  let isMobile = window.innerWidth < 768;
  const shouldInitMinimap = minimapEl && !isMobile;
  
  // Hàm helper để ẩn/hiện minimap
  const toggleMinimapVisibility = (hide) => {
    if (!minimapEl) return;
    if (hide) {
      minimapEl.style.display = 'none';
      const minimapPanel = minimapEl.closest('.minimap-panel');
      if (minimapPanel) minimapPanel.style.display = 'none';
    } else {
      minimapEl.style.display = '';
      const minimapPanel = minimapEl.closest('.minimap-panel');
      if (minimapPanel) minimapPanel.style.display = '';
    }
  };
  
  if (isMobile && minimapEl) {
    console.log('[App] Mobile device detected, hiding minimap');
    toggleMinimapVisibility(true);
  }

  // Helper function để tạo minimap
  const createMinimapInstance = () => {
    const checkIsMobile = window.innerWidth < 768;
    if (!minimapEl || checkIsMobile) return null;
    return createMinimap({
      container: minimapEl,
      graph: currentGraph,
      onGotoScene: (id) => { userActivity(); return safeNavigateTo(id); },
      onPathPlay: (path) => {
        if (!Array.isArray(path) || !path.length) return Promise.resolve();
        const STEP_MS = 600, FADE_MS = 80, MAX_STEPS = 200;
        const ids = path.slice(0, MAX_STEPS).map(p => String(p));
        ids.forEach((id, idx) => {
          const delay = idx * STEP_MS;
          setTimeout(() => {
            try {
              userActivity();
              (async () => {
                try { await fade(1, FADE_MS); await safeNavigateTo(id); await fade(0, FADE_MS); } catch (e) { console.error('onPathPlay step failed for', id, e); }
              })();
            } catch (e) { console.error('onPathPlay scheduler error', e); }
          }, delay);
        });
        return Promise.resolve();
      },
      onGraphChange: (updatedGraph) => { currentGraph = updatedGraph; handleGraphChange(updatedGraph); }
    });
  };
  
  let minimap = shouldInitMinimap ? createMinimapInstance() : null;

  // Refresh minimap với graph đã load từ API sau khi minimap đã khởi tạo xong (chỉ nếu không phải mobile)
  if (minimap && minimap.refresh && currentGraph && currentGraph.nodes && currentGraph.nodes.length > 0 && !isMobile) {
    setTimeout(() => {
      minimap.refresh(currentGraph);
      console.log('[App] Minimap refreshed with graph from API, nodes:', currentGraph.nodes.length, 'edges:', currentGraph.edges.length);
    }, 200);
  }
  
  // Handle window resize để ẩn/hiện minimap khi chuyển giữa mobile và desktop
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newIsMobile = window.innerWidth < 768;
      if (newIsMobile !== isMobile) {
        isMobile = newIsMobile;
        if (newIsMobile) {
          console.log('[App] Switched to mobile, hiding minimap');
          toggleMinimapVisibility(true);
        } else {
          console.log('[App] Switched to desktop, showing minimap');
          toggleMinimapVisibility(false);
          // Nếu minimap chưa được khởi tạo và giờ là desktop, khởi tạo lại
          if (!minimap && minimapEl) {
            console.log('[App] Initializing minimap after resize to desktop');
            minimap = createMinimapInstance();
            if (minimap && currentGraph && currentGraph.nodes && currentGraph.nodes.length > 0) {
              setTimeout(() => {
                minimap.refresh(currentGraph);
                console.log('[App] Minimap initialized and refreshed after resize');
              }, 200);
            }
          }
        }
      }
    }, 250);
  });

 
  // ===== API helpers =====
  async function navigateTo(id) {
    await fade(1, 120);
    await loadScene(id);
    await fade(0, 120);
  }

  // Start at first scene
  if (scenes && scenes.length > 0) {
    console.log('[App] Starting with first scene:', scenes[0].id);
    await loadScene(scenes[0].id);
  } else {
    console.error('[App] Không có scene nào để hiển thị.');
  }


  onSceneChange(({ id }) => {
    updateTenKhuVuc(id);
    const activeSceneData = scenes.find(s => s.id === id);
    // Chỉ update minimap nếu không phải mobile (kiểm tra lại mỗi lần)
    const currentIsMobile = window.innerWidth < 768;
    if (!currentIsMobile && activeSceneData && minimap?.setActive) minimap.setActive(id);
  });


const voiceBot = createVoiceBot({
  container: document.body,
  buttonId: 'voice-command-btn', // Sử dụng button có sẵn trong HTML
  // Cung cấp các đối tượng cảnh đầy đủ để bot giọng nói có thể truy cập vào các trường sàn/giọng nói
  getScenes: () => scenes.map(s => ({
    id: s.id,
    name: s.name,               // keep original name object {vi,en}
    hotspots: s.hotspots || [],
    floor: s.floor,            // numeric floor used for announcements
    voice: s.voice || '',
    voiceIntro: s.voiceIntro || ''
  })),
  getCurrentSceneId: ()=> currentSceneId,
  onGotoScene: async(id)=> safeNavigateTo(id),
  onPathPlay: async (path)=> {
    console.log('[App] VoiceBot path:', path); // Log để kiểm tra
    
    if (!Array.isArray(path) || !path.length) return Promise.resolve();

    // Gọi visualizePath NGAY LẬP TỨC để làm mờ và zoom minimap
    if (minimap && minimap.visualizePath) {
      console.log('[App] Calling minimap.visualizePath...');
      minimap.visualizePath(path);
    } else {
      console.warn('[App] Minimap not found or visualizePath missing!');
      // Fallback: nếu chưa có visualizePath, thử dùng highlightPath
      if (minimap && minimap.highlightPath) minimap.highlightPath(path.map(String));
    }
    
    // Đợi một chút để minimap có thời gian render và zoom
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const STEP_MS = 1200, FADE_MS = 120, MAX_STEPS = 200;
    const ids = path.slice(0, MAX_STEPS).map(p => String(p));
    for (let idx = 0; idx < ids.length; idx++) {
      const id = ids[idx];
      // Bỏ qua delay cho scene đầu tiên vì đã ở đó rồi
      if (idx > 0) {
        await new Promise(resolve => setTimeout(resolve, STEP_MS));
      }
      try {
        userActivity();
        await fade(1, FADE_MS);
        await safeNavigateTo(id);
        await fade(0, FADE_MS);
      } catch (e) {
        console.error('onPathPlay step failed for', id, e);
      }
    }
    return Promise.resolve();
  },
  getGraph: () => currentGraph,
  getTours: async () => {
    try {
      const url = `${dataBaseUrl}/tours`;
      console.log('[VoiceBot] Fetching tours from:', url);
      const res = await fetch(url);
      console.log('[VoiceBot] Tours response status:', res.status);
      if (res.ok) {
        const tours = await res.json();
        console.log('[VoiceBot] Tours fetched successfully:', tours);
        return tours;
      } else {
        const errorText = await res.text();
        console.error('[VoiceBot] Tours fetch failed:', res.status, errorText);
        return [];
      }
    } catch (e) {
      console.error('[VoiceBot] Failed to fetch tours:', e);
      return [];
    }
  },
  tts: { enabled: true, useGoogle: true, voice: 'vi-VN-Wavenet-B' }, // Enable Google Cloud TTS
  baseUrl: dataBaseUrl || '' // Use same origin for API calls
});
await voiceBot.mount();


  // ===== Analytics tracking =====
  let sessionId = localStorage.getItem('session_id') || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  localStorage.setItem('session_id', sessionId);

  console.log('[Analytics] Session ID:', sessionId);
  console.log('[Analytics] API Base URL:', dataBaseUrl);

  // Track initial visit
  fetch(`${dataBaseUrl}/analytics/visit`, {
    method: 'POST',
    headers: { 'X-Session-ID': sessionId }
  })
  .then(res => {
    if (res.ok) {
      return res.json();
    }
    throw new Error(`Visit tracking failed: ${res.status}`);
  })
  .then(data => {
    console.log('[Analytics] Visit tracked:', data);
    console.log('[Analytics] Current concurrent users:', data.concurrent);
  })
  .catch(err => {
    console.error('[Analytics] Failed to track visit:', err);
  });

  // Ping every 1 minute to keep session alive (reduced from 2 minutes for better tracking)
  const pingInterval = setInterval(() => {
    fetch(`${dataBaseUrl}/analytics/ping`, {
      method: 'POST',
      headers: { 'X-Session-ID': sessionId }
    })
    .then(res => res.ok ? res.json() : Promise.reject(new Error(`Ping failed: ${res.status}`)))
    .then(data => {
      // Only log occasionally to reduce console spam
      if (Math.random() < 0.1) {  // Log 10% of pings
        console.log('[Analytics] Ping OK:', data);
      }
    })
    .catch(err => console.error('[Analytics] Ping failed:', err));
  }, 60000);  // 1 minute instead of 2 minutes

  // Update concurrent users display every 30 seconds (reduced from 10 seconds for better performance)
  let concurrentEl = null;
  let concurrentUpdateInterval = null;
  const updateConcurrent = async () => {
    try {
      const res = await fetch(`${dataBaseUrl}/analytics/concurrent`);
      if (res.ok) {
        const data = await res.json();
        // Only log occasionally to reduce console spam
        if (Math.random() < 0.1) {  // Log 10% of updates
          console.log('[Analytics] Concurrent users:', data.concurrent);
        }
        if (concurrentEl) {
          concurrentEl.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></span><span>${data.concurrent || 0} người đang xem</span>`;
        }
      } else {
        console.warn('[Analytics] Failed to get concurrent:', res.status);
      }
    } catch (e) {
      console.error('[Analytics] Failed to fetch concurrent users:', e);
    }
  };

  // Create concurrent users display in header
  const headerActions = document.querySelector('.header-actions');
  if (headerActions && !document.getElementById('concurrent-users')) {
    concurrentEl = document.createElement('div');
    concurrentEl.id = 'concurrent-users';
    concurrentEl.style.cssText = 'font-size: 13px; color: rgba(255,255,255,0.9); padding: 6px 12px; background: rgba(0,0,0,0.2); border-radius: 6px; margin-right: 12px; display: flex; align-items: center; gap: 6px;';
    concurrentEl.innerHTML = '<span style="display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></span><span>Đang tải...</span>';
    headerActions.insertBefore(concurrentEl, headerActions.firstChild);
    updateConcurrent();
    concurrentUpdateInterval = setInterval(updateConcurrent, 30000);  // 30 seconds instead of 10
  }

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    clearInterval(pingInterval);
    if (concurrentUpdateInterval) {
      clearInterval(concurrentUpdateInterval);
    }
  });

  // ===== Return external API =====
  return {
    navigateTo,
    route: (from, to) => minimap?.routeAndPlay?.(from, to),
    onSceneChange,
    controls, 
    fpsCounter, // Expose FPS counter for external control
    getActiveScene: () => {
      const s = scenes.find(x => x.id === active.id);
      return { id: active.id, name: s?.name || active.id };
    },
    graph: minimap?.getGraph?.() || null,
    updateSize: () => viewer.updateSize?.(),
    minimap: minimap, // Expose minimap to allow updating selects with i18n
    scenes: scenes // Expose scenes for i18n
  };
}