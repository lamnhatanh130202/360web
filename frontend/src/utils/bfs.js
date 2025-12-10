// src/utils/bfs.js
export function findPath(graph, start, goal) {
  if (start === goal) return [start];
  const q = [[start]];
  const visited = new Set([start]);
  while (q.length) {
    const path = q.shift();
    const node = path[path.length - 1];
    const neighbors = graph[node] || [];
    for (const n of neighbors) {
      if (visited.has(n)) continue;
      const newPath = path.concat(n);
      if (n === goal) return newPath;
      visited.add(n);
      q.push(newPath);
    }
  }
  return null; // no path
}
