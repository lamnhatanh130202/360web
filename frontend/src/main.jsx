// src/main.jsx
import './styles/style.css';
import './styles/bot.css'; // Voice bot styles
import React from "react";
import ReactDOM from "react-dom/client";      // <- BẮT BUỘC
import { initI18n, t, getCurrentLang, setLanguage, translations, applyTranslations } from './utils/i18n.js';
import App from "../../cms-frontend/src/cms/AppLayout.jsx";
import { bootstrap } from './core/app.js';    // viewer bootstrap (Marzipano)

// --- Helper: mount React CMS only when admin container exists or path indicates /cms
function shouldMountCms() {
  // Nếu bạn serve admin ở /cms (basename) hoặc dùng hash #/admin
  const p = location.pathname || '';
  const hash = location.hash || '';
  if (document.getElementById('cms-root')) return true;
  if (p.startsWith('/cms')) return true;
  if (hash.startsWith('#/admin') || hash.startsWith('#admin')) return true;
  return false;
}

// --- Mount CMS react app (if present)
if (shouldMountCms()) {
  const cmsRoot = document.getElementById('cms-root') || document.getElementById('root');
  if (cmsRoot) {
    ReactDOM.createRoot(cmsRoot).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  } else {
    console.warn('Không tìm thấy #cms-root hay #root để mount CMS React. Tạo <div id="cms-root"></div> trong index.html nếu cần.');
  }
}

// ================= PWA install button =================
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  const btn = document.getElementById('installButton');
  if (btn) btn.style.display = 'inline-block';
});
document.getElementById('installButton')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('installButton').style.display = 'none';
});

