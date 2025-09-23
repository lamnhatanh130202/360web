// js/navigation.js
(function (global) {
    // ====== Helpers: tween + walk transition ======
    function tween(from, to, ms, onUpdate, onDone, ease) {
      const start = performance.now();
      const easing = ease || (t => (t < .5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2));
      function loop(now) {
        const p = Math.min(1, (now - start) / ms);
        onUpdate(from + (to - from) * easing(p));
        if (p < 1) requestAnimationFrame(loop);
        else if (onDone) onDone();
      }
      requestAnimationFrame(loop);
    }
  
    function walkTransition(currentView, targetMeta, done) {
      if (!currentView) return done && done();
      const f0 = currentView.fov();
      const f1 = Math.max(f0 * 0.8, 35 * Math.PI / 180);
      tween(f0, f1, 300, v => currentView.setFov(v), () => {
        if (targetMeta && typeof targetMeta.enterYaw === 'number') {
          const y0 = currentView.yaw(),   y1 = targetMeta.enterYaw;
          const p0 = currentView.pitch(), p1 = targetMeta.enterPitch || 0;
          let c = 0; const ck = () => (++c === 2) && done && done();
          tween(y0, y1, 360, v => currentView.setYaw(v), ck);
          tween(p0, p1, 360, v => currentView.setPitch(v), ck);
        } else {
          done && done();
        }
      });
    }
  
    // ====== Travel to one scene (mượt) ======
    function travelTo(targetId) {
      const list = (global.SCENES || []);
      const meta = list.find(s => s.id === targetId);
      if (!meta || !global.viewer) return;
  
      const curView = global.viewer.view();
      if (global.AutoRotate) global.AutoRotate.stop();
  
      walkTransition(curView, meta, () => {
        if (typeof global.loadScene === 'function') {
          global.loadScene(meta);
        }
        // zoom-out nhẹ + bật lại auto-rotate
        setTimeout(() => {
          const v = global.viewer.view();
          const f0 = v.fov(), f1 = Math.min(f0 * 1.25, 100 * Math.PI / 180);
          tween(f0, f1, 360, x => v.setFov(x), () => global.AutoRotate && global.AutoRotate.start(v, 0.015));
        }, 120);
      });
    }
  
    // ====== Build graph from SCENES.hotspots (vô hướng, trọng số = 1) ======
    function buildGraphFromScenes() {
      const G = {}; const scenes = (global.SCENES || []);
      scenes.forEach(s => { G[s.id] = new Set(); });
      scenes.forEach(s => {
        (s.hotspots || []).forEach(h => {
          if (h.target && G[s.id]) {
            G[s.id].add(h.target);
            // hai chiều nếu ngược lại không có, vẫn thêm để đi về được
            if (G[h.target]) G[h.target].add(s.id);
          }
        });
      });
      // chuyển Set -> Array
      const out = {}; Object.keys(G).forEach(k => out[k] = Array.from(G[k]));
      return out;
    }
  
    // ====== Dijkstra (trọng số 1) ======
    function shortestPath(graph, start, goal) {
      if (!graph[start] || !graph[goal]) return null;
      const q = [start];
      const prev = {}; prev[start] = null;
      const seen = new Set([start]);
  
      while (q.length) {
        const u = q.shift();
        if (u === goal) break;
        (graph[u] || []).forEach(v => {
          if (!seen.has(v)) { seen.add(v); prev[v] = u; q.push(v); }
        });
      }
      if (!(goal in prev)) return null;
      const path = [];
      for (let at = goal; at !== null; at = prev[at]) path.push(at);
      return path.reverse();
    }
  
    // ====== Directions render ======
    function renderDirections(path, containerId = 'directions') {
      let box = document.getElementById(containerId);
      if (!box) {
        box = document.createElement('div'); box.id = containerId;
        box.style.position = 'fixed'; box.style.left = '16px'; box.style.bottom = '16px';
        box.style.maxWidth = '320px'; box.style.background = 'rgba(255,255,255,.9)';
        box.style.borderRadius = '12px'; box.style.boxShadow = '0 10px 30px rgba(0,0,0,.2)';
        box.style.padding = '12px'; box.style.zIndex = '9999'; box.style.fontSize = '14px';
        document.body.appendChild(box);
      }
      if (!path || path.length < 2) { box.innerHTML = '<b>Không có lộ trình phù hợp.</b>'; return; }
  
      const names = (global.KHUVUC || {});
      const steps = path.map((id, i) => {
        const name = names[id] || id;
        if (i === 0) return `Bắt đầu: <b>${name}</b>`;
        if (i === path.length - 1) return `Đến: <b>${name}</b>`;
        return `Đi qua: <b>${name}</b>`;
      });
  
      box.innerHTML = `
        <div style="font-weight:600;margin-bottom:8px;">Chỉ đường</div>
        <ol style="margin:0;padding-left:18px;">
          ${steps.map(s => `<li style="margin:4px 0;">${s}</li>`).join('')}
        </ol>
        <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="navStartBtn">Bắt đầu</button>
          <button id="navCloseBtn">Đóng</button>
        </div>
      `;
  
      document.getElementById('navCloseBtn').onclick = () => box.remove();
      return box;
    }
  
    // ====== Điều hướng: tìm đường + đi theo lộ trình ======
    function navigateTo(targetId, options = {}) {
      const graph = buildGraphFromScenes();
      const startId = global.CURRENT_SCENE_ID || (global.SCENES && global.SCENES[0] && global.SCENES[0].id);
      if (!startId) return;
  
      const path = shortestPath(graph, startId, targetId);
      const panel = renderDirections(path, options.containerId || 'directions');
  
      if (!path || path.length < 2) return;
  
      // thực thi: đi qua từng scene trong path
      let i = 1; // bỏ node đầu (đang đứng)
      const step = () => {
        if (i >= path.length) return;
        const id = path[i++];
        travelTo(id);
        // đợi nhẹ cho scene đổi xong rồi đi tiếp
        setTimeout(step, options.stepDelayMs || 900);
      };
      if (panel) {
        const btn = document.getElementById('navStartBtn');
        if (btn) btn.onclick = step;
      } else {
        step();
      }
    }
  
    // ====== Hook loadScene để lưu CURRENT_SCENE_ID ======
    function hookLoadScene() {
      if (!global.loadScene || global.__navHooked) return;
      const orig = global.loadScene;
      global.loadScene = function (sceneMeta) {
        const ret = orig(sceneMeta);
        try { global.CURRENT_SCENE_ID = sceneMeta.id; } catch (e) {}
        return ret;
      };
      global.__navHooked = true;
    }
  
    // Public API
    global.Nav = {
      travelTo, navigateTo,
      buildGraphFromScenes, shortestPath,
      hookLoadScene
    };
  })(window);
  
  // Gợi ý khởi động (gọi sau khi app.js chạy xong):
  // Nav.hookLoadScene();
  // Ví dụ: Nav.navigateTo("a3_trcthuvien"); // hiển thị chỉ đường + nút "Bắt đầu"
  