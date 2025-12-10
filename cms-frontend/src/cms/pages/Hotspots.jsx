import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const apiBase = "/api";

export default function Hotspots() {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedScene, setSelectedScene] = useState(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/scenes`);
        if (!res.ok) throw new Error("Không tải được scenes");
        const data = await res.json();
        setScenes(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message || "Không thể tải scenes");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Collect all hotspots from all scenes
  const allHotspots = scenes.flatMap((scene) => {
    if (!scene.hotspots || !Array.isArray(scene.hotspots)) return [];
    return scene.hotspots.map((hotspot, idx) => ({
      ...hotspot,
      sceneId: scene.id,
      sceneName: scene.name?.vi || scene.name || scene.id,
      hotspotIndex: idx
    }));
  });

  function getTargetSceneName(targetId) {
    const targetScene = scenes.find(s => s.id === targetId);
    return targetScene?.name?.vi || targetScene?.name || targetId;
  }

  if (loading) return <div className="scenes-loading">Đang tải...</div>;
  if (error) return <div className="scenes-error">{error}</div>;

  return (
    <div className="cms-container">
      <div className="scenes-list-header">
        <h1 className="scenes-list-title">Quản lý Hotspots</h1>
      </div>

      <div className="scene-preview-info" style={{ marginTop: 24 }}>
        <div>
          <h3>Thống kê</h3>
          <ul>
            <li><strong>Tổng số scenes:</strong> {scenes.length}</li>
            <li><strong>Tổng số hotspots:</strong> {allHotspots.length}</li>
            <li><strong>Scenes có hotspots:</strong> {scenes.filter(s => s.hotspots && s.hotspots.length > 0).length}</li>
          </ul>
        </div>
      </div>

      {allHotspots.length > 0 ? (
        <div className="scene-preview-hotspot-list" style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 16, fontSize: 20, fontWeight: 700 }}>Danh sách Hotspots</h3>
          <table>
            <thead>
              <tr>
                <th>Scene nguồn</th>
                <th>Nhãn</th>
                <th>Scene đích</th>
                <th>Yaw</th>
                <th>Pitch</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {allHotspots.map((hotspot, idx) => (
                <tr key={`${hotspot.sceneId}-${hotspot.hotspotIndex}-${idx}`}>
                  <td>
                    <Link 
                      to={`/cms/scenes/${hotspot.sceneId}/preview`}
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      {hotspot.sceneName}
                    </Link>
                  </td>
                  <td>{hotspot.label || "—"}</td>
                  <td>
                    <Link 
                      to={`/cms/scenes/${hotspot.target}/preview`}
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      {getTargetSceneName(hotspot.target)}
                    </Link>
                  </td>
                  <td>{hotspot.yaw?.toFixed(3) ?? "—"}</td>
                  <td>{hotspot.pitch?.toFixed(3) ?? "—"}</td>
                  <td>
                    <Link
                      to={`/cms/scenes/${hotspot.sceneId}/preview`}
                      className="scene-btn scene-btn-view"
                    >
                      Xem & Sửa
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ 
          marginTop: 24, 
          padding: 32, 
          textAlign: 'center', 
          background: 'var(--panel)', 
          borderRadius: 16,
          border: '1px solid rgba(15,23,42,0.06)'
        }}>
          <p style={{ color: 'var(--muted)', fontSize: 16 }}>
            Chưa có hotspots nào. Tạo hotspots trong trang <Link to="/cms/scenes" style={{ color: 'var(--accent)' }}>Scenes</Link>.
          </p>
        </div>
      )}
    </div>
  );
}
