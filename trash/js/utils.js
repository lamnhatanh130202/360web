// js/utils.js
function smoothMove(start, end, duration, update, done) {
    const t0 = performance.now();
    const ease = t => t; // linear; có thể đổi sang easeInOut nếu thích
    function step(t) {
      const p = Math.min(1, (t - t0) / duration);
      update(start + (end - start) * ease(p));
      if (p < 1) requestAnimationFrame(step); else if (done) done();
    }
    requestAnimationFrame(step);
  }
  
  function zoom(viewer, factor) {
    const view = viewer.view(); if (!view) return;
    const cur = view.fov();
    const next = Math.max(0.2, Math.min(cur * factor, 1.5));
    smoothMove(cur, next, 300, v => view.setFov(v));
  }
  
  function updateTenKhuVuc(sceneId) {
    const el = document.getElementById("tenKhuVuc");
    const name = (window.KHUVUC && window.KHUVUC[sceneId]) || "Không xác định";
    if (el) el.textContent = `Tên khu vực: ${name}`;
  }
  