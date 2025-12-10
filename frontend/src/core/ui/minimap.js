import '../../styles/style.css';

export function createMinimap(opts) {
    const {
        container,
        graph,
        onGotoScene,
        onPathPlay,
    } = opts || {};

    // --- 1. CONFIG & STATE ---
    
    // Chuẩn hóa dữ liệu đầu vào
    let G = normalizeGraph(graph || { nodes: [], edges: [] });

    // Cấu hình đường dẫn ảnh nền các tầng
    const floorBackgrounds = {
        0:   "/assets/minimap/so_do_ca_truong.jpg",
        1:   "/assets/minimap/lau_1_khu_a_b.jpg",
        2:   "/assets/minimap/lau_2_khu_a_b.jpg",
        3:   "/assets/minimap/lau_3_khu_a_b.jpg",
        4:   "/assets/minimap/lau_4_khu_a.jpg",
        5:   "/assets/minimap/lau_5_khu_a.jpg",
        5.5: "/assets/minimap/mat_lung_lau_5_khu_a.jpg",
        6:   "/assets/minimap/lau_6_khu_a.jpg"
    };

    // State nội bộ
    let currentFloor = 0;
    let activeId = null;
    let activePath = []; // Biến global lưu đường đi hiện tại
    let isMapLocked = false;
    let scenes = []; 
    
    // [NEW] Quản lý ngôn ngữ
    let currentLang = localStorage.getItem('lang') || 'vi';

    // View State: quản lý Zoom & Pan
    let view = { scale: 1, x: 0, y: 0 }; 
    let savedView = null; 
    
    let stageWidth = 1000; 
    let stageHeight = 1000;

    const SCALE_MIN = 0.1;
    const SCALE_MAX = 4.0;

    // [UPDATED] Hàm lấy tên Scene theo ngôn ngữ
    function getSceneName(nodeId) {
        const scene = scenes.find(s => String(s.id) === String(nodeId));
        if (!scene) return nodeId;

        // Nếu name là object {vi, en} -> Lấy theo currentLang
        if (scene.name && typeof scene.name === 'object') {
            return scene.name[currentLang] || scene.name.vi || nodeId;
        }
        // Nếu name là string
        return scene.name || nodeId;
    }

    // [NEW] Hàm lấy tên Tầng theo ngôn ngữ
    function getFloorName(f) {
        if (currentLang === 'en') {
            if (f === 0) return 'Ground Floor (0)';
            if (f === 5.5) return 'Mezzanine 5 (5.5)';
            return `Floor ${f}`;
        } else {
            if (f === 0) return 'Trệt (0)';
            if (f === 5.5) return 'Lửng 5 (5.5)';
            return `Tầng ${f}`;
        }
    }

    async function loadScenes() {
        try {
            const res = await fetch('/api/scenes?t=' + Date.now());
            if (res.ok) {
                const data = await res.json();
                scenes = Array.isArray(data) ? data : [];
                // Load xong thì cập nhật lại tên trên UI ngay
                fillSelects();
                renderNodes();
            }
        } catch (e) {
            console.warn('[Minimap] Failed to load scenes:', e);
        }
    }

    // --- 2. DOM STRUCTURE ---

    try { isMapLocked = JSON.parse(localStorage.getItem('minimap_locked') || 'false'); } catch { }
    if (isMapLocked) container.classList.add('locked');
    container.classList.add('minimap');
    
    container.innerHTML = `
    <div class="mm-toolbar">
        <div class="mm-route">
            <select id="mmFrom"></select>
            <span>→</span>
            <select id="mmTo"></select>
            <button id="mmGo">Tìm đường</button>
            <button id="mmClear">Xóa</button>
        </div>
        <button class="mm-toggle" id="mmToggle">Thu</button>
    </div>

    <div class="mm-viewport" id="mmViewport" style="overflow: hidden; position: relative; width: 100%; height: 100%; background: #e5e5e5; user-select: none;">
        <div class="mm-controls">
            <div class="floor-selector">
                <button data-floor="6">6</button>
                <button data-floor="5.5">5.5</button>
                <button data-floor="5">5</button>
                <button data-floor="4">4</button>
                <button data-floor="3">3</button>
                <button data-floor="2">2</button>
                <button data-floor="1">1</button>
                <button data-floor="0" class="active">0</button>
            </div>
            <div class="mm-zoom">
                <button id="mmZoomIn" title="Phóng to">+</button>
                <button id="mmZoomOut" title="Thu nhỏ">−</button>
                <button id="mmZoomReset" title="Vừa màn hình">Fit</button>
                <button id="mmLock" title="Khoá vị trí">Khoá</button>
            </div>
        </div>
        
        <div class="mm-stage" id="mmStage" style="position: absolute; top: 0; left: 0; transform-origin: 0 0; will-change: transform;">
            <img id="mmBgImage" src="" style="position: absolute; top: 0; left: 0; pointer-events: none; user-select: none; display: block;" />
            <div id="mmContent" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>
        </div>
    </div>
    `;

    const viewport = container.querySelector('#mmViewport');
    const stage = container.querySelector('#mmStage');
    const bgImage = container.querySelector('#mmBgImage');
    const content = container.querySelector('#mmContent');
    const selFrom = container.querySelector('#mmFrom');
    const selTo = container.querySelector('#mmTo');

    // [NEW] Cập nhật text nút bấm theo ngôn ngữ
    function updateUIText() {
        const isEn = currentLang === 'en';
        container.querySelector('#mmGo').innerText = isEn ? 'Find' : 'Tìm đường';
        container.querySelector('#mmClear').innerText = isEn ? 'Clear' : 'Xóa';
        container.querySelector('#mmToggle').innerText = isEn ? 'Hide' : 'Thu';
        container.querySelector('#mmLock').title = isEn ? 'Lock position' : 'Khoá vị trí';
        container.querySelector('#mmZoomReset').title = isEn ? 'Fit screen' : 'Vừa màn hình';
    }

    // --- 3. CORE LOGIC ---

    function setFloor(floorId) {
        if (!floorBackgrounds[floorId] && floorId !== 0) return;
        
        currentFloor = floorId;
        const src = floorBackgrounds[currentFloor];

        container.querySelectorAll('.floor-selector button').forEach(btn => {
            btn.classList.toggle('active', parseFloat(btn.dataset.floor) === currentFloor);
        });

        const img = new Image();
        img.onload = () => {
            stageWidth = img.naturalWidth || 1000;
            stageHeight = img.naturalHeight || 1000;
            
            stage.style.width = `${stageWidth}px`;
            stage.style.height = `${stageHeight}px`;
            
            bgImage.src = src;
            bgImage.style.width = `${stageWidth}px`;
            bgImage.style.height = `${stageHeight}px`;

            renderNodes();
            fillSelects();

            // [FIX LOGIC ZOOM] Nếu đang có đường đi active thì ưu tiên zoom vào đường đó
            if (activePath && activePath.length > 1) {
                try { focusPath(activePath); } catch (e) { console.error('focusPath failed:', e); }
            } else {
                fitToScreen();
            }
        };
        img.onerror = () => console.error("[Minimap] Cannot load image:", src);
        img.src = src;
    }

    function getNodePosition(node, floor) {
        if (node.positions && typeof node.positions === 'object') {
            const fKey = String(floor);
            if (node.positions[fKey]) return node.positions[fKey];
            if (Object.keys(node.positions).length > 0) return node.positions[Object.keys(node.positions)[0]];
        }
        return { x: node.x || 0, y: node.y || 0 };
    }

    function renderNodes() {
        content.innerHTML = '';

        const hasActivePath = Array.isArray(activePath) && activePath.length > 1;
        const activeSet = hasActivePath ? new Set(activePath) : null;
        
        const visibleNodes = G.nodes.filter(n => (n.floor ?? 0) === currentFloor);
        const visibleIds = new Set(visibleNodes.map(n => n.id));

        // Vẽ đường nối
        G.edges.forEach(e => {
            if (!visibleIds.has(e.from) || !visibleIds.has(e.to)) return;
            const n1 = G.nodes.find(n => n.id === e.from);
            const n2 = G.nodes.find(n => n.id === e.to);
            if (!n1 || !n2) return;
            const p1 = getNodePosition(n1, currentFloor);
            const p2 = getNodePosition(n2, currentFloor);
            
            // Kiểm tra xem edge có nằm trong active path không
            let isInPath = false;
            let edgeOpacity = 1.0;
            
            if (hasActivePath && activePath.length > 1) {
                const fromIndex = activePath.indexOf(String(e.from));
                const toIndex = activePath.indexOf(String(e.to));
                isInPath = fromIndex >= 0 && toIndex >= 0 && Math.abs(fromIndex - toIndex) === 1;
                
                if (!isInPath) {
                    edgeOpacity = 0.15; // Làm mờ edges không trong path
                }
            }
            
            drawEdge(p1.x, p1.y, p2.x, p2.y, edgeOpacity, isInPath);
        });

        // Vẽ nodes
        visibleNodes.forEach(n => {
            const pos = getNodePosition(n, currentFloor);
            const name = getSceneName(n.id); // [FIX] Lấy tên theo ngôn ngữ

            const dot = document.createElement('div');
            dot.className = 'mm-dot';
            if (String(n.id) === String(activeId)) dot.classList.add('mm-dot--active');
            
            dot.style.left = `${pos.x}px`;
            dot.style.top = `${pos.y}px`;
            dot.style.transform = 'translate(-50%, -50%)';
            dot.title = name;

            if (hasActivePath && !activeSet.has(String(n.id))) {
                dot.style.opacity = '0.15'; // Làm mờ hơn các nodes không trong path
                dot.style.filter = 'blur(1px)'; // Thêm blur effect
            }
            
            dot.onclick = (e) => {
                e.stopPropagation(); 
                if (onGotoScene) onGotoScene(n.id);
            };

            const label = document.createElement('div');
            label.className = 'mm-label';
            label.innerText = name;
            label.style.left = `${pos.x}px`;
            label.style.top = `${pos.y}px`;
            label.style.transform = 'translate(-50%, -150%)';

            if (hasActivePath && !activeSet.has(String(n.id))) {
                label.style.opacity = '0.2'; // Làm mờ labels không trong path
            }

            content.appendChild(dot);
            content.appendChild(label);
        });

        // KHÔNG vẽ path highlight riêng nữa vì đã được vẽ trong phần edges ở trên
        // Path highlight đã được xử lý trong logic vẽ edges với opacity khác nhau
    }

    function drawEdge(x1, y1, x2, y2, opacity = 1.0, isHighlight = false) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx*dx + dy*dy);
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        const line = document.createElement('div');
        // Dùng class mm-edge--hl nếu edge nằm trong path
        line.className = isHighlight ? 'mm-edge mm-edge--hl' : 'mm-edge';
        line.style.width = `${length}px`;
        line.style.left = `${x1}px`;
        line.style.top = `${y1}px`;
        line.style.transform = `rotate(${angle}deg)`;
        line.style.opacity = opacity;
        
        content.appendChild(line);
    }


    // --- 4. TRANSFORM & ZOOM LOGIC ---

    function updateTransform() {
        stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    }

    function fitToScreen() {
        const vpRect = viewport.getBoundingClientRect();
        if (vpRect.width === 0 || stageWidth === 0) return;
        const scaleW = vpRect.width / stageWidth;
        const scaleH = vpRect.height / stageHeight;
        let newScale = Math.min(scaleW, scaleH) * 0.95;
        const newX = (vpRect.width - stageWidth * newScale) / 2;
        const newY = (vpRect.height - stageHeight * newScale) / 2;
        view = { scale: newScale, x: newX, y: newY };
        updateTransform();
    }

    function focusPath(path) {
        if (!Array.isArray(path) || path.length === 0) return;
        if (!savedView) savedView = { ...view };

        const nodesOnPath = [];
        path.forEach(id => {
            // [FIX] So sánh String để đảm bảo tìm thấy
            const n = G.nodes.find(node => String(node.id) === String(id));
            if (!n) return;
            
            // Chỉ lấy tọa độ các node ở tầng hiện tại
            if ((n.floor ?? 0) === currentFloor) {
                const pos = getNodePosition(n, currentFloor);
                if (pos) nodesOnPath.push({ pos });
            }
        });

        if (nodesOnPath.length === 0) return; // Không có node nào ở tầng này để zoom

        const xs = nodesOnPath.map(p => p.pos.x);
        const ys = nodesOnPath.map(p => p.pos.y);

        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const vpRect = viewport.getBoundingClientRect();
        const padding = 120; // Giảm padding để zoom gần hơn
        const contentW = (maxX - minX) + padding * 2;
        const contentH = (maxY - minY) + padding * 2;

        const scaleW = vpRect.width / contentW;
        const scaleH = vpRect.height / contentH;
        let bboxScale = Math.min(scaleW, scaleH);

        // Zoom to hơn - tăng scale
        const baseScale = (savedView && savedView.scale) ? savedView.scale : view.scale;
        let newScale = Math.max(bboxScale * 1.2, baseScale * 1.3); // Tăng zoom level
        newScale = Math.max(0.5, Math.min(2.0, newScale)); // Cho phép zoom to hơn

        const newX = vpRect.width / 2 - cx * newScale;
        const newY = vpRect.height / 2 - cy * newScale;

        // Smooth animation
        const startScale = view.scale;
        const startX = view.x;
        const startY = view.y;
        const duration = 500; // 500ms animation
        const startTime = performance.now();
        
        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Easing function (ease-out)
            const easeProgress = 1 - Math.pow(1 - progress, 3);
            
            view.scale = startScale + (newScale - startScale) * easeProgress;
            view.x = startX + (newX - startX) * easeProgress;
            view.y = startY + (newY - startY) * easeProgress;
        updateTransform();
            
            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }
        
        requestAnimationFrame(animate);
    }

    function resetViewAfterPath() {
        if (savedView) {
            view = { ...savedView };
            savedView = null;
            updateTransform();
        } else {
            fitToScreen();
        }
        activePath = []; // Xóa đường đi
        renderNodes();
    }

    function zoomAt(factor, clientX, clientY) {
        const rect = viewport.getBoundingClientRect();
        const mouseX = clientX - rect.left;
        const mouseY = clientY - rect.top;
        const stageX = (mouseX - view.x) / view.scale;
        const stageY = (mouseY - view.y) / view.scale;
        let newScale = view.scale * factor;
        newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, newScale));
        view.x = mouseX - stageX * newScale;
        view.y = mouseY - stageY * newScale;
        view.scale = newScale;
        updateTransform();
    }


    // --- 5. EVENT LISTENERS ---

    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        zoomAt(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
    }, { passive: false });

    let isDragging = false;
    let startX = 0, startY = 0;
    
    viewport.addEventListener('mousedown', (e) => {
        if (isMapLocked) return;
        if (e.target.closest('button') || e.target.closest('select')) return;
        isDragging = true;
        startX = e.clientX - view.x;
        startY = e.clientY - view.y;
        container.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        e.preventDefault();
        view.x = e.clientX - startX;
        view.y = e.clientY - startY;
        updateTransform();
    });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = '';
        }
    });

    viewport.addEventListener('touchstart', (e) => {
         if (e.touches.length === 1) {
             const t = e.touches[0];
             isDragging = true;
             startX = t.clientX - view.x;
             startY = t.clientY - view.y;
         }
    }, { passive: true });
    
    window.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches.length === 1) {
             const t = e.touches[0];
             view.x = t.clientX - startX;
             view.y = t.clientY - startY;
             updateTransform();
        }
    }, { passive: true });
    
    window.addEventListener('touchend', () => isDragging = false);


    // --- 6. CONTROLS EVENTS ---

    container.querySelector('#mmZoomIn').onclick = () => {
        const rect = viewport.getBoundingClientRect();
        zoomAt(1.2, rect.left + rect.width/2, rect.top + rect.height/2);
    };
    container.querySelector('#mmZoomOut').onclick = () => {
        const rect = viewport.getBoundingClientRect();
        zoomAt(0.8, rect.left + rect.width/2, rect.top + rect.height/2);
    };
    container.querySelector('#mmZoomReset').onclick = fitToScreen;

    const toolbar = container.querySelector('.mm-toolbar');
    let isContainerDragging = false;
    let startCX = 0, startCY = 0;
    let startLeft = 0, startTop = 0;

    toolbar.addEventListener('mousedown', (e) => {
        if (e.target.tagName === 'SELECT') return;
        isContainerDragging = true;
        const rect = container.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        startCX = e.clientX;
        startCY = e.clientY;
        container.style.left = `${rect.left}px`;
        container.style.top = `${rect.top}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.classList.add('minimap--dragging');
    });

    window.addEventListener('mousemove', (e) => {
        if (!isContainerDragging) return;
        const dx = e.clientX - startCX;
        const dy = e.clientY - startCY;
        container.style.left = `${startLeft + dx}px`;
        container.style.top = `${startTop + dy}px`;
    });

    window.addEventListener('mouseup', () => {
        if (!isContainerDragging) return;
        isContainerDragging = false;
        container.classList.remove('minimap--dragging');
    });

    const btnLock = container.querySelector('#mmLock');
    btnLock.onclick = () => {
        isMapLocked = !isMapLocked;
        container.classList.toggle('locked', isMapLocked);
        btnLock.classList.toggle('active', isMapLocked);
        localStorage.setItem('minimap_locked', JSON.stringify(isMapLocked));
    };
    if (isMapLocked) btnLock.classList.add('active');

    container.querySelector('.floor-selector').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            const f = parseFloat(e.target.dataset.floor);
            if (!isNaN(f)) {
                setFloor(f);
            }
        }
    });
    
    const btnToggle = container.querySelector('#mmToggle');
    btnToggle.onclick = () => {
        const wasCollapsed = container.classList.contains('minimap--collapsed');
        container.classList.toggle('minimap--collapsed');
        const isCollapsed = container.classList.contains('minimap--collapsed');
        if (wasCollapsed && !isCollapsed) {
            try {
                const rect = container.getBoundingClientRect();
                const vw = window.innerWidth || document.documentElement.clientWidth;
                const vh = window.innerHeight || document.documentElement.clientHeight;
                let newLeft = rect.left;
                let newTop = rect.top;
                const margin = 12; 
                if (rect.right > vw - margin) newLeft = Math.max(margin, vw - rect.width - margin);
                if (rect.bottom > vh - margin) newTop = Math.max(margin, vh - rect.height - margin);
                container.style.left = `${newLeft}px`;
                container.style.top = `${newTop}px`;
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            } catch (e) {}
        }
        if (!wasCollapsed && isCollapsed) {
            try {
                const rect = container.getBoundingClientRect();
                const vw = window.innerWidth || document.documentElement.clientWidth;
                const vh = window.innerHeight || document.documentElement.clientHeight;
                let newLeft = rect.left;
                let newTop = rect.top;
                const margin = 4; 
                if (rect.right > vw - margin) newLeft = Math.max(margin, vw - rect.width - margin);
                if (rect.bottom > vh - margin) newTop = Math.max(margin, vh - rect.height - margin);
                if (rect.left < margin) newLeft = margin;
                if (rect.top < margin) newTop = margin;
                container.style.left = `${newLeft}px`;
                container.style.top = `${newTop}px`;
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            } catch (e) {}
        }
        window.dispatchEvent(new CustomEvent('minimap-toggle', { detail: { collapsed: isCollapsed } }));
    };

    container.querySelector('#mmGo').onclick = async () => {
        const from = selFrom.value;
        const to = selTo.value;
        if (from && to && from !== to) {
            const path = dijkstraPath(G, from, to);
            if (path.length) {
                visualizePath(path); // Dùng visualizePath để thống nhất hiệu ứng
                
                if (onPathPlay) {
                    try { onPathPlay(path); } catch (e) { console.error('onPathPlay error', e); }
                }
            } else {
                alert(currentLang === 'en' ? "No path found!" : "Không tìm thấy đường đi!");
            }
        }
    };
    container.querySelector('#mmClear').onclick = () => {
        highlightPath([]);
        resetViewAfterPath();
    };


    // --- 7. PUBLIC API & UTILS ---

    // [FIXED] Hàm kích hoạt hiệu ứng: Tự động chuyển tầng nếu cần
    function visualizePath(path) {
        if (!Array.isArray(path) || path.length === 0) return;

        console.log('[Minimap] Visualizing path:', path);

        // 1. Chuẩn hóa ID & Lưu global
        const safePath = path.map(p => String(p));
        activePath = safePath; // QUAN TRỌNG: Để setFloor đọc được

        // 2. Xác định tầng của điểm đến
        let targetFloor = currentFloor;
        // Lấy điểm cuối (đích)
        const targetId = safePath[safePath.length - 1]; 
        const targetNode = G.nodes.find(n => String(n.id) === String(targetId));
        
        if (targetNode) {
            targetFloor = targetNode.floor ?? 0;
        }

        // 3. Xử lý hiển thị
        if (targetFloor !== currentFloor) {
            // Khác tầng -> Gọi setFloor. 
            // setFloor sẽ load ảnh mới, và trong img.onload đã có logic check activePath để zoom.
            console.log(`[Minimap] Switching floor to ${targetFloor} for path`);
            setFloor(targetFloor); 
        } else {
            // Cùng tầng -> Vẽ và Zoom ngay
            console.log('[Minimap] Same floor, rendering now...');
            renderNodes();
            try { 
                focusPath(safePath);
            } catch (e) { console.error('Zoom error:', e); }
        }

        // 4. Hẹn giờ reset
        const STEP_MS = 1200; 
        const totalMs = Math.max(path.length, 1) * STEP_MS + 2500; 
        
        if (window.resetViewTimeout) clearTimeout(window.resetViewTimeout);
        window.resetViewTimeout = setTimeout(() => {
            resetViewAfterPath();
        }, totalMs);
    }
    
    function setActive(id) {
        activeId = id;
        const n = G.nodes.find(x => String(x.id) === String(id)); 
        if (n && (n.floor ?? 0) !== currentFloor) {
            setFloor(n.floor ?? 0);
        } else {
            renderNodes();
        }
        // Chọn giá trị trong select nếu có
        if (selFrom && selFrom.querySelector(`option[value="${id}"]`)) selFrom.value = id;
    }
    
    function highlightPath(path) {
        activePath = path || [];
        renderNodes();
    }
    
    // [UPDATED] Hỗ trợ đa ngôn ngữ cho Select box
    function fillSelects() {
        const byFloor = {};
        G.nodes.forEach(n => {
            const f = (n.floor ?? 0);
            if (!byFloor[f]) byFloor[f] = [];
            byFloor[f].push(n);
        });

        const floors = Object.keys(byFloor).map(k => parseFloat(k)).sort((a,b) => a - b);
        const prevFrom = selFrom.value;
        const prevTo = selTo.value;

        let html = '';
        floors.forEach(f => {
            const nodes = byFloor[f];
            if (!nodes || nodes.length === 0) return;
            
            // Dùng getFloorName
            html += `<optgroup label="${getFloorName(f)}">`;
            nodes.forEach(n => {
                // Dùng getSceneName
                const label = getSceneName(n.id).replace(/"/g, '&quot;');
                html += `<option value="${n.id}">${label}</option>`;
            });
            html += `</optgroup>`;
        });

        selFrom.innerHTML = html;
        selTo.innerHTML = html;
        if (prevFrom) selFrom.value = prevFrom;
        if (prevTo) selTo.value = prevTo;
    }
    
    function updateSelectsWithScenes(scenes, lang) {
        // Hàm này giữ lại để tương thích ngược nếu cần, nhưng logic chính đã chuyển vào fillSelects()
    }

    // [NEW] API đổi ngôn ngữ
    function setLanguage(lang) {
        if (currentLang === lang) return;
        currentLang = lang;
        console.log('[Minimap] Language switched to:', lang);
        
        updateUIText();
        fillSelects(); // Vẽ lại dropdown
        renderNodes(); // Vẽ lại map label
    }
    window.addEventListener('change-lang', (e) => {
        if (e.detail) {
            console.log('[Minimap] Language changed, re-rendering UI text and nodes.');
            updateUIText(); // Cập nhật tiêu đề, nút bấm của minimap
            renderNodes();  // Vẽ lại các nhãn trên bản đồ với ngôn ngữ mới
        }
    });

    // --- Init ---
    updateUIText();
    loadScenes().then(() => {
        console.log('[Minimap] Scenes loaded, count:', scenes.length);
        setTimeout(() => {
            setFloor(currentFloor);
            // Đảm bảo render nodes sau khi set floor
            if (G.nodes && G.nodes.length > 0) {
                renderNodes();
                console.log('[Minimap] Initial render completed, nodes:', G.nodes.length);
            }
        }, 50);
    });
    window.addEventListener('resize', fitToScreen);

    // Return API
    return { 
        setActive, 
        refresh: (g) => { 
            G = normalizeGraph(g); 
            console.log('[Minimap] Refreshed with graph:', { 
                nodeCount: G.nodes.length, 
                edgeCount: G.edges.length,
                currentFloor: currentFloor,
                visibleNodes: G.nodes.filter(n => (n.floor ?? 0) === currentFloor).length
            });
            renderNodes(); 
        }, 
        highlightPath, 
        updateSelectsWithScenes,
        setLanguage ,
        visualizePath, // [QUAN TRỌNG] Đã export hàm này
           // [QUAN TRỌNG] Hàm đổi ngôn ngữ
    };
} 

// --- UTILS HELPERS ---

function normalizeGraph(g) {
    const nodes = Array.isArray(g.nodes) ? g.nodes.filter(n => n.id) : [];
    const edges = Array.isArray(g.edges) ? g.edges.filter(e => e.from && e.to) : [];
    return { nodes, edges };
}

function dijkstraPath(G, startId, endId) {
    const nodes = G.nodes;
    const edges = G.edges;
    const adj = {};
    edges.forEach(e => {
        if (!adj[e.from]) adj[e.from] = [];
        if (!adj[e.to]) adj[e.to] = [];
        const weight = e.w || 1; 
        adj[e.from].push({ node: e.to, w: weight });
        adj[e.to].push({ node: e.from, w: weight }); 
    });
    const distances = {};
    const previous = {};
    const pq = new Set(); 
    nodes.forEach(n => {
        distances[n.id] = Infinity;
        pq.add(n.id);
    });
    distances[startId] = 0;
    while (pq.size > 0) {
        let minNode = null;
        for (const node of pq) {
            if (minNode === null || distances[node] < distances[minNode]) {
                minNode = node;
            }
        }
        if (!minNode || distances[minNode] === Infinity) break;
        if (minNode === endId) break; 
        pq.delete(minNode);
        const neighbors = adj[minNode] || [];
        for (const neighbor of neighbors) {
            if (!pq.has(neighbor.node)) continue;
            const alt = distances[minNode] + neighbor.w;
            if (alt < distances[neighbor.node]) {
                distances[neighbor.node] = alt;
                previous[neighbor.node] = minNode;
            }
        }
    }
    const path = [];
    let u = endId;
    if (previous[u] || u === startId) {
        while (u) {
            path.unshift(u); 
            u = previous[u]; 
        }
    }
    return path;
}