// ================= Viewer bootstrap (Marzipano) =================
// Chỉ khởi bootstrap nếu có element pano (tránh chạy viewer khi đang ở /cms)
(async function startViewerIfNeeded() {
  console.log('[main.jsx] ========== START VIEWER ==========');
  console.log('[main.jsx] Document ready state:', document.readyState);
  
  const panoEl = document.querySelector('#pano');
  console.log('[main.jsx] Pano element:', panoEl);
  
  if (!panoEl) {
    // Không có #pano => không khởi viewer
    console.log('[main.jsx] No #pano element, skipping viewer');
    return;
  }

  console.log('[main.jsx] Calling bootstrap()...');
  let app;
  try {
    app = await bootstrap({
    dataBaseUrl: '/api',
    rootSelector: '#pano',
    minimapSelector: '#minimap',
    hotspotsSelector: '#hotspots',
    fadeSelector: '#fade'
  });
    console.log('[main.jsx] ✅ Bootstrap completed, app object:', app);
    console.log('[main.jsx] app.controls:', app?.controls);
    console.log('[main.jsx] typeof app.controls:', typeof app?.controls);
  } catch (error) {
    console.error('[main.jsx] ❌ Bootstrap failed:', error);
    console.error('[main.jsx] Error stack:', error.stack);
    return;
  }

  // Load scenes (để render menu theo i18n)
  const scenes = await fetch('/api/scenes').then(r => r.json()).catch(() => []);

  // ================= I18N (VN–EN) =================
  await initI18n();
  applyTranslations();

  // ================= Auto-hide Header (hiện khi hover lên trên) =================
  const header = document.getElementById('mainHeader');
  const headerTrigger = document.getElementById('headerTrigger');
  let hideTimeout = null;
  const HIDE_DELAY = 2000; // Ẩn sau 2 giây không hover

  if (header && headerTrigger) {
    function showHeader() {
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
      header.classList.remove('header-hidden');
    }

    function hideHeader() {
      hideTimeout = setTimeout(() => {
        header.classList.add('header-hidden');
      }, HIDE_DELAY);
    }

    // Hiện header khi hover lên vùng trigger (phía trên)
    headerTrigger.addEventListener('mouseenter', showHeader);
    headerTrigger.addEventListener('mousemove', showHeader);
    
    // Hiện header khi hover vào chính header
    header.addEventListener('mouseenter', showHeader);
    header.addEventListener('mousemove', showHeader);
    
    // Ẩn header khi rời khỏi vùng header và trigger
    headerTrigger.addEventListener('mouseleave', () => {
      // Chỉ ẩn nếu không đang hover vào header
      const isHoveringHeader = header.matches(':hover');
      if (!isHoveringHeader) {
        hideHeader();
      }
    });
    
    header.addEventListener('mouseleave', () => {
      // Chỉ ẩn nếu không đang hover vào trigger
      const isHoveringTrigger = headerTrigger.matches(':hover');
      if (!isHoveringTrigger) {
        hideHeader();
      }
    });

    // Hiện header khi scroll lên trên
    let lastScrollY = window.scrollY;
    window.addEventListener('scroll', () => {
      const currentScrollY = window.scrollY;
      if (currentScrollY < lastScrollY && currentScrollY < 50) {
        // Đang scroll lên và gần đầu trang
        showHeader();
      }
      lastScrollY = currentScrollY;
    });

    // Hiện header ban đầu, sau đó tự ẩn sau 3 giây
    setTimeout(() => {
      hideHeader();
    }, 3000);

    console.log('[HeaderAutoHide] Initialized - Header will auto-hide, show on hover top area');
  }
// ================= Helper function to update scene title =================
function updateSceneTitle(sceneId, sceneName) {
  const currentLang = getCurrentLang();
  const titleEl = document.getElementById('tenKhuVuc');
  if (!titleEl) return;
  
  let displayName = sceneName;
  if (typeof sceneName === 'object' && sceneName !== null) {
    displayName = sceneName[currentLang] || sceneName.vi || sceneName.en || sceneId;
  }
  

  titleEl.textContent = `${t('sceneLabel')}: ${displayName}`;
  console.log('[SceneTitle] Updated to:', displayName, 'for language:', currentLang);
}

// ================= Helper function to render menu =================
function renderMenu() {
  const menuList = document.getElementById('menuList');
  if (!menuList) return;
  
  const currentLang = getCurrentLang();
  menuList.innerHTML = '';
  
  scenes.forEach(scene => {
    const li = document.createElement('li');
    li.dataset.scene = scene.id;
    
    let displayName = scene.name;
    if (typeof scene.name === 'object' && scene.name !== null) {
      displayName = scene.name[currentLang] || scene.name.vi || scene.name.en || scene.id;
    }
    
    li.textContent = displayName;
    li.addEventListener('click', () => {
      if (app && app.navigateTo) {
        app.navigateTo(scene.id);
      }
    });
    
    menuList.appendChild(li);
  });
  
  console.log('[Menu] Rendered', scenes.length, 'scenes for language:', currentLang);
}

// ================= Hàm cập nhật toàn bộ UI theo ngôn ngữ hiện tại =================
function updateUI() {
  const currentLang = getCurrentLang();
  console.log('[UI] Updating UI for language:', currentLang);

  // [FIXED] Luôn gọi applyTranslations để cập nhật các nút/tiêu đề tĩnh
  applyTranslations();

  // Update current scene title
  if (app && app.getActiveScene) {
    const activeScene = app.getActiveScene();
    if (activeScene && activeScene.id) {
      updateSceneTitle(activeScene.id, activeScene.name);
    }
  }
  
  // Re-render menu with new language
  renderMenu();
  
  // [FIXED] Cập nhật Minimap Selects (Dùng setLanguage nếu đã export ở app.js)
  if (app?.minimap?.setLanguage) {
    try {
      app.minimap.setLanguage(currentLang);
    } catch (e) {
      console.error('Error updating minimap language:', e);
    }
  }
}

  // Lắng nghe sự kiện đổi ngôn ngữ từ i18n.js
  window.addEventListener('change-lang', () => {
    console.log('[main.jsx] Received change-lang event. Updating UI.');
    updateUI();
  });

  // Cập nhật UI lần đầu khi tải trang
  updateUI();

// ================= Language Switcher =================
console.log('[main.jsx] Setting up language switcher...');

const langButtons = document.querySelectorAll('.lang-btn');

if (langButtons.length > 0) {
  langButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      const newLang = btn.dataset.lang;
      console.log('[main.jsx] Language button clicked:', newLang);
      
      // Update active state
      langButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Change language
      try {
        // setLanguage trong i18n.js sẽ tự bắn event 'change-lang'
        await setLanguage(newLang);
        console.log('[main.jsx] Language changed successfully to:', newLang);
      } catch (error) {
        console.error('[main.jsx] Failed to change language:', error);
      }
    });
  });

  // Set initial active state
  const currentLang = getCurrentLang();
  const activeBtn = document.querySelector(`.lang-btn[data-lang="${currentLang}"]`);
  if (activeBtn) activeBtn.classList.add('active');
}

  // =======================================================

  // Khi scene thay đổi, cập nhật lại tiêu đề
  app.on('sceneChange', (sceneId, sceneName) => {
    updateSceneTitle(sceneId, sceneName);
    const items = document.querySelectorAll('#menu li[data-scene]');
    items.forEach(li => li.classList.toggle('active', li.dataset.scene === sceneId));
  });

  // ================= Controls (footer) =================
  console.log('[Controls] ========== SETUP CONTROLS ==========');
  console.log('[Controls] Current time:', new Date().toISOString());
  console.log('[Controls] app object:', app);
  console.log('[Controls] app.controls:', app.controls);
  console.log('[Controls] app.controls type:', typeof app.controls);
  
  // Kiểm tra app.controls
  if (!app || !app.controls) {
    console.error('[Controls] ❌ app.controls is not available!', { app, controls: app?.controls });
    console.error('[Controls] Retrying in 1 second...');
    setTimeout(() => {
      console.log('[Controls] Retry: app.controls:', app?.controls);
      if (app?.controls) {
        setupControlButtons();
      }
    }, 1000);
    return;
  }
  
  console.log('[Controls] ✅ app.controls available:', Object.keys(app.controls));
  
  // Hàm setup controls - Đơn giản hóa, gắn trực tiếp không clone
  function setupControlButtons() {
    console.log('[Controls] ========== setupControlButtons() CALLED ==========');
    console.log('[Controls] Document ready state:', document.readyState);
    console.log('[Controls] app.controls:', app.controls);
    
    if (!app || !app.controls) {
      console.error('[Controls] ❌ app.controls not available in setupControlButtons()');
      return;
    }
    
    // Các nút controls
    const buttons = [
      { id: 'left', func: 'left' },
      { id: 'right', func: 'right' },
      { id: 'zoomIn', func: 'zoomIn' },
      { id: 'zoomOut', func: 'zoomOut' }
    ];
    
    buttons.forEach(({ id, func }) => {
      const btn = document.getElementById(id);
      console.log(`[Controls] Processing button #${id}:`, btn);
      
      if (!btn) {
        console.warn(`[Controls] ⚠️ Button #${id} not found in DOM`);
        return;
      }
      
      if (!app.controls[func]) {
        console.warn(`[Controls] ⚠️ app.controls.${func} is not a function`);
        return;
      }
      
      // Xóa tất cả listeners cũ bằng cách remove và add lại
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      // Handler function
      const clickHandler = function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        console.log(`[Controls] ========== ${id.toUpperCase()} BUTTON CLICKED ==========`);
        console.log(`[Controls] Event type:`, e.type);
        console.log(`[Controls] Target:`, e.target);
        console.log(`[Controls] CurrentTarget:`, e.currentTarget);
        console.log(`[Controls] Calling app.controls.${func}()...`);
        
        if (!app || !app.controls || !app.controls[func]) {
          console.error(`[Controls] ❌ app.controls.${func} not available when clicked!`);
          return false;
        }
        
        try {
          const result = app.controls[func]();
          console.log(`[Controls] ✅ ${func}() executed, result:`, result);
        } catch (error) {
          console.error(`[Controls] ❌ Error in ${func}():`, error);
          console.error(`[Controls] Error stack:`, error.stack);
        }
        return false;
      };
      
      // Gắn listener với capture phase
      newBtn.addEventListener('click', clickHandler, { capture: true, passive: false });
      newBtn.addEventListener('mousedown', clickHandler, { capture: true, passive: false });
      
      // Đánh dấu đã setup
      newBtn.setAttribute('data-control-setup', 'true');
      newBtn.style.cursor = 'pointer'; // Đảm bảo cursor pointer
      
      console.log(`[Controls] ✅ ${id} button listener attached`);
    });
  }
  
  // Gắn listener trực tiếp - đơn giản và chắc chắn nhất
  function attachControlListeners() {
    console.log('[Controls] ========== attachControlListeners() ==========');
    
    const buttonConfigs = [
      { id: 'left', func: 'left' },
      { id: 'right', func: 'right' },
      { id: 'zoomIn', func: 'zoomIn' },
      { id: 'zoomOut', func: 'zoomOut' }
    ];
    
    buttonConfigs.forEach(({ id, func }) => {
      const btn = document.getElementById(id);
      if (!btn) {
        console.warn(`[Controls] Button #${id} not found`);
        return;
      }
      
      if (!app?.controls?.[func]) {
        console.warn(`[Controls] app.controls.${func} not available`);
        return;
      }
      
      // Xóa listeners cũ nếu có
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      
      // Handler đơn giản
      const handler = function(e) {
        console.log(`[Controls] ========== ${id.toUpperCase()} CLICKED ==========`);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        if (app?.controls?.[func]) {
          try {
            app.controls[func]();
            console.log(`[Controls] ✅ ${func}() called successfully`);
          } catch (err) {
            console.error(`[Controls] ❌ Error:`, err);
          }
        }
        return false;
      };
      
      // Gắn listener
      newBtn.onclick = handler;
      newBtn.addEventListener('click', handler, true);
      
      console.log(`[Controls] ✅ ${id} listener attached`);
    });
  }
  
  // Gọi ngay
  attachControlListeners();
  
  // Retry với interval
  const retries = [100, 500, 1000, 2000, 3000];
  retries.forEach((delay, index) => {
    setTimeout(() => {
      console.log(`[Controls] Retry ${index + 1} after ${delay}ms...`);
      attachControlListeners();
    }, delay);
  });
  
  // Event delegation trên #controls container (backup - chỉ chạy nếu direct listener không hoạt động)
  const controlsContainer = document.getElementById('controls');
  if (controlsContainer) {
    controlsContainer.addEventListener('click', (e) => {
      const target = e.target;
      const id = target?.id;
      
      // Chỉ xử lý nếu click vào button
      if (!target || target.tagName !== 'BUTTON') return;
      
      // Chỉ xử lý các button controls
      if (id !== 'left' && id !== 'right' && id !== 'zoomIn' && id !== 'zoomOut') return;
      
      console.log('[Controls] [DELEGATION] Button clicked via container:', id);
      
      if (!app || !app.controls) {
        console.warn('[Controls] [DELEGATION] app.controls not available');
        return;
      }
      
      const funcMap = {
        'left': 'left',
        'right': 'right',
        'zoomIn': 'zoomIn',
        'zoomOut': 'zoomOut'
      };
      
      const func = funcMap[id];
      if (func && app.controls[func]) {
        e.preventDefault();
        e.stopPropagation();
        try {
          console.log(`[Controls] [DELEGATION] Calling ${func}()...`);
          app.controls[func]();
        } catch (error) {
          console.error(`[Controls] [DELEGATION] Error in ${func}():`, error);
        }
      }
    }, true);
    console.log('[Controls] ✅ Event delegation attached to #controls container');
  }
  
  // Kiểm tra các nút có tồn tại không và test click
  setTimeout(() => {
    console.log('[Controls] ========== BUTTON CHECK ==========');
    const buttons = ['left', 'right', 'zoomIn', 'zoomOut'];
    buttons.forEach(btnId => {
      const btn = document.getElementById(btnId);
      if (btn) {
        console.log(`[Controls] ✅ Button #${btnId} exists`);
        console.log(`[Controls]   - Element:`, btn);
        console.log(`[Controls]   - Computed style pointer-events:`, window.getComputedStyle(btn).pointerEvents);
        console.log(`[Controls]   - Z-index:`, window.getComputedStyle(btn).zIndex);
        console.log(`[Controls]   - Data attribute:`, btn.getAttribute('data-control-setup'));
        console.log(`[Controls]   - Has onclick:`, !!btn.onclick);
        
        // Test programmatic click
        console.log(`[Controls]   - Testing programmatic click...`);
        try {
          btn.click();
        } catch (e) {
          console.error(`[Controls]   - Error testing click:`, e);
        }
      } else {
        console.error(`[Controls] ❌ Button #${btnId} NOT FOUND in DOM`);
      }
    });
    
    // Kiểm tra #controls container
    const controlsContainer = document.getElementById('controls');
    if (controlsContainer) {
      console.log('[Controls] ✅ #controls container exists');
      console.log('[Controls]   - Computed style pointer-events:', window.getComputedStyle(controlsContainer).pointerEvents);
      console.log('[Controls]   - Z-index:', window.getComputedStyle(controlsContainer).zIndex);
    } else {
      console.error('[Controls] ❌ #controls container NOT FOUND');
    }
    
    // Kiểm tra footer
    const footer = document.querySelector('footer.footer');
    if (footer) {
      console.log('[Controls] ✅ footer.footer exists');
      console.log('[Controls]   - Computed style pointer-events:', window.getComputedStyle(footer).pointerEvents);
      console.log('[Controls]   - Z-index:', window.getComputedStyle(footer).zIndex);
    } else {
      console.error('[Controls] ❌ footer.footer NOT FOUND');
    }
  }, 2000);
  // Khi scene thay đổi, cập nhật lại tiêu đề
    app.onSceneChange(({ id, name }) => {
      updateSceneTitle(id, name);
      const items = document.querySelectorAll('#menu li[data-scene]');
      items.forEach(li => li.classList.toggle('active', li.dataset.scene === id));
    });
  /* ================= Hover preview ảnh ================= */
  const menuRoot = document.getElementById('menu');
  const preview = document.getElementById('hoverPreview');
  const previewImg = document.getElementById('previewImage');
  if (menuRoot && preview && previewImg) {
    menuRoot.addEventListener('mouseover', (e) => {
      const el = e.target;
      if (el?.dataset?.scene) {
        const url = (scenes.find(x => x.id === el.dataset.scene)?.preview) || '';
        if (url) {
          previewImg.src = url;
          preview.setAttribute('aria-hidden', 'false');
          preview.style.display = 'block';
        }
      }
    });
    menuRoot.addEventListener('mouseout', () => {
      previewImg.src = '';
      preview.setAttribute('aria-hidden', 'true');
      preview.style.display = 'none';
    });
  }

  /* ================= Resize ================= */
  window.addEventListener('resize', () => {
    app.updateSize?.();
  });

  /* ================= Route (Dijkstra) UI ================= */
  const fromSel  = document.getElementById('routeFrom');
  const toSel    = document.getElementById('routeTo');
  const btnRoute = document.getElementById('routeBtn');

  let graph = app?.graph;
  if (!graph) {
    try { graph = await fetch('/api/graph').then(r => r.json()); }
    catch (e) { console.warn('Không tải được graph.json:', e); }
  }

  if (graph && fromSel && toSel) {
    fromSel.innerHTML = '';
    toSel.innerHTML = '';
    graph.nodes.forEach(n => {
      const o1 = document.createElement('option');
      o1.value = n.id; o1.textContent = n.label || n.id;
      const o2 = o1.cloneNode(true);
      fromSel.appendChild(o1); toSel.appendChild(o2);
    });
  }

  btnRoute?.addEventListener('click', () => {
    if (!fromSel || !toSel || !app?.route) return;
    const a = fromSel.value, b = toSel.value;
    if (!a || !b || a === b) return;
    app.route(a, b);
  });

  /* ================= Voice Control ================= */
  const voiceControlBtn = document.getElementById('voiceControlBtn');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (SpeechRecognition && voiceControlBtn) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'vi-VN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    let isListening = false;

    voiceControlBtn.addEventListener('click', () => {
      if (isListening) { recognition.stop(); return; }
      recognition.start();
    });

    recognition.onstart = () => {
      isListening = true;
      voiceControlBtn.classList.add('listening');
      voiceControlBtn.textContent = '🎧';
    };
    recognition.onend = () => {
      isListening = false;
      voiceControlBtn.classList.remove('listening');
      voiceControlBtn.textContent = '🎤';
    };
    recognition.onerror = (event) => {
      console.error("Lỗi nhận dạng giọng nói:", event.error);
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript.toLowerCase().trim();
      console.log("Bạn đã nói:", transcript);
      for (const scene of scenes) {
        const sceneNameVI = (scene.name?.vi || scene.name || '').toLowerCase();
        const sceneNameEN = (scene.name?.en || '').toLowerCase();
        if ((sceneNameVI && transcript.includes(sceneNameVI)) || (sceneNameEN && transcript.includes(sceneNameEN))) {
          console.log(`Đã tìm thấy khu vực: "${scene.name.vi || scene.name}". Đang điều hướng...`);
          app.navigateTo(scene.id);
          return;
        }
      }
      console.log("Không tìm thấy khu vực nào khớp.");
    };
  } else {
    if (voiceControlBtn) voiceControlBtn.style.display = 'none';
  }

})(); // end viewer start
