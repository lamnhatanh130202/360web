// js/app.js
// Viewer & state toàn cục
const viewer  = new Marzipano.Viewer(document.getElementById("pano"));
const limiter = Marzipano.RectilinearView.limit.traditional(1024, 120 * Math.PI / 180);
const sceneCache = {};
let currentView;

// TẠM DỪNG/KHỞI ĐỘNG XOAY THEO TƯƠNG TÁC NGƯỜI DÙNG
AutoRotate.attachIdleResume(viewer, 5000, 0.015);

function createScene(sceneData) {
  const source   = Marzipano.ImageUrlSource.fromString(sceneData.src);
  const geometry = new Marzipano.EquirectGeometry([{ width: 3500 }]);
  const lim      = Marzipano.RectilinearView.limit.traditional(1024, 180 * Math.PI / 180);
  const view     = new Marzipano.RectilinearView({ yaw: 0, pitch: 0, fov: Math.PI / 3 }, lim);
  const scene    = viewer.createScene({ source, geometry, view });

  (sceneData.hotspots || []).forEach(h => addHotspot(scene, h));
  return { scene, view };
}

function loadScene(sceneData) {
  if (!sceneCache[sceneData.id]) sceneCache[sceneData.id] = createScene(sceneData);
  const { scene, view } = sceneCache[sceneData.id];
  currentView = view;
  scene.switchTo();
  setupControls(viewer);
  setTimeout(() => AutoRotate.start(view), 200);
}
window.loadScene = loadScene; // cho hotspots.js gọi

function initializeMenu() {
  const menuButton = document.getElementById("menuButton");
  const menuList   = document.getElementById("menuList");

  if (menuButton && menuList) {
    menuButton.addEventListener("click", () => {
      menuList.style.display = menuList.style.display === "block" ? "none" : "block";
    });
  }

  document.querySelectorAll("#menuList li > span").forEach(item => {
    item.addEventListener("click", () => item.parentNode.classList.toggle("open"));
  });

  document.querySelectorAll("#menuList [data-scene]").forEach(item => {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-scene");
      const meta = (window.SCENES || []).find(s => s.id === id);
      if (meta) { loadScene(meta); updateTenKhuVuc(id); }
      if (menuList) menuList.style.display = "none";
    });
  });
}

function initializePreview() {
  const hoverPreview = document.getElementById('hoverPreview');
  const previewImage = document.getElementById('previewImage');
  if (!hoverPreview || !previewImage) return;

  document.querySelectorAll('#menuList li[data-preview]').forEach(menuItem => {
    menuItem.addEventListener('mouseover', () => {
      const src = menuItem.getAttribute('data-preview');
      if (src) { previewImage.src = src; hoverPreview.style.display = 'block'; }
    });
    menuItem.addEventListener('mouseout', () => { hoverPreview.style.display = 'none'; });
    menuItem.addEventListener('mousemove', (e) => {
      hoverPreview.style.left = `${e.pageX + 10}px`;
      hoverPreview.style.top  = `${e.pageY + 10}px`;
    });
  });
}

// SW + PWA install
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js")
    .then(() => console.log("Service Worker Registered"))
    .catch(err => console.log("Service Worker Failed", err));
}

let deferredPrompt;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e;
  const btn = document.getElementById("installButton");
  if (btn) btn.style.display = "block";
});
const installBtn = document.getElementById("installButton");
if (installBtn) {
  installBtn.addEventListener("click", () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.finally(() => { deferredPrompt = null; });
  });
}

// Khởi động
(function init() {
  initializeMenu();
  initializePreview();
  if (window.SCENES && window.SCENES.length) {
    loadScene(window.SCENES[0]);
    updateTenKhuVuc(window.SCENES[0].id);
  }
})();
