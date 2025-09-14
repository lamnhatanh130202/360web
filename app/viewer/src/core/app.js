// src/core/app.js
import { initViewer, switchScene } from './viewer.js';
import { renderHotspots } from '../ui/hotspot.js';
import { renderMinimap } from '../ui/minimap.js';

let currentSceneId = null;
let sceneChangeCallbacks = [];

export async function bootstrap(opts) {
  const { dataBaseUrl, rootSelector, minimapSelector, hotspotsSelector, fadeSelector } = opts;

  // Load dữ liệu
  const scenes = await fetch(`${dataBaseUrl}/scenes.json`).then(r => r.json());

  // Khởi tạo viewer
  const viewer = initViewer(rootSelector);

  // Render minimap
  renderMinimap(minimapSelector, scenes, (id) => navigateTo(id));

  // API expose
  function navigateTo(id) {
    const scene = scenes.find(s => s.id === id);
    if (!scene) return;
    switchScene(viewer, scene, fadeSelector);
    renderHotspots(viewer, hotspotsSelector, scene.hotspots, navigateTo);
    currentSceneId = id;
    sceneChangeCallbacks.forEach(cb => cb({ id, name: scene.name }));
  }

  function onSceneChange(cb) {
    sceneChangeCallbacks.push(cb);
  }

  return {
    navigateTo,
    onSceneChange,
    controls: {
      left: () => viewer.controls().yawDelta(-0.2),
      right: () => viewer.controls().yawDelta(0.2),
      zoomIn: () => viewer.controls().fovDelta(-0.2),
      zoomOut: () => viewer.controls().fovDelta(0.2),
      toggleAutoRotate: () => { /* TODO implement */ }
    }
  };
}
