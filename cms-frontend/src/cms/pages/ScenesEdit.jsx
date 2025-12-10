import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function ScenesEdit({ apiBase = "/api" }) {
  const { sceneId } = useParams();
  const navigate = useNavigate();

  const [scene, setScene] = useState(null);
  const [allScenes, setAllScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  
  // State quản lý ảnh preview
  const [imageKey, setImageKey] = useState(0); 
  const [imageTimestamp, setImageTimestamp] = useState(Date.now()); 
  const [previewImageUrl, setPreviewImageUrl] = useState(null); 

  // Dữ liệu dự phòng (Backup) để đối chiếu khi lưu
  const [originalHotspotsData, setOriginalHotspotsData] = useState([]);

  const floors = useMemo(() => [0,1,2,3,4,5,6], []);
  const floorNames = useMemo(() => ({
    0: "Tầng Trệt (Ground Floor)",
    1: "Tầng 1",
    2: "Tầng 2",
    3: "Tầng 3",
    4: "Tầng 4",
    5: "Tầng 5",
    6: "Tầng 6"
  }), []);

  // Hàm tạo URL chống cache
  const getFreshUrl = (url) => `${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`;

  useEffect(() => {
    async function load() {
      setLoading(true); setErr(null);
      try {
        const headers = { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' };
        
        const [scRes, allRes] = await Promise.all([
          fetch(getFreshUrl(`${apiBase}/scenes/${sceneId}`), { headers }),
          fetch(getFreshUrl(`${apiBase}/scenes`), { headers })
        ]);
        
        if (!scRes.ok) throw new Error("Không tải được scene");
        const s = await scRes.json();
        const all = await allRes.json().catch(()=>[]);
        
        // Lưu backup dữ liệu hotspot gốc
        setOriginalHotspotsData(s.hotspots || []);
        console.log(`[Load Scene] Đã tải dữ liệu. Số hotspot hiện có: ${(s.hotspots || []).length}`);

        setScene({
          id: s.id,
          nameVi: s?.name?.vi || s?.name || "",
          nameEn: s?.name?.en || "",
          url: s.url,
          floor: s.floor ?? 0,
          // Load dữ liệu góc nhìn lên Form
          initialYaw: s?.initialView?.yaw ?? 0,
          initialPitch: s?.initialView?.pitch ?? 0,
          initialFov: s?.initialView?.hfov ?? 1.2,
          // Map danh sách hotspot thành mảng ID để hiển thị checkbox
          targets: (s.hotspots || []).map(h => h.target).filter(Boolean),
        });
        
        setAllScenes(Array.isArray(all) ? all : []);
        
        // Xử lý cache ảnh
        let extractedTimestamp = null;
        if (s.url) {
          const match = s.url.match(/_(\d+)\.(jpg|jpeg|png|webp|gif)$/i) || s.url.match(/\?v=(\d+)/);
          if (match) extractedTimestamp = parseInt(match[1]);
        }
        
        if (extractedTimestamp) {
          setImageKey(extractedTimestamp % 1000000);
          setImageTimestamp(extractedTimestamp);
        } else {
          setImageKey(prev => prev + 1);
          setImageTimestamp(Date.now());
        }
        
      } catch (e) {
        setErr(e.message || "Lỗi khi tải scene");
      } finally {
        setLoading(false);
      }
    }
    load();
    
    return () => {
      if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
    };
  }, [apiBase, sceneId]);

  function update(key, value) { setScene(prev => ({ ...prev, [key]: value })); }

  function toggleTarget(id) {
    setScene(prev => {
      const has = prev.targets.includes(id);
      return { ...prev, targets: has ? prev.targets.filter(x=>x!==id) : [...prev.targets, id] };
    });
  }

  // --- LOGIC MERGE THÔNG MINH (Giữ tọa độ Server) ---
  async function prepareSafeHotspots(uiTargets) {
    try {
        // 1. Tải dữ liệu MỚI NHẤT từ server (để lấy tọa độ Preview vừa sửa)
        const res = await fetch(getFreshUrl(`${apiBase}/scenes/${sceneId}`), { 
            headers: { 'Cache-Control': 'no-cache' } 
        });
        const latestData = await res.json();
        const latestHotspots = latestData.hotspots || [];

        // 2. Duyệt qua danh sách checkbox đang tích trên UI
        return uiTargets.map((targetId, idx) => {
            // Ưu tiên 1: Tìm trong dữ liệu mới nhất từ Server
            let existing = latestHotspots.find(h => h.target === targetId);
            
            // Ưu tiên 2: Nếu không thấy (do lỗi mạng?), tìm trong Backup lúc load trang
            if (!existing) {
                existing = originalHotspotsData.find(h => h.target === targetId);
            }

            if (existing) {
                // TÌM THẤY -> GIỮ NGUYÊN TỌA ĐỘ CŨ (Yaw/Pitch)
                console.log(`[Merge] Giữ nguyên tọa độ cho ${targetId}`);
                return { ...existing }; 
            } else {
                // KHÔNG TÌM THẤY -> Mới tạo -> Tính tọa độ mặc định
                console.log(`[Merge] Tạo mới tọa độ mặc định cho ${targetId}`);
                const yaw = ((idx / Math.max(1, uiTargets.length)) * Math.PI * 2) - Math.PI;
                return {
                    target: targetId,
                    yaw: yaw, 
                    pitch: 0, 
                    label: (allScenes.find(s=>s.id===targetId)?.name?.vi || targetId) 
                };
            }
        });
    } catch (e) {
        console.error("Lỗi merge:", e);
        return []; // Fallback an toàn
    }
  }

  async function save(e) {
    e.preventDefault(); 
    setErr(null); setMsg(null); setSaving(true);
    
    try {
      // Bước 1: Tính toán danh sách Hotspots an toàn
      const safeHotspots = await prepareSafeHotspots(scene.targets);

      // Bước 2: Tạo Payload
      const payload = {
        id: scene.id,
        name: { vi: scene.nameVi || scene.id, en: scene.nameEn || scene.nameVi || scene.id },
        type: "equirect",
        url: scene.url, 
        
        // Lấy Initial View từ Form (Input)
        initialView: {
          yaw: Number(scene.initialYaw),
          pitch: Number(scene.initialPitch),
          hfov: Number(scene.initialFov)
        },
        
        floor: Number(scene.floor) || 0,
        hotspots: safeHotspots // <--- Dùng danh sách đã bảo toàn
      };

      // Bước 3: Gửi Request
      const res = await fetch(`${apiBase}/scenes/${sceneId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      // Bước 4: Cập nhật lại backup data
      const savedData = await res.json();
      setOriginalHotspotsData(savedData.hotspots || []);
      
      setMsg("Đã lưu thành công! (Dữ liệu tọa độ được bảo toàn)");

    } catch (e) {
      console.error("Lỗi:", e);
      setErr(e.message || "Không thể lưu");
    } finally {
      setSaving(false);
    }
  }

  async function onReplaceImage(file) {
    if (!file) return;
    setMsg("Đang tải ảnh lên..."); setErr(null);
    
    if (previewImageUrl) URL.revokeObjectURL(previewImageUrl);
    const objectUrl = URL.createObjectURL(file);
    setPreviewImageUrl(objectUrl);
    
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("scene_id", scene.id);
      const uploadRes = await fetch(`${apiBase}/upload`, { method: "POST", body: fd });
      if (!uploadRes.ok) throw new Error(await uploadRes.text());
      const { url: newUrl } = await uploadRes.json();
      
      setScene(prev => ({ ...prev, url: newUrl }));

      // Cũng dùng logic an toàn khi upload ảnh
      const safeHotspots = await prepareSafeHotspots(scene.targets);

      const updatePayload = {
        id: scene.id,
        name: { vi: scene.nameVi || scene.id, en: scene.nameEn || scene.nameVi || scene.id },
        type: "equirect",
        url: newUrl, 
        initialView: {
          yaw: Number(scene.initialYaw),
          pitch: Number(scene.initialPitch),
          hfov: Number(scene.initialFov)
        },
        floor: Number(scene.floor) || 0,
        hotspots: safeHotspots
      };
      
      const updateRes = await fetch(`${apiBase}/scenes/${scene.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload)
      });
      if (!updateRes.ok) throw new Error("Cập nhật scene thất bại");
      
      const updatedScene = await updateRes.json();
      setOriginalHotspotsData(updatedScene.hotspots || []);
      
      const newTimestamp = Date.now();
      setImageKey(newTimestamp % 1000000);
      setImageTimestamp(newTimestamp);
      setMsg("Đã cập nhật ảnh thành công!");
      
      setTimeout(() => { URL.revokeObjectURL(objectUrl); setPreviewImageUrl(null); }, 50);
    } catch (error) { setErr(error.message || "Lỗi khi cập nhật ảnh"); }
  }

  if (loading) return <div className="scenes-loading">Đang tải...</div>;
  if (err && !scene) return <div className="scenes-error">{err}</div>;
  if (!scene) return null;

  return (
    <div className="cms-container">
      <div className="scenes-list-header">
        <h1 className="scenes-list-title">Sửa Scene</h1>
        <a href="/cms/scenes" className="scene-modal-btn scene-modal-btn-secondary">Quay lại</a>
      </div>

      <form onSubmit={save} className="scene-preview-info">
        <div>
          <h3>Thông tin cơ bản</h3>
          <div className="form-row">
            <label className="scene-info-label">ID (không đổi)</label>
            <div className="scene-info-value mono">{scene.id}</div>
          </div>
          <div className="form-row">
            <label className="scene-info-label">Tên (Tiếng Việt)</label>
            <input className="input" value={scene.nameVi} onChange={(e)=>update("nameVi", e.target.value)} />
          </div>
          <div className="form-row">
            <label className="scene-info-label">Tên (English)</label>
            <input className="input" value={scene.nameEn} onChange={(e)=>update("nameEn", e.target.value)} />
          </div>
          <div className="form-row">
            <label className="scene-info-label">Tầng</label>
            <select className="input" value={scene.floor} onChange={(e)=>update("floor", e.target.value)}>
              {floors.map(f=>(
                <option key={f} value={f}>{floorNames[f]}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label className="scene-info-label">Ảnh panorama</label>
            <input type="file" accept="image/*" className="input" onChange={(e)=>onReplaceImage(e.target.files[0])} disabled={saving} />
            
            <div className="scene-info-value" style={{marginTop:8}}>
              <span className="mono">{scene.url}</span>
              {(previewImageUrl || scene.url) && (
                <div style={{marginTop:8}}>
                  <img 
                    key={`img-${scene.id}-${imageKey}-${imageTimestamp}`} 
                    src={
                      previewImageUrl || (scene.url 
                        ? (scene.url.match(/_(\d+)\.(jpg|jpeg|png|webp|gif)$/i) 
                            ? `${scene.url}?t=${imageTimestamp}&k=${imageKey}` 
                            : `${scene.url}?v=${imageTimestamp}&k=${imageKey}`)
                        : '')
                    } 
                    alt="Preview" 
                    style={{
                      maxWidth: '100%', 
                      maxHeight: '200px', 
                      borderRadius: '8px', 
                      border: '1px solid #e2e8f0', 
                      objectFit: 'contain'
                    }} 
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <h3>Góc nhìn ban đầu</h3>
          <p style={{fontSize:'0.85rem', color:'#666', marginBottom:8}}>
             *Nhập thông số tại đây nếu muốn sửa. Nếu không sửa, giữ nguyên số hiển thị.
          </p>
          <div className="form-row" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12}}>
            <div>
              <label className="scene-info-label">Yaw</label>
              <input type="number" step="0.01" className="input" value={scene.initialYaw} onChange={(e)=>update("initialYaw", e.target.value)} />
            </div>
            <div>
              <label className="scene-info-label">Pitch</label>
              <input type="number" step="0.01" className="input" value={scene.initialPitch} onChange={(e)=>update("initialPitch", e.target.value)} />
            </div>
            <div>
              <label className="scene-info-label">FOV</label>
              <input type="number" step="0.01" className="input" value={scene.initialFov} onChange={(e)=>update("initialFov", e.target.value)} />
            </div>
          </div>

          <h3 style={{marginTop:16}}>Kết nối (hotspots)</h3>
          <p style={{fontSize:'0.85rem', color:'#666', marginBottom:8}}>
            *Tích chọn để hiển thị hotspot. Tọa độ sẽ được <strong>GIỮ NGUYÊN</strong> từ file nếu đã có.
          </p>
          <div className="scene-info-group" style={{maxHeight:240, overflow:'auto'}}>
            {allScenes.filter(s=>s.id!==scene.id).map((s)=>(
              <label key={s.id} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0', cursor:'pointer'}}>
                <input type="checkbox" checked={scene.targets.includes(s.id)} onChange={()=>toggleTarget(s.id)} />
                <span><strong>{s.name?.vi || s.id}</strong> <span style={{color:'#64748b'}}>({s.id})</span></span>
              </label>
            ))}
          </div>

          <div className="form-row" style={{marginTop:16, display:'flex', gap:12}}>
            <button type="submit" className="scene-modal-btn scene-modal-btn-primary" disabled={saving}>
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
            <a href="/cms/scenes" className="scene-modal-btn scene-modal-btn-secondary">Huỷ</a>
          </div>
          {msg && <div className="scenes-error" style={{background:'#ecfdf5', color:'#065f46', borderColor:'#10b98166'}}>{msg}</div>}
          {err && <div className="scenes-error">{err}</div>}
        </div>
      </form>
    </div>
  );
}