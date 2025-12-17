import React, { useEffect, useState } from "react";

export default function ScenesList({ apiBase = "/api" }) {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedScene, setSelectedScene] = useState(null);

  const floors = [0, 1, 2, 3, 4, 5, 6];
  const floorNames = {
    0: "Tầng Trệt (Ground Floor)",
    1: "Tầng 1 (Floor 1)",
    2: "Tầng 2 (Floor 2)",
    3: "Tầng 3 (Floor 3)",
    4: "Tầng 4 (Floor 4)",
    5: "Tầng 5 (Floor 5)",
    6: "Tầng 6 (Floor 6)"
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/scenes`);
      if (!res.ok) throw new Error("Không tải được scenes");
      const data = await res.json();
      setScenes(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openSceneDetail(scene) {
    setSelectedScene(scene);
  }

  function closeSceneDetail() {
    setSelectedScene(null);
  }

  async function removeScene(id, e) {
    e.stopPropagation();
    if (!window.confirm("Xác nhận xóa scene này?")) return;
    try {
      const res = await fetch(`${apiBase}/scenes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Xóa thất bại");
      setScenes((prev) => prev.filter((s) => s.id !== id));
      if (selectedScene?.id === id) {
        closeSceneDetail();
      }
    } catch (e) {
      alert(e.message);
    }
  }

  function getScenesByFloor(floor) {
    return scenes.filter((s) => (s.floor ?? 0) === floor);
  }

  return (
    <div >
      <div className="scenes-list-header1">
        <h1 className="scenes-list-title">Danh sách Scenes</h1>
        <a 
          href="/cms/scenes/create" 
          className="scenes-create-btn"
        >
          + Tạo Scene mới
        </a>
      </div>

      {loading && <div className="scenes-loading">Đang tải...</div>}
      {error && <div className="scenes-error">{error}</div>}

      {!loading && !error && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {floors.map((floor) => {
            const floorScenes = getScenesByFloor(floor);
            if (floorScenes.length === 0) return null;

            return (
              <div key={floor} className="floor-section">
                <h2 className="floor-title">
                  {floorNames[floor]}
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {floorScenes.map((scene) => (
                    <div
                      key={scene.id}
                      className="scene-item"
                    >
                      <div
                        className="scene-item-content"
                        onClick={() => openSceneDetail(scene)}
                      >
                        <div className="scene-name">
                          {(scene.name && scene.name.vi) || scene.id}
                        </div>
                        {scene.name && scene.name.en && (
                          <div className="scene-name-en">
                            {scene.name.en}
                          </div>
                        )}
                      </div>
                      <div className="scene-actions">
                        <a
                          href={`/cms/scenes/${scene.id}/preview`}
                          className="scene-btn scene-btn-view"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Xem
                        </a>
                        <a
                          href={`/cms/scenes/${scene.id}/edit`}
                          className="scene-btn scene-btn-edit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          Sửa
                        </a>
                        <button
                          onClick={(e) => removeScene(scene.id, e)}
                          className="scene-btn scene-btn-delete"
                        >
                          Xóa
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Scene Detail Modal */}
      {selectedScene && (
        <div
          className="scene-modal-overlay"
          onClick={closeSceneDetail}
        >
          <div
            className="scene-modal"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="scene-modal-header">
              <div>
                <h2 className="scene-modal-title">
                  {(selectedScene.name && selectedScene.name.vi) || selectedScene.id}
                </h2>
                {selectedScene.name && selectedScene.name.en && (
                  <p className="scene-modal-subtitle">{selectedScene.name.en}</p>
                )}
              </div>
              <button
                onClick={closeSceneDetail}
                className="scene-modal-close"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="scene-modal-content">
              <div style={{ maxWidth: '600px', margin: '0 auto' }}>
                <h3 style={{ fontSize: '20px', fontWeight: '700', color: '#0f172a', marginBottom: '24px' }}>
                  Thông tin Scene
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div className="scene-info-section">
                    <label className="scene-info-label">ID</label>
                    <p className="scene-info-value mono">{selectedScene.id}</p>
                  </div>
                  <div className="scene-info-section">
                    <label className="scene-info-label">Tầng</label>
                    <p className="scene-info-value">{floorNames[selectedScene.floor ?? 0]}</p>
                  </div>
                  <div className="scene-info-section">
                    <label className="scene-info-label">Loại</label>
                    <p className="scene-info-value">{selectedScene.type || "equirect"}</p>
                  </div>
                  <div className="scene-info-section">
                    <label className="scene-info-label">URL Ảnh</label>
                    <p className="scene-info-value" style={{ fontSize: '13px', wordBreak: 'break-all' }}>{selectedScene.url}</p>
                  </div>
                  {selectedScene.initialView && (
                    <div className="scene-info-section">
                      <label className="scene-info-label">Góc nhìn ban đầu</label>
                      <div className="scene-info-group">
                        <p>Yaw: {selectedScene.initialView.yaw ?? 0}°</p>
                        <p>Pitch: {selectedScene.initialView.pitch ?? 0}°</p>
                        <p>FOV: {selectedScene.initialView.hfov ?? 1.2}</p>
                      </div>
                    </div>
                  )}
                  {selectedScene.hotspots && selectedScene.hotspots.length > 0 && (
                    <div className="scene-info-section">
                      <label className="scene-info-label">Hotspots</label>
                      <p className="scene-info-value">{selectedScene.hotspots.length} điểm</p>
                    </div>
                  )}
                </div>
                <div className="scene-modal-actions">
                  <a
                    href={`/viewer/${selectedScene.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="scene-modal-btn scene-modal-btn-primary"
                  >
                    Mở trong Viewer
                  </a>
                  <a
                    href={`/cms/scenes/${selectedScene.id}/edit`}
                    className="scene-modal-btn scene-modal-btn-secondary"
                  >
                    Chỉnh sửa
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
