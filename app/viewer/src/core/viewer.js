import Marzipano from 'marzipano';

export function initViewer(rootSelector) {
  const viewerElement = document.querySelector(rootSelector);
  return new Marzipano.Viewer(viewerElement);
}

export function switchScene(viewer, scene, fadeSelector) {
  // chuyển cảnh với animation zoom/fade
  const source = Marzipano.ImageUrlSource.fromString(scene.url);
  const geometry = new Marzipano.EquirectGeometry([{ width: 4000 }]);
  const limiter = Marzipano.util.compose(
    Marzipano.RectilinearView.limit.traditional(1024, 120*Math.PI/180),
    Marzipano.RectilinearView.limit.yaw(2*Math.PI)
  );
  const view = new Marzipano.RectilinearView(null, limiter);
  const sceneObj = viewer.createScene({ source, geometry, view });

  fadeTransition(fadeSelector, () => sceneObj.switchTo({ transitionDuration: 1000 }));
}

function fadeTransition(fadeSelector, callback) {
  const fade = document.querySelector(fadeSelector);
  if (!fade) return callback();
  fade.style.opacity = 1;
  setTimeout(() => {
    callback();
    fade.style.opacity = 0;
  }, 300);
}
