// /src/ui/minimap.js
export function createMinimap(opts) {
    const {
      container,
      graph,
      onGotoScene,
      onPathPlay
    } = opts || {};
  
    let G = normalizeGraph(graph || { nodes:[], edges:[] });
    let activeId = null;
  
    container.classList.add('minimap');
    container.innerHTML = `
      <div class="mm-toolbar">
        <div class="mm-route">
          <select id="mmFrom"></select>
          <span>→</span>
          <select id="mmTo"></select>
          <button id="mmGo">Tìm đường</button>
          <button id="mmClear">Xóa</button>
        </div>
        <button class="mm-toggle" id="mmToggle">Thu</button>
      </div>
      <div class="mm-viewport" id="mmViewport">
        <div class="mm-stage" id="mmStage"></div>
        <div class="mm-zoom">
          <button id="mmZoomIn">+</button>
          <button id="mmZoomOut">−</button>
          <button id="mmZoomReset">100%</button>
        </div>
      </div>
    `;
  
    const stage    = container.querySelector('#mmStage');
    const viewport = container.querySelector('#mmViewport');
    const selFrom  = container.querySelector('#mmFrom');
    const selTo    = container.querySelector('#mmTo');
  
    /* ---------- View (zoom/pan) state ---------- */
    let view = { scale: 0.9, ox: 0, oy: 0 };           // scale + offset
    const SCALE_MIN = 0.5, SCALE_MAX = 2.5, SCALE_STEP = 0.15;
  
    function applyView() {
      stage.style.transform = `translate(${view.ox}px, ${view.oy}px) scale(${view.scale})`;
    }
    function zoomBy(ds, cx, cy) {
      const old = view.scale;
      const next = clamp(old + ds, SCALE_MIN, SCALE_MAX);
      if (next === old) return;
      // zoom quanh điểm (cx,cy) trong viewport
      const rect = viewport.getBoundingClientRect();
      const x = cx - rect.left, y = cy - rect.top;
      view.ox = x - (x - view.ox) * (next / old);
      view.oy = y - (y - view.oy) * (next / old);
      view.scale = next;
      applyView();
    }
    function panBy(dx, dy) { view.ox += dx; view.oy += dy; applyView(); }
    function resetView() { view = { scale: 1, ox: 0, oy: 0 }; applyView(); }
  
    // wheel zoom
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const ds = (e.deltaY > 0 ? -SCALE_STEP : SCALE_STEP);
      zoomBy(ds, e.clientX, e.clientY);
    }, { passive: false });
  
    // drag to pan (mouse + touch)
    (function enableDragPan() {
      let dragging = false, sx=0, sy=0;
      viewport.addEventListener('mousedown', (e) => { dragging=true; sx=e.clientX; sy=e.clientY; });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panBy(e.clientX - sx, e.clientY - sy);
        sx = e.clientX; sy = e.clientY;
      });
      window.addEventListener('mouseup', () => dragging=false);
  
      viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length!==1) return;
        const t = e.touches[0]; dragging=true; sx=t.clientX; sy=t.clientY;
      }, {passive:true});
      window.addEventListener('touchmove', (e) => {
        if (!dragging || e.touches.length!==1) return;
        const t = e.touches[0]; panBy(t.clientX - sx, t.clientY - sy); sx=t.clientX; sy=t.clientY;
      }, {passive:true});
      window.addEventListener('touchend', () => dragging=false, {passive:true});
    })();
  
    container.querySelector('#mmZoomIn') .addEventListener('click', e => zoomBy(+SCALE_STEP, e.clientX||0, e.clientY||0));
    container.querySelector('#mmZoomOut').addEventListener('click', e => zoomBy(-SCALE_STEP, e.clientX||0, e.clientY||0));
    container.querySelector('#mmZoomReset').addEventListener('click', resetView);
  
    // collapse / expand
    const btnToggle = container.querySelector('#mmToggle');
    btnToggle.addEventListener('click', () => {
      container.classList.toggle('minimap--collapsed');
      btnToggle.textContent = container.classList.contains('minimap--collapsed') ? 'Mở' : 'Thu';
    });
  
    /* ---------- Render graph ---------- */
    function fillSelects() {
      const html = G.nodes.map(n => `<option value="${esc(n.id)}">${esc(n.label||n.id)}</option>`).join('');
      selFrom.innerHTML = html; selTo.innerHTML = html;
    }
    function render() {
      stage.innerHTML = '';
      // edges
      for (const e of G.edges) {
        const a = node(G, e.from), b = node(G, e.to);
        if (!a || !b) continue;
        const el = document.createElement('div');
        el.className = 'mm-edge';
        posEdge(el, a, b);
        stage.appendChild(el);
      }
      // nodes
      for (const n of G.nodes) {
        const dot = document.createElement('button');
        dot.className = 'mm-dot';
        dot.type = 'button';
        dot.dataset.id = n.id;
        dot.style.left = `${n.x}px`;
        dot.style.top  = `${n.y}px`;
        dot.title = n.label || n.id;
        dot.addEventListener('click', (ev) => { ev.stopPropagation(); onGotoScene && onGotoScene(n.id); });
        stage.appendChild(dot);
  
        const lb = document.createElement('div');
        lb.className = 'mm-label';
        lb.textContent = n.label || n.id;
        lb.style.left = `${n.x + 10}px`;
        lb.style.top  = `${n.y - 6}px`;
        stage.appendChild(lb);
      }
      applyActive();
      applyView(); // re-apply transform sau khi vẽ
    }
  
    function posEdge(el, a, b) {
      const x1=a.x, y1=a.y, x2=b.x, y2=b.y;
      const dx=x2-x1, dy=y2-y1;
      const len=Math.hypot(dx,dy);
      const ang=Math.atan2(dy,dx)*180/Math.PI;
      el.style.width = `${len}px`;
      el.style.left  = `${x1}px`;
      el.style.top   = `${y1}px`;
      el.style.transform = `rotate(${ang}deg)`;
    }
  
    function applyActive() {
      stage.querySelectorAll('.mm-dot').forEach(el => {
        if (el.dataset.id === activeId) el.classList.add('mm-dot--active');
        else el.classList.remove('mm-dot--active');
      });
    }
  
    function highlightPath(path) {
      clearHighlights();
      for (let i=0;i<path.length-1;i++) {
        const a=node(G,path[i]), b=node(G,path[i+1]); if(!a||!b) continue;
        const el=document.createElement('div'); el.className='mm-edge mm-edge--hl'; el.dataset.hl='1';
        posEdge(el,a,b); stage.appendChild(el);
      }
      for (const id of path) {
        const dot = stage.querySelector(`.mm-dot[data-id="${css(id)}"]`);
        dot && dot.classList.add('mm-dot--path');
      }
    }
    function clearHighlights() {
      stage.querySelectorAll('.mm-edge[data-hl="1"]').forEach(el => el.remove());
      stage.querySelectorAll('.mm-dot.mm-dot--path').forEach(el => el.classList.remove('mm-dot--path'));
    }
  
    /* ---------- Events ---------- */
    container.querySelector('#mmGo').addEventListener('click', async () => {
      const from = selFrom.value, to = selTo.value;
      if (!from || !to || from===to) return;
      const path = dijkstraPath(G, from, to);
      if (!path.length) return;
      highlightPath(path);
      if (onPathPlay) await onPathPlay(path);
    });
    container.querySelector('#mmClear').addEventListener('click', clearHighlights);
  
    /* ---------- Public API ---------- */
    function setActive(id) {
      activeId = id;
      if (node(G, id)) { selFrom.value = id; if (!selTo.value) selTo.value = id; }
      applyActive();
    }
    function refresh(newGraph) { G = normalizeGraph(newGraph || G); fillSelects(); render(); }
    async function routeAndPlay(from, to) {
      const path = dijkstraPath(G, from, to);
      if (!path.length) return [];
      highlightPath(path);
      if (onPathPlay) await onPathPlay(path);
      return path;
    }
  /* ===== Drag toàn bộ minimap (mouse + touch) ===== */
