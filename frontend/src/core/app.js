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

  // Index scenes by id for fast hotspot lookup
  const scenesById = new Map();
  scenes.forEach(s => { if (s && s.id) scenesById.set(String(s.id), s); });

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
    // Ensure wheel and pinch zoom controls are registered
    try {
      const ctrls = typeof viewer.controls === 'function' ? viewer.controls() : null;
      if (Marzipano.registerDefaultControls && ctrls) {
        // Correct API: pass Controls instance, not Viewer
        Marzipano.registerDefaultControls(ctrls);
      } else if (ctrls) {
        ctrls.registerMethod('scrollZoom', new Marzipano.ScrollZoomControlMethod(), true);
        ctrls.registerMethod('pinchZoom', new Marzipano.PinchZoomControlMethod(), true);
      }
      console.log('[App] Zoom controls registered (scroll + pinch)');
    } catch (ctrlErr) {
      console.warn('[App] Failed to register zoom controls:', ctrlErr);
    }
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
        try {
          const ctrls = typeof viewer.controls === 'function' ? viewer.controls() : null;
          if (Marzipano.registerDefaultControls && ctrls) {
            Marzipano.registerDefaultControls(ctrls);
          } else if (ctrls) {
            ctrls.registerMethod('scrollZoom', new Marzipano.ScrollZoomControlMethod(), true);
            ctrls.registerMethod('pinchZoom', new Marzipano.PinchZoomControlMethod(), true);
          }
          console.log('[App] Zoom controls registered (scroll + pinch) [CSS fallback]');
        } catch (ctrlErr2) {
          console.warn('[App] Failed to register zoom controls (CSS fallback):', ctrlErr2);
        }
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
        try {
          const ctrls = typeof viewer.controls === 'function' ? viewer.controls() : null;
          if (Marzipano.registerDefaultControls && ctrls) {
            Marzipano.registerDefaultControls(ctrls);
          } else if (ctrls) {
            ctrls.registerMethod('scrollZoom', new Marzipano.ScrollZoomControlMethod(), true);
            ctrls.registerMethod('pinchZoom', new Marzipano.PinchZoomControlMethod(), true);
          }
          console.log('[App] Zoom controls registered (scroll + pinch) [retry]');
        } catch (ctrlErr3) {
          console.warn('[App] Failed to register zoom controls (retry):', ctrlErr3);
        }
      } catch (retryError) {
        console.error('[App] Failed to initialize Marzipano Viewer after retry:', retryError);
        throw retryError;
      }
    }
  }
  
  // Fallback: ensure desktop wheel zoom always works even if controls fail
  try {
    root.addEventListener('wheel', (e) => {
      // Ignore if interacting with overlays
      if (e.target.closest('#minimap') || e.target.closest('header') || e.target.closest('footer')) return;
      userActivity();
      const delta = e.deltaY;
      // Small step to feel smooth; positive = zoom out, negative = zoom in
      fovDelta(delta > 0 ? +0.08 : -0.08);
      scheduleAutoResume();
    }, { passive: true });
    console.log('[App] Wheel zoom fallback attached to #pano');
  } catch (wheelErr) {
    console.warn('[App] Failed to attach wheel zoom fallback:', wheelErr);
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
      <div class="hs-label">${(h.title || h.label || '').trim() || ''}</div>
      <svg class="hs-arrow" viewBox="0 0 120 60" aria-hidden="true">
        <g fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 42 L36 28 L60 42" />
          <path d="M60 42 L84 28 L108 42" />
        </g>
      </svg>
      <img class="hotspot-icon" src="${h.icon || '/assets/icon/vitri.png'}" alt="">
    `;
    // Text đã được hiển thị trong tooltip khi hover, không cần hiển thị dưới icon

  const targetScene = scenes.find(x => x.id === h.target);
  const hsTitle = h.title || h.label || h.text || (targetScene?.name?.vi || targetScene?.name || h.target);
    const hsDesc = h.desc || targetScene?.desc || '';
    const hsImg = h.thumb || targetScene?.preview || '';

    // Cập nhật label hiển thị trực tiếp trên hotspot
    const lbl = el.querySelector('.hs-label');
    if (lbl) lbl.textContent = hsTitle;

    // Tăng khoảng cách giữa mũi tên và icon (có thể tùy biến bằng h.arrowGap)
    const arrowGap = Number.isFinite(+h.arrowGap) ? Math.max(20, +h.arrowGap) : 36;
    el.style.setProperty('--arrow-gap', arrowGap + 'px');

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
      try { await travelToScene(h.target); } catch (e) { console.warn('[Hotspot] travel failed, fallback:', e); await fade(1,120); await loadScene(h.target, active.id); await fade(0,120); }
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
      // Nếu là multi-touch (pinch), chuyển sự kiện cho viewer bằng cách tạm thời tắt pointer-events
      if (e.touches.length > 1) {
        isDraggingHotspot = true; // đánh dấu đang thao tác để bỏ qua xử lý tap
        el.style.pointerEvents = 'none';
        void el.offsetHeight; // force reflow để áp dụng ngay
        return; // để viewer nhận các sự kiện pinch
      }
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
      // Bật lại pointer-events sau mọi thao tác chạm
      el.style.pointerEvents = 'auto';
      
      if (e.touches.length > 0) return; // Nếu vẫn còn touch khác, bỏ qua
      const touchDuration = Date.now() - touchStartTime;
      
      // Nếu đã drag hoặc vừa pinch, không xử lý tap - để viewer xử lý pan/zoom
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
          // Tap lần 2: điều hướng với hiệu ứng travel
          hideTip();
          travelToScene(h.target).catch(() => { fade(1,120).then(() => loadScene(h.target, active.id)).then(() => fade(0,120)); });
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
      // Luôn khôi phục pointer-events nếu thao tác bị hủy (bao gồm pinch)
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
    // Add scene-anchored road banner directly in panorama
    try {
      const lang = localStorage.getItem('lang') || 'vi';
      const roadText = extractRoadText(s, lang);
      if (roadText) {
        const banner = document.createElement('div');
        banner.className = 'scene-banner';
        banner.textContent = roadText;
        const yaw = +(s.bannerYaw ?? s.initialView?.yaw ?? 0);
        const pitch = +(s.bannerPitch ?? -0.22);
        const hs = scene.hotspotContainer().createHotspot(banner, { yaw, pitch });
        scene.__banner = { el: banner, yaw, pitch, hs };
      }
    } catch (e) {
      console.warn('[SceneBanner] Unable to add banner:', e);
    }
    return { scene, view };
  }

// ===== UI title helper =====
function updateTenKhuVuc(sceneId) {
  const el = document.getElementById('tenKhuVuc');
  const mobileTitle = document.getElementById('mobileSceneTitle');
  const s = scenes.find(x => x.id === sceneId);
  const currentLang = localStorage.getItem('lang') || 'vi';
  const sceneName = (s?.name?.[currentLang]) || s?.name?.vi || s?.name || sceneId;
  if (el) el.textContent = sceneName;
  if (mobileTitle) {
    mobileTitle.textContent = sceneName;
    // Ensure visible on mobile
    if (window.innerWidth < 768) mobileTitle.style.display = 'block';
  }
}

// ===== Road banner helper =====
function updateRoadBanner(sceneId) {
  const rb = document.getElementById('roadBanner');
  if (!rb) return;
  const s = scenes.find(x => x.id === sceneId);
  const currentLang = localStorage.getItem('lang') || 'vi';

  // Ưu tiên dùng trường tuỳ chọn s.road nếu CMS có; nếu không, cố gắng lấy từ tên scene
  let roadText = (s?.road && (typeof s.road === 'string' ? s.road : s.road[currentLang])) || '';

  if (!roadText) {
    const nameText = (s?.name?.[currentLang]) || s?.name?.vi || s?.name || '';
    // Nếu tên chứa "Đường" hoặc "Road" thì lấy cụm sau đó
    const matchVi = /Đường\s+[^\-]+(?:\-[^]*)?/i.exec(nameText);
    const matchEn = /Road\s+[^\-]+(?:\-[^]*)?/i.exec(nameText);
    roadText = (matchVi && matchVi[0]) || (matchEn && matchEn[0]) || '';
  }

  // Chỉ hiển thị cho một số cổng (có thể mở rộng danh sách)
  const specialGateIds = new Set(['congtruong', 'congphu']);
  const shouldShow = specialGateIds.has(String(sceneId)) && !!roadText;

  if (shouldShow) {
    rb.textContent = roadText;
    rb.style.display = 'inline-block';
  } else {
    rb.style.display = 'none';
    rb.textContent = '';
  }
}

  // ===== Auto-rotate & idle resume =====
  // Auto-rotate speed is per animation frame; keep extremely low for slowest motion
  const autoRotate = { on: false, raf: 0, speed: 0.0001 };
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
  updateRoadBanner(id);

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
    const before = v.fov();
    const after = Math.min(ZMAX, Math.max(ZMIN, before + d));
    v.setFov(after);
    try { console.log('[Zoom] FOV change:', { beforeDeg: Marzipano.util.radToDeg(before).toFixed(2), afterDeg: Marzipano.util.radToDeg(after).toFixed(2) }); } catch (_) {}
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
      // Quick zoom keys: + / - / =
      if (e.key === '+' || e.key === '=' ) { e.preventDefault(); userActivity(); try { fovDelta(-0.12); } finally { scheduleAutoResume(); } }
      if (e.key === '-' ) { e.preventDefault(); userActivity(); try { fovDelta(+0.12); } finally { scheduleAutoResume(); } }
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
        // Hide panel initially to avoid flash-of-unstyled content while bootstrapping
        minimapPanel.style.visibility = 'hidden';
        minimapPanel.style.opacity = '0';
        minimapPanel.style.transition = 'opacity 150ms ease';
      } else if (!minimapPanel && minimapEl.parentElement !== document.body) {
        document.body.appendChild(minimapEl);
        console.log('[App] Moved #minimap to document.body to avoid stacking-context issues');
        // Hide container initially
        minimapEl.style.visibility = 'hidden';
        minimapEl.style.opacity = '0';
        minimapEl.style.transition = 'opacity 150ms ease';
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

  // ===== Global navigation throttle (3s) =====
  const NAV_DELAY_MS = 3000;
  let lastNavigateAt = 0;
  let pendingNavigateId = null;
  let pendingNavigateTimer = null;

  async function navigateThrottled(id) {
    const now = Date.now();
    const elapsed = now - lastNavigateAt;
    if (elapsed < NAV_DELAY_MS) {
      pendingNavigateId = id;
      const waitMs = NAV_DELAY_MS - elapsed;
      if (pendingNavigateTimer) clearTimeout(pendingNavigateTimer);
      return new Promise(resolve => {
        pendingNavigateTimer = setTimeout(async () => {
          const runId = pendingNavigateId;
          pendingNavigateId = null;
          lastNavigateAt = Date.now();
          try { await navigateTo(runId); } catch (e) { console.error('navigateThrottled failed', e); }
          resolve();
        }, Math.max(150, waitMs));
      });
    } else {
      lastNavigateAt = now;
      return navigateTo(id);
    }
  }

  // ===== Hotspot-aligned rotation before scene change =====
  const ALIGN_TOL_DEG = 6;            // acceptable yaw error
  const ALIGN_TIMEOUT_MS = 8000;      // max time to attempt alignment
  const SETTLE_PAUSE_MS = 1000;       // pause when aligned (for viewer comprehension)

  function normalizeYaw(rad) {
    while (rad > Math.PI) rad -= 2 * Math.PI;
    while (rad < -Math.PI) rad += 2 * Math.PI;
    return rad;
  }
  function degToRad(d) { return d * Math.PI / 180; }
  function radToDeg(r) { return r * 180 / Math.PI; }

  // Find yaw of hotspot in scene `fromId` that links to `toId`
  function getHotspotYaw(fromId, toId) {
    const scene = scenesById.get(String(fromId));
    if (!scene || !Array.isArray(scene.hotspots)) return null;
    const hs = scene.hotspots.find(h => h && (String(h.target) === String(toId) || String(h.to) === String(toId) || String(h.linkTo) === String(toId)));
    if (!hs) return null;
    let yaw = typeof hs.yaw === 'number' ? hs.yaw : (typeof hs.theta === 'number' ? hs.theta : null);
    if (yaw == null) return null;
    // If value looks like degrees (> 2π), convert to radians
    if (Math.abs(yaw) > (2 * Math.PI + 0.0001)) yaw = degToRad(yaw);
    return yaw;
  }

  async function smoothRotateToYaw(targetYawRad) {
    if (!active || !active.view) return;
    const view = active.view;
    targetYawRad = normalizeYaw(targetYawRad);
    let last = performance.now();
    const MAX_SPEED = 1.6; // rad/s
    const MIN_SPEED = 0.5; // rad/s
    return new Promise(resolve => {
      function step(now) {
        const current = normalizeYaw(view.yaw());
        const diff = normalizeYaw(targetYawRad - current);
        const dt = Math.max(0.0005, (now - last) / 1000);
        last = now;
        const speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, Math.abs(diff) * 1.2));
        const delta = Math.sign(diff) * Math.min(Math.abs(diff), speed * dt);
        view.setYaw(normalizeYaw(current + delta));
        const errDeg = Math.abs(radToDeg(normalizeYaw(targetYawRad - view.yaw())));
        if (errDeg <= ALIGN_TOL_DEG) return resolve();
        requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
    });
  }

  async function alignToHotspotBeforeNavigate(fromId, toId) {
    const yaw = getHotspotYaw(fromId, toId);
    if (typeof yaw !== 'number') return false;
    try {
      userActivity(); // stop auto-rotate while aligning
      const start = performance.now();
      await smoothRotateToYaw(yaw);
      // wait until aligned within tolerance or timeout
      while (performance.now() - start < ALIGN_TIMEOUT_MS) {
        const errDeg = Math.abs(radToDeg(normalizeYaw(yaw - active.view.yaw())));
        if (errDeg <= ALIGN_TOL_DEG) break;
        await new Promise(r => setTimeout(r, 80));
      }
      await new Promise(r => setTimeout(r, SETTLE_PAUSE_MS));
      return true;
    } catch (e) {
      console.warn('[App] Alignment failed, continuing:', e);
      return false;
    }
  }

  // ===== Travel-like transition between scenes =====
  function animateFov(view, targetFov, duration = 350) {
    if (!view) return Promise.resolve();
    const startFov = view.fov();
    const t0 = performance.now();
    return new Promise(resolve => {
      (function step(now){
        const p = Math.min(1, (now - t0) / duration);
        const ease = 1 - Math.pow(1 - p, 3);
        view.setFov(startFov + (targetFov - startFov) * ease);
        if (p < 1) requestAnimationFrame(step); else resolve();
      })(t0);
    });
  }

  async function travelToScene(toId) {
    const fromId = active?.id;
    if (!toId || toId === fromId) return;
    try {
      userActivity();
      // Animate traveler on minimap from current to target
      try { minimap?.playTravel && minimap.playTravel([fromId, toId]); } catch (_) {}
      const v = active.view || viewer.scene()?.view();
      const prevFov = v ? v.fov() : Marzipano.util.degToRad(75);
      // 1) Align to hotspot yaw if available (glide)
      await alignToHotspotBeforeNavigate(fromId, toId).catch(() => {});
      // 2) Zoom-out the current scene slightly to give a shrink effect
      if (v) {
        const maxFov = Marzipano.util.degToRad(110);
        const farFov = Math.min(maxFov, prevFov * 1.25);
        await animateFov(v, farFov, 320);
      }
      // 3) Crossfade and switch
      await fade(0.5, 150);
      await loadScene(toId, fromId);
      const newView = active.view || viewer.scene()?.view();
      // Keep arrival yaw consistent with departure heading if known
      const carryYaw = getHotspotYaw(fromId, toId);
      if (newView && typeof carryYaw === 'number') newView.setYaw(carryYaw);
      // 4) Zoom-in on the destination scene, then ease to comfortable FOV
      if (newView) {
        const minFov = Marzipano.util.degToRad(20);
        const nearFovArrive = Math.max(minFov, Math.min(prevFov, prevFov * 0.75));
        newView.setFov(nearFovArrive);
      }
      await fade(0, 150);
      if (newView) {
        // Hold the zoom-in briefly, then ease back to previous FOV
        await new Promise(r => setTimeout(r, 220));
        await animateFov(newView, prevFov, 520);
      }
      scheduleAutoResume();
    } catch (e) {
      console.warn('[App] travelToScene fallback to direct navigate:', e);
      await fade(1, 120); await loadScene(toId, fromId); await fade(0, 120);
    }
  }

  // ===== Destination voice announcement =====
  let arrivalAudio = null;
  let audioCtx = null;
  let audioPrimed = false;
  function primeAudioPlayback() {
    try {
      if (!audioPrimed) {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        audioCtx.resume && audioCtx.resume();
        audioPrimed = true;
      }
    } catch (_) {}
  }
  async function ttsSpeak(text) {
    try {
      primeAudioPlayback();
      // Always hit backend TTS root path (not under /api)
      const res = await fetch(`/tts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          language_code: 'vi-VN',
          voice: 'vi-VN-Wavenet-B',
          format: 'MP3',
          speakingRate: 1.0,
          pitch: 0.0,
          volumeGainDb: 6.0,
          sampleRateHertz: 24000
        })
      });
      if (!res.ok) throw new Error('TTS request failed');
      const data = await res.json();
      const url = data && data.url ? data.url : null;
      if (url) {
        // Reset previous audio, then play arrival voice slightly louder
        try { if (arrivalAudio) { arrivalAudio.pause(); arrivalAudio.currentTime = 0; } } catch (_) {}
        arrivalAudio = new Audio();
        arrivalAudio.src = url;
        arrivalAudio.preload = 'auto';
        arrivalAudio.volume = 1.0;
        try {
          await arrivalAudio.play();
        } catch (e) {
          // Attempt to unlock and retry once
          try {
            primeAudioPlayback();
            await arrivalAudio.play();
          } catch (e2) {
            console.warn('[TTS] Audio play blocked, falling back to SpeechSynthesis');
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = 'vi-VN';
            window.speechSynthesis.speak(utter);
          }
        }
        return true;
      }
    } catch (e) {
      // Fallback to Web Speech API (only if Google TTS is unavailable)
      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'vi-VN';
        window.speechSynthesis.speak(utter);
        return true;
      } catch (_) {}
    }
    return false;
  }
  async function announceArrival(sceneId) {
    const s = scenes.find(x => x.id === sceneId);
    const lang = localStorage.getItem('lang') || 'vi';
    const name = (s && s.name && (s.name[lang] || s.name.vi)) || (s && s.name) || sceneId;
    const text = `Đã tới ${name}`;
    return ttsSpeak(text);
  }

  // Inject Google Maps API key to window for minimap (if available)
  // Frontend có thể nhận API key từ window hoặc config
  // Có thể set từ backend config hoặc environment variable
  if (typeof window !== 'undefined') {
    // Có thể lấy từ backend config hoặc env variable
    // window.__GOOGLE_MAPS_API_KEY__ = dataBaseUrl.includes('localhost') ? '' : (process.env.VITE_GOOGLE_MAPS_API_KEY || '');
    // Tạm thời để empty, có thể set sau từ config
  }

  // Phát hiện mobile để cấu hình minimap ở chế độ đơn giản (read-only)
  let isMobile = window.innerWidth < 768;
  const shouldInitMinimap = !!minimapEl; // luôn khởi tạo minimap cả trên mobile (read-only)

  // Helper function để tạo minimap
  const createMinimapInstance = () => {
    const checkIsMobile = window.innerWidth < 768;
    if (!minimapEl) return null;
    return createMinimap({
      container: minimapEl,
      graph: currentGraph,
      // Trên mobile: chỉ hiển thị vị trí hiện tại, bỏ tìm đường thủ công
      readOnly: checkIsMobile,
      mobileMode: checkIsMobile,
      onGotoScene: (id) => { userActivity(); primeAudioPlayback(); return navigateThrottled(id); },
      onPathPlay: (path) => {
        if (!Array.isArray(path) || !path.length) return Promise.resolve();
        primeAudioPlayback();
        const FADE_MS = 100, MAX_STEPS = 200;
        const ids = path.slice(0, MAX_STEPS).map(p => String(p));
        // Show animated traveler along the full path on minimap
        try { minimap?.visualizePath && minimap.visualizePath(ids); } catch (_) {}
        try { minimap?.playTravel && minimap.playTravel(ids); } catch (_) {}
        (async () => {
          for (let idx = 0; idx < ids.length; idx++) {
            const id = ids[idx];
            try {
              await travelToScene(id);
            } catch (e) { console.error('onPathPlay step failed for', id, e); }
          }
          try { await announceArrival(ids[ids.length - 1]); } catch (e) {}
        })();
        return Promise.resolve();
      },
      onGraphChange: (updatedGraph) => { currentGraph = updatedGraph; handleGraphChange(updatedGraph); }
    });
  };
  
  let minimap = shouldInitMinimap ? createMinimapInstance() : null;

  // Ensure current position is shown once minimap finishes initial render
  window.addEventListener('minimap-ready', () => {
    try {
      if (currentSceneId && minimap?.setActive) {
        minimap.setActive(currentSceneId);
      }
      // Reveal minimap panel/container now that it's ready
      const panel = document.querySelector('.minimap-panel');
      const container = document.getElementById('minimap');
      if (panel) { panel.style.visibility = 'visible'; panel.style.opacity = '1'; }
      if (container) { container.style.visibility = 'visible'; container.style.opacity = '1'; }
    } catch (e) { console.warn('[App] Failed to set active on minimap-ready:', e); }
  });

  // Setup mobile-only fullscreen button
  (function setupFullscreenBtn(){
    const fsBtn = document.getElementById('btnFullscreen');
    const mobileTitle = document.getElementById('mobileSceneTitle');
    const showMobileUI = () => {
      const mobile = window.innerWidth < 768;
      if (fsBtn) fsBtn.style.display = mobile ? 'inline-flex' : 'none';
      if (mobileTitle) mobileTitle.style.display = mobile ? 'block' : 'none';
    };
    const isFs = () => document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
    const enterFs = async () => {
      const el = document.documentElement;
      try {
        if (el.requestFullscreen) return await el.requestFullscreen();
        if (el.webkitRequestFullscreen) return el.webkitRequestFullscreen();
        if (el.msRequestFullscreen) return el.msRequestFullscreen();
      } catch (e) { console.warn('[Fullscreen] enter failed:', e); }
    };
    const exitFs = async () => {
      try {
        if (document.exitFullscreen) return await document.exitFullscreen();
        if (document.webkitExitFullscreen) return document.webkitExitFullscreen();
        if (document.msExitFullscreen) return document.msExitFullscreen();
      } catch (e) { console.warn('[Fullscreen] exit failed:', e); }
    };
    const updateBtn = () => {
      if (!fsBtn) return;
      fsBtn.textContent = isFs() ? '🗗' : '⛶';
      fsBtn.title = isFs() ? 'Thoát toàn màn hình' : 'Toàn màn hình';
      fsBtn.setAttribute('aria-label', fsBtn.title);
    };
    if (fsBtn) {
      fsBtn.addEventListener('click', async () => {
        if (isFs()) await exitFs(); else await enterFs();
        setTimeout(updateBtn, 50);
      });
    }
    document.addEventListener('fullscreenchange', updateBtn);
    document.addEventListener('webkitfullscreenchange', updateBtn);
    document.addEventListener('MSFullscreenChange', updateBtn);
    showMobileUI();
    updateBtn();
    window.addEventListener('resize', () => { showMobileUI(); updateBtn(); });
  })();

  // Setup mobile-only minimap and language toggle buttons
  (function setupMobileButtons(){
    const mmBtn = document.getElementById('btnMinimap');
    const langBtn = document.getElementById('btnLang');
    const showMobile = () => {
      const m = window.innerWidth < 768;
      if (mmBtn) mmBtn.style.display = m ? 'inline-flex' : 'none';
      if (langBtn) langBtn.style.display = m ? 'inline-flex' : 'none';
    };
    showMobile();
    window.addEventListener('resize', showMobile);

    if (mmBtn) {
      const updateMmBtn = () => {
        const el = document.getElementById('minimap');
        if (!el) return;
        const hidden = el.classList.contains('minimap--hidden');
        mmBtn.textContent = '🗺';
        mmBtn.title = hidden ? 'Hiện minimap' : 'Ẩn minimap';
        mmBtn.setAttribute('aria-label', mmBtn.title);
      };
      mmBtn.addEventListener('click', () => {
        const el = document.getElementById('minimap');
        if (!el) return;
        // Toggle show/hide only on mobile to avoid showing the small block
        if (el.classList.contains('minimap--hidden')) {
          el.classList.remove('minimap--hidden');
          el.classList.remove('minimap--collapsed');
        } else {
          el.classList.add('minimap--hidden');
          el.classList.remove('minimap--collapsed');
        }
        updateMmBtn();
      });
      // Initialize button state
      updateMmBtn();
    }

    if (langBtn) {
      const updateLangBtn = () => {
        const current = localStorage.getItem('lang') || 'vi';
        langBtn.textContent = current.toUpperCase();
        langBtn.title = current === 'vi' ? 'Đổi sang EN' : 'Switch to VI';
        langBtn.setAttribute('aria-label', langBtn.title);
      };
      updateLangBtn();
      langBtn.addEventListener('click', () => {
        const current = (localStorage.getItem('lang') || 'vi').toLowerCase();
        const next = current === 'vi' ? 'en' : 'vi';
        localStorage.setItem('lang', next);
        // Thông báo cho minimap và các thành phần khác
        window.dispatchEvent(new CustomEvent('change-lang', { detail: next }));
        // Cập nhật tiêu đề khu vực
        try { updateTenKhuVuc(currentSceneId); } catch (_) {}
        updateLangBtn();
      });
    }
  })();

  // Refresh minimap với graph đã load từ API sau khi minimap đã khởi tạo xong (chỉ nếu không phải mobile)
  if (minimap && minimap.refresh && currentGraph && currentGraph.nodes && currentGraph.nodes.length > 0 && !isMobile) {
    setTimeout(() => {
      minimap.refresh(currentGraph);
      console.log('[App] Minimap refreshed with graph from API, nodes:', currentGraph.nodes.length, 'edges:', currentGraph.edges.length);
    }, 200);
  }
  
  // Handle window resize: chuyển chế độ mobile/desktop cho minimap
  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newIsMobile = window.innerWidth < 768;
      if (newIsMobile !== isMobile) {
        isMobile = newIsMobile;
        console.log('[App] Resize detected, reinitializing minimap with mode:', newIsMobile ? 'mobile' : 'desktop');
        // Re-init minimap to apply mobile/desktop options
        if (minimapEl) {
          minimap = createMinimapInstance();
          if (minimap && currentGraph && currentGraph.nodes && currentGraph.nodes.length > 0) {
            setTimeout(() => {
              minimap.refresh(currentGraph);
              console.log('[App] Minimap initialized and refreshed after resize');
            }, 200);
          }
        }
      }
    }, 250);
  });

 
  // ===== API helpers =====
  async function navigateTo(id) { await travelToScene(id); }

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
    // Luôn cập nhật minimap để làm nổi bật vị trí hiện tại (kể cả mobile)
    if (activeSceneData && minimap?.setActive) minimap.setActive(id);
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
    primeAudioPlayback();

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
    
    const FADE_MS = 120, MAX_STEPS = 200;
    const ids = path.slice(0, MAX_STEPS).map(p => String(p));
    for (let idx = 0; idx < ids.length; idx++) {
      const id = ids[idx];
      try { await travelToScene(id); }
      catch (e) { console.error('onPathPlay step failed for', id, e); }
    }
    try { await announceArrival(ids[ids.length - 1]); } catch (e) {}
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

  // Đảm bảo nút VoiceBot luôn hiển thị (đặc biệt trên mobile)
  function ensureVoiceButtonVisible() {
    const btn = document.getElementById('voice-command-btn');
    if (!btn) return;
    btn.style.display = 'block';
    btn.style.position = 'fixed';
    btn.style.right = '15px';
    // Đặt cao hơn footer để không che
    btn.style.bottom = (window.innerWidth < 768) ? '110px' : '100px';
    btn.style.zIndex = '10020';
    btn.style.pointerEvents = 'auto';
  }
  ensureVoiceButtonVisible();
  window.addEventListener('resize', ensureVoiceButtonVisible);


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

