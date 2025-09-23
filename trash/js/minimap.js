// js/minimap.js
(function (global) {
    const MAP = { W: 800, H: 500 }; // kích thước gốc của ảnh minimap (px)
  
    // Tạo DOM minimap nếu chưa có
    function ensureDOM() {
      let mm = document.getElementById('minimap');
      if (!mm) {
        mm = document.createElement('div');
        mm.id = 'minimap';
        mm.innerHTML = `
          <img src="./assets/map.png" alt="Sơ đồ khuôn viên"/>
          <div id="minimap-marker"></div>
        `;
        document.body.appendChild(mm);
      }
      if (!document.getElementById('minimap-marker')) {
        const mk = document.createElement('div');
        mk.id = 'minimap-marker';
        mm.appendChild(mk);
      }
    }
  
    // Cập nhật vị trí marker theo sceneId
    function update(sceneId) {
      const mm = document.getElementById('minimap');
      const mk = document.getElementById('minimap-marker');
      if (!mm || !mk) return;
  
      const list = (global.SCENES || []);
      const s = list.find(x => x.id === sceneId);
      if (!s || !s.mapPos) return; // cần mapPos: {x,y} theo ảnh gốc 800x500
  
      const box = mm.getBoundingClientRect();
      const sx = (box.width  - 16) / MAP.W;
      const sy = (box.height - 16) / MAP.H;
  
      mk.style.position = 'absolute';
      mk.style.width = '14px';
      mk.style.height = '14px';
      mk.style.borderRadius = '50%';
      mk.style.border = '2px solid #fff';
      mk.style.background = '#ff3b30';
      mk.style.transform = 'translate(-50%,-50%)';
      mk.style.boxShadow = '0 0 0 3px rgba(255,59,48,.3)';
      mk.style.left = (s.mapPos.x * sx + 8) + 'px';
      mk.style.top  = (s.mapPos.y * sy + 8) + 'px';
    }
  
    // Khởi tạo: tạo DOM (nếu thiếu) + gắn auto cập nhật khi resize
    function init() {
      ensureDOM();
      // cập nhật lại marker khi cửa sổ đổi kích thước
      global.addEventListener('resize', () => {
        if (global.CURRENT_SCENE_ID) update(global.CURRENT_SCENE_ID);
      });
    }
  
    // Cho phép đổi kích thước gốc nếu map.png của bạn không phải 800x500
    function setMapSize(w, h) { MAP.W = w; MAP.H = h; }
  
    // Hook loadScene để tự update minimap
    function hookLoadScene() {
      if (!global.loadScene || global.__minimapHooked) return;
      const orig = global.loadScene;
      global.loadScene = function (sceneMeta) {
        const ret = orig(sceneMeta);
        try {
          global.CURRENT_SCENE_ID = sceneMeta.id;
          update(sceneMeta.id);
        } catch (e) {}
        return ret;
      };
      global.__minimapHooked = true;
    }
  
    // Public API
    global.MiniMap = { init, update, setMapSize, hookLoadScene };
  })(window);
  
  // Gợi ý khởi động (gọi sau khi app.js chạy xong):
  // MiniMap.init(); MiniMap.hookLoadScene();
  