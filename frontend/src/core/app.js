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
    if (!r.ok) throw new Error('Kh么ng t岷 膽瓢峄 scenes');
    return r.json();
  }).catch(err => {
    console.error('L峄梚 khi t岷 scenes:', err);
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
  const fadeEl = document.querySelector(fadeSelector);

    // Start with a black overlay to avoid flashing on initial load.
    try {
      if (fadeEl) {
        fadeEl.style.opacity = '1';
        fadeEl.style.pointerEvents = 'auto';
      }
    } catch (_) {}

  const ensureElementSize = (el) => {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn('[App] Element has zero size, setting default dimensions');

      if (!el.style.width || el.style.width === '0px') {
        el.style.width = '100vw';
      }

      if (!el.style.height || el.style.height === '0px') {
        el.style.height = '100vh';
      }

      el.offsetHeight;
    }
    const computed = el.getBoundingClientRect();
    console.log('[App] Element size:', { width: computed.width, height: computed.height });
  };
  
  ensureElementSize(root);
  
  // 膼峄 DOM v脿 styles 膽茫 render
  await new Promise(resolve => {
    if (document.readyState === 'complete') {
      requestAnimationFrame(resolve);
    } else {
      window.addEventListener('load', () => requestAnimationFrame(resolve));
    }
  });
  
  // 膼岷 b岷 l岷 k铆ch th瓢峄沜 sau khi load
  ensureElementSize(root);
  
  // Ki峄僲 tra Marzipano c贸 膽瓢峄 load kh么ng
  if (typeof Marzipano === 'undefined') {
    throw new Error('Marzipano library not loaded. Please check if /marzipano.js is accessible.');
  }
  
  // Ki峄僲 tra WebGL support chi ti岷縯 h啤n
  const checkWebGLSupport = () => {
    try {
      const canvas = document.createElement('canvas');
      // Th峄?c谩c context kh谩c nhau
      const gl = canvas.getContext('webgl2') || 
                 canvas.getContext('webgl') || 
                 canvas.getContext('experimental-webgl');
      
      if (gl) {
        // Ki峄僲 tra xem context c贸 th峄眂 s峄?ho岷 膽峄檔g kh么ng
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
      
      // Ki峄僲 tra xem c贸 b峄?block kh么ng
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
  
  // Ch峄峮 stageType d峄盿 tr锚n WebGL support
  if (hasWebGL) {
    viewerOptions.stageType = "webgl";
  } else {
    // S峄?d峄g CSS transforms n岷縰 WebGL kh么ng kh岷?d峄g
    viewerOptions.stageType = "css";
    console.log('[App] Using CSS stage type as WebGL fallback');
  }
  
  try {
    viewer = new Marzipano.Viewer(root, viewerOptions);
    console.log('[App] Marzipano Viewer initialized successfully', hasWebGL ? 'with WebGL' : 'with CSS fallback');
    // Ensure wheel and pinch zoom controls are registered.
    // Some Marzipano builds throw inside registerDefaultControls (e.g. missing Hammer).
    try {
      const ctrls = typeof viewer.controls === 'function' ? viewer.controls() : null;
      if (ctrls) {
        let usedDefault = false;
        if (typeof Marzipano.registerDefaultControls === 'function') {
          try {
            Marzipano.registerDefaultControls(ctrls);
            usedDefault = true;
          } catch (e) {
            console.warn('[App] Default controls registration failed, falling back:', e);
          }
        }

        // If default controls fail (e.g. Hammer.js integration missing), we rely on our own
        // wheel + touch pinch fallbacks later in this file.
      }
      console.log('[App] Zoom controls registered (default or fallback)');
    } catch (ctrlErr) {
      console.warn('[App] Failed to register zoom controls:', ctrlErr);
    }
  } catch (error) {
    console.error('[App] Failed to initialize Marzipano Viewer:', error);
    
    // Retry v峄沬 CSS n岷縰 l岷 膽岷 d霉ng WebGL
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
          if (ctrls) {
            let usedDefault = false;
            if (typeof Marzipano.registerDefaultControls === 'function') {
              try {
                Marzipano.registerDefaultControls(ctrls);
                usedDefault = true;
              } catch (e) {
                console.warn('[App] Default controls registration failed (CSS fallback), falling back:', e);
              }
            }
            // Rely on our own wheel + pinch fallbacks.
          }
          console.log('[App] Zoom controls registered (default or fallback) [CSS fallback]');
        } catch (ctrlErr2) {
          console.warn('[App] Failed to register zoom controls (CSS fallback):', ctrlErr2);
        }
      } catch (cssError) {
        console.error('[App] Failed to initialize with CSS fallback:', cssError);
        // Fall through to final error handling
        throw cssError;
      }
    } else {
      // Retry v峄沬 c岷 h矛nh 膽啤n gi岷 h啤n
      ensureElementSize(root);
      await new Promise(resolve => setTimeout(resolve, 300));
      try {
        // Th峄?kh么ng ch峄?膽峄媙h stageType (膽峄?Marzipano t峄?ch峄峮)
        viewer = new Marzipano.Viewer(root, {
          controls: {
            mouseViewMode: 'drag'
          }
        });
        console.log('[App] Marzipano Viewer initialized on retry (Marzipano auto-selected stage type)');
        try {
          const ctrls = typeof viewer.controls === 'function' ? viewer.controls() : null;
          if (ctrls) {
            let usedDefault = false;
            if (typeof Marzipano.registerDefaultControls === 'function') {
              try {
                Marzipano.registerDefaultControls(ctrls);
                usedDefault = true;
              } catch (e) {
                console.warn('[App] Default controls registration failed (retry), falling back:', e);
              }
            }
            // Rely on our own wheel + pinch fallbacks.
          }
          console.log('[App] Zoom controls registered (default or fallback) [retry]');
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
      // Noticeable step; positive = zoom out, negative = zoom in
      fovDelta(delta > 0 ? +0.18 : -0.18);
      scheduleAutoResume();
    }, { passive: true, capture: true });
    console.log('[App] Wheel zoom fallback attached to #pano');
  } catch (wheelErr) {
    console.warn('[App] Failed to attach wheel zoom fallback:', wheelErr);
  }

  // Fallback: touch pinch zoom without Hammer.js
  try {
    const dist = (t1, t2) => {
      const dx = (t1.clientX - t2.clientX);
      const dy = (t1.clientY - t2.clientY);
      return Math.sqrt(dx * dx + dy * dy);
    };
    const pinchState = { active: false, startDist: 0, startFov: 0 };

    root.addEventListener('touchstart', (e) => {
      if (!e.touches || e.touches.length !== 2) return;
      const v = getActiveView();
      if (!v) return;
      pinchState.active = true;
      pinchState.startDist = dist(e.touches[0], e.touches[1]) || 1;
      pinchState.startFov = v.fov();
    }, { passive: true });

    root.addEventListener('touchmove', (e) => {
      if (!pinchState.active || !e.touches || e.touches.length !== 2) return;
      const v = getActiveView();
      if (!v) return;
      // prevent browser page zoom/scroll while pinching on pano
      try { e.preventDefault(); } catch (_) {}
      userActivity();

      const d = dist(e.touches[0], e.touches[1]) || 1;
      const scale = d / (pinchState.startDist || 1);

      const ZMIN = Marzipano.util.degToRad(20), ZMAX = Marzipano.util.degToRad(110);
      const target = pinchState.startFov / Math.max(0.25, Math.min(4, scale));
      v.setFov(Math.min(ZMAX, Math.max(ZMIN, target)));
      requestRender();
      scheduleAutoResume();
    }, { passive: false });

    root.addEventListener('touchend', (e) => {
      if (!e.touches || e.touches.length < 2) pinchState.active = false;
    }, { passive: true });
    root.addEventListener('touchcancel', () => { pinchState.active = false; }, { passive: true });

    console.log('[App] Pinch zoom fallback attached to #pano');
  } catch (touchErr) {
    console.warn('[App] Failed to attach pinch zoom fallback:', touchErr);
  }

  // Final error handling n岷縰 t岷 c岷?膽峄乽 fail
  if (!viewer) {
    const isWebGLError = true; // Assume WebGL error if we got here
    const errorMsg = 'WebGL kh么ng 膽瓢峄 h峄?tr峄? Vui l貌ng ki峄僲 tra c脿i 膽岷穞 tr矛nh duy峄噒 ho岷穋 th峄?tr矛nh duy峄噒 kh谩c.';
    
    if (root) {
      root.innerHTML = `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: red; font-size: 18px; padding: 20px; text-align: center;">
        <div style="margin-bottom: 10px;">${errorMsg}</div>
        <div style="font-size: 14px; color: #666; margin-top: 10px;">N岷縰 v岷 膽峄?v岷玭 ti岷縫 t峄, vui l貌ng th峄?</div>
        <ul style="font-size: 14px; color: #666; text-align: left; margin-top: 10px;">
          <li>Ki峄僲 tra WebGL c贸 膽瓢峄 b岷璽 trong c脿i 膽岷穞 tr矛nh duy峄噒</li>
          <li>C岷璸 nh岷璽 driver 膽峄?h峄峚</li>
          <li>Th峄?tr矛nh duy峄噒 kh谩c (Chrome, Firefox, Edge)</li>
          <li>Ki峄僲 tra t岷: <a href="https://webglreport.com/" target="_blank" style="color: #0066cc;">webglreport.com</a></li>
        </ul>
      </div>`;
    }
    throw new Error(errorMsg);
  }
 const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);
 // NOTE: RectilinearView.limit.traditional(resolution, maxVfov, maxHfov)
 // The previous code passed FOV values into the resolution slot, which can prevent
 // view updates (including setFov) from applying correctly.
 const MIN_FOV = Marzipano.util.degToRad(20);
 const MAX_FOV = Marzipano.util.degToRad(110);
 const DEFAULT_FOV_DEG = 53.02;
 const DEFAULT_FOV = Marzipano.util.degToRad(DEFAULT_FOV_DEG);
 const limiter = Marzipano.util.compose(
  Marzipano.RectilinearView.limit.vfov(MIN_FOV, MAX_FOV),
  Marzipano.RectilinearView.limit.pitch(-Math.PI / 2, Math.PI / 2)
 );

 const sceneCache = {};
 let active = { id: null, scene: null, view: null };
 let isSceneTransitioning = false;

 // Transition overlay strength (0..1). Keep it < 1 so users still see the old scene.
 const TRANSITION_MASK_OPACITY = 0.6;

 // Marzipano internal scene transition duration (ms)
 const SCENE_SWITCH_MS = 700;

 // ===== Render helper =====
 function requestRender() {
  try {
   const rl = viewer && typeof viewer.renderLoop === 'function' ? viewer.renderLoop() : null;
   if (rl && typeof rl.renderOnNextFrame === 'function') {
    rl.renderOnNextFrame();
    return;
   }
  } catch (_) {}
  try {
   const stage = viewer && typeof viewer.stage === 'function' ? viewer.stage() : null;
   if (stage && typeof stage.render === 'function') stage.render();
  } catch (_) {}
 }

 function getActiveView() {
  try {
   const s = viewer && typeof viewer.scene === 'function' ? viewer.scene() : null;
   const v = s && typeof s.view === 'function' ? s.view() : null;
   if (v) {
    active.scene = s;
    active.view = v;
    try { ensureViewSize(v); } catch (_) {}
    return v;
   }
  } catch (_) {}
  return active.view || null;
 }

 function ensureViewSize(v) {
  if (!v || typeof v.setSize !== 'function') return false;
  const stage = viewer && typeof viewer.stage === 'function' ? viewer.stage() : null;
  const w = stage && typeof stage.width === 'function' ? stage.width() : 0;
  const h = stage && typeof stage.height === 'function' ? stage.height() : 0;
  if (!(w > 0 && h > 0)) return false;
  let vw = 0, vh = 0;
  try { vw = typeof v.width === 'function' ? v.width() : 0; } catch (_) {}
  try { vh = typeof v.height === 'function' ? v.height() : 0; } catch (_) {}
  if (!(vw > 0 && vh > 0)) {
    v.setSize({ width: w, height: h });
    return true;
  }
  return false;
 }

 // ===== Pub/Sub (scenechange) =====
 const _listeners = { scenechange: new Set() };
 function onSceneChange(cb) { _listeners.scenechange.add(cb); return () => _listeners.scenechange.delete(cb); }
 function _emit(type, payload) { _listeners[type]?.forEach(fn => fn(payload)); }

 // ===== Fade helper =====
 function fade(to = 1, dur = 200) {
  if (!fadeEl) return Promise.resolve();
  const from = +getComputedStyle(fadeEl).opacity || 0;
  try { fadeEl.style.pointerEvents = to > 0.02 ? 'auto' : 'none'; } catch (_) {}
  return new Promise(res => {
   const t0 = performance.now();
   const easeInOutCubic = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
   (function step(t) {
    const p = Math.min(1, (t - t0) / Math.max(0, dur));
    const e = easeInOutCubic(p);
    fadeEl.style.opacity = String(from + (to - from) * e);
    if (p < 1) {
      requestAnimationFrame(step);
    } else {
      try { fadeEl.style.pointerEvents = to > 0.02 ? 'auto' : 'none'; } catch (_) {}
      res();
    }
   })(t0);
  });
 }

 // Unified transition used by ALL scene navigation paths.
 async function transitionToScene(toId, fromId = null, opts = {}) {
  const outMs = Number(opts.outMs ?? 220);
  const holdMs = Number(opts.holdMs ?? 320);
  const inMs = Number(opts.inMs ?? 260);
  const mask = Number.isFinite(opts.maskOpacity) ? Number(opts.maskOpacity) : TRANSITION_MASK_OPACITY;

  if (!toId) return;
  if (isSceneTransitioning) return;
  isSceneTransitioning = true;
  try {
    userActivity();
    await fade(Math.max(0, Math.min(1, mask)), outMs);
    await loadScene(toId, fromId);
    if (typeof opts.onAfterLoad === 'function') {
      try { await opts.onAfterLoad(); } catch (e) { console.warn('[Transition] onAfterLoad failed:', e); }
    }
    if (holdMs > 0) await new Promise(r => setTimeout(r, holdMs));
    await fade(0, inMs);
    scheduleAutoResume();
  } finally {
    isSceneTransitioning = false;
  }
 }

 // Tooltip singleton for hotspots
 const tip = document.createElement('div');
 tip.className = 'hs-tip';
 document.body.appendChild(tip);

 // Hover preview (flat equirect image) like CMS "Xem nhanh ảnh"
 const hoverPreviewEl = document.getElementById('hoverPreview');
 const previewImageEl = document.getElementById('previewImage');
 try {
  if (previewImageEl) {
   previewImageEl.loading = 'lazy';
   previewImageEl.decoding = 'async';
  }
 } catch (_) {}

 function showHoverPreview(src, x, y) {
  if (!hoverPreviewEl || !previewImageEl || !src) return;
  if (previewImageEl.dataset.src !== src) {
   previewImageEl.dataset.src = src;
   previewImageEl.src = src;
  }
  hoverPreviewEl.style.left = (x + 14) + 'px';
  hoverPreviewEl.style.top = (y + 14) + 'px';
  hoverPreviewEl.style.display = 'block';
  hoverPreviewEl.setAttribute('aria-hidden', 'false');
 }

 function moveHoverPreview(x, y) {
  if (!hoverPreviewEl || hoverPreviewEl.style.display === 'none') return;
  hoverPreviewEl.style.left = (x + 14) + 'px';
  hoverPreviewEl.style.top = (y + 14) + 'px';
 }

 function hideHoverPreview() {
  if (!hoverPreviewEl || !previewImageEl) return;
  hoverPreviewEl.style.display = 'none';
  hoverPreviewEl.setAttribute('aria-hidden', 'true');
 }

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
  // Global arrow config: force same orientation for all arrows
  const ARROW_GLOBAL = {
    forceFixed: true,    // set to true to ignore yaw/per-hotspot rotation
    rotate: 0,           // degrees; chevron path already points up
    tilt: 50,            // degrees; stronger floor lie
    offsetY: 24,         // px; push lower to match screenshot
    scale: 0.85          // slightly smaller
  };

  let ARROW_SHADOW_SEQ = 0;

   function normalizeLang(lang) {
    const l = (lang || localStorage.getItem('lang') || 'vi');
    return String(l).toLowerCase() === 'en' ? 'en' : 'vi';
   }

   function getSceneFieldByLang(scene, field, lang) {
    if (!scene) return '';
    const v = scene[field];
    if (!v) return '';
    if (typeof v === 'object') return v[lang] || v.vi || v.en || '';
    return String(v);
   }

   function applyHotspotLabelForLang(hotspotEl, lang) {
    if (!hotspotEl) return;
    const lbl = hotspotEl.querySelector('.hs-label');
    if (!lbl) return;
    const vi = hotspotEl.dataset.labelVi || '';
    const en = hotspotEl.dataset.labelEn || vi;
    lbl.textContent = lang === 'en' ? (en || vi) : (vi || en);
   }

   function refreshHotspotLabels(lang) {
    const l = normalizeLang(lang);
    document.querySelectorAll('.hotspot[data-label-vi], .hotspot[data-label-en]').forEach(el => {
     applyHotspotLabelForLang(el, l);
    });
   }

   function refreshSceneBanners(lang) {
    const l = normalizeLang(lang);
    try {
     Object.keys(sceneCache).forEach((sceneId) => {
      const rec = sceneCache[sceneId];
      const sc = rec?.scene;
      if (!sc?.__banner?.el) return;
      const sData = scenesById.get(String(sceneId)) || scenes.find(x => String(x.id) === String(sceneId));
      const text = extractRoadText(sData, l);
      sc.__banner.el.textContent = text || '';
      sc.__banner.el.style.display = text ? '' : 'none';
     });
    } catch (e) {
     console.warn('[SceneBanner] Refresh failed:', e);
    }
   }

 function addHotspot(scene, h) {
  const el = document.createElement('div');
  el.className = 'hotspot';
    // Give a perspective context so the arrow can "lie" on the floor
    try {
      el.style.perspective = '700px';
      el.style.transformStyle = 'preserve-3d';
    } catch {}
    // Build arrow SVG with customizable style and rotation
    // Visual style: default to a clean blue outline
    const arrowColor = h.arrowColor || '#1E4FA3';
    const arrowWidth = Number.isFinite(+h.arrowWidth) ? Math.max(2, +h.arrowWidth) : 8;
    const outlineColor = h.arrowOutlineColor || '#0E315F';
    const outlineWidth = Math.max(arrowWidth + 2, arrowWidth);

    // Double-chevron like the provided screenshot
    const chevronTop = 'M32 20 L60 6 L88 20';
    const chevronBottom = 'M32 44 L60 30 L88 44';

    // Orientation: force fixed for all, matching the provided example
    const useFixed = ARROW_GLOBAL && ARROW_GLOBAL.forceFixed === true;
    const arrowRotate = useFixed
      ? +ARROW_GLOBAL.rotate
      : (Number.isFinite(+h.arrowRotate)
          ? +h.arrowRotate
          : (h.arrowAuto !== false && Number.isFinite(+h.yaw)
              ? (+h.yaw) * 180 / Math.PI - 90
              : -90));

    // Tilt: make arrow look like it's lying on the ground (use global if forced)
    const arrowTilt = useFixed
      ? +ARROW_GLOBAL.tilt
      : (Number.isFinite(+h.arrowTilt) ? +h.arrowTilt : 35);

    // Offset and scale: make position match the desired look
    const arrowOffsetY = useFixed
      ? +ARROW_GLOBAL.offsetY
      : (Number.isFinite(+h.arrowOffsetY) ? +h.arrowOffsetY : 0);
    const arrowScale = useFixed
      ? +ARROW_GLOBAL.scale
      : (Number.isFinite(+h.arrowScale) ? +h.arrowScale : 1);
    const shadowId = `hsArrowShadow_${++ARROW_SHADOW_SEQ}`;
    const arrowSvg = `
      <div class="hs-arrow-outer" aria-hidden="true" style="transform: translate(-50%, 0) translateY(${arrowOffsetY}px) rotate(${arrowRotate}deg) rotateX(${arrowTilt}deg) scale(${arrowScale}); transform-origin: center bottom; transform-style: preserve-3d; pointer-events: none;">
        <div class="hs-arrow-inner">
          <svg class="hs-arrow" viewBox="0 0 120 60" aria-hidden="true">
            <defs>
              <filter id="${shadowId}" x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.35)"/>
              </filter>
            </defs>
            <g filter="url(#${shadowId})">
              <path d="${chevronTop}" fill="none" stroke="${outlineColor}" stroke-width="${outlineWidth}" stroke-linecap="round" stroke-linejoin="round" />
              <path d="${chevronBottom}" fill="none" stroke="${outlineColor}" stroke-width="${outlineWidth}" stroke-linecap="round" stroke-linejoin="round" />
              <path d="${chevronTop}" fill="none" stroke="${arrowColor}" stroke-width="${arrowWidth}" stroke-linecap="round" stroke-linejoin="round" />
              <path d="${chevronBottom}" fill="none" stroke="${arrowColor}" stroke-width="${arrowWidth}" stroke-linecap="round" stroke-linejoin="round" />
            </g>
          </svg>
        </div>
      </div>`;

    const targetScene = scenesById.get(String(h.target)) || scenes.find(x => x.id === h.target);
    const labelVi = (getSceneNameByLang(targetScene, 'vi') || (h.title || h.label || h.text || '')).trim();
    const labelEn = (getSceneNameByLang(targetScene, 'en') || labelVi).trim();
    const descVi = (getSceneDescByLang(targetScene, 'vi') || (h.desc || '')).trim();
    const descEn = (getSceneDescByLang(targetScene, 'en') || descVi).trim();

    el.dataset.targetScene = String(h.target ?? '');
    el.dataset.labelVi = labelVi;
    el.dataset.labelEn = labelEn;
    el.dataset.descVi = descVi;
    el.dataset.descEn = descEn;

    el.innerHTML = `
      <div class="hs-label"></div>
      ${arrowSvg}
      <img class="hotspot-icon" src="${h.icon || '/assets/icon/vitri.png'}" alt="">
    `;
    // Text 膽茫 膽瓢峄 hi峄僴 th峄?trong tooltip khi hover, kh么ng c岷 hi峄僴 th峄?d瓢峄沬 icon

  const hsImg = h.thumb || targetScene?.preview || '';
  const panoPreview = (targetScene && (targetScene.url || targetScene.src)) ? (targetScene.url || targetScene.src) : '';

    // C岷璸 nh岷璽 label hi峄僴 th峄?tr峄眂 ti岷縫 tr锚n hotspot
    // Apply initial label according to current language
    applyHotspotLabelForLang(el, normalizeLang());

    // T膬ng kho岷g c谩ch gi峄痑 m农i t锚n v脿 icon (c贸 th峄?t霉y bi岷縩 b岷眓g h.arrowGap)
    const arrowGap = Number.isFinite(+h.arrowGap) ? Math.max(20, +h.arrowGap) : 36;
    el.style.setProperty('--arrow-gap', arrowGap + 'px');

    const getTipHtml = () => {
      const l = normalizeLang();
      const desc = l === 'en' ? (el.dataset.descEn || el.dataset.descVi || '') : (el.dataset.descVi || el.dataset.descEn || '');
      // Do not show scene name on hover (label is already rendered on hotspot).
      // Keep tooltip only for description (if present).
      if (!desc) return '';
      return `<div class="sub">${desc}</div>`;
    };

  el.addEventListener('mouseenter', (e) => {
    const html = getTipHtml();
    if (html) showTip(html, e.clientX + 8, e.clientY + 8);
    else hideTip();
    // Show flat preview image (equirectangular) on hover
    showHoverPreview(panoPreview, e.clientX, e.clientY);
  });
  el.addEventListener('mousemove', (e) => {
   moveTip(e.clientX + 8, e.clientY + 8);
   moveHoverPreview(e.clientX, e.clientY);
  });
  el.addEventListener('mouseleave', () => {
   hideTip();
   hideHoverPreview();
  });

    el.addEventListener('click', async () => {
      hideTip();
      hideHoverPreview();
      try { await travelToScene(h.target); } catch (e) { console.warn('[Hotspot] travel failed, fallback:', e); await transitionToScene(h.target, active.id); }
    });

    // Mobile touch handling - cho ph茅p pan khi drag, ch峄?x峄?l媒 tap khi kh么ng drag
    let touchStartX = 0;
    let touchStartY = 0;
    let touchMoved = false;
    let touchStartTime = 0;
    let isDraggingHotspot = false;
    const TAP_THRESHOLD = 10; // pixels
    const TAP_DURATION = 300; // ms

    el.addEventListener('touchstart', (e) => {
      // N岷縰 l脿 multi-touch (pinch), chuy峄僴 s峄?ki峄噉 cho viewer b岷眓g c谩ch t岷 th峄漣 t岷痶 pointer-events
      if (e.touches.length > 1) {
        isDraggingHotspot = true; // 膽谩nh d岷 膽ang thao t谩c 膽峄?b峄?qua x峄?l媒 tap
        el.style.pointerEvents = 'none';
        void el.offsetHeight; // force reflow 膽峄?谩p d峄g ngay
        return; // 膽峄?viewer nh岷璶 c谩c s峄?ki峄噉 pinch
      }
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchMoved = false;
      touchStartTime = Date.now();
      isDraggingHotspot = false;
      // Kh么ng preventDefault 膽峄?cho ph茅p event lan truy峄乶 膽岷縩 viewer
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) return;
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
        if (!touchMoved) {
          // L岷 膽岷 ph谩t hi峄噉 drag - cho ph茅p event 膽i qua 膽岷縩 viewer
          touchMoved = true;
          isDraggingHotspot = true;
          hideTip(); // 岷╪ tooltip khi 膽ang drag
          
          // T岷痶 pointer-events 膽峄?c谩c touch event ti岷縫 theo c贸 th峄?膽i qua 膽岷縩 viewer
          // v脿 viewer c贸 th峄?b岷痶 膽岷 pan gesture t峄?c谩c touchmove/touchend ti岷縫 theo
          el.style.pointerEvents = 'none';
          // Force reflow 膽峄?膽岷 b岷 style 膽瓢峄 谩p d峄g ngay
          void el.offsetHeight;
        }
      }
      // Kh么ng preventDefault 膽峄?viewer c贸 th峄?nh岷璶 膽瓢峄 touchmove
    }, { passive: true });

    el.addEventListener('touchend', (e) => {
      // B岷璽 l岷 pointer-events sau m峄峣 thao t谩c ch岷
      el.style.pointerEvents = 'auto';
      
      if (e.touches.length > 0) return; // N岷縰 v岷玭 c貌n touch kh谩c, b峄?qua
      const touchDuration = Date.now() - touchStartTime;
      
      // N岷縰 膽茫 drag ho岷穋 v峄玜 pinch, kh么ng x峄?l媒 tap - 膽峄?viewer x峄?l媒 pan/zoom
      if (touchMoved || isDraggingHotspot) {
        touchMoved = false;
        isDraggingHotspot = false;
        return;
      }
      
      // Ch峄?x峄?l媒 n岷縰 l脿 tap (kh么ng ph岷 drag) v脿 th峄漣 gian ng岷痭
      if (touchDuration < TAP_DURATION) {
        e.preventDefault();
        e.stopPropagation(); // Ng膬n click event sau 膽贸
        // Mobile UX: tap 1 lần để điều hướng luôn (không yêu cầu tap 2 lần)
        hideTip();
        travelToScene(h.target).catch(() => { transitionToScene(h.target, active.id); });
      }
      touchMoved = false;
      isDraggingHotspot = false;
    }, { passive: false });
    
    // X峄?l媒 touchcancel 膽峄?膽岷 b岷 reset state
    el.addEventListener('touchcancel', () => {
      // Lu么n kh么i ph峄 pointer-events n岷縰 thao t谩c b峄?h峄 (bao g峄搈 pinch)
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
  const rawFov = Number(s?.initialView?.hfov);
  const initFov = (Number.isFinite(rawFov) && rawFov > 0) ? rawFov : DEFAULT_FOV;
  const view = new Marzipano.RectilinearView({
   yaw: +(s.initialView?.yaw ?? 0),
   pitch: +(s.initialView?.pitch ?? 0),
   fov: Math.min(MAX_FOV, Math.max(MIN_FOV, initFov))
  }, limiter);
  try { ensureViewSize(view); } catch (_) {}
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
 const sceneName = (s?.name?.[currentLang]) || s?.name?.vi || s?.name?.en || s?.name || sceneId;
 if (el) {
 const prefix = currentLang === 'en' ? 'Current Scene' : 'Tên khu vực';
 el.textContent = `${prefix}: ${sceneName}`;
 }
 if (mobileTitle) {
  mobileTitle.textContent = sceneName;
  // Ensure visible on mobile
  if (window.innerWidth < 768) mobileTitle.style.display = 'block';
 }
}

function getSceneNameByLang(scene, lang) {
  if (!scene) return '';
  const n = scene.name;
  if (n && typeof n === 'object') return n[lang] || n.vi || n.en || scene.id;
  return n || scene.id;
}

function getSceneDescByLang(scene, lang) {
  if (!scene) return '';
  const d = scene.desc;
  if (!d) return '';
  if (typeof d === 'object') return d[lang] || d.vi || d.en || '';
  return String(d);
}

// ===== Road banner helper =====
function updateRoadBanner(sceneId) {
  // Ensure banner element exists even if missing in HTML
  function ensureRoadBanner() {
    let el = document.getElementById('roadBanner');
    if (el) return el;
    const header = document.getElementById('mainHeader');
    if (!header) return null;
    el = document.createElement('div');
    el.id = 'roadBanner';
    el.className = 'road-banner';
    el.style.display = 'none';
    const actions = header.querySelector('.header-actions');
    if (actions) header.insertBefore(el, actions); else header.appendChild(el);
    return el;
  }
  const rb = ensureRoadBanner();
  if (!rb) return;
  const s = scenes.find(x => x.id === sceneId);
  const currentLang = localStorage.getItem('lang') || 'vi';
  // L岷 n峄檌 dung 膽瓢峄漬g b岷眓g extractor th峄憂g nh岷
  const roadText = extractRoadText(s, currentLang);

  // Ch峄?hi峄僴 th峄?cho m峄檛 s峄?c峄昻g (c贸 th峄?m峄?r峄檔g danh s谩ch)
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

 // Live language update (no refresh)
 window.addEventListener('change-lang', (e) => {
  const lang = normalizeLang(e?.detail);
  try { updateTenKhuVuc(currentSceneId); } catch (_) {}
  try { updateRoadBanner(currentSceneId); } catch (_) {}
  try { refreshSceneBanners(lang); } catch (_) {}
  try { refreshHotspotLabels(lang); } catch (_) {}
 });

  // ===== Auto-rotate & idle resume =====
  // Auto-rotate speed is per animation frame; keep extremely low for slowest motion
  const autoRotate = { on: false, raf: 0, speed: 0.0001 };
  const idle = { timer: 0, delay: 7500 }; // 7.5 gi芒y
  
  // Detect user interaction v峄沬 viewer (drag, touch) 膽峄?reset timer
  // KH脭NG trigger khi click v脿o c谩c n煤t controls
  let isInteracting = false;
  root.addEventListener('mousedown', (e) => {
    // B峄?qua n岷縰 click v脿o n煤t controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      return;
    }
    isInteracting = true;
    userActivity();
  }, { passive: true });
  root.addEventListener('mousemove', (e) => {
    // B峄?qua n岷縰 膽ang hover v脿o n煤t controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      return;
    }
    if (isInteracting) {
      userActivity();
    }
  }, { passive: true });
  root.addEventListener('mouseup', (e) => {
    // B峄?qua n岷縰 click v脿o n煤t controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      isInteracting = false;
      return;
    }
    isInteracting = false;
    userActivity(); // Reset timer khi th岷?chu峄檛
  }, { passive: true });
  root.addEventListener('touchstart', (e) => {
    // B峄?qua n岷縰 touch v脿o n煤t controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      return;
    }
    isInteracting = true;
    userActivity();
  }, { passive: true });
  root.addEventListener('touchmove', (e) => {
    // B峄?qua n岷縰 touch v脿o n煤t controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      return;
    }
    if (isInteracting) {
      userActivity();
    }
  }, { passive: true });
  root.addEventListener('touchend', (e) => {
    // B峄?qua n岷縰 touch v脿o n煤t controls
    if (e.target.closest('button') || e.target.closest('#controls') || e.target.closest('footer')) {
      isInteracting = false;
      return;
    }
    isInteracting = false;
    userActivity(); // Reset timer khi th岷?tay
  }, { passive: true });

  function _autoLoop() {
  if (!autoRotate.on) return;
  const v = getActiveView();
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
  // [FIXED] Kh么ng x贸a timer idle 峄?膽芒y, userActivity s岷?lo vi峄嘽 膽贸
 return false;
} 
function userActivity() {
  // D峄玭g xoay t峄?膽峄檔g ngay l岷璸 t峄ヽ khi user t瓢啤ng t谩c
  stopAutoRotate();
  if (idle.timer) clearTimeout(idle.timer); // X贸a b峄?膽岷縨 c农
  // 膼岷穞 l岷 b峄?膽岷縨 膽峄?t峄?xoay l岷 sau 7.5 gi芒y kh么ng c贸 t瓢啤ng t谩c
  idle.timer = setTimeout(() => { 
    console.log('[AutoRotate] Resuming after 7.5s idle');
    startAutoRotate();
  }, idle.delay);
}