// Extract road text for scene-anchored banner
function extractRoadText(scene, lang = (localStorage.getItem('lang') || 'vi')) {
  if (!scene) return '';
  const fromField = scene?.road && (typeof scene.road === 'string' ? scene.road : scene.road[lang]);
  if (fromField) return fromField;
  const overrides = {
    congphu: { vi: 'Đường Hoàng Hoa Thám', en: 'Hoang Hoa Tham Street' },
  };
  const ov = overrides[String(scene.id)];
  if (ov) return ov[lang] || ov.vi;
  const nameText = (scene?.name?.[lang]) || scene?.name?.vi || scene?.name || '';
  const matchVi = /Đường\s+[^\-]+/i.exec(nameText);
  const matchEn = /Road\s+[^\-]+/i.exec(nameText);
  return (matchVi && matchVi[0]) || (matchEn && matchEn[0]) || '';
}

// Move/update scene banner position at runtime
function setSceneBannerPosition(sceneId, yaw, pitch) {
  const rec = sceneCache[sceneId];
  if (!rec) { console.warn('[SceneBanner] Scene not in cache:', sceneId); return false; }
  const scene = rec.scene;
  const sData = scenes.find(x => x.id === sceneId);
  if (!scene.__banner) {
    // Create if missing
    const lang = localStorage.getItem('lang') || 'vi';
    const roadText = extractRoadText(sData, lang);
    if (!roadText) return false;
    const el = document.createElement('div');
    el.className = 'scene-banner';
    el.textContent = roadText;
    const hs = scene.hotspotContainer().createHotspot(el, { yaw, pitch });
    scene.__banner = { el, yaw, pitch, hs };
    return true;
  }
  try {
    // Recreate hotspot at new position
    const cont = scene.hotspotContainer();
    if (scene.__banner.hs) { try { cont.destroyHotspot(scene.__banner.hs); } catch(e) { /* ignore */ } }
    const hs = cont.createHotspot(scene.__banner.el, { yaw, pitch });
    scene.__banner = { ...scene.__banner, yaw, pitch, hs };
    return true;
  } catch (e) {
    console.warn('[SceneBanner] set position failed:', e);
    return false;
  }
}

// Convenience: capture current center yaw/pitch and optionally move banner
window.copyCenterForBanner = async function(copyOnly = true) {
  try {
    const v = active.view || viewer.scene()?.view();
    if (!v) return;
    const yaw = +v.yaw().toFixed(4);
    const pitch = +v.pitch().toFixed(4);
    const snippet = `"bannerYaw": ${yaw}, "bannerPitch": ${pitch}`;
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(snippet);
    console.log('[SceneBanner] Center →', { yaw, pitch, snippet });
    if (!copyOnly) setSceneBannerPosition(currentSceneId, yaw, pitch);
  } catch (e) { console.warn('[SceneBanner] copyCenterForBanner error:', e); }
};

// Shortcut: Shift+B copies bannerYaw/bannerPitch of current center
window.addEventListener('keydown', (e) => {
  if (e.shiftKey && (e.key === 'B' || e.key === 'b')) {
    window.copyCenterForBanner(true);
  }
});