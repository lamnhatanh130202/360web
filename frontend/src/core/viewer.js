// Dùng bản UMD từ <script src="/vendor/marzipano.js"> nên lấy qua window.Marzipano
const M = window.Marzipano;

export function createViewer(rootSelector) {
  const el = document.querySelector(rootSelector);
  const viewer = new M.Viewer(el);
  return viewer;
}

export function switchSceneEquirect(viewer, sceneMeta, onSwitched) {
  // Nguồn equirect 1 ảnh (test)
  const source = M.ImageUrlSource.fromString(sceneMeta.url);

  // Khai báo geometry equirect với width ảnh (ước lượng)
  const geometry = new M.EquirectGeometry([{ width: sceneMeta.width || 8000 }]);

  const limit = M.RectilinearView.limit.traditional(2048, Math.PI);
  const view = new M.RectilinearView(
    {
      yaw: sceneMeta.initialView?.yaw ?? 0,
      pitch: sceneMeta.initialView?.pitch ?? 0,
      fov: sceneMeta.initialView?.hfov ?? 1.2
    },
    limit
  );

  const scene = viewer.createScene({ source, geometry, view });

  // Chuyển cảnh: dùng transition ngắn
  scene.switchTo({ transitionDuration: 300 });
  onSwitched && onSwitched({ id: sceneMeta.id, name: sceneMeta.name });

  // Trả về handle nếu cần
  return { scene, view };
}