(function enableMinimapDrag() {
    const bar = container.querySelector('.mm-toolbar');
    let dragging = false, sx=0, sy=0, startLeft=0, startTop=0;
  
    // load vị trí đã lưu
    try {
      const pos = JSON.parse(localStorage.getItem('minimap_pos') || 'null');
      if (pos && Number.isFinite(pos.left) && Number.isFinite(pos.top)) {
        container.style.left = pos.left + 'px';
        container.style.top  = pos.top  + 'px';
        container.style.right = 'auto';
        container.style.bottom = 'auto';
      }
    } catch {}
  
    function savePos() {
      const rect = container.getBoundingClientRect();
      localStorage.setItem('minimap_pos', JSON.stringify({ left: rect.left, top: rect.top }));
    }
  
    function onDown(clientX, clientY) {
      // tránh xung đột: nếu click vào input/select/button trong toolbar thì không drag
      const tag = (document.activeElement || {}).tagName;
      if (/INPUT|SELECT|BUTTON|TEXTAREA/.test(tag)) return;
  
      dragging = true;
      container.classList.add('minimap--dragging');
  
      const rect = container.getBoundingClientRect();
      startLeft = rect.left;
      startTop  = rect.top;
      sx = clientX; sy = clientY;
  
      // chuyển sang fixed nếu chưa
      container.style.position = 'fixed';
      container.style.left = startLeft + 'px';
      container.style.top  = startTop  + 'px';
      container.style.right = 'auto';
      container.style.bottom = 'auto';
    }
  
    function onMove(clientX, clientY) {
      if (!dragging) return;
      const dx = clientX - sx, dy = clientY - sy;
  
      // giới hạn trong viewport (trừ 20px đệm)
      const vw = window.innerWidth, vh = window.innerHeight;
      const w = container.offsetWidth, h = container.offsetHeight;
      let left = startLeft + dx, top = startTop + dy;
      left = Math.min(vw - 20, Math.max(0 - (w - 20), left));
      top  = Math.min(vh - 20, Math.max(0 - (h - 20), top));
  
      container.style.left = left + 'px';
      container.style.top  = top  + 'px';
    }
  
    function onUp() {
      if (!dragging) return;
      dragging = false;
      container.classList.remove('minimap--dragging');
      savePos();
    }
  
    // mouse
    bar.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onUp);
  
    // touch
    bar.addEventListener('touchstart', e => {
      if (e.touches.length!==1) return;
      const t = e.touches[0]; onDown(t.clientX, t.clientY);
    }, {passive:true});
    window.addEventListener('touchmove', e => {
      if (!dragging || e.touches.length!==1) return;
      const t = e.touches[0]; onMove(t.clientX, t.clientY);
    }, {passive:true});
    window.addEventListener('touchend', onUp, {passive:true});
  })();
  
    // init
    fillSelects(); render();
  
    return { setActive, refresh, routeAndPlay };
  }
  
  /* ================= Utils ================= */
  const clamp = (x,a,b)=> Math.min(b, Math.max(a,x));
  const esc = s => String(s).replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const css = s => (CSS.escape ? CSS.escape(s) : String(s).replace(/[^a-zA-Z0-9_-]/g,'\\$&'));
  const node = (G,id)=> G.nodes.find(n=>n.id===id);
  const num  = v => typeof v==='number' && Number.isFinite(v);
  const ok   = v => v!==undefined && v!==null && String(v).trim()!=='';
  function normalizeGraph(g){
    const N = Array.isArray(g.nodes) ? g.nodes.filter(n=> ok(n.id) && num(n.x) && num(n.y)) : [];
    const E = Array.isArray(g.edges) ? g.edges.filter(e=> ok(e.from) && ok(e.to)) : [];
    return { nodes:N, edges:E };
  }
  function buildAdj(G){
    const m=new Map(); for(const n of G.nodes) m.set(n.id,[]);
    for(const e of G.edges){ const w=typeof e.w==='number'?e.w:1;
      if(m.has(e.from)&&m.has(e.to)){ m.get(e.from).push({v:e.to,w}); m.get(e.to).push({v:e.from,w}); }
    } return m;
  }
  function dijkstraPath(G,start,goal){
    if(!node(G,start)||!node(G,goal)) return [];
    const adj=buildAdj(G), dist=new Map(), prev=new Map();
    const pq=new MinPQ(); for(const n of G.nodes) dist.set(n.id,Infinity);
    dist.set(start,0); pq.push(start,0);
    while(!pq.empty()){
      const u=pq.pop(); if(u===goal) break;
      for(const {v,w} of (adj.get(u)||[])){
        const alt = dist.get(u)+w;
        if(alt < dist.get(v)){ dist.set(v,alt); prev.set(v,u); pq.push(v,alt); }
      }
    }
    if(start!==goal && !prev.has(goal)) return [];
    const path=[]; let cur=goal; path.push(cur);
    while(cur!==start){ cur=prev.get(cur); if(!cur) return []; path.push(cur); }
    return path.reverse();
  }
  class MinPQ{
    constructor(){this.h=[];} empty(){return this.h.length===0;}
    push(k,p){this.h.push({k,p});this.up(this.h.length-1);}
    pop(){ if(this.h.length===1) return this.h.pop().k;
      const t=this.h[0].k; this.h[0]=this.h.pop(); this.down(0); return t; }
    up(i){for(;i>0;){const p=(i-1>>1); if(this.h[p].p<=this.h[i].p) break; [this.h[p],this.h[i]]=[this.h[i],this.h[p]]; i=p;}}
    down(i){for(;;){const l=i*2+1,r=l+1; let s=i;
      if(l<this.h.length&&this.h[l].p<this.h[s].p) s=l;
      if(r<this.h.length&&this.h[r].p<this.h[s].p) s=r;
      if(s===i) break; [this.h[s],this.h[i]]=[this.h[i],this.h[s]]; i=s;}}
  }
  