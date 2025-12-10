// frontend/src/core/ui/fpsCounter.js
// FPS Counter for 360 viewer performance monitoring

export function createFPSCounter(opts = {}) {
  const {
    container = document.body,
    position = 'top-right', // 'top-left', 'top-right', 'bottom-left', 'bottom-right'
    targetFPS = 60,
    updateInterval = 1000, // Update display every 1 second
    showGraph = false, // Show FPS graph
  } = opts;

  // State
  let frameCount = 0;
  let lastTime = performance.now();
  let currentFPS = 0;
  let rafId = null;
  let updateTimer = null;
  let isEnabled = true;
  let fpsHistory = [];

  // Create FPS display element
  const fpsEl = document.createElement('div');
  fpsEl.id = 'fps-counter';
  fpsEl.style.cssText = `
    position: fixed;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    padding: 8px 12px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    font-weight: bold;
    pointer-events: none;
    user-select: none;
    backdrop-filter: blur(4px);
    transition: color 0.3s ease;
  `;

  // Position styles
  const positionStyles = {
    'top-left': { top: '10px', left: '10px' },
    'top-right': { top: '10px', right: '10px' },
    'bottom-left': { bottom: '10px', left: '10px' },
    'bottom-right': { bottom: '10px', right: '10px' },
  };

  Object.assign(fpsEl.style, positionStyles[position] || positionStyles['top-right']);

  // Create graph element if needed
  let graphEl = null;
  if (showGraph) {
    graphEl = document.createElement('canvas');
    graphEl.width = 200;
    graphEl.height = 60;
    graphEl.style.cssText = `
      position: fixed;
      ${positionStyles[position].top};
      ${positionStyles[position].right};
      margin-top: 0px;
      background: rgba(0, 0, 0, 0.5);
      border-radius: 4px;
      z-index: 10000;
      pointer-events: none;
    `;
  }

  // Update FPS color based on performance
  function updateColor(fps) {
    if (fps >= targetFPS * 0.95) {
      fpsEl.style.color = '#4ade80'; // Green - excellent
    } else if (fps >= targetFPS * 0.7) {
      fpsEl.style.color = '#fbbf24'; // Yellow - good
    } else if (fps >= targetFPS * 0.5) {
      fpsEl.style.color = '#fb923c'; // Orange - acceptable
    } else {
      fpsEl.style.color = '#f87171'; // Red - poor
    }
  }

  // Update display
  function updateDisplay() {
    fpsEl.textContent = `FPS: ${currentFPS.toFixed(1)}`;
    updateColor(currentFPS);

    // Update graph if enabled
    if (graphEl && fpsHistory.length > 0) {
      const ctx = graphEl.getContext('2d');
      ctx.clearRect(0, 0, graphEl.width, graphEl.height);

      // Draw background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fillRect(0, 0, graphEl.width, graphEl.height);

      // Draw target FPS line
      const targetY = graphEl.height - (targetFPS / 60) * graphEl.height;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, targetY);
      ctx.lineTo(graphEl.width, targetY);
      ctx.stroke();

      // Draw FPS line
      if (fpsHistory.length > 1) {
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const stepX = graphEl.width / (fpsHistory.length - 1);
        fpsHistory.forEach((fps, i) => {
          const x = i * stepX;
          const y = graphEl.height - (fps / 60) * graphEl.height;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();
      }
    }
  }

  // FPS calculation loop
  function measureFPS() {
    if (!isEnabled) return;

    const now = performance.now();
    frameCount++;

    // Calculate FPS every second
    const elapsed = now - lastTime;
    if (elapsed >= updateInterval) {
      currentFPS = (frameCount * 1000) / elapsed;
      frameCount = 0;
      lastTime = now;

      // Add to history (keep last 60 samples for graph)
      fpsHistory.push(currentFPS);
      if (fpsHistory.length > 60) {
        fpsHistory.shift();
      }

      updateDisplay();
    }

    rafId = requestAnimationFrame(measureFPS);
  }

  // Start measuring
  function start() {
    if (!isEnabled || rafId !== null) return;
    
    lastTime = performance.now();
    frameCount = 0;
    rafId = requestAnimationFrame(measureFPS);
    
    // Initial display
    updateDisplay();
  }

  // Stop measuring
  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (updateTimer !== null) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
  }

  // Toggle visibility
  function show() {
    fpsEl.style.display = 'block';
    if (graphEl) graphEl.style.display = 'block';
    if (!rafId) start();
  }

  function hide() {
    fpsEl.style.display = 'none';
    if (graphEl) graphEl.style.display = 'none';
  }

  // Toggle on/off
  function toggle() {
    isEnabled = !isEnabled;
    if (isEnabled) {
      show();
      start();
    } else {
      hide();
      stop();
    }
  }

  // Initialize
  container.appendChild(fpsEl);
  if (graphEl) {
    container.appendChild(graphEl);
  }

  // Start automatically
  start();

  // Public API
  return {
    start,
    stop,
    show,
    hide,
    toggle,
    getFPS: () => currentFPS,
    isEnabled: () => isEnabled,
    destroy: () => {
      stop();
      if (fpsEl.parentNode) {
        fpsEl.parentNode.removeChild(fpsEl);
      }
      if (graphEl && graphEl.parentNode) {
        graphEl.parentNode.removeChild(graphEl);
      }
    },
  };
}

