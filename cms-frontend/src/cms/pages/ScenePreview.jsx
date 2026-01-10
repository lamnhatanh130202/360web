import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "../styles/ScenePreview.css"; 

const DEFAULT_FOV_DEG = 53.02;
const DEFAULT_HFOV = (DEFAULT_FOV_DEG * Math.PI) / 180;
const SCENE_SWITCH_MS = 700;
const INITIAL_VIEW_DEFAULTS = { yaw: 0, pitch: 0, hfov: DEFAULT_HFOV };

// Định nghĩa tên tầng (giống bên Edit)
const FLOOR_NAMES = {
  0: "Tầng Trệt (Ground Floor)",
  1: "Tầng 1",
  2: "Tầng 2",
  3: "Tầng 3",
  4: "Tầng 4",
  5: "Tầng 5",
  6: "Tầng 6"
};

function resolveSceneUrl(url = "") {
  if (!url) return "";
  // If points to uploads, prefer /api/uploads so it proxies to backend via Render rewrite
  if (url.startsWith("/uploads/")) return `/api/uploads/${url.slice('/uploads/'.length)}`;
  if (url.startsWith("http") || url.startsWith("/")) return url;
  if (url.startsWith("./")) return `/cms/${url.slice(2)}`;
  return url;
}

export default function ScenePreview({ apiBase = "/api" }) {
  const { sceneId } = useParams();
  const navigate = useNavigate();
  
  // --- STATE ---
  const [scenes, setScenes] = useState([]);
  const [currentSceneId, setCurrentSceneId] = useState(sceneId);
  const [hotspots, setHotspots] = useState([]);
  
  // --- UI STATE ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editMode, setEditMode] = useState(false);
  
  // --- MODAL STATE ---
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newHotspotTarget, setNewHotspotTarget] = useState("");
  const [newHotspotLabel, setNewHotspotLabel] = useState("");

  // --- REFS ---
  const viewerContainerRef = useRef(null);
  const marzipanoViewerRef = useRef(null);
  const activeSceneRef = useRef(null);
  const hotspotNodesRef = useRef([]);
  const isDraggingRef = useRef(false);

  // 1. LOAD SCENES LIST
  useEffect(() => {
    async function loadScenes() {
      try {
        const res = await fetch(`${apiBase}/scenes`);
        if (!res.ok) throw new Error("Failed to load scenes");
        const data = await res.json();
        setScenes(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    loadScenes();
  }, [apiBase]);

  const sceneMap = useMemo(() => {
    const map = {};
    scenes.forEach(s => { if(s?.id) map[s.id] = s; });
    return map;
  }, [scenes]);

  // --- LOGIC MỚI: NHÓM SCENES THEO TẦNG ---
  // Tạo ra cấu trúc: { 0: [SceneA, SceneB], 1: [SceneC] ... }
  const groupedScenes = useMemo(() => {
      const groups = {};
      // Lọc bỏ scene hiện tại (không thể đi đến chính mình)
      const targets = scenes.filter(s => s.id !== currentSceneId);
      
      targets.forEach(s => {
          const floor = s.floor ?? 0; // Mặc định tầng 0 nếu không có
          if (!groups[floor]) groups[floor] = [];
          groups[floor].push(s);
      });
      return groups;
  }, [scenes, currentSceneId]);

  // Lấy danh sách các tầng có dữ liệu để render (Sort từ thấp lên cao)
  const sortedFloors = useMemo(() => {
      return Object.keys(groupedScenes).sort((a, b) => Number(a) - Number(b));
  }, [groupedScenes]);

  // Sync URL param
  useEffect(() => { if (sceneId) setCurrentSceneId(sceneId); }, [sceneId]);

  // 2. LOAD HOTSPOTS DATA
  useEffect(() => {
    if (!currentSceneId) return;
    setHotspots([]); 

    async function loadHotspots() {
      try {
        const res = await fetch(`${apiBase}/scenes/${currentSceneId}`);
        let dataHotspots = [];
        if (res.ok) {
          const data = await res.json();
          dataHotspots = data.hotspots || [];
        } else {
          dataHotspots = sceneMap[currentSceneId]?.hotspots || [];
        }
        setHotspots(dataHotspots);
      } catch {
        setHotspots(sceneMap[currentSceneId]?.hotspots || []);
      }
    }
    loadHotspots();
  }, [currentSceneId, apiBase, sceneMap]);

  // 3. INIT VIEWER & SCENE
  useEffect(() => {
    if (!currentSceneId || !sceneMap[currentSceneId]) return;
    if (!window.Marzipano || !viewerContainerRef.current) return;

    const M = window.Marzipano;

    if (!marzipanoViewerRef.current) {
      marzipanoViewerRef.current = new M.Viewer(viewerContainerRef.current, {
        stageType: "webgl",
        controls: { mouseViewMode: 'drag' } 
      });
    }

    const sceneData = sceneMap[currentSceneId];
    const source = M.ImageUrlSource.fromString(resolveSceneUrl(sceneData.url) + `?v=${Date.now()}`);
    const geometry = new M.EquirectGeometry([{ width: 4000 }]);
    const limiter = M.RectilinearView.limit.traditional(M.util.degToRad(100), M.util.degToRad(120));
    
    const savedView = sceneData.initialView || {};
    const savedFov = Number(savedView.hfov);
    const initialFov = (Number.isFinite(savedFov) && savedFov > 0) ? savedFov : INITIAL_VIEW_DEFAULTS.hfov;
    const initialViewParams = { 
        yaw: savedView.yaw ?? INITIAL_VIEW_DEFAULTS.yaw, 
        pitch: savedView.pitch ?? INITIAL_VIEW_DEFAULTS.pitch, 
      fov: initialFov 
    };

    const view = new M.RectilinearView(initialViewParams, limiter);
    const scene = marzipanoViewerRef.current.createScene({ source, geometry, view });
    
    activeSceneRef.current = scene;
    scene.switchTo({ transitionDuration: SCENE_SWITCH_MS });

    hotspotNodesRef.current = [];

  }, [currentSceneId, sceneMap]); 

  // 4. TRIGGER RENDER
  useEffect(() => {
      if (activeSceneRef.current && !isDraggingRef.current) {
          renderHotspots();
      }
  }, [hotspots, editMode, currentSceneId]); 

  // --- RENDER HOTSPOTS ---
  function renderHotspots() {
    if (!activeSceneRef.current) return;
    
    const scene = activeSceneRef.current;
    const container = scene.hotspotContainer();
    
    const existingHotspots = container.listHotspots();
    existingHotspots.forEach(hotspot => {
      try { container.destroyHotspot(hotspot); } catch(e) {}
    });
    hotspotNodesRef.current = [];

    hotspots.forEach((h, index) => {
      const el = document.createElement("div");
      el.className = editMode ? "preview-hotspot editable" : "preview-hotspot";
      
      const dot = document.createElement("div");
      dot.className = "preview-hotspot-dot";
      el.appendChild(dot);

      const label = document.createElement("div");
      label.className = "preview-hotspot-label";
      label.textContent = h.label || h.target;
      el.appendChild(label);

      if (editMode) {
        const delBtn = document.createElement("div");
        delBtn.className = "preview-hotspot-delete";
        delBtn.innerHTML = "×";
        delBtn.onclick = (e) => { e.stopPropagation(); deleteHotspot(index); };
        el.appendChild(delBtn);

        const onMouseDown = (e) => {
           e.stopPropagation(); e.preventDefault();
           isDraggingRef.current = true;
           if (marzipanoViewerRef.current) marzipanoViewerRef.current.controls().disable();

           const onMouseMove = (ev) => {
               if (!isDraggingRef.current) return;
               const rect = viewerContainerRef.current.getBoundingClientRect();
               const x = ev.clientX - rect.left;
               const y = ev.clientY - rect.top;
               const view = scene.view();
               const coords = view.screenToCoordinates({ x, y });

               if (coords) {
                   const { yaw, pitch } = coords;
                   try {
                       container.destroyHotspot(el);
                       container.createHotspot(el, { yaw, pitch });
                   } catch(err) {}

                   setHotspots(prev => {
                       const next = [...prev];
                       next[index] = { ...next[index], yaw, pitch };
                       return next;
                   });
               }
           };

           const onMouseUp = () => {
               isDraggingRef.current = false;
               document.removeEventListener('mousemove', onMouseMove);
               document.removeEventListener('mouseup', onMouseUp);
               if (marzipanoViewerRef.current) marzipanoViewerRef.current.controls().enable();
               renderHotspots();
           };

           document.addEventListener('mousemove', onMouseMove);
           document.addEventListener('mouseup', onMouseUp);
        };
        el.addEventListener('mousedown', onMouseDown);
      } else {
        el.addEventListener('click', () => {
            if(sceneMap[h.target]) setCurrentSceneId(h.target);
        });
      }

      try {
          container.createHotspot(el, { yaw: h.yaw, pitch: h.pitch });
          hotspotNodesRef.current.push(el);
      } catch (err) { console.error(err); }
    });
  }

  // --- LƯU DỮ LIỆU ---
  async function saveHotspots() {
    setSaving(true);
    try {
      let currentViewData = {};
      if (activeSceneRef.current) {
          const view = activeSceneRef.current.view();
          currentViewData = {
              yaw: view.yaw(),
              pitch: view.pitch(),
              hfov: view.fov()
          };
      }

      const res = await fetch(`${apiBase}/scenes/${currentSceneId}`);
      const originalSceneData = await res.json();

      const payload = { 
          ...originalSceneData,
          hotspots: hotspots, 
          initialView: currentViewData 
      };

      const updateRes = await fetch(`${apiBase}/scenes/${currentSceneId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if(!updateRes.ok) throw new Error("Lỗi server khi lưu");

      setScenes(prev => prev.map(s => s.id === currentSceneId ? payload : s));
      setMsg("Đã lưu thành công!");
      setTimeout(() => setMsg(null), 3000);
      setEditMode(false);
    } catch (e) {
      alert("Lỗi: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  const createHotspot = () => {
      if(!newHotspotTarget) return alert("Vui lòng chọn scene đích!");
      
      let pos = { yaw: 0, pitch: 0 };
      if (activeSceneRef.current) {
          const view = activeSceneRef.current.view();
          pos = { yaw: view.yaw(), pitch: view.pitch() }; 
      }

      const newH = { 
          target: newHotspotTarget, 
          label: newHotspotLabel || sceneMap[newHotspotTarget]?.name?.vi || newHotspotTarget, 
          ...pos 
      };
      setHotspots([...hotspots, newH]);
      setShowCreateDialog(false);
      setNewHotspotTarget(""); setNewHotspotLabel("");
  };

  const deleteHotspot = (idx) => {
      if(window.confirm("Xóa điểm này?")) {
          setHotspots(prev => prev.filter((_, i) => i !== idx));
      }
  };

  const updateHotspotValue = (idx, field, val) => {
      setHotspots(prev => {
          const next = [...prev];
          if (field === 'label' || field === 'target') {
              next[idx] = { ...next[idx], [field]: val };
          } else {
              next[idx] = { ...next[idx], [field]: parseFloat(val) || 0 };
          }
          return next;
      });
  };

  if (loading) return <div className="scene-preview-page">Đang tải...</div>;
  if (error) return <div className="scene-preview-page alert-error">{error}</div>;

  const currentScene = sceneMap[currentSceneId];

  // --- COMPONENT HELPER: Render options grouped by floor ---
  // 
  const renderSceneOptions = () => {
      return (
          <>
            <option value="">-- Chọn điểm đến --</option>
            {sortedFloors.map(floor => (
                <optgroup key={floor} label={FLOOR_NAMES[floor] || `Tầng ${floor}`}>
                    {groupedScenes[floor].map(s => (
                        <option key={s.id} value={s.id}>
                            {s.name?.vi || s.id} ({s.id})
                        </option>
                    ))}
                </optgroup>
            ))}
          </>
      );
  };

  return (
    <div className="scene-preview-page">
      <div className="scene-preview-header">
        <div>
           <h1 className="scene-preview-title">{editMode ? "🛠️ Đang sửa Hotspots" : "👁️ Xem trước"}</h1>
           <p className="scene-preview-sub">
             {currentScene?.name?.vi || currentSceneId}
             {!editMode && (
               <span style={{ marginLeft: '12px', color: 'var(--muted)', fontSize: '0.9rem', fontWeight: 'normal' }}>
                 ({hotspots.length} {hotspots.length === 1 ? 'hotspot' : 'hotspots'})
               </span>
             )}
           </p>
        </div>
        <div className="scene-preview-actions">
           <button className="btn btn-back" onClick={() => navigate('/cms/scenes')}>Quay lại</button>
        </div>
      </div>

      {msg && <div className="alert alert-success">{msg}</div>}

      <div className="scene-preview-toolbar">
         <label>Phòng: </label>
         <select 
            className="scene-preview-select"
            value={currentSceneId || ""} 
            onChange={(e) => { setCurrentSceneId(e.target.value); setEditMode(false); }}
            disabled={editMode}
         >
            {/* Sử dụng hàm renderSceneOptions cho cả dropdown này */}
            {renderSceneOptions()}
         </select>
      </div>

      <div className="scene-preview-viewer" ref={viewerContainerRef}>
          {!currentScene && <div className="scene-preview-empty">Chọn scene</div>}
          {editMode && <div style={{position:'absolute', top:10, left:10, zIndex:100, color:'white', background:'rgba(0,0,0,0.6)', padding:'5px 10px', borderRadius:4, pointerEvents:'none'}}>Kéo ảnh để quay - Kéo điểm để sửa</div>}
      </div>

      {/* Bảng hotspots luôn hiển thị */}
          <div className="hotspots-table-container">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>
                Danh sách Hotspots ({hotspots.length} {hotspots.length === 1 ? 'điểm' : 'điểm'})
              </h3>
              {!editMode && (
                <button className="btn btn-edit" onClick={() => setEditMode(true)}>
                  ✏️ Sửa Hotspots
                </button>
              )}
          </div>
          
              <table className="hotspots-table">
                  <thead>
                      <tr>
                          <th style={{width: '30%'}}>Tên hiển thị</th>
                          <th style={{width: '30%'}}>Đi đến (Target)</th>
                          <th style={{width: '15%'}}>Yaw</th>
                          <th style={{width: '15%'}}>Pitch</th>
                          <th style={{width: '10%'}}>Xóa</th>
                      </tr>
                  </thead>
                  <tbody>
                  {hotspots.length === 0 ? (
                      <tr>
                          <td colSpan="5" style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>
                              Chưa có hotspots. {editMode && 'Nhấn "Thêm điểm" để thêm hotspot mới.'}
                          </td>
                      </tr>
                  ) : (
                      hotspots.map((h, i) => (
                          <tr key={i}>
                              <td>
                                <input 
                                    type="text" 
                                    className="table-input"
                                    value={h.label || ""} 
                                    onChange={e => updateHotspotValue(i, 'label', e.target.value)}
                                    disabled={!editMode}
                                />
                              </td>
                              <td>
                                <select 
                                    className="table-select"
                                    value={h.target} 
                                    onChange={e => updateHotspotValue(i, 'target', e.target.value)}
                                    disabled={!editMode}
                                >
                                    {renderSceneOptions()}
                                </select>
                              </td>
                              <td>
                                <input 
                                    className="table-input" 
                                    type="number" 
                                    step="0.01" 
                                    value={h.yaw} 
                                    onChange={e => updateHotspotValue(i, 'yaw', e.target.value)}
                                    disabled={!editMode}
                                />
                              </td>
                              <td>
                                <input 
                                    className="table-input" 
                                    type="number" 
                                    step="0.01" 
                                    value={h.pitch} 
                                    onChange={e => updateHotspotValue(i, 'pitch', e.target.value)}
                                    disabled={!editMode}
                                />
                              </td>
                              <td>
                                <button 
                                    className="btn btn-danger" 
                                    onClick={() => deleteHotspot(i)}
                                    disabled={!editMode}
                                    style={{ opacity: editMode ? 1 : 0.5, cursor: editMode ? 'pointer' : 'not-allowed' }}
                                >
                                    ×
                                </button>
                              </td>
                          </tr>
                      ))
                  )}
                  </tbody>
              </table>

          {/* Các nút thao tác ở dưới bảng */}
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              {editMode ? (
                  <>
                      <button className="btn btn-primary" onClick={() => setShowCreateDialog(true)}>
                          + Thêm điểm
                      </button>
                      <button className="btn btn-back" onClick={() => {
                          setEditMode(false);
                          window.location.reload(); 
                      }}>
                          Hủy
                      </button>
                      <button className="btn btn-primary" onClick={saveHotspots} disabled={saving}>
                          {saving ? "Lưu..." : "💾 Lưu lại"}
                      </button>
                  </>
              ) : (
                  hotspots.length > 0 && (
                      <div style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
                          Nhấn "Sửa Hotspots" để chỉnh sửa
                      </div>
                  )
              )}
          </div>
      </div>

      {showCreateDialog && (
          <div className="modal-overlay" onClick={() => setShowCreateDialog(false)}>
              <div className="modal-content" onClick={e => e.stopPropagation()}>
                  <h3>Thêm điểm mới</h3>
                  <div className="form-group">
                      <label>Đến phòng:</label>
                      <select value={newHotspotTarget} onChange={e => setNewHotspotTarget(e.target.value)}>
                          {renderSceneOptions()}
                      </select>
                  </div>
                  <div className="form-group">
                      <label>Tên hiển thị:</label>
                      <input value={newHotspotLabel} onChange={e => setNewHotspotLabel(e.target.value)} />
                  </div>
                  <div className="scene-preview-actions" style={{justifyContent: 'flex-end'}}>
                      <button className="btn btn-back" onClick={() => setShowCreateDialog(false)}>Hủy</button>
                      <button className="btn btn-primary" onClick={createHotspot}>Thêm</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}