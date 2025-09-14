// /src/main.js
import './style.css';
import { bootstrap } from './core/app.js';

// ---------- PWA install button ----------
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

// ---------- Khởi động app/viewer ----------
(async function start() {
  // Khởi tạo viewer + trả về API điều khiển
  const app = await bootstrap({
    dataBaseUrl: '/data',
    i18nBaseUrl: '/i18n',
    rootSelector: '#pano',
    minimapSelector: '#minimap',
    hotspotsSelector: '#hotspots',
    fadeSelector: '#fade'
  });

  // ---------- Bind nút điều khiển footer ----------
  document.getElementById('left')?.addEventListener('click', app.controls.left);
  document.getElementById('right')?.addEventListener('click', app.controls.right);
  document.getElementById('zoomIn')?.addEventListener('click', app.controls.zoomIn);
  document.getElementById('zoomOut')?.addEventListener('click', app.controls.zoomOut);
  document.getElementById('toggleAutoRotate')?.addEventListener('click', () => {
    const active = app.controls.toggleAutoRotate();
    document.getElementById('toggleAutoRotate').textContent = active ? 'Dừng lại' : 'Tự xoay';
  });

  // ---------- Cập nhật tiêu đề khu vực ở header ----------
  const tenKhuVuc = document.getElementById('tenKhuVuc');
  app.onSceneChange(({ id, name }) => {
    if (tenKhuVuc) tenKhuVuc.textContent = `Tên khu vực: ${name?.vi || name || id}`;
    // đồng thời highlight item menu
    highlightActiveInMenu(id);
  });

  // ---------- Render menu điều hướng động từ scenes.json ----------
  // (menu rỗng trong index.html sẽ được lấp nội dung ở đây)
  const scenes = await fetch('/data/scenes.json').then(r => r.json()).catch(() => []);
  const menuRoot = document.getElementById('menu');
  if (menuRoot) {
    menuRoot.innerHTML = '';
    const ul = document.createElement('ul');
    ul.id = 'menuList';

    for (const s of scenes) {
      const li = document.createElement('li');
      li.dataset.scene = s.id;
      li.textContent = s?.name?.vi || s.id;
      li.addEventListener('click', () => app.navigateTo(s.id));
      ul.appendChild(li);
    }

    // Nút mở/đóng menu 
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'menuButton';
    toggleBtn.setAttribute('aria-expanded', 'false');
    toggleBtn.textContent = '☰';
    toggleBtn.addEventListener('click', () => {
      const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!expanded));
      ul.style.display = expanded ? 'none' : 'block';
    });

    menuRoot.appendChild(toggleBtn);
    menuRoot.appendChild(ul);
  }

  // ---------- Hover preview ảnh  ----------
  const preview = document.getElementById('hoverPreview');
  const previewImg = document.getElementById('previewImage');
  if (menuRoot && preview && previewImg) {
    menuRoot.addEventListener('mouseover', (e) => {
      const el = e.target;
      if (el?.dataset?.scene) {
        // nếu có ảnh preview riêng thì map theo sceneId -> url ở đây
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

  // ---------- Tiện ích: highlight item đang active ----------
  function highlightActiveInMenu(activeId) {
    const items = menuRoot?.querySelectorAll('li[data-scene]') || [];
    items.forEach(li => {
      li.classList.toggle('active', li.dataset.scene === activeId);
    });
  }
})();
