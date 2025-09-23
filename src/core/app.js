import { createViewer, switchSceneEquirect } from './viewer.js';

export async function bootstrap(opts) {
  const { dataBaseUrl, rootSelector } = opts;

  const scenes = await fetch(`${dataBaseUrl}/scenes.json`).then(r => r.json());
  const viewer = createViewer(rootSelector);

  let current = null;
  const sceneChangeCbs = [];

  function navigateTo(id) {
    const meta = scenes.find(s => s.id === id);
    if (!meta) return;

    // Equirect test
    const handle = switchSceneEquirect(viewer, meta, (info) => {
      current = handle;
      sceneChangeCbs.forEach(cb => cb({ id: info.id, name: info.name }));
    });

    // (Tạm) render hotspot kiểu console để xác nhận
    if (Array.isArray(meta.hotspots)) {
      console.log('Hotspots of', meta.id, meta.hotspots);
    }
  }

  function onSceneChange(cb) { sceneChangeCbs.push(cb); }

  // Controls test (đơn giản)
  const controls = viewer.controls();
  const api = {
    navigateTo,
    onSceneChange,
    controls: {
      left: () => controls.yawDelta(-0.2),
      right: () => controls.yawDelta(0.2),
      zoomIn: () => controls.fovDelta(-0.1),
      zoomOut: () => controls.fovDelta(0.1),
      toggleAutoRotate: (() => {
        let active = false, handleId = null;
        return () => {
          active = !active;
          if (active) {
            handleId = setInterval(()=> controls.yawDelta(0.02), 16);
          } else if (handleId) {
            clearInterval(handleId); handleId = null;
          }
          return active;
        };
      })()
    }
  };

  // Vào cảnh đầu
  if (scenes[0]) navigateTo(scenes[0].id);

  return api;
}
