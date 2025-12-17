import React, { useEffect, useState } from "react";

const apiBase = "/api";

export default function Tours() {
  const [tours, setTours] = useState([]);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingTour, setEditingTour] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [draggedScene, setDraggedScene] = useState(null);

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

  useEffect(() => {
    loadTours();
    loadScenes();
  }, []);

  async function loadTours() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/tours`);
      if (!res.ok) throw new Error("Không tải được tours");
      const data = await res.json();
      setTours(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Không thể tải tours");
    } finally {
      setLoading(false);
    }
  }

  async function loadScenes() {
    try {
      const res = await fetch(`${apiBase}/scenes`);
      if (res.ok) {
        const data = await res.json();
        setScenes(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn("Failed to load scenes:", e);
    }
  }

  function getSceneName(sceneId) {
    const scene = scenes.find(s => s.id === sceneId);
    return scene?.name?.vi || scene?.name || sceneId;
  }

  function getSceneFloor(sceneId) {
    const scene = scenes.find(s => s.id === sceneId);
    return scene?.floor ?? 0;
  }

  function getScenesByFloor(floor) {
    return scenes.filter((s) => (s.floor ?? 0) === floor);
  }

  function getTourScenesByFloor(tourScenes) {
    const grouped = {};
    tourScenes.forEach((sceneId) => {
      const floor = getSceneFloor(sceneId);
      if (!grouped[floor]) {
        grouped[floor] = [];
      }
      grouped[floor].push(sceneId);
    });
    return grouped;
  }

  async function handleDelete(tourId, e) {
    e.stopPropagation();
    if (!window.confirm("Xác nhận xóa tour này?")) return;
    
    try {
      const res = await fetch(`${apiBase}/tours/${tourId}`, { method: "DELETE" });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Xóa thất bại");
      }
      await loadTours();
      try {
        if (window.BroadcastChannel) {
          const bc = new BroadcastChannel('cms_updates');
          bc.postMessage('tours-updated');
          bc.close();
        } else {
          localStorage.setItem('tours-updated', Date.now().toString());
        }
        window.dispatchEvent(new CustomEvent('tours-updated'));
      } catch (err) { console.warn('Broadcast error', err); }
    } catch (e) {
      alert(e.message);
    }
  }

  function handleEdit(tour) {
    setEditingTour({ ...tour });
    setShowCreateModal(true);
  }

  function handleCreate() {
    setEditingTour({
      id: "",
      name: "",
      keywords: [],
      scenes: []
    });
    setShowCreateModal(true);
  }

  function handleSave() {
    if (!editingTour.name.trim()) {
      alert("Vui lòng nhập tên tour");
      return;
    }

    const isEdit = editingTour.id && tours.some(t => t.id === editingTour.id);
    const url = isEdit 
      ? `${apiBase}/tours/${editingTour.id}`
      : `${apiBase}/tours`;
    const method = isEdit ? "PUT" : "POST";
    (async () => {
      try {
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingTour)
        });

        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }

        if (!res.ok) {
          const msg = data && data.error ? data.error : `Lỗi server: ${res.status} ${res.statusText}`;
          alert(msg);
          return;
        }

        // Success
        setShowCreateModal(false);
        setEditingTour(null);
        await loadTours();

        try {
          // Broadcast update to other tabs/windows
          if (window.BroadcastChannel) {
            const bc = new BroadcastChannel('cms_updates');
            bc.postMessage('tours-updated');
            bc.close();
          } else {
            localStorage.setItem('tours-updated', Date.now().toString());
          }
          // Also dispatch same-tab event
          window.dispatchEvent(new CustomEvent('tours-updated'));
        } catch (e) { console.warn('Broadcast tours-updated failed', e); }

      } catch (e) {
        alert("Lỗi: " + (e && e.message ? e.message : e));
      }
    })();
  }

  function handleAddKeyword() {
    const keyword = prompt("Nhập từ khóa mới:");
    if (keyword && keyword.trim()) {
      setEditingTour({
        ...editingTour,
        keywords: [...(editingTour.keywords || []), keyword.trim()]
      });
    }
  }

  function handleRemoveKeyword(keyword) {
    setEditingTour({
      ...editingTour,
      keywords: (editingTour.keywords || []).filter(k => k !== keyword)
    });
  }

  function handleAddScene(sceneId) {
    if (!editingTour.scenes.includes(sceneId)) {
      setEditingTour({
        ...editingTour,
        scenes: [...(editingTour.scenes || []), sceneId]
      });
    }
  }

  function handleRemoveScene(index) {
    const newScenes = [...(editingTour.scenes || [])];
    newScenes.splice(index, 1);
    setEditingTour({
      ...editingTour,
      scenes: newScenes
    });
  }

  function handleDragStart(e, index) {
    setDraggedScene(index);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e, dropIndex) {
    e.preventDefault();
    if (draggedScene === null || draggedScene === dropIndex) return;

    const newScenes = [...(editingTour.scenes || [])];
    const draggedItem = newScenes[draggedScene];
    newScenes.splice(draggedScene, 1);
    newScenes.splice(dropIndex, 0, draggedItem);

    setEditingTour({
      ...editingTour,
      scenes: newScenes
    });
    setDraggedScene(null);
  }

  if (loading) return <div className="scenes-loading">Đang tải...</div>;
  if (error) return <div className="scenes-error">{error}</div>;

  return (
    <div className="cms-container">
      <div className="scenes-list-header">
        <h1 className="scenes-list-title">Quản lý Tours</h1>
        <button onClick={handleCreate} className="scenes-create-btn">
          + Tạo Tour mới
        </button>
      </div>

      {tours.length === 0 ? (
        <div style={{
          marginTop: 24,
          padding: 32,
          textAlign: 'center',
          background: 'var(--panel)',
          borderRadius: 16,
          border: '1px solid rgba(15,23,42,0.06)'
        }}>
          <p style={{ color: 'var(--muted)', fontSize: 16 }}>
            Chưa có tour nào. Nhấn "Tạo Tour mới" để bắt đầu.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: 24 }}>
          {tours.map((tour) => (
            <div
              key={tour.id}
              style={{
                background: 'var(--panel)',
                padding: 24,
                borderRadius: 16,
                border: '1px solid rgba(15,23,42,0.06)',
                boxShadow: 'var(--shadow)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
                    {tour.name}
                  </h3>
                  <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 4 }}>
                    ID: <code style={{ background: 'rgba(15,23,42,0.05)', padding: '2px 6px', borderRadius: 4 }}>{tour.id}</code>
                  </p>
                  {tour.keywords && tour.keywords.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {tour.keywords.map((keyword, idx) => (
                        <span
                          key={idx}
                          style={{
                            fontSize: 12,
                            padding: '4px 8px',
                            background: 'rgba(139, 92, 246, 0.1)',
                            color: '#8b5cf6',
                            borderRadius: 6
                          }}
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleEdit(tour)}
                    className="scene-btn scene-btn-edit"
                  >
                    Sửa
                  </button>
                  <button
                    onClick={(e) => handleDelete(tour.id, e)}
                    className="scene-btn scene-btn-delete"
                  >
                    Xóa
                  </button>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                  Scenes ({tour.scenes?.length || 0})
                </h4>
                {tour.scenes && tour.scenes.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {floors.map((floor) => {
                      const floorScenes = tour.scenes.filter((sceneId) => getSceneFloor(sceneId) === floor);
                      if (floorScenes.length === 0) return null;

                      return (
                        <div key={floor} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ 
                            fontSize: 12, 
                            fontWeight: 600, 
                            color: '#8b5cf6', 
                            marginBottom: 4,
                            padding: '4px 8px',
                            background: 'rgba(139, 92, 246, 0.1)',
                            borderRadius: 4,
                            display: 'inline-block',
                            width: 'fit-content'
                          }}>
                            {floorNames[floor]}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginLeft: 8 }}>
                            {floorScenes.map((sceneId, idx) => {
                              const globalIndex = tour.scenes.indexOf(sceneId);
                              return (
                                <div
                                  key={sceneId}
                                  style={{
                                    fontSize: 13,
                                    padding: '6px 12px',
                                    background: 'rgba(15,23,42,0.05)',
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6
                                  }}
                                >
                                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{globalIndex + 1}.</span>
                                  <span>{getSceneName(sceneId)}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic' }}>
                    Chưa có scenes nào
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && editingTour && (
        <div
          className="scene-modal-overlay"
          onClick={() => {
            setShowCreateModal(false);
            setEditingTour(null);
          }}
        >
          <div
            className="scene-modal"
            style={{ maxWidth: '800px', maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="scene-modal-header">
              <h2 className="scene-modal-title">
                {editingTour.id && tours.some(t => t.id === editingTour.id) ? 'Sửa Tour' : 'Tạo Tour mới'}
              </h2>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTour(null);
                }}
                className="scene-modal-close"
              >
                ×
              </button>
            </div>

            <div className="scene-modal-content" style={{ padding: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {/* Tour Name */}
                <div>
                  <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                    Tên Tour *
                  </label>
                  <input
                    type="text"
                    value={editingTour.name}
                    onChange={(e) => setEditingTour({ ...editingTour, name: e.target.value })}
                    placeholder="Ví dụ: Tour Khoa Công nghệ Thông tin"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 14,
                      border: '1px solid rgba(15,23,42,0.1)',
                      borderRadius: 8,
                      outline: 'none'
                    }}
                  />
                </div>

                {/* Tour ID */}
                {!editingTour.id || !tours.some(t => t.id === editingTour.id) ? (
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                      ID Tour (tự động tạo nếu để trống)
                    </label>
                    <input
                      type="text"
                      value={editingTour.id}
                      onChange={(e) => setEditingTour({ ...editingTour, id: e.target.value })}
                      placeholder="tour_cntt"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        fontSize: 14,
                        border: '1px solid rgba(15,23,42,0.1)',
                        borderRadius: 8,
                        outline: 'none'
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 8 }}>
                      ID Tour
                    </label>
                    <code style={{
                      display: 'block',
                      padding: '10px 12px',
                      fontSize: 14,
                      background: 'rgba(15,23,42,0.05)',
                      borderRadius: 8
                    }}>
                      {editingTour.id}
                    </code>
                  </div>
                )}

                {/* Keywords */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                      Từ khóa
                    </label>
                    <button
                      onClick={handleAddKeyword}
                      style={{
                        fontSize: 12,
                        padding: '6px 12px',
                        background: 'var(--accent)',
                        color: 'white',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer'
                      }}
                    >
                      + Thêm từ khóa
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {(editingTour.keywords || []).map((keyword, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: 13,
                          padding: '6px 12px',
                          background: 'rgba(139, 92, 246, 0.1)',
                          color: '#8b5cf6',
                          borderRadius: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        {keyword}
                        <button
                          onClick={() => handleRemoveKeyword(keyword)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#8b5cf6',
                            cursor: 'pointer',
                            fontSize: 16,
                            lineHeight: 1,
                            padding: 0,
                            width: 18,
                            height: 18,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Scenes */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                      Scenes ({editingTour.scenes?.length || 0})
                    </label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAddScene(e.target.value);
                          e.target.value = '';
                        }
                      }}
                      style={{
                        fontSize: 13,
                        padding: '6px 12px',
                        border: '1px solid rgba(15,23,42,0.1)',
                        borderRadius: 6,
                        outline: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="">Thêm scene...</option>
                      {floors.map((floor) => {
                        const floorScenes = getScenesByFloor(floor).filter(s => !editingTour.scenes?.includes(s.id));
                        if (floorScenes.length === 0) return null;
                        return (
                          <optgroup key={floor} label={floorNames[floor]}>
                            {floorScenes.map(scene => (
                              <option key={scene.id} value={scene.id}>
                                {getSceneName(scene.id)}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  {editingTour.scenes && editingTour.scenes.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {floors.map((floor) => {
                        const floorScenes = editingTour.scenes.filter((sceneId) => getSceneFloor(sceneId) === floor);
                        if (floorScenes.length === 0) return null;

                        return (
                          <div key={floor} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <h5 style={{ 
                              fontSize: 13, 
                              fontWeight: 600, 
                              color: '#0f172a', 
                              marginBottom: 4,
                              padding: '6px 12px',
                              background: 'rgba(139, 92, 246, 0.1)',
                              borderRadius: 6,
                              borderLeft: '3px solid #8b5cf6'
                            }}>
                              {floorNames[floor]} ({floorScenes.length} scene{floorScenes.length > 1 ? 's' : ''})
                            </h5>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 12 }}>
                              {floorScenes.map((sceneId) => {
                                const index = editingTour.scenes.indexOf(sceneId);
                                return (
                                  <div
                                    key={sceneId}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(e, index)}
                                    style={{
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: 12,
                                      padding: '10px 12px',
                                      background: 'rgba(15,23,42,0.03)',
                                      borderRadius: 8,
                                      border: '1px solid rgba(15,23,42,0.06)',
                                      cursor: 'move'
                                    }}
                                  >
                                    <span style={{ color: 'var(--muted)', fontSize: 13, fontWeight: 600, minWidth: 32 }}>
                                      {index + 1}
                                    </span>
                                    <span style={{ flex: 1, fontSize: 14 }}>{getSceneName(sceneId)}</span>
                                    <button
                                      onClick={() => handleRemoveScene(index)}
                                      style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        fontSize: 18,
                                        padding: '4px 8px'
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                      <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8, fontStyle: 'italic' }}>
                        💡 Kéo thả để sắp xếp thứ tự scenes
                      </p>
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', padding: 16, textAlign: 'center', background: 'rgba(15,23,42,0.02)', borderRadius: 8 }}>
                      Chưa có scenes nào. Chọn scene từ dropdown để thêm.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="scene-modal-actions">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingTour(null);
                }}
                className="scene-modal-btn scene-modal-btn-secondary"
              >
                Hủy
              </button>
              <button
                onClick={handleSave}
                className="scene-modal-btn scene-modal-btn-primary"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

