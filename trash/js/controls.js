// js/controls.js
function setupControls(viewer) {
    const view = viewer.view();
    let isRotatingLeft = false, isRotatingRight = false;
  
    const rotateLeft = () => {
      if (isRotatingLeft) {
        AutoRotate.stop();
        view.setYaw(view.yaw() - 0.01);
        requestAnimationFrame(rotateLeft);
      } else AutoRotate.reset(view);
    };
    const rotateRight = () => {
      if (isRotatingRight) {
        AutoRotate.stop();
        view.setYaw(view.yaw() + 0.01);
        requestAnimationFrame(rotateRight);
      } else AutoRotate.reset(view);
    };
  
    const leftButton  = document.getElementById("left");
    const rightButton = document.getElementById("right");
    const zoomInBtn   = document.getElementById("zoomIn");
    const zoomOutBtn  = document.getElementById("zoomOut");
    const toggleBtn   = document.getElementById("toggleAutoRotate");
  
    if (leftButton) {
      leftButton.onmousedown = () => { isRotatingLeft = true; rotateLeft(); };
      leftButton.onmouseup = leftButton.onmouseleave = () => { isRotatingLeft = false; };
    }
    if (rightButton) {
      rightButton.onmousedown = () => { isRotatingRight = true; rotateRight(); };
      rightButton.onmouseup = rightButton.onmouseleave = () => { isRotatingRight = false; };
    }
    if (zoomInBtn)  zoomInBtn.onclick  = () => zoom(viewer, 0.8);
    if (zoomOutBtn) zoomOutBtn.onclick = () => zoom(viewer, 1.2);
  
    if (toggleBtn) {
      let on = true;
      toggleBtn.innerText = on ? "Dừng lại" : "Tiếp tục";
      toggleBtn.onclick = () => {
        on = !on;
        toggleBtn.innerText = on ? "Dừng lại" : "Tiếp tục";
        if (on) AutoRotate.start(view); else AutoRotate.stop();
      };
    }
  
    // Wheel zoom
    const pano = document.getElementById("pano");
    if (pano) {
      pano.addEventListener("wheel", ev => {
        zoom(viewer, ev.deltaY > 0 ? 1.1 : 0.9);
        ev.preventDefault();
      }, { passive: false });
    }
  }
  