// js/hotspots.js
function addHotspot(scene, hotspotData) {
    const el = document.createElement("div");
    el.classList.add("hotspot");
  
    const icon = document.createElement("img");
    icon.src = hotspotData.icon || "./assets/icon/vitri.png";
    icon.classList.add("hotspot-icon");
    el.appendChild(icon);
  
    const info = document.createElement("div");
    info.classList.add("hotspot-info");
  
    const img = document.createElement("img");
    img.src = hotspotData.image;
    info.appendChild(img);
  
    const txt = document.createElement("div");
    txt.innerText = hotspotData.text;
    info.appendChild(txt);
  
    el.appendChild(info);
  
    el.addEventListener("click", () => {
      const targetScene = (window.SCENES || []).find(s => s.id === hotspotData.target);
      if (targetScene && window.loadScene) {
        window.loadScene(targetScene);
        updateTenKhuVuc(hotspotData.target);
      }
    });
  
    scene.hotspotContainer().createHotspot(el, { yaw: hotspotData.yaw, pitch: hotspotData.pitch });
  }
  