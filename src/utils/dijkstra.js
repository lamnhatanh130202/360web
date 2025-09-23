export function dijkstra(graph, start, end) {
    const dist = {}, prev = {}; const nodes = new Set(graph.nodes);
    graph.nodes.forEach(n => dist[n] = Infinity); dist[start] = 0;
    const visited = new Set();
  
    while (visited.size < graph.nodes.length) {
      const u = Object.keys(dist).filter(k=>!visited.has(k)).sort((a,b)=>dist[a]-dist[b])[0];
      if (!u || dist[u] === Infinity) break;
      visited.add(u); if (u === end) break;
      for (const e of graph.edges) if (e.from === u) {
        const alt = dist[u] + (e.w ?? 1);
        if (alt < (dist[e.to] ?? Infinity)) { dist[e.to] = alt; prev[e.to] = u; }
      }
    }
    const path=[]; let cur=end; while (cur){ path.unshift(cur); cur=prev[cur]; }
    return path[0]===start ? path : [];
  }
  