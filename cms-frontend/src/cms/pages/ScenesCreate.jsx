import React, { useEffect, useMemo, useState } from "react";

export default function ScenesCreate({ apiBase = "/api" }) {
  const [nameVi, setNameVi] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [floor, setFloor] = useState(0);
  const [initialYaw, setInitialYaw] = useState(0);
  const [initialPitch, setInitialPitch] = useState(0);
  const [initialFov, setInitialFov] = useState(1.2);
  const [allScenes, setAllScenes] = useState([]);
  const [selectedTargets, setSelectedTargets] = useState([]); // ids of scenes to connect
  const [hotspotLabel, setHotspotLabel] = useState(""); // optional default label for connections
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  // Generate scene ID from Vietnamese name or filename
  function generateSceneId(name, filename) {
    if (name) {
      return name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
        .replace(/[^a-z0-9]+/g, "") // Remove special chars
        .substring(0, 50);
    }
    return filename.replace(/\.[^.]+$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  // load existing scenes to build connection options
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase}/scenes`);
        const data = await res.json().catch(() => []);
        setAllScenes(Array.isArray(data) ? data : []);
      } catch (_) {
        // ignore
      }
    })();
  }, [apiBase]);

  // preview local image
  useEffect(() => {
    if (!file) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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

  function toggleTarget(id) {
    setSelectedTargets((prev) =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!file) return setErr("Chưa chọn file");
    setLoading(true);
    try {
      // Step 1: Generate scene ID first (needed for consistent file naming)
      const sceneName = nameVi || file.name.replace(/\.[^.]+$/, "");
      let sceneId = generateSceneId(nameVi, file.name);
      // Ensure unique ID by checking against existing scenes
      try {
        const resList = await fetch(`${apiBase}/scenes`);
        const existing = await resList.json().catch(() => []);
        const ids = Array.isArray(existing) ? new Set(existing.map(s => s.id)) : new Set();
        if (ids.has(sceneId)) {
          const suffix = Date.now().toString(36);
          sceneId = `${sceneId}-${suffix}`.slice(0, 64);
        }
      } catch (_) { /* ignore list fetch issue and proceed */ }
      
      // Step 2: Upload the file with scene_id for consistent naming
      const fd = new FormData();
      fd.append("file", file);
      fd.append("scene_id", sceneId); // Pass scene_id so backend can name file consistently
      const uploadRes = await fetch(`${apiBase}/upload`, { method: "POST", body: fd });
      if (!uploadRes.ok) {
        const uploadBody = await uploadRes.json().catch(() => ({ error: "Upload thất bại" }));
        throw new Error(uploadBody.error || uploadBody.message || "Upload thất bại");
      }
      const uploadData = await uploadRes.json();
      const fileUrl = uploadData.url;
      
      // Build hotspots from selected targets - place them around evenly with default yaw/pitch
      const connections = selectedTargets.map((targetId, idx) => {
        const yaw = ((idx / Math.max(1, selectedTargets.length)) * Math.PI * 2) - Math.PI;
        return {
          target: targetId,
          yaw,
          pitch: 0,
          label: hotspotLabel || (allScenes.find(s=>s.id===targetId)?.name?.vi || targetId)
        };
      });

      const sceneData = {
        id: sceneId,
        name: {
          vi: nameVi || sceneName,
          en: nameEn || sceneName
        },
        type: "equirect",
        url: fileUrl,
        initialView: {
          yaw: Number(initialYaw) || 0,
          pitch: Number(initialPitch) || 0,
          hfov: Number(initialFov) || 1.2
        },
        hotspots: connections,
        floor: Number(floor) || 0
      };

      const createRes = await fetch(`${apiBase}/scenes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sceneData)
      });
      
      if (!createRes.ok) {
        let errMsg = "Tạo scene thất bại";
        try {
          const createBody = await createRes.json();
          errMsg = createBody?.error || createBody?.message || errMsg;
        } catch (_) {
          // Try read text for more info
          try {
            const txt = await createRes.text();
            if (txt) errMsg = txt.slice(0, 300);
          } catch (_) {}
        }
        throw new Error(errMsg);
      }
      
      // After creating new scene, create backlinks from target scenes to this new scene
      for (const targetId of selectedTargets) {
        try {
          const tRes = await fetch(`${apiBase}/scenes/${targetId}`);
          if (!tRes.ok) continue; // skip if target scene missing
          const t = await tRes.json();
          const existing = Array.isArray(t.hotspots) ? t.hotspots : [];
          const hasBacklink = existing.some(h => h && (h.target === sceneId));
          if (!hasBacklink) {
            const newHotspot = { 
              target: sceneId, 
              yaw: 0, 
              pitch: 0, 
              label: sceneData.name.vi || sceneId 
            };
            const updatedHotspots = [...existing, newHotspot];
            // Update target scene with full data to preserve all fields
            const targetUpdate = {
              ...t,
              hotspots: updatedHotspots
            };
            await fetch(`${apiBase}/scenes/${targetId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(targetUpdate)
            });
          }
        } catch (e) {
          // don't block creation if backlinking fails for one target
          console.warn("Failed to add backlink to", targetId, e);
        }
      }
      
      setMsg("Tạo scene thành công");
      // redirect về list after a short delay
      setTimeout(() => {
        window.location.href = "/cms/scenes";
      }, 1000);
    } catch (e) {
      setErr(e.message);
    } finally { setLoading(false); }
  }

  return (
    <div className="cms-container">
      <div className="scenes-list-header">
        <h1 className="scenes-list-title">Tạo Scene mới</h1>
        <a href="/cms/scenes" className="scene-modal-btn scene-modal-btn-secondary">Hủy</a>
      </div>

      <form onSubmit={submit} className="scene-preview-info">
        {/* Left: basic info */}
        <div>
          <h3>Thông tin cơ bản</h3>
          <div className="form-row">
            <label className="scene-info-label">Tên (Tiếng Việt) *</label>
            <input className="input" value={nameVi} onChange={(e)=>setNameVi(e.target.value)} placeholder="Ví dụ: Cổng Chính" required />
          </div>
          <div className="form-row">
            <label className="scene-info-label">Tên (English)</label>
            <input className="input" value={nameEn} onChange={(e)=>setNameEn(e.target.value)} placeholder="Example: Main Gate" />
          </div>
          <div className="form-row">
            <label className="scene-info-label">Tầng</label>
            <select className="input" value={floor} onChange={(e)=>setFloor(e.target.value)}>
              {floors.map(f=>(
                <option key={f} value={f}>{floorNames[f]}</option>
              ))}
            </select>
          </div>
          <div className="form-row">
            <label className="scene-info-label">Ảnh panorama *</label>
            <input type="file" accept="image/*" className="input" onChange={(e)=>setFile(e.target.files[0])} required />
            {file && <div className="scene-info-value">Đã chọn: {file.name} ({(file.size/1024/1024).toFixed(2)} MB)</div>}
          </div>
          {previewUrl && (
            <div className="form-row">
              <label className="scene-info-label">Xem nhanh ảnh</label>
              <img src={previewUrl} alt="preview" style={{width:'100%', borderRadius:12, border:'1px solid rgba(15,23,42,0.08)'}} />
            </div>
          )}
        </div>

        {/* Right: view + connections */}
        <div>
          <h3>Cấu hình góc nhìn ban đầu</h3>
          <div className="form-row" style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12}}>
            <div>
              <label className="scene-info-label">Yaw</label>
              <input type="number" step="0.01" className="input" value={initialYaw} onChange={(e)=>setInitialYaw(e.target.value)} />
            </div>
            <div>
              <label className="scene-info-label">Pitch</label>
              <input type="number" step="0.01" className="input" value={initialPitch} onChange={(e)=>setInitialPitch(e.target.value)} />
            </div>
            <div>
              <label className="scene-info-label">FOV</label>
              <input type="number" step="0.01" className="input" value={initialFov} onChange={(e)=>setInitialFov(e.target.value)} />
            </div>
          </div>

          <h3 style={{marginTop:16}}>Kết nối với Scene hiện có</h3>
          <div className="form-row">
            <label className="scene-info-label">Nhãn mặc định cho hotspot (tuỳ chọn)</label>
            <input className="input" placeholder="Ví dụ: Đi tới ..." value={hotspotLabel} onChange={(e)=>setHotspotLabel(e.target.value)} />
          </div>
          <div className="scene-info-group" style={{maxHeight:220, overflow:'auto'}}>
            {allScenes.length === 0 && <div>Chưa có scene nào để kết nối.</div>}
            {allScenes.length > 0 && allScenes.map((s)=>(
              <label key={s.id} style={{display:'flex', alignItems:'center', gap:10, padding:'6px 0'}}>
                <input type="checkbox" checked={selectedTargets.includes(s.id)} onChange={()=>toggleTarget(s.id)} />
                <span><strong>{s.name?.vi || s.id}</strong> <span style={{color:'#64748b'}}>({s.id})</span></span>
              </label>
            ))}
          </div>
          <div className="form-row" style={{marginTop:16, display:'flex', gap:12}}>
            <button type="submit" disabled={loading} className="scene-modal-btn scene-modal-btn-primary">
              {loading ? "Đang tạo..." : "Upload & Tạo"}
            </button>
            <a href="/cms/scenes" className="scene-modal-btn scene-modal-btn-secondary">Hủy</a>
          </div>
          {msg && <div className="scenes-error" style={{background:'#ecfdf5', color:'#065f46', borderColor:'#10b98166'}}>{msg}</div>}
          {err && <div className="scenes-error">{err}</div>}
        </div>
      </form>
    </div>
  );
}
