// /src/main.js
import './style.css';
import { bootstrap } from './core/app.js';

/* ================= PWA install button ================= */
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

/* ================= App bootstrap ================= */
(async function start() {
  const app = await bootstrap({
    dataBaseUrl: '/api',
    rootSelector: '#pano',
    minimapSelector: '#minimap',
    hotspotsSelector: '#hotspots',
    fadeSelector: '#fade'
  });

  // Load scenes (để render menu theo i18n)
  const scenes = await fetch('/api/scenes').then(r => r.json()).catch(() => []);

  /* ================= I18N (VN–EN) ================= */
  let currentLang = localStorage.getItem('lang') || 'vi';
  let langData = {};


async function loadLang(lang) {
  try {
    // Sửa dòng này: bỏ "/api"
    const res = await fetch(`/language/${lang}.json`); 
    // ... code còn lại giữ nguyên
  } catch (e) {
    // ...
  }
}

  function applyLang() {
    const h = document.getElementById('tieude');
    if (h && langData.title) h.textContent = langData.title;

    const btn = document.getElementById('toggleAutoRotate');
    if (btn && langData.btnRotateOn && langData.btnRotateOff) {
      const ctrl = app.controls || {};
      const state = (typeof ctrl.isAutoRotating === 'function')
        ? ctrl.isAutoRotating()
        : (typeof ctrl.isAutoRotating === 'boolean' ? ctrl.isAutoRotating : false);
      btn.textContent = state ? langData.btnRotateOn : langData.btnRotateOff;
    }

    const rb = document.getElementById('routeBtn');
    if (rb && langData.routeBtn) rb.textContent = langData.routeBtn;
  }

  function updateSceneTitle(id, name) {
    const el = document.getElementById('tenKhuVuc');
    if (!el || !langData.sceneLabel) return;
    const sceneName = (name?.[currentLang]) || name?.vi || name || id;
    el.textContent = `${langData.sceneLabel}: ${sceneName}`;
  }

  function renderMenu() {
    const menuRoot = document.getElementById('menu');
    if (!menuRoot) return;
    menuRoot.innerHTML = '';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'menuButton';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = '☰';

    const ul = document.createElement('ul');
    ul.id = 'menuList';

    for (const s of scenes) {
      const li = document.createElement('li');
      li.dataset.scene = s.id;
      li.textContent = s?.name?.[currentLang] || s?.name?.vi || s.id;
      li.addEventListener('click', () => app.navigateTo(s.id));
      ul.appendChild(li);
    }

    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      ul.style.display = expanded ? 'none' : 'block';
    });

    menuRoot.appendChild(toggleBtn);
    menuRoot.appendChild(ul);
  }

  document.getElementById('langSwitch')?.addEventListener('change', (e) => {
    loadLang(e.target.value);
  });

  await loadLang(currentLang);
  const langSel = document.getElementById('langSwitch');
  if (langSel) langSel.value = currentLang;

  /* ================= Controls (footer) ================= */
  if (app.controls?.left)    document.getElementById('left')   ?.addEventListener('click', app.controls.left);
  if (app.controls?.right)   document.getElementById('right')  ?.addEventListener('click', app.controls.right);
  if (app.controls?.zoomIn)  document.getElementById('zoomIn') ?.addEventListener('click', app.controls.zoomIn);
  if (app.controls?.zoomOut) document.getElementById('zoomOut')?.addEventListener('click', app.controls.zoomOut);

  document.getElementById('toggleAutoRotate')?.addEventListener('click', () => {
    const active = app.controls?.toggleAutoRotate ? app.controls.toggleAutoRotate() : false;
    const btn = document.getElementById('toggleAutoRotate');
    if (!btn) return;
    btn.textContent = active
      ? (langData.btnRotateOn || 'Dừng lại')
      : (langData.btnRotateOff || 'Tự xoay');
  });

  /* ================= Scene change hook ================= */
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

if (SpeechRecognition) {
  const recognition = new SpeechRecognition();
  recognition.continuous = false; // Chỉ nghe một lần rồi dừng
  recognition.lang = 'vi-VN';      // Thiết lập cho tiếng Việt
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  let isListening = false;

  // Khi nút micro được bấm
  voiceControlBtn.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
      return;
    }
    recognition.start();
  });

  // Bắt đầu lắng nghe
  recognition.onstart = () => {
    isListening = true;
    voiceControlBtn.classList.add('listening'); // Thêm class để đổi màu nút (CSS)
    voiceControlBtn.textContent = '🎧';
  };

  // Dừng lắng nghe
  recognition.onend = () => {
    isListening = false;
    voiceControlBtn.classList.remove('listening');
    voiceControlBtn.textContent = '🎤';
  };

  // Khi có lỗi
  recognition.onerror = (event) => {
    console.error("Lỗi nhận dạng giọng nói:", event.error);
  };

  // Khi có kết quả
  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase().trim();
    console.log("Bạn đã nói:", transcript);

    // Tìm scene khớp với những gì bạn nói
    // scenes là biến đã được tải ở đầu file main.js
    for (const scene of scenes) {
      const sceneNameVI = (scene.name?.vi || scene.name || '').toLowerCase();
      const sceneNameEN = (scene.name?.en || '').toLowerCase();

      // Kiểm tra xem lời nói có chứa tên của scene không
      if ((sceneNameVI && transcript.includes(sceneNameVI)) || (sceneNameEN && transcript.includes(sceneNameEN))) {
        console.log(`Đã tìm thấy khu vực: "${scene.name.vi}". Đang điều hướng...`);
        app.navigateTo(scene.id); // Gọi hàm điều hướng đã có
        return; // Dừng tìm kiếm khi đã thấy
      }
    }

    console.log("Không tìm thấy khu vực nào khớp.");
    // Optional: Hiển thị thông báo "Không tìm thấy" cho người dùng
  };

} else {
  // Ẩn nút nếu trình duyệt không hỗ trợ
  console.warn("Trình duyệt này không hỗ trợ Web Speech API.");
  if (voiceControlBtn) voiceControlBtn.style.display = 'none';
}

})();
