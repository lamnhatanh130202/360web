import '../../styles/style.css';

export function createMinimap(opts) {
    const {
        container,
        graph,
        onGotoScene,
        onPathPlay,
        navigationDelayMs = 3000,
        readOnly = false,
        mobileMode = false,
    } = opts || {};

    // --- 1. CONFIG & STATE ---
    
    // Chuẩn hóa dữ liệu đầu vào
    let G = normalizeGraph(graph || { nodes: [], edges: [] });

    // Cấu hình đường dẫn ảnh nền các tầng
    // Use ASCII filenames to avoid macOS Unicode normalization issues.
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
    // Cooldown để hạn chế chuyển scene quá nhanh
    let lastNavAt = 0;
    let pendingNavId = null;
    let navTimer = null;
    
    // [NEW] Quản lý ngôn ngữ
    let currentLang = localStorage.getItem('lang') || 'vi';

    // View State: quản lý Zoom & Pan
    let view = { scale: 1, x: 0, y: 0 }; 
    let savedView = null; 
    
    let stageWidth = 1000; 
    let stageHeight = 1000;

    // Zoom limits should depend on the current image size vs viewport.
    // A fixed SCALE_MIN (like 0.5) breaks large images because fit scale can be ~0.1,
    // causing zoom to jump to 0.5 and then never zoom out.
    const SCALE_ABS_MIN = 0.05;
    const SCALE_ABS_MAX = 3.0;

    function getFitScale() {
        const vpRect = viewport?.getBoundingClientRect?.();
        const vw = vpRect?.width || 0;
        const vh = vpRect?.height || 0;
        const sw = Number(stageWidth) || 0;
        const sh = Number(stageHeight) || 0;
        if (vw <= 0 || vh <= 0 || sw <= 0 || sh <= 0) return 1;
        return Math.min(vw / sw, vh / sh) * 0.95;
    }

    function getScaleMin() {
        const fit = getFitScale();
        // Allow zooming out a bit beyond fit, but never force min above 1.
        return Math.max(SCALE_ABS_MIN, Math.min(1, fit * 0.6));
    }

    function getScaleMax() {
        const fit = getFitScale();
        // Keep zoom-in reasonable relative to fit; cap globally.
        return Math.max(1.5, Math.min(SCALE_ABS_MAX, fit * 10));
    }

    function clampScale(s) {
        const min = getScaleMin();
        const max = getScaleMax();
        return Math.max(min, Math.min(max, s));
    }

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
                // Merge fetched scenes into current graph G so new scenes/nodes appear immediately
                try {
                    const scenesById = new Map();
                    scenes.forEach(s => { if (s && s.id) scenesById.set(String(s.id), s); });

                    const oldNodesMap = new Map();
                    if (G && G.nodes) G.nodes.forEach(n => oldNodesMap.set(String(n.id), n));

                    // Update existing nodes and add new ones from scenes
                    const merged = [];
                    scenesById.forEach((scene, idStr) => {
                        const old = oldNodesMap.get(idStr);
                        const nodeFromScene = {
                            id: scene.id,
                            name: scene.name || scene.title || scene.id,
                            floor: scene.floor ?? (old ? old.floor : 0),
                            positions: scene.positions || (old ? old.positions : undefined),
                        };
                        if (old) {
                            // preserve existing x/y unless scene provides positions with coordinates
                            nodeFromScene.x = old.x !== undefined && old.x !== null ? old.x : scene.x;
                            nodeFromScene.y = old.y !== undefined && old.y !== null ? old.y : scene.y;
                            // merge other props
                            Object.assign(nodeFromScene, old, scene);
                        } else {
                            // new node
                            if (scene.x !== undefined) nodeFromScene.x = scene.x;
                            if (scene.y !== undefined) nodeFromScene.y = scene.y;
                        }
                        merged.push(nodeFromScene);
                        // remove from oldNodesMap so we can keep nodes that are not in scenes as well
                        oldNodesMap.delete(idStr);
                    });

                    // Keep any old nodes not present in scenes (avoid losing nodes)
                    oldNodesMap.forEach(v => merged.push(v));

                    // Keep edges as before
                    G = { nodes: merged, edges: G.edges || [] };
                } catch (e) {
                    console.warn('[Minimap] Failed to merge scenes into graph:', e);
                }

                // Load xong thì cập nhật lại tên trên UI ngay
                fillSelects();
                renderNodes();
            }
        } catch (e) {
            console.warn('[Minimap] Failed to load scenes:', e);
        }
    }

    // --- Graph loader & auto-positioning ---
    async function ensureNodePositions() {
        // Find nodes missing positions (x/y and positions)
        const missing = G.nodes.filter(n => (n.x === undefined || n.x === null) && (n.positions === undefined || Object.keys(n.positions || {}).length === 0));
        if (!missing || missing.length === 0) return false;

        console.log('[Minimap] Auto-placing', missing.length, 'nodes');

        // Group by floor
        const byFloor = {};
        missing.forEach(n => {
            const f = (n.floor ?? 0);
            byFloor[f] = byFloor[f] || [];
            byFloor[f].push(n);
        });

        Object.keys(byFloor).forEach(fk => {
            const nodes = byFloor[fk];
            const floor = parseFloat(fk);

            // Use current stage dimensions (fallback to defaults)
            const w = stageWidth || 1000;
            const h = stageHeight || 1000;

            const n = nodes.length;
            const cols = Math.ceil(Math.sqrt(n));
            const rows = Math.ceil(n / cols);
            const padX = Math.max(80, Math.floor(w * 0.08));
            const padY = Math.max(80, Math.floor(h * 0.08));
            const spacingX = (w - padX * 2) / (cols + 1);
            const spacingY = (h - padY * 2) / (rows + 1);

            nodes.forEach((node, idx) => {
                const col = idx % cols;
                const row = Math.floor(idx / cols);
                const x = Math.round(padX + spacingX * (col + 1));
                const y = Math.round(padY + spacingY * (row + 1));
                node.x = node.x !== undefined && node.x !== null ? node.x : x;
                node.y = node.y !== undefined && node.y !== null ? node.y : y;
                // also add positions object keyed by floor for compatibility
                if (!node.positions || Object.keys(node.positions || {}).length === 0) {
                    node.positions = {};
                    node.positions[String(floor)] = { x: node.x, y: node.y };
                }
            });
        });

        // Persist merged graph to backend so positions are kept
        try {
            const payload = { nodes: G.nodes, edges: G.edges };
            const res = await fetch('/api/graph', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
            if (res.ok) {
                console.log('[Minimap] Persisted auto-generated positions to /api/graph');
                return true;
            } else {
                console.warn('[Minimap] Failed to persist graph:', res.statusText);
            }
        } catch (e) {
            console.warn('[Minimap] Error persisting graph:', e);
        }

        return false;
    }

    async function loadGraph() {
        try {
            const res = await fetch('/api/graph?t=' + Date.now());
            if (!res.ok) throw new Error('Failed to load graph');
            const data = await res.json();
            // Normalize
            const newGraph = normalizeGraph(data || { nodes: [], edges: [] });

            // Merge: keep existing node props if present
            const oldMap = new Map();
            if (G && G.nodes) G.nodes.forEach(n => oldMap.set(String(n.id), n));

            const mergedNodes = newGraph.nodes.map(n => {
                const id = String(n.id);
                const old = oldMap.get(id);
                if (old) return { ...old, ...n };
                return n;
            });

            // Add any old nodes not present in new graph
            oldMap.forEach((v, k) => {
                if (!mergedNodes.find(n => String(n.id) === k)) mergedNodes.push(v);
            });

            G = { nodes: mergedNodes, edges: newGraph.edges };

            // If some nodes missing positions, auto-generate and persist
            const hadMissing = await ensureNodePositions();
            if (hadMissing) {
                // reload graph from server to get authoritative saved data
                try { await new Promise(r => setTimeout(r, 220)); } catch {}
                return loadGraph();
            }

            // Update scenes list (for names) as well
            await loadScenes();
            renderNodes();
            return true;
        } catch (e) {
            console.warn('[Minimap] loadGraph failed:', e);
            // fallback to loading scenes only
            await loadScenes();
            renderNodes();
            return false;
        }
    }

    // --- 2. DOM STRUCTURE ---

    try { isMapLocked = JSON.parse(localStorage.getItem('minimap_locked') || 'false'); } catch { }
    // Trên mobile, luôn cho phép kéo để tránh hiểu nhầm khoá
    if (mobileMode) {
        isMapLocked = false;
        localStorage.setItem('minimap_locked', 'false');
    }
    if (isMapLocked) container.classList.add('locked');
    container.classList.add('minimap');
    if (mobileMode) container.classList.add('minimap--mobile');
    if (readOnly) container.classList.add('minimap--readonly');
    
    container.innerHTML = `
    <div class="mm-toolbar">
        <div class="mm-route">
            <select id="mmFrom"></select>
            <span>→</span>
            <select id="mmTo"></select>
            <button id="mmGo">Tìm đường</button>
            <button id="mmClear">Làm Mới</button>
        </div>
        <button class="mm-toggle" id="mmToggle">Thu</button>
    </div>

    <div class="mm-viewport" id="mmViewport" style="overflow: hidden; position: relative; width: 100%; height: 100%; background: #e5e5e5; user-select: none; touch-action: none;">
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
    const floorSelectorEl = container.querySelector('.floor-selector');

    // Ẩn các controls tìm đường khi ở chế độ read-only/mobile
    try {
        if (readOnly || mobileMode) {
            const routeEl = container.querySelector('.mm-route');
            if (routeEl) routeEl.style.display = 'none';
            const zoomEl = container.querySelector('.mm-zoom');
            if (zoomEl) zoomEl.style.display = 'none';
            // Move floor selector into toolbar and lay out horizontally on mobile
            const toolbarEl = container.querySelector('.mm-toolbar');
            if (floorSelectorEl && toolbarEl) {
                floorSelectorEl.classList.add('floor-selector--inline');
                toolbarEl.insertBefore(floorSelectorEl, container.querySelector('#mmToggle'));
            }
            const controlsEl = container.querySelector('.mm-controls');
            if (controlsEl) controlsEl.style.display = 'none';
        }
    } catch {}

    // [NEW] Cập nhật text nút bấm theo ngôn ngữ
    function updateUIText() {
        const isEn = currentLang === 'en';
        container.querySelector('#mmGo').innerText = isEn ? 'Find' : 'Tìm đường';
        container.querySelector('#mmClear').innerText = isEn ? 'Clear' : 'Làm Mới';
        container.querySelector('#mmToggle').innerText = isEn ? 'Hide' : 'Thu';
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
            // Nếu đang có đường đi active trên tầng hiện tại, tự động focus vào đường đi
            try {
                const hasPath = Array.isArray(activePath) && activePath.length > 1;
                if (hasPath) {
                    const nodesOnThisFloor = activePath.filter(id => {
                        const n = G.nodes.find(node => String(node.id) === String(id));
                        return n && (n.floor ?? 0) === currentFloor;
                    });
                    if (nodesOnThisFloor.length > 0) {
                        focusPath(activePath);
                    } else {
                        fitToScreen();
                    }
                } else {
                    fitToScreen();
                }
            } catch (_) {
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

    // Tìm các node có thể đi tới trực tiếp từ nodeId (edges có hướng: from -> to)
    function findConnectedNodes(nodeId) {
        const connected = [];
        const nodeIdStr = String(nodeId);
        G.edges.forEach(edge => {
            if (String(edge.from) === nodeIdStr) {
                connected.push(edge.to);
            }
        });
        return connected;
    }

    // Hiện label của node
    function showNodeLabel(nodeId) {
        const nodeIdStr = String(nodeId);
        const label = content.querySelector(`.mm-label[data-node-id="${nodeIdStr}"]`);
        if (label) {
            label.style.opacity = '1';
            label.style.transition = 'opacity 0.2s ease';
        }
    }

    // Ẩn label của node
    function hideNodeLabel(nodeId) {
        const nodeIdStr = String(nodeId);
        const label = content.querySelector(`.mm-label[data-node-id="${nodeIdStr}"]`);
        if (label) {
            // Không ẩn nếu là node đang active hoặc trong active path
            const isActiveNode = String(activeId) === nodeIdStr;
            const isInActivePath = activePath && activePath.includes(nodeIdStr);
            if (!isActiveNode && !isInActivePath) {
                label.style.opacity = '0';
                label.style.transition = 'opacity 0.2s ease';
            }
        }
    }

    // Voice: đọc tên node (text-to-speech)
    let currentSpeech = null;
    let lastSpokenNodeId = null; // Tránh đọc lại cùng một node liên tục
    function speakNodeName(nodeId, name) {
        // Tránh đọc lại cùng một node
        if (lastSpokenNodeId === nodeId) return;
        lastSpokenNodeId = nodeId;
        
        // Dừng speech trước đó nếu có
        if (currentSpeech && window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        
        // Kiểm tra xem có hỗ trợ speech synthesis không
        if (!window.speechSynthesis) {
            console.log('[Minimap] Speech synthesis not supported');
            return;
        }

        // Tạo utterance
        const utterance = new SpeechSynthesisUtterance(name);
        
        // Cài đặt ngôn ngữ dựa trên currentLang
        if (currentLang === 'vi') {
            utterance.lang = 'vi-VN';
        } else {
            utterance.lang = 'en-US';
        }
        
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 0.8;
        
        currentSpeech = utterance;
        window.speechSynthesis.speak(utterance);
    }

    // Chuyển đổi tọa độ chuột (clientX, clientY) sang tọa độ stage (x, y)
    function getStageCoords(clientX, clientY) {
        const vpRect = viewport.getBoundingClientRect();
        const mouseX = clientX - vpRect.left;
        const mouseY = clientY - vpRect.top;
        
        // Chuyển đổi sang tọa độ stage (tính đến transform)
        const stageX = (mouseX - view.x) / view.scale;
        const stageY = (mouseY - view.y) / view.scale;
        
        return { x: stageX, y: stageY };
    }

    // Tìm node gần nhất tại vị trí chuột (chỉ tìm node gần nhất, không phải tất cả trong bán kính)
    function findClosestNode(stageX, stageY, radius = 50) {
        let closest = null;
        let minDistance = radius;
        const visibleNodes = G.nodes.filter(n => (n.floor ?? 0) === currentFloor);
        
        visibleNodes.forEach(n => {
            const pos = getNodePosition(n, currentFloor);
            const dx = stageX - pos.x;
            const dy = stageY - pos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance <= minDistance) {
                minDistance = distance;
                closest = n;
            }
        });
        
        return closest;
    }

    // Chỉ hiện labels của các node có liên kết với node gần vị trí chuột (không hiện node gần nhất)
    let currentlyShowingLabels = new Set(); // Track các node đang hiện label
    function showNearbyLabels(stageX, stageY) {
        // Ẩn tất cả labels trước đó (trừ active node và active path)
        currentlyShowingLabels.forEach(nodeId => {
            const nodeIdStr = String(nodeId);
            const isActiveNode = String(activeId) === nodeIdStr;
            const isInActivePath = activePath && activePath.includes(nodeIdStr);
            if (!isActiveNode && !isInActivePath) {
                hideNodeLabel(nodeId);
            }
        });
        currentlyShowingLabels.clear();
        
        // Tìm node gần nhất (để xác định các node kết nối)
        // Radius should be in screen pixels, not stage units (otherwise it changes with zoom).
        const radiusPx = 50;
        const scale = Math.max(0.001, Number(view?.scale) || 1);
        const radiusStage = radiusPx / scale;
        const closestNode = findClosestNode(stageX, stageY, radiusStage);
        
        if (closestNode) {
            // KHÔNG hiện label của node gần nhất, chỉ hiện label của các node có kết nối trực tiếp
            const connectedNodes = findConnectedNodes(closestNode.id);
            connectedNodes.forEach(nodeId => {
                showNodeLabel(nodeId);
                currentlyShowingLabels.add(String(nodeId));
            });
        } else {
            // Không có node gần nào -> đảm bảo ẩn tất cả labels (trừ active node)
            // Có thể có labels từ node/edge hover đang hiện, cần ẩn chúng
            const allLabels = content.querySelectorAll('.mm-label');
            allLabels.forEach(label => {
                const nodeId = label.dataset.nodeId;
                if (nodeId) {
                    const nodeIdStr = String(nodeId);
                    const isActiveNode = String(activeId) === nodeIdStr;
                    const isInActivePath = activePath && activePath.includes(nodeIdStr);
                    if (!isActiveNode && !isInActivePath) {
                        hideNodeLabel(nodeId);
                    }
                }
            });
        }
    }

    // Ẩn tất cả labels khi rời khỏi minimap (trừ node active)
    function hideAllLabels() {
        currentlyShowingLabels.forEach(nodeId => {
            const nodeIdStr = String(nodeId);
            const isActiveNode = String(activeId) === nodeIdStr;
            const isInActivePath = activePath && activePath.includes(nodeIdStr);
            if (!isActiveNode && !isInActivePath) {
                hideNodeLabel(nodeId);
            }
        });
        currentlyShowingLabels.clear();
        lastSpokenNodeId = null; // Reset để có thể đọc lại sau này
    }

    function renderNodes() {
        console.log('[Minimap] renderNodes called, G.nodes.length:', G.nodes?.length || 0, 'currentFloor:', currentFloor);
        content.innerHTML = '';
        currentlyShowingLabels.clear(); // Reset labels khi render lại
        lastSpokenNodeId = null; // Reset voice

        const hasActivePath = Array.isArray(activePath) && activePath.length > 1;
        const activeSet = hasActivePath ? new Set(activePath) : null;
        
        const visibleNodes = G.nodes.filter(n => (n.floor ?? 0) === currentFloor);
        const visibleIds = new Set(visibleNodes.map(n => n.id));
        console.log('[Minimap] Visible nodes on floor', currentFloor, ':', visibleNodes.length);

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
            
            const edge = drawEdge(p1.x, p1.y, p2.x, p2.y, edgeOpacity, isInPath);
            // Lưu thông tin edge để có thể hover
            if (edge) {
                edge.dataset.edgeFrom = e.from;
                edge.dataset.edgeTo = e.to;
                // Hover vào edge: hiện label của 2 node kết nối
                edge.addEventListener('mouseenter', () => {
                    showNodeLabel(e.from);
                    showNodeLabel(e.to);
                });
                edge.addEventListener('mouseleave', (e) => {
                    // Chỉ ẩn nếu không có node/edge nào đang được hover
                    const relatedElement = e.relatedTarget;
                    if (!relatedElement || (!relatedElement.closest('.mm-dot') && !relatedElement.closest('.mm-edge'))) {
                        hideNodeLabel(e.from);
                        hideNodeLabel(e.to);
                        currentlyShowingLabels.delete(String(e.from));
                        currentlyShowingLabels.delete(String(e.to));
                    }
                });
            }
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
                if (readOnly || mobileMode) {
                    // Chế độ mobile/read-only: chỉ hiển thị nhãn, không điều hướng
                    showNodeLabel(n.id);
                    return;
                }
                if (!onGotoScene) return;
                const now = Date.now();
                const elapsed = now - lastNavAt;

                // Nếu đang trong cooldown, xếp yêu cầu điều hướng cuối cùng và chạy sau
                if (elapsed < navigationDelayMs) {
                    pendingNavId = n.id;
                    const waitMs = navigationDelayMs - elapsed;
                    if (navTimer) clearTimeout(navTimer);
                    navTimer = setTimeout(() => {
                        if (pendingNavId != null) {
                            lastNavAt = Date.now();
                            try { onGotoScene(pendingNavId); } catch (err) {}
                            pendingNavId = null;
                        }
                    }, Math.max(150, waitMs));
                    return;
                }

                // Thực hiện điều hướng ngay và bắt đầu cooldown
                lastNavAt = now;
                try { onGotoScene(n.id); } catch (err) {}
            };

            const label = document.createElement('div');
            label.className = 'mm-label';
            label.innerText = name;
            label.style.left = `${pos.x}px`;
            label.style.top = `${pos.y}px`;
            label.style.transform = 'translate(-50%, -150%)';
            label.style.opacity = '0'; // Ẩn label mặc định
            label.style.pointerEvents = 'none';
            label.dataset.nodeId = n.id; // Lưu node ID để dễ tìm

            // Nếu là node đang active, luôn hiện label
            const isActiveNode = String(n.id) === String(activeId);
            
            // Ưu tiên: node active > active path > ẩn
            if (isActiveNode) {
                label.style.opacity = '1'; // Luôn hiện label của node đang active
                label.style.transition = 'opacity 0.2s ease';
            } else if (hasActivePath && activeSet.has(String(n.id))) {
                label.style.opacity = '1'; // Hiện label nếu trong path
            } else if (hasActivePath && !activeSet.has(String(n.id))) {
                label.style.opacity = '0.2'; // Làm mờ labels không trong path
            } else {
                label.style.opacity = '0'; // Ẩn hoàn toàn nếu không trong path và không phải active
            }

            // Hover vào node: hiện label của node đó và các node kết nối
            let isHovered = false;
            dot.addEventListener('mouseenter', (e) => {
                e.stopPropagation();
                isHovered = true;
                showNodeLabel(n.id);
                // Tìm các node kết nối và hiện label của chúng
                const connectedNodes = findConnectedNodes(n.id);
                connectedNodes.forEach(nodeId => {
                    showNodeLabel(nodeId);
                });
                // Voice đã tắt theo yêu cầu
            });

            dot.addEventListener('mouseleave', (e) => {
                e.stopPropagation();
                // Khi rời khỏi node, kiểm tra xem có đang hover vào node/edge khác không
                const relatedElement = e.relatedTarget;
                if (!relatedElement || (!relatedElement.closest('.mm-dot') && !relatedElement.closest('.mm-edge'))) {
                    // Không hover vào node/edge nào khác, ẩn labels
                    hideNodeLabel(n.id);
                    const connectedNodes = findConnectedNodes(n.id);
                    connectedNodes.forEach(nodeId => {
                        hideNodeLabel(nodeId);
                    });
                    currentlyShowingLabels.delete(String(n.id));
                    connectedNodes.forEach(nodeId => {
                        currentlyShowingLabels.delete(String(nodeId));
                    });
                }
            });

            content.appendChild(dot);
            content.appendChild(label);
        });

        console.log('[Minimap] renderNodes completed, dots rendered:', visibleNodes.length, 'activeId:', activeId);
        // KHÔNG vẽ path highlight riêng nữa vì đã được vẽ trong phần edges ở trên
        // Path highlight đã được xử lý trong logic vẽ edges với opacity khác nhau
    }

    // --- Traveler dot animation ---
    let travelDot = null;
    function ensureTravelDot() {
        if (!travelDot) {
            travelDot = document.createElement('div');
            travelDot.className = 'mm-travel-dot';
            content.appendChild(travelDot);
            travelDot.style.display = 'none';
        } else if (!content.contains(travelDot)) {
            content.appendChild(travelDot);
        }
    }
    function setDotAt(x, y) {
        ensureTravelDot();
        travelDot.style.left = `${x}px`;
        travelDot.style.top = `${y}px`;
        travelDot.style.transform = 'translate(-50%, -50%)';
    }
    // Tính toán scale "vừa đủ" cho một đoạn tuyến
    function computeSegmentScale(p0, p1, padding = 140) {
        const vpRect = viewport.getBoundingClientRect();
        const minX = Math.min(p0.x, p1.x);
        const maxX = Math.max(p0.x, p1.x);
        const minY = Math.min(p0.y, p1.y);
        const maxY = Math.max(p0.y, p1.y);
        const contentW = Math.max(1, (maxX - minX) + padding * 2);
        const contentH = Math.max(1, (maxY - minY) + padding * 2);
        const scaleW = vpRect.width / contentW;
        const scaleH = vpRect.height / contentH;
        let s = Math.min(scaleW, scaleH) * 1.0; // vừa đủ
        s = clampScale(s);
        return s;
    }

    function animateSegment(p0, p1, duration = 550, targetScaleOverride = null) {
        ensureTravelDot();
        travelDot.style.display = 'block';
        const t0 = performance.now();
        const vpRect = viewport.getBoundingClientRect();
        const startScale = view.scale;
        const targetScale = targetScaleOverride != null ? targetScaleOverride : computeSegmentScale(p0, p1);
        return new Promise(resolve => {
            (function step(now){
                const p = Math.min(1, (now - t0) / duration);
                const ease = 1 - Math.pow(1 - p, 3);
                const x = p0.x + (p1.x - p0.x) * ease;
                const y = p0.y + (p1.y - p0.y) * ease;
                setDotAt(x, y);
                // Pan & zoom theo điểm di chuyển để luôn nhìn rõ đoạn tuyến
                const currentScale = startScale + (targetScale - startScale) * ease;
                view.scale = clampScale(currentScale);
                view.x = vpRect.width / 2 - x * view.scale;
                view.y = vpRect.height / 2 - y * view.scale;
                updateTransform();
                if (p < 1) requestAnimationFrame(step); else resolve();
            })(t0);
        });
    }
    async function playTravel(path) {
        try {
            if (!Array.isArray(path) || path.length < 2) return Promise.resolve();
            const ids = path.map(String);
            // Focus visible part of path for better context
            try { focusPath(ids); } catch(_) {}
            autoFitLock = true; // tránh tự động fit trong lúc theo tuyến
            // Handle floor changes: when a segment crosses floors, jump dot after switching floor
            for (let i = 0; i < ids.length - 1; i++) {
                const aId = ids[i];
                const bId = ids[i+1];
                const aNode = G.nodes.find(n => String(n.id) === aId);
                const bNode = G.nodes.find(n => String(n.id) === bId);
                if (!aNode || !bNode) continue;
                const aFloor = aNode.floor ?? 0;
                const bFloor = bNode.floor ?? 0;
                if (aFloor !== currentFloor) setFloor(aFloor);
                const pA = getNodePosition(aNode, aFloor);
                const pB = getNodePosition(bNode, bFloor);
                if (aFloor !== bFloor) {
                    // Place dot at last point on current floor, then switch floor and continue
                    setDotAt(pA.x, pA.y);
                    travelDot.style.display = 'block';
                    setFloor(bFloor);
                    const pB2 = getNodePosition(bNode, bFloor);
                    setDotAt(pB2.x, pB2.y);
                } else {
                    const segScale = computeSegmentScale(pA, pB);
                    await animateSegment(pA, pB, 600, segScale);
                }
            }
            // Keep dot at final target briefly
            setTimeout(() => { if (travelDot) travelDot.style.display = 'none'; }, 800);
            autoFitLock = false;
        } catch (e) { console.warn('[Minimap] playTravel error:', e); }
        return Promise.resolve();
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
        line.style.pointerEvents = 'auto'; // Cho phép hover trên edge
        line.style.cursor = 'pointer';
        
        content.appendChild(line);
        return line; // Trả về element để có thể thêm event listeners
    }


    // --- 4. TRANSFORM & ZOOM LOGIC ---

    // Prevent unintended auto-fit during user interaction
    let autoFitLock = false;

    function updateTransform() {
        stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
        try {
            // Expose current scale to CSS so labels and dots can remain readable
            container.style.setProperty('--mm-scale', String(view.scale));
        } catch (e) { /* ignore */ }
    }

    function fitToScreen(force = false) {
        if (autoFitLock && !force) return;
        const vpRect = viewport.getBoundingClientRect();
        if (vpRect.width === 0 || stageWidth === 0) return;
        const scaleW = vpRect.width / stageWidth;
        const scaleH = vpRect.height / stageHeight;
        let newScale = Math.min(scaleW, scaleH) * 0.95;
        // On mobile, avoid upscaling the background image (looks like the minimap is "too big").
        if (mobileMode) newScale = Math.min(1, newScale);
        const newX = (vpRect.width - stageWidth * newScale) / 2;
        const newY = (vpRect.height - stageHeight * newScale) / 2;
        view = { scale: newScale, x: newX, y: newY };
        updateTransform();
    }

    function focusPath(path) {
        // Zoom and pan to fit the path bounding box centered in viewport.
        if (!Array.isArray(path) || path.length === 0) return;
        if (!savedView) savedView = { ...view };

        const nodesOnPath = [];
        path.forEach(id => {
            const n = G.nodes.find(node => String(node.id) === String(id));
            if (!n) return;
            if ((n.floor ?? 0) === currentFloor) {
                const pos = getNodePosition(n, currentFloor);
                if (pos) nodesOnPath.push(pos);
            }
        });

        if (nodesOnPath.length === 0) return;

        const xs = nodesOnPath.map(p => p.x);
        const ys = nodesOnPath.map(p => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;

        const vpRect = viewport.getBoundingClientRect();
        const padding = 120;
        const contentW = Math.max(1, (maxX - minX) + padding * 2);
        const contentH = Math.max(1, (maxY - minY) + padding * 2);
        const scaleW = vpRect.width / contentW;
        const scaleH = vpRect.height / contentH;
        let targetScale = Math.min(scaleW, scaleH) * 1.05; // just enough
        targetScale = clampScale(targetScale);

        const startScale = view.scale;
        const startX = view.x;
        const startY = view.y;
        const newX = vpRect.width / 2 - cx * targetScale;
        const newY = vpRect.height / 2 - cy * targetScale;

        const duration = 500;
        const t0 = performance.now();
        (function animate(now){
            const p = Math.min(1, (now - t0) / duration);
            const ease = 1 - Math.pow(1 - p, 3);
            const currentScale = startScale + (targetScale - startScale) * ease;
            view.scale = currentScale;
            view.x = startX + (newX - startX) * ease;
            view.y = startY + (newY - startY) * ease;
            updateTransform();
            if (p < 1) requestAnimationFrame(animate);
        })(t0);
    }

    // Focus a single node (center + optional zoom)
    function focusNode(nodeId, opts = { zoom: true }) {
        if (!nodeId) return;
        const n = G.nodes.find(node => String(node.id) === String(nodeId));
        if (!n) return;

        const pos = getNodePosition(n, currentFloor);
        if (!pos) return;

        // Compute target scale (slightly zoomed in) or keep current
        let newScale = view.scale;
        if (opts.zoom) {
            // Use an absolute target scale instead of multiplying to avoid accumulation
            const fitScale = getFitScale();
            // Aim for a moderate zoom (slightly above fit), without jumping too far.
            newScale = Math.max(view.scale, fitScale * 1.1);
            newScale = clampScale(newScale);
        }

        const vpRect = viewport.getBoundingClientRect();
        const newX = vpRect.width / 2 - pos.x * newScale;
        const newY = vpRect.height / 2 - pos.y * newScale;

        // Smooth animation to the target
        const startScale = view.scale;
        const startX = view.x;
        const startY = view.y;
        const duration = 350;
        const startTime = performance.now();

        function animate(now) {
            const elapsed = now - startTime;
            const t = Math.min(1, elapsed / duration);
            const ease = 1 - Math.pow(1 - t, 3);
            view.scale = startScale + (newScale - startScale) * ease;
            view.x = startX + (newX - startX) * ease;
            view.y = startY + (newY - startY) * ease;
            updateTransform();
            if (t < 1) requestAnimationFrame(animate);
        }
        requestAnimationFrame(animate);
    }

    function resetViewAfterPath() {
        // Always return to normal fit after path playback
        savedView = null;
        autoFitLock = false;
        fitToScreen(true);
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
        newScale = clampScale(newScale);
        view.x = mouseX - stageX * newScale;
        view.y = mouseY - stageY * newScale;
        view.scale = newScale;
        updateTransform();
    }


    // --- 5. EVENT LISTENERS ---

    // Throttle wheel zoom and make steps gentler to avoid overshoot
    let lastWheelTs = 0;
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        autoFitLock = true;
        const now = performance.now();
        if (now - lastWheelTs < 30) return; // throttle
        lastWheelTs = now;
        const step = e.deltaY > 0 ? 0.96 : 1.04; // gentler zoom
        zoomAt(step, e.clientX, e.clientY);
    }, { passive: false });

    let isDragging = false;
    let startX = 0, startY = 0;
    
    // Tắt kéo nội dung minimap trên mọi thiết bị (chỉ cho phép zoom)
    viewport.addEventListener('mousedown', (e) => {
        return; // no-op: disable content panning
    });

    window.addEventListener('mousemove', (e) => { /* no content pan */ });

    window.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            container.style.cursor = '';
        }
    });

            viewport.addEventListener('touchstart', (e) => { /* no content pan on touch */ }, { passive: false });
    
    window.addEventListener('touchmove', (e) => { /* no content pan on touch */ }, { passive: false });
    
    window.addEventListener('touchend', () => { /* no content pan */ });

    // Khi di chuyển chuột trên minimap: hiện labels của các node gần đó
    let mouseMoveTimeout = null;
    viewport.addEventListener('mousemove', (e) => {
        // Bỏ qua nếu đang drag
        if (isDragging) {
            // Khi đang drag, ẩn tất cả labels
            hideAllLabels();
            return;
        }
        
        // Nếu đang hover trực tiếp vào node/edge, để logic hover riêng xử lý
        if (e.target.closest('.mm-dot') || e.target.closest('.mm-edge')) {
            return;
        }
        
        // Debounce để tránh quá nhiều tính toán
        if (mouseMoveTimeout) {
            clearTimeout(mouseMoveTimeout);
        }
        
        mouseMoveTimeout = setTimeout(() => {
            const stageCoords = getStageCoords(e.clientX, e.clientY);
            showNearbyLabels(stageCoords.x, stageCoords.y);
        }, 50); // Delay 50ms để mượt hơn
    });

    // Khi rời khỏi viewport: ẩn tất cả labels
    viewport.addEventListener('mouseleave', () => {
        if (mouseMoveTimeout) {
            clearTimeout(mouseMoveTimeout);
            mouseMoveTimeout = null;
        }
        hideAllLabels();
    });


    // --- 6. CONTROLS EVENTS ---

    container.querySelector('#mmZoomIn').onclick = () => {
        const rect = viewport.getBoundingClientRect();
        zoomAt(1.08, rect.left + rect.width/2, rect.top + rect.height/2);
    };
    container.querySelector('#mmZoomOut').onclick = () => {
        const rect = viewport.getBoundingClientRect();
        zoomAt(0.92, rect.left + rect.width/2, rect.top + rect.height/2);
    };
    container.querySelector('#mmZoomReset').onclick = () => { autoFitLock = false; savedView = null; fitToScreen(true); };

    const toolbar = container.querySelector('.mm-toolbar');
    let isContainerDragging = false;
    let startCX = 0, startCY = 0;
    let startLeft = 0, startTop = 0;

    // Helper: determine if the event target is an interactive control
    function isInteractiveTarget(el) {
        if (!el) return false;
        const tag = el.tagName;
        if (tag === 'BUTTON' || tag === 'SELECT' || tag === 'INPUT' || tag === 'A') return true;
        // Floor selector or any route controls inside toolbar
        if (el.closest('.floor-selector') || el.closest('.mm-route')) return true;
        // The collapse toggle button
        if (el.closest('#mmToggle')) return true;
        return false;
    }

    toolbar.addEventListener('mousedown', (e) => {
        if (isInteractiveTarget(e.target)) return;
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

    // Mobile: touch drag on toolbar to move minimap panel
    toolbar.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        // Do not start drag when interacting with controls
        const target = e.target;
        if (isInteractiveTarget(target)) return;
        const t = e.touches[0];
        isContainerDragging = true;
        const rect = container.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        startCX = t.clientX;
        startCY = t.clientY;
        container.style.left = `${rect.left}px`;
        container.style.top = `${rect.top}px`;
        container.style.right = 'auto';
        container.style.bottom = 'auto';
        container.classList.add('minimap--dragging');
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        if (!isContainerDragging || e.touches.length !== 1) return;
        const t = e.touches[0];
        const dx = t.clientX - startCX;
        const dy = t.clientY - startCY;
        // Clamp within viewport bounds
        const vw = window.innerWidth || document.documentElement.clientWidth;
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const rect = container.getBoundingClientRect();
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;
        newLeft = Math.max(0, Math.min(newLeft, vw - rect.width));
        newTop = Math.max(0, Math.min(newTop, vh - rect.height));
        container.style.left = `${Math.round(newLeft)}px`;
        container.style.top = `${Math.round(newTop)}px`;
        e.preventDefault();
    }, { passive: false });

    window.addEventListener('touchend', () => {
        if (!isContainerDragging) return;
        isContainerDragging = false;
        container.classList.remove('minimap--dragging');
    }, { passive: true });

    // Lock control removed (auto-locked behavior); no UI button

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
                // If there's a voice command button (BOT), position the collapsed minimap
                // just below it (preferred). Otherwise, fall back to keeping inside viewport.
                const rect = container.getBoundingClientRect();
                const vw = window.innerWidth || document.documentElement.clientWidth;
                const vh = window.innerHeight || document.documentElement.clientHeight;
                const voiceBtn = document.querySelector('#voice-command-btn');
                const gap = 8;
                let newLeft = rect.left;
                let newTop = rect.top;

                if (voiceBtn) {
                    const vRect = voiceBtn.getBoundingClientRect();
                    // Place the minimap immediately below the voice button.
                    // Use fixed positioning relative to viewport so it stays anchored.
                    container.style.position = 'fixed';
                    // Try align right edges of minimap with voice button
                    newLeft = Math.max(8, Math.min(vRect.right - rect.width, vw - rect.width - 8));
                    // If the voice button is near bottom, place minimap below it; otherwise use bottom spacing
                    newTop = vRect.bottom + gap;
                    // Ensure it doesn't go off-screen vertically
                    if (newTop + rect.height > vh - 8) {
                        // instead place it above the voice button
                        newTop = Math.max(8, vRect.top - gap - rect.height);
                    }
                } else {
                    // fallback: keep inside viewport with small margin
                    const margin = 4;
                    if (rect.right > vw - margin) newLeft = Math.max(margin, vw - rect.width - margin);
                    if (rect.bottom > vh - margin) newTop = Math.max(margin, vh - rect.height - margin);
                    if (rect.left < margin) newLeft = margin;
                    if (rect.top < margin) newTop = margin;
                }

                container.style.left = `${Math.round(newLeft)}px`;
                container.style.top = `${Math.round(newTop)}px`;
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
            // Cùng tầng -> chỉ render, KHÔNG zoom minimap
            console.log('[Minimap] Same floor, rendering without zoom...');
            renderNodes();
        }

        // 4. Hẹn giờ reset
        // Align reset timing with app navigation pacing to avoid mid-route reset
        const steps = Math.max(safePath.length - 1, 0);
        const stepDelay = Number(navigationDelayMs || 0) || 0; // provided via opts
        const fadeBuffer = 600; // extra buffer for fades/processing
        const totalMs = steps * stepDelay + fadeBuffer + 1200; 
        
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
            // Hiện label node active và các node kề (giống hover) — không pan
            setTimeout(() => {
                if (!activeId) return;
                showNodeLabel(activeId);
                currentlyShowingLabels.add(String(activeId));
                const neighbors = findConnectedNodes(activeId) || [];
                neighbors.forEach(nodeId => {
                    showNodeLabel(nodeId);
                    currentlyShowingLabels.add(String(nodeId));
                });
            }, 0);
            // Nếu người dùng đã zoom quá đà, tự động trả về vừa màn hình sau khi đổi scene
            try {
                const vpRect = viewport.getBoundingClientRect();
                const fitScale = Math.min(vpRect.width / stageWidth, vpRect.height / stageHeight) * 0.95;
                if (!activePath || activePath.length === 0) {
                    const tooSmall = view.scale < fitScale * 0.75;
                    const tooLarge = view.scale > fitScale * 1.5;
                    if (tooSmall || tooLarge) {
                        autoFitLock = false;
                        fitToScreen(true);
                    }
                }
            } catch (_) {}
        }
        // Cập nhật select nếu có
        if (selFrom && selFrom.querySelector(`option[value="${id}"]`)) selFrom.value = id;
        // KHÔNG pan/center tự động khi đổi scene bằng hotspot
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
    // Load graph (will also load scenes and auto-generate positions if needed)
    loadGraph().then(() => {
        console.log('[Minimap] Graph loaded, nodes:', G.nodes?.length || 0);
        setTimeout(() => {
            setFloor(currentFloor);
            if (G.nodes && G.nodes.length > 0) {
                renderNodes();
                console.log('[Minimap] Initial render completed, nodes:', G.nodes.length);
                if (activeId) {
                    setTimeout(() => {
                        showNodeLabel(activeId);
                        currentlyShowingLabels.add(String(activeId));
                    }, 100);
                }
                try {
                    // Notify app that minimap is ready so it can set active scene
                    window.dispatchEvent(new CustomEvent('minimap-ready', { detail: { nodes: G.nodes.length } }));
                } catch (e) { /* ignore */ }
            }
        }, 50);
    });
    window.addEventListener('resize', () => fitToScreen());

    // Allow external code (CMS/editor) to notify minimap about changes
    window.addEventListener('scene-updated', async (e) => {
        const id = e && e.detail && e.detail.id;
        // Regenerate graph on server and reload
        try {
            await fetch('/api/graph/regenerate', { method: 'POST' });
        } catch (err) { /* ignore */ }
        await loadGraph();
        if (id) {
            try { setActive(id); } catch (err) {}
            setTimeout(() => { try { focusNode(id); } catch (err) {} }, 200);
        }
    });

    window.addEventListener('scenes-updated', async () => {
        try {
            await fetch('/api/graph/regenerate', { method: 'POST' });
        } catch (err) { /* ignore */ }
        await loadGraph();
    });

    // Allow passing a new graph object directly
    window.addEventListener('minimap-refresh', (e) => {
        if (e && e.detail && e.detail.graph) {
            try { const graph = e.detail.graph; G = normalizeGraph(graph); renderNodes(); } catch (err) { console.warn(err); }
        } else {
            // fallback to reloading graph
            loadGraph();
        }
    });

    // Return API
    return { 
        setActive, 
        refresh: (g) => { 
            // KHÔNG BAO GIỜ reset hoàn toàn - MERGE với dữ liệu hiện có
            if (!g || (!g.nodes && !g.edges)) {
                console.warn('[Minimap] refresh called with invalid or empty graph, keeping current data');
                return; // Giữ nguyên dữ liệu hiện tại, không reset
            }
            
            const newGraph = normalizeGraph(g);
            if (newGraph.nodes.length === 0 && newGraph.edges.length === 0) {
                console.warn('[Minimap] New graph is empty, keeping current data');
                return; // Giữ nguyên dữ liệu hiện tại
            }
            
            // MERGE: Giữ lại vị trí x, y từ graph cũ nếu graph mới không có
            const oldNodesMap = new Map();
            if (G && G.nodes) {
                G.nodes.forEach(node => {
                    oldNodesMap.set(String(node.id), node);
                });
            }
            
            // Merge nodes: Giữ lại x, y, positions từ node cũ nếu node mới không có
            const mergedNodes = newGraph.nodes.map(newNode => {
                const oldNode = oldNodesMap.get(String(newNode.id));
                if (oldNode) {
                    // MERGE: Giữ lại tất cả thông tin từ node cũ, chỉ cập nhật những gì mới có
                    return {
                        ...oldNode,  // Giữ nguyên node cũ (bao gồm x, y, positions)
                        ...newNode,  // Cập nhật thông tin mới
                        // Đặc biệt: Nếu node mới không có x, y nhưng node cũ có, giữ lại
                        x: newNode.x !== undefined && newNode.x !== null ? newNode.x : (oldNode.x !== undefined ? oldNode.x : undefined),
                        y: newNode.y !== undefined && newNode.y !== null ? newNode.y : (oldNode.y !== undefined ? oldNode.y : undefined),
                        // Giữ lại positions nếu node mới không có
                        positions: newNode.positions || oldNode.positions
                    };
                }
                return newNode; // Node mới, không có trong graph cũ
            });
            
            // Thêm các nodes cũ không có trong graph mới (tránh mất nodes)
            newGraph.nodes.forEach(node => {
                oldNodesMap.delete(String(node.id)); // Đánh dấu đã xử lý
            });
            // Thêm lại các nodes cũ không có trong graph mới (giữ lại nodes đã bị xóa khỏi graph mới)
            oldNodesMap.forEach((oldNode) => {
                mergedNodes.push(oldNode);
            });
            
            // Cập nhật graph với dữ liệu đã merge
            G = {
                nodes: mergedNodes,
                edges: newGraph.edges // Edges luôn lấy mới (kết nối có thể thay đổi)
            };
            
            console.log('[Minimap] Refreshed with MERGED graph:', { 
                nodeCount: G.nodes.length, 
                edgeCount: G.edges.length,
                currentFloor: currentFloor,
                visibleNodes: G.nodes.filter(n => (n.floor ?? 0) === currentFloor).length,
                preservedPositions: mergedNodes.filter(n => (n.x !== undefined || n.y !== undefined || n.positions)).length
            });
            
            renderNodes();
            // Đảm bảo label của node active được hiển thị sau khi refresh
            if (activeId) {
                setTimeout(() => {
                    showNodeLabel(activeId);
                    currentlyShowingLabels.add(String(activeId));
                }, 50);
            }
        }, 
        highlightPath, 
        updateSelectsWithScenes,
        setLanguage ,
        visualizePath, // [QUAN TRỌNG] Đã export hàm này
        playTravel,
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
        const weight = e.w || 1; 
        adj[e.from].push({ node: e.to, w: weight });
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