// H脿m scheduleAutoResume - t瓢啤ng t峄?userActivity nh瓢ng c贸 th峄?g峄峣 khi 膽茫 d峄玭g
function scheduleAutoResume() {
  if (idle.timer) clearTimeout(idle.timer); // X贸a b峄?膽岷縨 c农
  // 膼岷穞 l岷 b峄?膽岷縨 膽峄?t峄?xoay l岷 sau 7.5 gi芒y
  idle.timer = setTimeout(() => { 
    console.log('[AutoRotate] Resuming after 7.5s idle (scheduled)');
    startAutoRotate();
  }, idle.delay);
}

  // ===== loadScene =====
  async function loadScene(id, previousSceneId = null) {
    const s = scenes.find(x => x.id === id);
    if (!s) {
      console.warn('[App] Scene kh么ng t峄搉 t岷:', id);
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
      await scene.switchTo({ transitionDuration: SCENE_SWITCH_MS });
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
  const v = getActiveView();
  if (v) {
    v.setYaw(v.yaw() + d);
    requestRender();
  }
 }
 function fovDelta(d = 0) {
   const v = getActiveView(); if (!v) return;
    try { ensureViewSize(v); } catch (_) {}
    const ZMIN = Marzipano.util.degToRad(20), ZMAX = Marzipano.util.degToRad(110);
    const before = v.fov();
    const after = Math.min(ZMAX, Math.max(ZMIN, before + d));
    v.setFov(after);
   requestRender();
    try {
      const applied = v.fov();
      console.log('[Zoom] FOV change:', {
        beforeDeg: Marzipano.util.radToDeg(before).toFixed(2),
        targetDeg: Marzipano.util.radToDeg(after).toFixed(2),
        appliedDeg: Marzipano.util.radToDeg(applied).toFixed(2)
      });
    } catch (_) {}
 }

 // ===== Smooth impulse rotate =====
 function impulseRotate(dir = 1, dur = 900) {
  const v = getActiveView(); if (!v) return;
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
        const v = getActiveView();
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
        const v = getActiveView();
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
        const v = getActiveView();
        if (!v) {
          console.warn('[Controls] zoomIn() - No view available');
          return;
        }
        fovDelta(-0.18);
        scheduleAutoResume();
      } catch (e) {
        console.error("[Controls] zoomIn() error:", e);
      }
    },
    zoomOut: () => {
      console.log('[Controls] zoomOut() called');
      userActivity();
      try {
        const v = getActiveView();
        if (!v) {
          console.warn('[Controls] zoomOut() - No view available');
          return;
        }
        fovDelta(+0.18);
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
    const v = getActiveView();
   if (v && vx) v.setYaw(v.yaw() + vx);
   if (running) rafId = requestAnimationFrame(loop);
  }
  function start() { if (!running) { running = true; rafId = requestAnimationFrame(loop); } }

  function stop() { dir = 0; }
    window.addEventListener('keydown', e => {
   if (e.key === 'ArrowLeft') { userActivity(); dir = -1; start(); }
   if (e.key === 'ArrowRight') { userActivity(); dir = +1; start(); }
        // Quick zoom keys: + / - / =
        if (e.key === '+' || e.key === '=' ) { e.preventDefault(); userActivity(); try { fovDelta(-0.28); } finally { scheduleAutoResume(); } }
        if (e.key === '-' ) { e.preventDefault(); userActivity(); try { fovDelta(+0.28); } finally { scheduleAutoResume(); } }
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
   console.error('L峄梚 khi l瓢u graph:', err);
  }
 }

  // load current graph
  currentGraph = await fetch(`${dataBaseUrl}/graph`).then(r => r.ok ? r.json() : { nodes: [], edges: [] }).catch(err => { console.error('L峄梚 khi t岷 graph ban 膽岷:', err); return { nodes: [], edges: [] }; });
  
  // ===== FPS Counter =====
  const fpsCounter = createFPSCounter({
    container: document.body,
    position: 'bottom-left', 
    targetFPS: 60,
    showGraph: false, // Set to true to show FPS graph
  });
  
  // Log graph data 膽峄?debug
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
    // If value looks like degrees (> 2蟺), convert to radians
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
      // 3) Fade out old scene, switch, wait briefly for new tiles, then fade in
      let newView = null;
      await transitionToScene(toId, fromId, {
        outMs: 220,
        holdMs: 420,
        inMs: 260,
        onAfterLoad: async () => {
          newView = active.view || viewer.scene()?.view();
          // Keep arrival yaw consistent with departure heading if known
          const carryYaw = getHotspotYaw(fromId, toId);
          if (newView && typeof carryYaw === 'number') newView.setYaw(carryYaw);
          // Set a near FOV so arrival feels like zoom-in
          if (newView) {
            const minFov = Marzipano.util.degToRad(20);
            const nearFovArrive = Math.max(minFov, Math.min(prevFov, prevFov * 0.75));
            newView.setFov(nearFovArrive);
          }
        }
      });
      if (newView) {
        // Hold the zoom-in briefly, then ease back to previous FOV
        await new Promise(r => setTimeout(r, 220));
        await animateFov(newView, prevFov, 520);
      }
    } catch (e) {
      console.warn('[App] travelToScene fallback to direct navigate:', e);
      await transitionToScene(toId, fromId);
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
 // Frontend c贸 th峄?nh岷璶 API key t峄?window ho岷穋 config
 // C贸 th峄?set t峄?backend config ho岷穋 environment variable
 if (typeof window !== 'undefined') {
  // C贸 th峄?l岷 t峄?backend config ho岷穋 env variable
  // window.__GOOGLE_MAPS_API_KEY__ = dataBaseUrl.includes('localhost') ? '' : (process.env.VITE_GOOGLE_MAPS_API_KEY || '');
  // T岷 th峄漣 膽峄?empty, c贸 th峄?set sau t峄?config
 }

  // Ph谩t hi峄噉 mobile 膽峄?c岷 h矛nh minimap 峄?ch岷?膽峄?膽啤n gi岷 (read-only)
  let isMobile = window.innerWidth < 768;
  const shouldInitMinimap = !!minimapEl; // lu么n kh峄焛 t岷 minimap c岷?tr锚n mobile (read-only)

  // Helper function 膽峄?t岷 minimap
  const createMinimapInstance = () => {
    const checkIsMobile = window.innerWidth < 768;
    if (!minimapEl) return null;
    return createMinimap({
      container: minimapEl,
      graph: currentGraph,
      // Tr锚n mobile: ch峄?hi峄僴 th峄?v峄?tr铆 hi峄噉 t岷, b峄?t矛m 膽瓢峄漬g th峄?c么ng
      readOnly: false,
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
        // Use Unicode escapes to avoid encoding issues in this file.
        // Show map icon when minimap is hidden (action: show), otherwise show X (action: hide).
        mmBtn.textContent = hidden ? '\uD83D\uDDFA' : '\u2715';
        mmBtn.title = hidden ? 'Hien minimap' : 'An minimap';
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
        langBtn.title = current === 'vi' ? '膼峄昳 sang EN' : 'Switch to VI';
        langBtn.setAttribute('aria-label', langBtn.title);
      };
      updateLangBtn();
      langBtn.addEventListener('click', () => {
        const current = (localStorage.getItem('lang') || 'vi').toLowerCase();
        const next = current === 'vi' ? 'en' : 'vi';
        localStorage.setItem('lang', next);
        // Th么ng b谩o cho minimap v脿 c谩c th脿nh ph岷 kh谩c
        window.dispatchEvent(new CustomEvent('change-lang', { detail: next }));
        // C岷璸 nh岷璽 ti锚u 膽峄?khu v峄眂
        try { updateTenKhuVuc(currentSceneId); } catch (_) {}
        updateLangBtn();
      });
    }
  })();

  // Refresh minimap v峄沬 graph 膽茫 load t峄?API sau khi minimap 膽茫 kh峄焛 t岷 xong (ch峄?n岷縰 kh么ng ph岷 mobile)
  if (minimap && minimap.refresh && currentGraph && currentGraph.nodes && currentGraph.nodes.length > 0 && !isMobile) {
    setTimeout(() => {
      minimap.refresh(currentGraph);
      console.log('[App] Minimap refreshed with graph from API, nodes:', currentGraph.nodes.length, 'edges:', currentGraph.edges.length);
    }, 200);
  }
  
  // Handle window resize: chuy峄僴 ch岷?膽峄?mobile/desktop cho minimap
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
    await transitionToScene(scenes[0].id);
  } else {
    console.error('[App] Kh么ng c贸 scene n脿o 膽峄?hi峄僴 th峄?');
  }


  onSceneChange(({ id }) => {
    updateTenKhuVuc(id);
    const activeSceneData = scenes.find(s => s.id === id);
    // Lu么n c岷璸 nh岷璽 minimap 膽峄?l脿m n峄昳 b岷璽 v峄?tr铆 hi峄噉 t岷 (k峄?c岷?mobile)
    if (activeSceneData && minimap?.setActive) minimap.setActive(id);
  });


