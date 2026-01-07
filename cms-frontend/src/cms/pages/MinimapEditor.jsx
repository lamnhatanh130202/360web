import React, { useEffect, useState, useRef, useCallback } from "react";
import '../styles/minimap.css'; // Style cho các thành phần bên trong map (dot, edge)
import '../styles/MinimapEditor.css'; // Style cho layout editor

const apiBase = "/api";

// (Removed Google Maps - editor will use local floor images only)

export default function MinimapEditor() {
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [currentFloor, setCurrentFloor] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [dragStart, setDragStart] = useState(null);
  const [view, setView] = useState({ ox: 0, oy: 0, scale: 0.9 });
  const [bgImageInfo, setBgImageInfo] = useState(null);
  const bgImgRef = useRef(null);
  
  const containerRef = useRef(null);
  const stageRef = useRef(null);
  const viewportRef = useRef(null);
  
  const DRAG_THRESHOLD = 5;
  const SCALE_MIN = 0.5;
  const SCALE_MAX = 2.5;
  const SCALE_STEP = 0.15;

  // Use raw image paths (no `url(...)`) so we can size stage to natural image pixels
  // Use CMS-scoped assets to avoid falling back to viewer's old /assets
  const floorBackgrounds = {
    0: '/cms/assets/minimap/sơ_đồ_cả_trường.jpg',
    1: '/cms/assets/minimap/lầu_1_Khu_A-B.jpg',
    2: '/cms/assets/minimap/lầu_2_Khu_A-B.jpg',
    3: '/cms/assets/minimap/lầu_3_Khu_A-B.jpg',
    4: '/cms/assets/minimap/lầu_4_Khu_A.jpg',
    5: '/cms/assets/minimap/lầu_5_Khu_A.jpg',
    5.5: '/cms/assets/minimap/mặt_lửng_lầu_5_Khu_A.jpg',
    6: '/cms/assets/minimap/lầu_6_Khu_A.jpg'
  };

  useEffect(() => {
    loadGraph();
    loadScenes();
  }, []);

  // --- LOAD DATA (ANTI-CACHE) ---
  async function loadGraph(skipFitToView = false) {
    const wasLoading = loading;
    setLoading(true);
    setError(null);
    try {
      const headers = { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' };
      const res = await fetch(`${apiBase}/graph?t=${Date.now()}`, { headers });
      
      if (!res.ok) throw new Error("Không tải được graph");
      const data = await res.json();
      const graphData = data || { nodes: [], edges: [] };
      
      // Migrate data logic
      graphData.nodes.forEach(n => {
        if ((n.x !== undefined || n.y !== undefined) && (!n.positions || Object.keys(n.positions || {}).length === 0)) {
          n.positions = {};
          const defaultFloor = n.floor ?? 0;
          n.positions[String(defaultFloor)] = { x: n.x || 0, y: n.y || 0 };
        }
      });
      
      setGraph(graphData);
      
      if (!skipFitToView && !wasLoading) {
        if (graphData.nodes && graphData.nodes.length > 0) {
          setTimeout(() => {
            if (viewportRef.current) fitToViewInternal(graphData, currentFloor);
          }, 500);
        }
      }
    } catch (e) {
      setError(e.message || "Không thể tải graph");
    } finally {
      setLoading(false);
    }
  }

  async function loadScenes() {
    try {
      const headers = { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' };
      const res = await fetch(`${apiBase}/scenes?t=${Date.now()}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setScenes(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn("Failed to load scenes:", e);
    }
  }

  // --- HELPER FUNCTIONS ---
  function getSceneName(nodeId) {
    const scene = scenes.find(s => s.id === nodeId);
    return scene?.name?.vi || scene?.name || nodeId;
  }

  function node(id) {
    return graph.nodes.find(n => n.id === id);
  }

  function getNodePosition(node, floor) {
    if (node.positions && typeof node.positions === 'object') {
      if (node.positions[floor] !== undefined) return node.positions[floor];
      const floorKey = String(floor);
      if (node.positions[floorKey] !== undefined) return node.positions[floorKey];
      if (Object.keys(node.positions).length > 0) return { x: 0, y: 0 };
    }
    return { x: node.x || 0, y: node.y || 0 };
  }

  function setNodePosition(node, floor, x, y) {
    if (!node.positions || typeof node.positions !== 'object') node.positions = {};
    node.positions[String(floor)] = { x, y };
  }

  // --- IMAGE CALCULATION ---
  function calculateBackgroundImageInfo(imgUrl, viewportWidth, viewportHeight) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const imgAspect = img.width / img.height;
        const viewportAspect = viewportWidth / viewportHeight;
        let bgWidth, bgHeight, bgX, bgY;
        
        if (imgAspect > viewportAspect) {
          bgWidth = viewportWidth;
          bgHeight = viewportWidth / imgAspect;
          bgX = 0;
          bgY = (viewportHeight - bgHeight) / 2;
        } else {
          bgHeight = viewportHeight;
          bgWidth = viewportHeight * imgAspect;
          bgX = (viewportWidth - bgWidth) / 2;
          bgY = 0;
        }
        
        resolve({
          originalWidth: img.width,
          originalHeight: img.height,
          displayWidth: bgWidth,
          displayHeight: bgHeight,
          displayX: bgX,
          displayY: bgY,
          scaleX: bgWidth / img.width,
          scaleY: bgHeight / img.height
        });
      };
      img.onerror = () => resolve(null);
      img.src = imgUrl.replace('url(', '').replace(')', '').replace(/['"]/g, '');
    });
  }

  // Load background image and compute how it will be displayed (contain + centered)
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (!viewportRef.current || !stageRef.current) return;
      const rect = viewportRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const rawImgPath = floorBackgrounds[currentFloor] || floorBackgrounds[0];
      const imgPath = encodeURI(rawImgPath) + `?v=${Date.now()}`;
      console.log('[MinimapEditor] Floor', currentFloor, 'image URL:', imgPath);
      if (!imgPath) return;

      // calculateBackgroundImageInfo will compute displayWidth/displayHeight/displayX/displayY
      calculateBackgroundImageInfo(imgPath, rect.width, rect.height).then(info => {
        if (!info) {
          setBgImageInfo(null);
          return;
        }

        // scaleX/Y map from original image pixel coords -> displayed pixels
        const scaleX = info.displayWidth / info.originalWidth;
        const scaleY = info.displayHeight / info.originalHeight;

        const stage = stageRef.current;
        stage.style.width = info.displayWidth + 'px';
        stage.style.height = info.displayHeight + 'px';
        stage.style.left = info.displayX + 'px';
        stage.style.top = info.displayY + 'px';

        // Create or update the background <img> inside the stage
        let bg = bgImgRef.current;
        if (!bg) {
          bg = document.createElement('img');
          bgImgRef.current = bg;
          bg.style.position = 'absolute';
          bg.style.left = '0px';
          bg.style.top = '0px';
          bg.style.pointerEvents = 'none';
          bg.style.userSelect = 'none';
          stage.insertBefore(bg, stage.firstChild);
        }
        bg.src = imgPath;
        bg.style.width = info.displayWidth + 'px';
        bg.style.height = info.displayHeight + 'px';

        setBgImageInfo({
          originalWidth: info.originalWidth,
          originalHeight: info.originalHeight,
          displayWidth: info.displayWidth,
          displayHeight: info.displayHeight,
          displayX: info.displayX,
          displayY: info.displayY,
          scaleX,
          scaleY
        });
      });
    }, 80);
    return () => clearTimeout(timeoutId);
  }, [currentFloor, viewportRef.current]);

  // --- COORDINATE TRANSFORM ---
  function screenToStage(clientX, clientY, bgInfo = null) {
    const info = bgInfo || bgImageInfo;
    if (!viewportRef.current || !info) return { x: 0, y: 0 };
    
    const rect = viewportRef.current.getBoundingClientRect();
    const viewportX = clientX - rect.left;
    const viewportY = clientY - rect.top;
    
    const stageX = (viewportX - view.ox) / view.scale;
    const stageY = (viewportY - view.oy) / view.scale;
    
    const originalX = (stageX - info.displayX) / info.scaleX;
    const originalY = (stageY - info.displayY) / info.scaleY;
    
    return { x: Math.round(originalX), y: Math.round(originalY) };
  }

  // --- EVENT HANDLERS ---
  function handleMouseDown(e, nodeId) {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const node = graph.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    setSelectedNode(nodeId);
    const currentPos = getNodePosition(node, currentFloor);
    
    setDragStart({
      nodeId: nodeId,
      startX: startX, startY: startY,
      nodeX: currentPos.x, nodeY: currentPos.y
    });
  }

  function handleMouseMove(e) {
    if (!dragStart) return;
    
    const dx = e.clientX - dragStart.startX;
    const dy = e.clientY - dragStart.startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance < DRAG_THRESHOLD && !draggingId) return;
    
    if (!draggingId) setDraggingId(dragStart.nodeId);
    
    if (!bgImageInfo) return;
    
    const { x, y } = screenToStage(e.clientX, e.clientY, bgImageInfo);
    if (isNaN(x) || isNaN(y)) return;

    setGraph(prev => ({
      ...prev,
      nodes: prev.nodes.map(n => {
        if (n.id === dragStart.nodeId) {
          const positionsCopy = { ...(n.positions || {}) };
          const updatedNode = { ...n, positions: positionsCopy };
          setNodePosition(updatedNode, currentFloor, x, y);
          return updatedNode;
        }
        return n;
      })
    }));
  }

  function handleMouseUp() {
    if (dragStart && !draggingId) setSelectedNode(dragStart.nodeId);
    setDraggingId(null);
    setDragStart(null);
  }

  useEffect(() => {
    if (dragStart) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragStart, draggingId, bgImageInfo, view]);

  // --- ZOOM & PAN ---
  function zoomBy(ds, cx, cy) {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const x = (cx || rect.width / 2) - rect.left;
    const y = (cy || rect.height / 2) - rect.top;
    
    setView(prev => {
      const old = prev.scale;
      const next = Math.min(SCALE_MAX, Math.max(SCALE_MIN, old + ds));
      if (next === old) return prev;
      const newOx = x - (x - prev.ox) * (next / old);
      const newOy = y - (y - prev.oy) * (next / old);
      return { ...prev, scale: next, ox: newOx, oy: newOy };
    });
  }

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    let panning = false;
    let panStartX = 0, panStartY = 0, panStartOx = 0, panStartOy = 0;

    const handleWheel = (e) => {
      e.preventDefault();
      zoomBy(e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP, e.clientX, e.clientY);
    };

    const onMouseDown = (e) => {
      if (draggingId || e.target.closest('.mm-dot')) return;
      panning = true;
      panStartX = e.clientX; panStartY = e.clientY;
      setView(prev => { panStartOx = prev.ox; panStartOy = prev.oy; return prev; });
    };

    const onMouseMove = (e) => {
      if (!panning) return;
      const dx = e.clientX - panStartX;
      const dy = e.clientY - panStartY;
      setView(prev => ({ ...prev, ox: panStartOx + dx, oy: panStartOy + dy }));
    };

    const onMouseUp = () => { panning = false; };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    viewport.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      viewport.removeEventListener('wheel', handleWheel);
      viewport.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingId]);

  // --- VIEW HELPERS ---
  function fitToViewInternal(graphData, floor) {
    const nodesOnFloor = graphData.nodes.filter(n => (n.floor ?? 0) === floor);
    if (nodesOnFloor.length === 0 || !viewportRef.current || !bgImageInfo) {
      setView({ ox: 0, oy: 0, scale: 1 });
      return;
    }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodesOnFloor.forEach(n => {
      const pos = getNodePosition(n, floor);
      const dx = pos.x * bgImageInfo.scaleX + bgImageInfo.displayX;
      const dy = pos.y * bgImageInfo.scaleY + bgImageInfo.displayY;
      minX = Math.min(minX, dx); minY = Math.min(minY, dy);
      maxX = Math.max(maxX, dx); maxY = Math.max(maxY, dy);
    });

    const padding = 50;
    const width = (maxX - minX) + padding * 2;
    const height = (maxY - minY) + padding * 2;
    const rect = viewportRef.current.getBoundingClientRect();
    const scale = Math.min(rect.width / width, rect.height / height, 2);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setView({
      ox: rect.width / 2 - centerX * scale,
      oy: rect.height / 2 - centerY * scale,
      scale
    });
  }

  function centerToNode(nodeId) {
    const n = node(nodeId);
    if (!n || !viewportRef.current || !bgImageInfo) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const pos = getNodePosition(n, currentFloor);
    const displayX = pos.x * bgImageInfo.scaleX + bgImageInfo.displayX;
    const displayY = pos.y * bgImageInfo.scaleY + bgImageInfo.displayY;
    
    setView(prev => ({
      ...prev,
      ox: (rect.width / 2) - displayX * prev.scale,
      oy: (rect.height / 2) - displayY * prev.scale
    }));
    setSelectedNode(nodeId);
  }

  // --- SAVE ---
  async function saveGraph() {
    setSaving(true);
    try {
      const nodesToSave = graph.nodes.map(n => {
        const nodeData = { id: n.id, floor: n.floor ?? 0, label: n.label };
        if (n.positions && Object.keys(n.positions).length > 0) nodeData.positions = n.positions;
        const pos = getNodePosition(n, n.floor ?? 0);
        nodeData.x = pos.x; nodeData.y = pos.y;
        return nodeData;
      });
      
      const res = await fetch(`${apiBase}/graph`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodes: nodesToSave, edges: graph.edges })
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to save graph");
      }
      
      const result = await res.json();
      console.log('[MinimapEditor] Save result:', result);
      
      alert("Đã lưu thành công!");
      
      // Reload graph từ server để đảm bảo có dữ liệu mới nhất
      await loadGraph(true);
    } catch (e) {
      alert("Lỗi: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  // --- RENDERER ---
  const render = useCallback(() => {
    if (!stageRef.current || !viewportRef.current || !bgImageInfo) return;
    const stage = stageRef.current;
    const viewport = viewportRef.current;

    // Preserve background <img> if present, then clear other children
    const bg = bgImgRef.current;
    stage.innerHTML = '';
    if (bg) stage.appendChild(bg);

    const { scaleX, scaleY, displayX, displayY } = bgImageInfo;

    // Edges
    graph.edges.forEach(edge => {
      const a = node(edge.from);
      const b = node(edge.to);
      if (!a || !b) return;
      if ((a.floor??0) !== currentFloor || (b.floor??0) !== currentFloor) return;

      const aPos = getNodePosition(a, currentFloor);
      const bPos = getNodePosition(b, currentFloor);
      const ax = aPos.x * scaleX;
      const ay = aPos.y * scaleY;
      const bx = bPos.x * scaleX;
      const by = bPos.y * scaleY;

      const line = document.createElement('div');
      line.className = 'mm-edge';
      line.style.position = 'absolute';
      line.style.left = `${Math.min(ax, bx)}px`;
      line.style.top = `${Math.min(ay, by)}px`;
      const dx = bx - ax, dy = by - ay;
      line.style.width = `${Math.sqrt(dx*dx + dy*dy)}px`;
      line.style.height = '2px';
      line.style.background = 'rgba(59, 130, 246, 0.5)';
      line.style.transformOrigin = '0 50%';
      line.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      stage.appendChild(line);
    });

    // Nodes
    const nodesOnFloor = graph.nodes.filter(n => (n.floor ?? 0) === currentFloor);
    nodesOnFloor.forEach(n => {
      const pos = getNodePosition(n, currentFloor);
      const dx = pos.x * scaleX;
      const dy = pos.y * scaleY;

      const dot = document.createElement('div');
      dot.className = `mm-dot ${selectedNode === n.id ? 'active' : ''} ${draggingId === n.id ? 'dragging' : ''}`;
      // Inline style for basic look if css fails
      dot.style.position = 'absolute';
      dot.style.left = `${dx}px`;
      dot.style.top = `${dy}px`;
      dot.style.width = '10px';
      dot.style.height = '10px';
      dot.style.borderRadius = '50%';
      dot.style.background = selectedNode === n.id ? '#2563eb' : '#64748b';
      dot.style.transform = 'translate(-50%, -50%)';
      dot.style.zIndex = selectedNode === n.id ? 10 : 1;
      dot.style.cursor = 'grab';
      
      if (!draggingId) {
        dot.onmousedown = (e) => handleMouseDown(e, n.id);
      }
      stage.appendChild(dot);

      // Label
      const label = document.createElement('div');
      label.textContent = getSceneName(n.id);
      label.style.position = 'absolute';
      label.style.left = `${dx + 8}px`;
      label.style.top = `${dy - 8}px`;
      label.style.background = 'rgba(255,255,255,0.9)';
      label.style.padding = '2px 4px';
      label.style.fontSize = '10px';
      label.style.borderRadius = '3px';
      label.style.pointerEvents = 'none';
      stage.appendChild(label);
    });

  }, [graph, currentFloor, selectedNode, draggingId, bgImageInfo]);

  // Trigger render
  useEffect(() => {
    if (bgImageInfo) render();
  }, [bgImageInfo, graph, currentFloor, view, render]);


  if (loading) return <div style={{ padding: 24 }}>Đang tải...</div>;
  if (error) return <div style={{ padding: 24, color: 'red' }}>Lỗi: {error}</div>;

  return (
    <div className="mm-editor-layout">
      <div className="mm-editor-sidebar">
        <h2 className="mm-editor-title">Chỉnh sửa Minimap</h2>
        <div>
          <label className="mm-section-label">Chọn tầng:</label>
          <div className="mm-floor-list">
            {[0, 1, 2, 3, 4, 5, 5.5, 6].map(floor => (
              <button
                key={floor}
                onClick={() => setCurrentFloor(floor)}
                className={`mm-floor-btn ${currentFloor === floor ? 'active' : ''}`}
              >
                {floor === 0 ? 'Trệt' : floor === 5.5 ? 'Lửng 5' : `Tầng ${floor}`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mm-section-label">Tìm node:</label>
          <select
            className="mm-control-select"
            value={selectedNode || ''}
            onChange={(e) => {
              if (e.target.value) centerToNode(e.target.value);
              else setSelectedNode(null);
            }}
          >
            <option value="">-- Chọn node --</option>
            {graph.nodes
              .filter(n => (n.floor ?? 0) === currentFloor)
              .map(n => (
                <option key={n.id} value={n.id}>{getSceneName(n.id)}</option>
              ))}
          </select>
        </div>

        <div>
          <h3 className="mm-section-label">Điều khiển:</h3>
          <div className="mm-zoom-group">
             <button className="mm-btn-action" onClick={() => zoomBy(SCALE_STEP, null, null)}>Zoom In (+)</button>
             <button className="mm-btn-action" onClick={() => zoomBy(-SCALE_STEP, null, null)}>Zoom Out (-)</button>
          </div>
          <button className="mm-btn-block mm-btn-reset" onClick={() => setView({ ox: 0, oy: 0, scale: 1 })}>
            Reset View
          </button>
          <button className="mm-btn-block mm-btn-fit" onClick={() => {
             if (graph && viewportRef.current && bgImageInfo) fitToViewInternal(graph, currentFloor);
          }}>
            Fit to View
          </button>
        </div>

        <button
          className="mm-btn-block mm-btn-save"
          onClick={saveGraph}
          disabled={saving}
        >
          {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
        </button>
      </div>

      <div className="mm-main-content">
        <div ref={containerRef} className="minimap-editor-container">
          <div
            ref={viewportRef}
            className="mm-viewport"
            style={{
              flexGrow: 1,
              position: 'relative',
              overflow: 'hidden',
              cursor: draggingId ? 'grabbing' : 'grab',
            }}
          >
             <div
                ref={stageRef}
                className="mm-stage"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  transform: `translate(${view.ox}px, ${view.oy}px) scale(${view.scale})`,
                  transformOrigin: '0 0',
                  zIndex: 1
                }}
             />
          </div>
        </div>
      </div>
    </div>
  );
}