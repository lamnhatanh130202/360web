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
    dataBaseUrl: '/data',
    rootSelector: '#pano',
    minimapSelector: '#minimap',
    hotspotsSelector: '#hotspots',
    fadeSelector: '#fade'
  });

  // Load scenes (để render menu theo i18n)
  const scenes = await fetch('/data/scenes.json').then(r => r.json()).catch(() => []);

  /* ================= I18N (VN–EN) ================= */
  let currentLang = localStorage.getItem('lang') || 'vi';
  let langData = {};

  async function loadLang(lang) {
    try {
      const res = await fetch(`/language/${lang}.json`); // file trong /public/language
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      langData = await res.json();
      currentLang = lang;
      localStorage.setItem('lang', lang);
      applyLang();
      renderMenu();
      const active = app.getActiveScene?.();
      if (active) updateSceneTitle(active.id, active.name);
    } catch (e) {
      console.error('i18n load fail:', e);
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
    try { graph = await fetch('/data/graph.json').then(r => r.json()); }
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
})();