const voiceBot = createVoiceBot({
  container: document.body,
  buttonId: 'voice-command-btn', // S峄?d峄g button c贸 s岷祅 trong HTML
  // Cung c岷 c谩c 膽峄慽 t瓢峄g c岷h 膽岷 膽峄?膽峄?bot gi峄峮g n贸i c贸 th峄?truy c岷璸 v脿o c谩c tr瓢峄漬g s脿n/gi峄峮g n贸i
  getScenes: () => scenes.map(s => ({
  id: s.id,
  name: s.name,        // keep original name object {vi,en}
  hotspots: s.hotspots || [],
  floor: s.floor,      // numeric floor used for announcements
  voice: s.voice || '',
  voiceIntro: s.voiceIntro || ''
 })),
 getCurrentSceneId: ()=> currentSceneId,
 onGotoScene: async(id)=> safeNavigateTo(id),
  onPathPlay: async (path)=> {
    console.log('[App] VoiceBot path:', path); // Log 膽峄?ki峄僲 tra
    
    if (!Array.isArray(path) || !path.length) return Promise.resolve();
    primeAudioPlayback();

    // G峄峣 visualizePath NGAY L岷琍 T峄– 膽峄?l脿m m峄?v脿 zoom minimap
    if (minimap && minimap.visualizePath) {
      console.log('[App] Calling minimap.visualizePath...');
      minimap.visualizePath(path);
    } else {
      console.warn('[App] Minimap not found or visualizePath missing!');
      // Fallback: n岷縰 ch瓢a c贸 visualizePath, th峄?d霉ng highlightPath
      if (minimap && minimap.highlightPath) minimap.highlightPath(path.map(String));
    }
    
    // 膼峄 m峄檛 ch煤t 膽峄?minimap c贸 th峄漣 gian render v脿 zoom
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

  // 膼岷 b岷 n煤t VoiceBot lu么n hi峄僴 th峄?(膽岷穋 bi峄噒 tr锚n mobile)
  function ensureVoiceButtonVisible() {
    const btn = document.getElementById('voice-command-btn');
    if (!btn) return;
    btn.style.display = 'block';
    btn.style.position = 'fixed';
    btn.style.right = '15px';
    // 膼岷穞 cao h啤n footer 膽峄?kh么ng che
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

   // Update UI immediately (avoid having to refresh while waiting for next poll)
   try {
    if (typeof data?.concurrent === 'number') {
     lastConcurrent = data.concurrent;
    }
    if (concurrentEl) {
     const lang = (localStorage.getItem('lang') || 'vi').toLowerCase() === 'en' ? 'en' : 'vi';
     const suffix = lang === 'en' ? 'watching' : 'người đang xem';
     concurrentEl.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></span><span>${(typeof lastConcurrent === 'number' ? lastConcurrent : (data.concurrent || 0))} ${suffix}</span>`;
    }
   } catch (e) {
    console.warn('[Analytics] Failed to update concurrent badge from visit:', e);
   }
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
   if (Math.random() < 0.1) { // Log 10% of pings
    console.log('[Analytics] Ping OK:', data);
   }
  })
  .catch(err => console.error('[Analytics] Ping failed:', err));
 }, 60000); // 1 minute instead of 2 minutes

 // Update concurrent users display every 30 seconds (reduced from 10 seconds for better performance)
 let concurrentEl = null;
 let concurrentUpdateInterval = null;
 let lastConcurrent = null;
 const updateConcurrent = async () => {
  try {
   const res = await fetch(`${dataBaseUrl}/analytics/concurrent`);
   if (res.ok) {
    const data = await res.json();
    if (typeof data?.concurrent === 'number') {
     lastConcurrent = data.concurrent;
    }
    // Only log occasionally to reduce console spam
    if (Math.random() < 0.1) { // Log 10% of updates
     console.log('[Analytics] Concurrent users:', data.concurrent);
    }
    if (concurrentEl) {
      const lang = (localStorage.getItem('lang') || 'vi').toLowerCase() === 'en' ? 'en' : 'vi';
      const suffix = lang === 'en' ? 'watching' : 'người đang xem';
      concurrentEl.innerHTML = `<span style="display: inline-block; width: 8px; height: 8px; background: #10b981; border-radius: 50%; animation: pulse 2s infinite;"></span><span>${(typeof lastConcurrent === 'number' ? lastConcurrent : (data.concurrent || 0))} ${suffix}</span>`;
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
  concurrentUpdateInterval = setInterval(updateConcurrent, 30000); // 30 seconds instead of 10
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
    // Compatibility alias used by some UI code: app.on('sceneChange', (id, name) => ...)
    on: (eventName, handler) => {
      const key = String(eventName || '').toLowerCase();
      if (key === 'scenechange') {
        return onSceneChange(({ id, name }) => {
          try { handler?.(id, name); } catch (e) { console.warn('[App] sceneChange handler failed:', e); }
        });
      }
      console.warn('[App] Unsupported event name:', eventName);
      return () => {};
    },
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
  return fromField || '';
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
    console.log('[SceneBanner] Center ->', { yaw, pitch, snippet });
    if (!copyOnly) setSceneBannerPosition(currentSceneId, yaw, pitch);
  } catch (e) { console.warn('[SceneBanner] copyCenterForBanner error:', e); }
};

// Shortcut: Shift+B copies bannerYaw/bannerPitch of current center
window.addEventListener('keydown', (e) => {
  if (e.shiftKey && (e.key === 'B' || e.key === 'b')) {
    window.copyCenterForBanner(true);
  }
});