# 🔧 NGUYÊN LÝ VẬN HÀNH VÀ KIẾN TRÚC ỨNG DỤNG 360 WEB

Tài liệu mô tả chi tiết cách hoạt động của toàn bộ hệ thống, giúp cả người và AI hiểu được nguyên lý vận hành.

**Cập nhật lần cuối**: 2025

---

## 📐 KIẾN TRÚC TỔNG THỂ

### 1. Kiến trúc 3 tầng (3-Tier Architecture)

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND LAYER                        │
│  ┌──────────────┐         ┌──────────────┐             │
│  │ Viewer App   │         │  CMS Admin   │             │
│  │ (React/Vite)  │         │  (React)     │             │
│  └──────┬───────┘         └──────┬───────┘             │
│         │                        │                      │
│         └────────┬───────────────┘                      │
│                  │                                      │
└──────────────────┼──────────────────────────────────────┘
                   │ HTTP/REST API
┌──────────────────┼──────────────────────────────────────┐
│                  │         BACKEND LAYER                │
│                  │  ┌──────────────────────┐          │
│                  │  │   Flask API Server   │          │
│                  │  │   (Python)           │          │
│                  │  └──────────┬───────────┘          │
│                  │             │                       │
└──────────────────┼─────────────┼───────────────────────┘
                   │             │
┌──────────────────┼─────────────┼───────────────────────┐
│                  │             │    DATA LAYER          │
│         ┌────────▼────┐  ┌─────▼──────────┐           │
│         │ JSON Files  │  │  File Storage  │           │
│         │ (scenes.json│  │  (uploads/,     │           │
│         │  tours.json│  │   static/tts/) │           │
│         │  graph.json│  │   stats.json)  │           │
│         └─────────────┘  └────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

### 2. Các thành phần chính

- **Frontend Viewer**: Ứng dụng xem 360° tour (Marzipano.js)
- **CMS Frontend**: Giao diện quản trị (React Router)
- **Backend API**: Flask server xử lý logic và data
- **Data Storage**: JSON files + File system

---

## 🔄 DATA FLOW TỔNG QUAN

### Flow khi người dùng truy cập Viewer:

```
1. User mở trình duyệt → Load index.html
   ↓
2. main.jsx khởi động → Kiểm tra có #pano element?
   ↓
3. Nếu có → Gọi bootstrap() từ core/app.js
   ↓
4. bootstrap() thực hiện:
   - Fetch /api/scenes → Lấy danh sách scenes
   - Fetch /api/graph → Lấy graph data (nodes, edges)
   - Khởi tạo Marzipano Viewer
   - Load scene đầu tiên
   - Render hotspots
   - Khởi tạo minimap
   - Khởi tạo voice bot
   ↓
5. User tương tác (click hotspot, voice command, menu...)
   ↓
6. Event handlers xử lý → Gọi API hoặc navigate
   ↓
7. Update UI → Render scene mới
```

### Flow khi quản trị viên sử dụng CMS:

```
1. User truy cập /cms/login
   ↓
2. Login → Xác thực (POST /api/auth/login)
   ↓
3. Redirect → /cms/dashboard
   ↓
4. ProtectedRoute kiểm tra authentication
   ↓
5. Render CMS pages (ScenesPage, Hotspots, Tours...)
   ↓
6. User thao tác (CRUD) → Gọi API endpoints
   ↓
7. Backend xử lý → MERGE với dữ liệu hiện có → Lưu vào JSON files
   ↓
8. Frontend refresh → Hiển thị dữ liệu mới
```

---

## 🎯 CÁC CHỨC NĂNG CHÍNH VÀ NGUYÊN LÝ HOẠT ĐỘNG

### 1. SCENE VIEWER (360° Panorama)

#### Kiến trúc:
- **Library**: Marzipano.js (WebGL-based 360° viewer)
- **File**: `frontend/src/core/app.js`

#### Flow hoạt động:

```
┌─────────────────────────────────────────────────┐
│ 1. Khởi tạo Viewer                              │
│    - Kiểm tra WebGL support                     │
│    - Tạo Marzipano.Viewer instance              │
│      * stageType: "webgl" nếu WebGL có sẵn      │
│      * stageType: "css" nếu WebGL không có      │
│    - Setup EquirectGeometry (hình cầu)          │
│    - Setup RectilinearView với limiter          │
│    - Đảm bảo element có kích thước hợp lệ       │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│ 2. Load Scene Data                              │
│    - Fetch /api/scenes → [{id, url, name, ...}] │
│    - Cache scenes trong memory                  │
│    - Fetch /api/graph → Load graph data         │
│    - Fetch /api/tours → Load tours data         │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│ 3. Create Scene                                 │
│    - Tạo ImageUrlSource từ scene.url            │
│    - Tạo Marzipano Scene với geometry/view      │
│    - Lưu vào sceneCache[sceneId]               │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│ 4. Switch Scene                                 │
│    - Fade out (opacity: 0)                      │
│    - Load scene từ cache hoặc tạo mới           │
│    - scene.switchTo() với transition            │
│    - Fade in (opacity: 1)                       │
│    - Emit 'scenechange' event                   │
│    - Update minimap current scene                │
└─────────────────────────────────────────────────┘
```

---

### 2. HOTSPOTS SYSTEM (Điểm tương tác)

#### Nguyên lý:
- Hotspots là các điểm clickable trên 360° image
- Mỗi hotspot có tọa độ (yaw, pitch) và target scene
- Hiển thị tooltip khi hover
- **Đồng bộ vị trí giữa Viewer và CMS**: Sử dụng `transform: translate(-50%, -50%)` để đảm bảo căn giữa chính xác

#### Flow:

```
┌─────────────────────────────────────────────┐
│ 1. Load Hotspots                            │
│    - Scene data chứa hotspots[] array       │
│    - Mỗi hotspot: {yaw, pitch, target, ...}│
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. Render Hotspots                          │
│    - Tạo DOM element cho mỗi hotspot        │
│    - Đặt vị trí bằng yaw/pitch              │
│    - Sử dụng transform: translate(-50%, -50%)│
│    - Thêm event listeners                   │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. User Interaction                         │
│    - Hover → Show tooltip                   │
│    - Click → Navigate to target scene       │
└─────────────────────────────────────────────┘
```

#### CSS Alignment (Quan trọng):
```css
.hotspot {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  transform-origin: center center;
  line-height: 0;
}

.hotspot-icon {
  transform: translate(-50%, -50%);
}
```

---

### 3. VOICE BOT (Điều khiển bằng giọng nói)

#### Kiến trúc:
- **File**: `frontend/src/bot/voiceBot.js`
- **API**: Web Speech Recognition API
- **TTS**: Google Cloud Text-to-Speech (qua backend)
- **UI**: Button text-only với gradient background, z-index cao để không bị che

#### Flow hoạt động:

```
┌─────────────────────────────────────────────┐
│ 1. Khởi tạo Voice Bot                       │
│    - Kiểm tra browser support               │
│    - Setup SpeechRecognition                │
│    - Tạo UI (button + bubble)               │
│    - Button: z-index 10020, bottom 100px   │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. User Click Button                        │
│    - Start recognition                       │
│    - Hiển thị "Listening..."                │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. Speech Recognition                       │
│    - Browser nhận diện giọng nói            │
│    - Trả về transcript (text)               │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. Text Processing                          │
│    - Normalize text (lowercase, remove diacritics)│
│    - Tìm match với scene names              │
│    - Hoặc tìm match với tour keywords        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 5. Action Execution                         │
│    - Nếu là scene: navigateToSceneStepByStep()│
│      * Tìm đường đi (Dijkstra)              │
│      * Gọi minimap.visualizePath()           │
│      * Navigate từng scene trong path        │
│    - Nếu là tour: playTour()                 │
│      * Dùng navigateToSceneStepByStep()      │
│      * Visualize path trên minimap           │
│    - TTS: Gọi /tts/generate → Play audio    │
└─────────────────────────────────────────────┘
```

---

### 4. MINIMAP (Bản đồ thu nhỏ)

#### Nguyên lý:
- Hiển thị sơ đồ tòa nhà với các nodes (scenes)
- Cho phép tìm đường đi giữa 2 scenes (Dijkstra algorithm)
- Visualize route trên minimap với hiệu ứng làm mờ và zoom
- Hỗ trợ multi-floor với chuyển tầng tự động
- **Label visibility**: Ẩn mặc định, hiện khi hover node/edge hoặc di chuyển chuột gần node
- **Data preservation**: Merge logic đảm bảo không mất vị trí x, y khi refresh

#### Flow:

```
┌─────────────────────────────────────────────┐
│ 1. Load Graph Data                          │
│    - Fetch /api/graph → {nodes, edges}     │
│    - Nodes: [{id, x, y, floor, label, positions}]│
│    - Edges: [{from, to, weight}]            │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. Render Minimap                            │
│    - Vẽ nodes trên canvas/SVG                 │
│    - Highlight current scene (opacity: 1)    │
│    - Vẽ edges (connections)                   │
│    - Labels ẩn mặc định (opacity: 0)         │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. Label Visibility Logic                   │
│    - Hover node → Show label của node đó    │
│      và các nodes kết nối trực tiếp          │
│    - Hover edge → Show labels của 2 nodes   │
│    - Mouse move → Tìm node gần nhất (50px) │
│      → Show labels của nodes kết nối         │
│    - Active node label luôn hiện (opacity: 1)│
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. User Select Route                         │
│    - Chọn "From" scene                       │
│    - Chọn "To" scene                         │
│    - Click "Find Route"                      │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 5. Calculate Path (Dijkstra)                 │
│    - Chạy Dijkstra algorithm                 │
│    - Trả về path: [scene1, scene2, ...]      │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 6. Visualize & Navigate                      │
│    - Gọi minimap.visualizePath(path)        │
│      * Làm mờ nodes/edges không trong path  │
│      * Highlight path với màu đỏ            │
│      * Zoom vào path với animation          │
│      * Chuyển tầng nếu cần                   │
│    - Navigate từng scene trong path           │
│      * Fade transition giữa các scene         │
│      * Update minimap current scene         │
└─────────────────────────────────────────────┘
```

#### Graph Refresh Logic (Quan trọng - Bảo vệ dữ liệu):

```javascript
// frontend/src/core/ui/minimap.js

function refresh(g) {
  // MERGE với graph hiện có, KHÔNG ghi đè hoàn toàn
  if (!g || !g.nodes) return;
  
  // Tạo map nodes cũ để tìm nhanh
  const oldNodesMap = {};
  G.nodes.forEach(n => {
    oldNodesMap[n.id] = n;
  });
  
  // Merge nodes: Giữ lại x, y, positions từ nodes cũ
  const mergedNodes = g.nodes.map(newNode => {
    const oldNode = oldNodesMap[newNode.id];
    if (oldNode) {
      // MERGE: Giữ lại vị trí nếu node mới không có
      return {
        ...oldNode,
        ...newNode,
        x: newNode.x !== undefined ? newNode.x : oldNode.x,
        y: newNode.y !== undefined ? newNode.y : oldNode.y,
        positions: newNode.positions || oldNode.positions
      };
    }
    return newNode;
  });
  
  // Giữ lại các nodes cũ không có trong graph mới
  g.nodes.forEach(newNode => {
    if (!oldNodesMap[newNode.id]) {
      mergedNodes.push(oldNode);
    }
  });
  
  // Cập nhật graph
  G = {
    nodes: mergedNodes,
    edges: g.edges || []
  };
  
  // Re-render
  renderNodes();
}
```

#### Algorithm (Dijkstra):

```javascript
// frontend/src/utils/bfs.js

function dijkstra(graph, start, end) {
  const distances = {};
  const previous = {};
  const unvisited = new Set();
  
  // Initialize
  graph.nodes.forEach(node => {
    distances[node.id] = Infinity;
    previous[node.id] = null;
    unvisited.add(node.id);
  });
  distances[start] = 0;
  
  // Main loop
  while (unvisited.size > 0) {
    // Find unvisited node with smallest distance
    const current = getMinDistanceNode(unvisited, distances);
    unvisited.delete(current);
    
    if (current === end) break;
    
    // Update neighbors
    graph.edges
      .filter(e => e.from === current)
      .forEach(edge => {
        const alt = distances[current] + edge.weight;
        if (alt < distances[edge.to]) {
          distances[edge.to] = alt;
          previous[edge.to] = current;
        }
      });
  }
  
  // Reconstruct path
  const path = [];
  let node = end;
  while (node) {
    path.unshift(node);
    node = previous[node];
  }
  return path;
}
```

---

### 5. BACKEND API ENDPOINTS

#### Cấu trúc API:

```
/api/scenes
  GET    → Lấy danh sách scenes (luôn reload từ file)
  POST   → Tạo scene mới
  PUT    → Cập nhật scene (merge với dữ liệu hiện có)
  DELETE → Xóa scene

/api/scenes/<id>
  GET    → Lấy chi tiết scene

/api/hotspots
  GET    → Lấy hotspots của scene
  POST   → Tạo hotspot
  PUT    → Cập nhật hotspot
  DELETE → Xóa hotspot

/api/tours
  GET    → Lấy danh sách tours
  POST   → Tạo tour mới
  PUT    → Cập nhật tour
  DELETE → Xóa tour

/api/graph
  GET    → Lấy graph data (luôn reload từ file)
  POST   → Lưu graph (MERGE với dữ liệu hiện có)
  PUT    → Lưu graph (MERGE với dữ liệu hiện có)
  
/api/graph/regenerate (POST)
  → Tạo lại graph từ scenes
  → MERGE với graph hiện có, giữ lại x, y, positions
  → Giữ lại nodes cũ không có trong scenes mới

/api/upload
  POST   → Upload file (image, audio)

/tts/generate
  POST   → Generate TTS audio (cache trên server)

/api/analytics/*
  POST   → Track visits, pings
  GET    → Get statistics (luôn reload từ file)
```

#### Data Merge Logic (Quan trọng - Bảo vệ dữ liệu):

##### Graph Save/Regenerate:

```python
# backend/app.py

@app.route("/api/graph/regenerate", methods=["POST"])
def regenerate_graph():
    """MERGE với graph hiện có, KHÔNG ghi đè vị trí x, y"""
    # 1. Load graph hiện có
    existing_graph = load_existing_graph()
    
    # 2. Generate graph mới từ scenes
    new_graph = generate_graph_from_scenes(_scenes)
    
    # 3. MERGE: Giữ lại x, y, positions từ graph cũ
    old_nodes_map = {n['id']: n for n in existing_graph.get('nodes', [])}
    merged_nodes = []
    
    for new_node in new_graph.get('nodes', []):
        old_node = old_nodes_map.get(new_node['id'])
        if old_node:
            # MERGE: Giữ lại vị trí nếu node mới không có
            merged_node = {
                **old_node,
                **new_node,
                'x': new_node.get('x') if new_node.get('x') is not None else old_node.get('x'),
                'y': new_node.get('y') if new_node.get('y') is not None else old_node.get('y'),
                'positions': new_node.get('positions') or old_node.get('positions')
            }
            merged_nodes.append(merged_node)
        else:
            merged_nodes.append(new_node)
    
    # 4. Giữ lại nodes cũ không có trong scenes mới
    for old_node in existing_graph.get('nodes', []):
        if not any(n['id'] == old_node['id'] for n in merged_nodes):
            merged_nodes.append(old_node)
    
    # 5. Save merged graph
    final_graph = {
        "nodes": merged_nodes,
        "edges": new_graph.get('edges', [])
    }
    save_graph(final_graph)
    
    return jsonify({"status": "ok", "nodes": len(merged_nodes)})
```

##### Analytics Data Protection:

```python
# backend/app.py

def save_stats(stats, lock_acquired=False):
    """Save stats - dữ liệu đã được merge trong memory trước khi save"""
    # Stats được merge trong memory trước khi gọi save_stats()
    # Không reset dữ liệu cũ
    with stats_lock:
        with open(STATS_FILE, 'w', encoding='utf-8') as f:
            json.dump(stats, f, ensure_ascii=False, indent=2)

def load_stats_from_file():
    """Load stats từ file - không reset nếu file không tồn tại"""
    if os.path.exists(STATS_FILE):
        with open(STATS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    # Trả về structure mặc định, không reset dữ liệu đã có
    return {
        "daily": {}, "weekly": {}, "monthly": {},
        "peak_concurrent": 0, "peak_concurrent_date": None
    }
```

#### Data Flow trong Backend:

```
┌─────────────────────────────────────────────┐
│ 1. Request đến Flask                        │
│    - Route handler nhận request              │
│    - Parse JSON body (nếu có)                │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. Load Data (nếu cần)                       │
│    - Đọc JSON từ file system                │
│    - Parse JSON → Python dict               │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. Process Request                           │
│    - CRUD operations                        │
│    - MERGE với dữ liệu hiện có (nếu update) │
│    - Validation                             │
│    - Business logic                         │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. Save Data                                │
│    - Update Python dict                     │
│    - Atomic write (temp file + rename)      │
│    - Write to JSON file                      │
│    - Sync to multiple paths (nếu cần)        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 5. Reload từ File (Quan trọng)               │
│    - Reload lại từ file sau khi save         │
│    - Đảm bảo đồng bộ memory và file         │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 6. Response                                 │
│    - Return JSON response                   │
│    - Status code                            │
└─────────────────────────────────────────────┘
```

---

### 6. CMS (Content Management System)

#### Kiến trúc:
- **Framework**: React + React Router
- **File**: `cms-frontend/src/cms/`

#### Flow:

```
┌─────────────────────────────────────────────┐
│ 1. Authentication                          │
│    - Login page → POST /api/auth/login     │
│    - Lưu token vào localStorage            │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. Protected Routes                         │
│    - ProtectedRoute component               │
│    - Kiểm tra token                         │
│    - Redirect nếu chưa login                │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. CMS Pages                                │
│    - ScenesPage: CRUD scenes                │
│    - ScenePreview: Preview + Edit hotspots  │
│      * Hiển thị số lượng hotspots           │
│      * Hotspot table luôn visible           │
│      * Button "Edit Hotspots" ở dưới viewer │
│    - Tours: Quản lý tours                   │
│    - MinimapEditor: Chỉnh sửa graph         │
│    - Analytics: Dashboard thống kê          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. User Actions                            │
│    - Form submit → API call                 │
│    - Upload file → /api/upload              │
│    - Update state → Re-render              │
└─────────────────────────────────────────────┘
```

---

### 7. TTS (Text-to-Speech)

#### Flow:

```
┌─────────────────────────────────────────────┐
│ 1. Frontend Request                        │
│    - POST /tts/generate                   │
│    - Body: {text, voice, sceneId}          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. Backend Check Cache                     │
│    - Generate filename từ text/sceneId     │
│    - Kiểm tra file đã tồn tại?             │
│    - Nếu có → Return URL ngay             │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. Generate TTS (nếu chưa có)              │
│    - Gọi Google Cloud TTS API              │
│    - Synthesize speech                     │
│    - Lưu MP3 vào static/tts/               │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. Response                                │
│    - Return {url: "/static/tts/xxx.mp3"}  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 5. Frontend Play                           │
│    - new Audio(url)                        │
│    - audio.play()                          │
└─────────────────────────────────────────────┘
```

---

### 8. ANALYTICS TRACKING

#### Flow:

```
┌─────────────────────────────────────────────┐
│ 1. Frontend Track Visit                    │
│    - POST /api/analytics/visit             │
│    - Body: {sessionId, sceneId}          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. Backend Update Stats                    │
│    - Load stats.json (merge với memory)    │
│    - Update daily/weekly/monthly counts    │
│    - Track active sessions                 │
│    - Update peak concurrent                │
│    - Save to file (atomic write)           │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. Ping (Keep-alive)                       │
│    - POST /api/analytics/ping              │
│    - Update last_activity timestamp        │
│    - Cleanup inactive sessions (2 phút)     │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. Get Statistics                          │
│    - GET /api/analytics/stats              │
│    - Luôn reload từ file                   │
│    - Filter theo year/month (nếu có)        │
│    - Return aggregated data                │
└─────────────────────────────────────────────┘
```

#### Data Protection:
- **Stats không bị reset**: Dữ liệu được merge trong memory trước khi save
- **File-based persistence**: Dữ liệu lưu trong `stats.json`
- **Reload từ file**: Luôn reload từ file khi get stats để đảm bảo dữ liệu mới nhất

---

## 🔗 TƯƠNG TÁC GIỮA CÁC COMPONENT

### Viewer ↔ Backend:

```
Viewer                    Backend
  │                         │
  │── GET /api/scenes ──────>│
  │<─── [{scenes}] ──────────│
  │                         │
  │── GET /api/graph ───────>│
  │<─── {nodes, edges} ────│
  │                         │
  │── POST /api/analytics/visit ─>│
  │<─── {ok} ───────────────│
  │                         │
  │── POST /tts/generate ──>│
  │<─── {url: "/static/..."} │
```

### CMS ↔ Backend:

```
CMS                       Backend
  │                         │
  │── POST /api/scenes ────>│
  │                         │── Load scenes.json
  │                         │── MERGE với dữ liệu hiện có
  │                         │── Save scenes.json
  │                         │── Reload từ file
  │<─── {scene} ────────────│
  │                         │
  │── PUT /api/graph ──────>│
  │                         │── Load graph.json
  │                         │── MERGE với dữ liệu hiện có
  │                         │── Save graph.json
  │                         │── Reload từ file
  │<─── {status: "ok"} ─────│
```

### Voice Bot ↔ Viewer:

```
Voice Bot                 Viewer App
  │                         │
  │── getScenes() ─────────>│
  │<─── [{scenes}] ─────────│
  │                         │
  │── navigateToSceneStepByStep(id) ─>│
  │                         │── Tìm đường đi (Dijkstra)
  │                         │── minimap.visualizePath()
  │                         │── Navigate từng scene
```

---

## 📊 DATA STRUCTURE

### Scene Object:

```json
{
  "id": "a0_1",
  "name": {
    "vi": "Sảnh chính",
    "en": "Main Hall"
  },
  "url": "/assets/a0_1.jpg",
  "preview": "/assets/a0_1.jpg",
  "floor": 0,
  "position": {"x": 100, "y": 200},
  "initialView": {
    "yaw": 0,
    "pitch": 0,
    "hfov": 1.2
  },
  "hotspots": [
    {
      "yaw": 1.5,
      "pitch": 0.2,
      "target": "a0_2",
      "label": "Phòng học",
      "icon": "/assets/icon/vitri.png"
    }
  ],
  "narration": {
    "vi": "Đây là sảnh chính...",
    "en": "This is the main hall..."
  }
}
```

### Tour Object:

```json
{
  "id": "tour_cntt",
  "name": "Tour Khoa CNTT",
  "keywords": ["cntt", "công nghệ thông tin", "it"],
  "scenes": ["a0_1", "a0_2", "a0_3"]
}
```

### Graph Object:

```json
{
  "nodes": [
    {
      "id": "a0_1", 
      "x": 100, 
      "y": 200, 
      "floor": 0, 
      "label": "Sảnh chính",
      "positions": {
        "0": {"x": 100, "y": 200},
        "1": {"x": 150, "y": 250}
      }
    },
    {
      "id": "a0_2", 
      "x": 200, 
      "y": 200, 
      "floor": 0, 
      "label": "Phòng học"
    }
  ],
  "edges": [
    {"from": "a0_1", "to": "a0_2", "weight": 1, "label": ""}
  ]
}
```

**Lưu ý**: 
- Nodes có thể có `positions` object để lưu vị trí trên nhiều tầng khác nhau
- Nếu không có `positions`, dùng `x`, `y` trực tiếp
- **Quan trọng**: Vị trí x, y được bảo vệ khi refresh/regenerate graph

---

## 🔐 AUTHENTICATION FLOW

```
┌─────────────────────────────────────────────┐
│ 1. User Login                               │
│    - POST /api/auth/login                   │
│    - Body: {username, password}            │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. Backend Verify                           │
│    - Check credentials                      │
│    - Generate JWT token                     │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. Store Token                              │
│    - localStorage.setItem('token', ...)     │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. Protected Routes                         │
│    - Header: Authorization: Bearer <token>  │
│    - Backend verify token                   │
└─────────────────────────────────────────────┘
```

---

## 🎨 UI COMPONENTS HIERARCHY

### Viewer:

```
index.html
  ├── #pano (Marzipano viewer)
  ├── #minimap (Minimap container)
  ├── #hotspots (Hotspots container)
  ├── #menu (Scene menu)
  ├── #controls (Navigation controls)
  └── #voice-command-btn (Voice bot button)
      └── z-index: 10020, bottom: 100px
```

### CMS:

```
AppLayout
  ├── Sidebar
  ├── Header
  └── Routes
      ├── Dashboard
      ├── ScenesPage
      │   ├── SceneList
      │   └── SceneForm
      ├── ScenePreview
      │   ├── Viewer Preview
      │   ├── Edit Hotspots Button
      │   ├── Hotspot Table (always visible)
      │   └── Save/Cancel Buttons
      ├── Hotspots
      ├── Tours
      ├── MinimapEditor
      └── Analytics
```

---

## 🚀 STARTUP SEQUENCE

### Frontend Viewer:

1. **HTML Load** → Parse index.html
2. **Scripts Load** → Load marzipano.js, main.jsx
3. **React Mount** → Mount CMS (nếu ở /cms)
4. **Viewer Bootstrap** → Check #pano element
5. **Load Scenes** → Fetch /api/scenes
6. **Load Graph** → Fetch /api/graph
7. **Init Viewer** → Create Marzipano instance
8. **Load First Scene** → Load và render scene đầu tiên
9. **Init Components** → Minimap, Voice Bot, Controls
10. **Ready** → App sẵn sàng

### Backend:

1. **Flask Init** → Create app instance
2. **Load Data** → Read scenes.json, tours.json, graph.json, stats.json
3. **Register Routes** → Setup API endpoints
4. **Start Server** → 
   - Development: Flask dev server (hot reload)
   - Production: Gunicorn với 4 workers
5. **Ready** → Accept requests

---

## 🔄 STATE MANAGEMENT

### Frontend Viewer:
- **Scenes**: Loaded từ API, cache trong memory
- **Current Scene**: Track trong `active` object
- **Graph**: Load từ API, cache (merge khi refresh)
- **Language**: localStorage + state

### CMS:
- **React State**: useState hooks
- **Data**: Fetch từ API khi cần
- **Auth**: localStorage (token)

### Backend:
- **In-memory**: Scenes, tours, graph dicts (được reload từ file khi cần)
- **Persistent**: JSON files (scenes.json, tours.json, graph.json, stats.json)
- **Stats**: JSON file + in-memory tracking với session cleanup
- **Data Sync**: 
  - Luôn reload từ file sau khi save để đảm bảo đồng bộ
  - **MERGE logic**: Không ghi đè dữ liệu cũ khi update/refresh

---

## 📝 CÁC CẢI TIẾN MỚI (2025)

### 1. Data Protection & Merge Logic
- **Vấn đề**: Dữ liệu bị mất khi refresh/update
- **Giải pháp**:
  - Graph refresh: MERGE với graph hiện có, giữ lại x, y, positions
  - Graph save: MERGE với graph hiện có trước khi save
  - Graph regenerate: MERGE với graph hiện có, giữ lại nodes cũ
  - Analytics: Merge trong memory trước khi save, không reset
  - Frontend minimap refresh: Merge với graph hiện có

### 2. Hotspot Alignment Fix
- **Vấn đề**: Hotspots bị lệch giữa Viewer và CMS
- **Giải pháp**:
  - Sử dụng `transform: translate(-50%, -50%)` cho cả Viewer và CMS
  - Thêm `transform-origin: center center`, `line-height: 0`
  - Loại bỏ text/label khỏi hotspot icon trong Viewer
  - Đảm bảo box-sizing và margin/padding nhất quán

### 3. Voice Bot UI Improvements
- **Vấn đề**: Button bị che bởi footer, không click được
- **Giải pháp**:
  - Redesign button: Text-only với gradient background
  - Tăng z-index lên 10020 (với !important)
  - Điều chỉnh bottom position: 100px (desktop), 110px (mobile)
  - Thêm `isolation: isolate` để tránh z-index conflicts

### 4. Minimap Label Visibility
- **Tính năng mới**:
  - Labels ẩn mặc định (opacity: 0)
  - Hiện khi hover node/edge
  - Hiện khi di chuyển chuột gần node (50px radius)
  - Chỉ hiện labels của nodes kết nối trực tiếp
  - Active node label luôn hiện (opacity: 1)

### 5. CMS ScenePreview Improvements
- **Tính năng mới**:
  - Hiển thị số lượng hotspots trong subtitle
  - Button "Edit Hotspots" di chuyển xuống dưới viewer
  - Hotspot table luôn visible (disabled khi không edit)
  - Save/Cancel buttons ở dưới hotspot table

### 6. Analytics Data Protection
- **Cải tiến**:
  - Stats được merge trong memory trước khi save
  - Không reset dữ liệu cũ khi load
  - Reload từ file khi get stats để đảm bảo dữ liệu mới nhất
  - Session cleanup: 2 phút timeout (giảm từ 10 phút)

### 7. Graph Management Endpoints
- **Endpoint mới**: `/api/graph/regenerate` (POST)
  - Tạo lại graph từ scenes
  - MERGE với graph hiện có, giữ lại x, y, positions
  - Giữ lại nodes cũ không có trong scenes mới
  - Trả về số lượng nodes với positions

### 8. WebGL Support với CSS Fallback
- **Vấn đề**: Một số trình duyệt không hỗ trợ WebGL hoặc bị tắt
- **Giải pháp**: 
  - Tự động phát hiện WebGL support
  - Dùng `stageType: "webgl"` nếu có, `stageType: "css"` nếu không
  - Đảm bảo element có kích thước hợp lệ trước khi khởi tạo

### 9. Minimap Visualization Enhancement
- **Tính năng mới**:
  - Làm mờ nodes và edges không trong path (opacity 0.15-0.25)
  - Highlight path với màu đỏ và class `mm-edge--hl`
  - Zoom tự động vào path với animation mượt (500ms)
  - Chuyển tầng tự động nếu path đi qua nhiều tầng
  - Reset view sau khi navigate xong

### 10. Voice Bot Integration với Minimap
- **Cải tiến**:
  - Voice bot gọi `minimap.visualizePath()` khi di chuyển
  - Tour navigation dùng `navigateToSceneStepByStep()` thay vì `onGotoScene()` trực tiếp
  - Tự động tìm đường đi và visualize trên minimap
  - Đợi 300ms để minimap render trước khi bắt đầu navigate

---

## 🔒 DATA PROTECTION PRINCIPLES

### Nguyên tắc bảo vệ dữ liệu:

1. **Không ghi đè dữ liệu cũ**: Tất cả update/refresh đều MERGE với dữ liệu hiện có
2. **Giữ lại vị trí**: Graph nodes giữ lại x, y, positions khi refresh/regenerate
3. **Giữ lại nodes cũ**: Nodes không có trong scenes mới vẫn được giữ lại trong graph
4. **Atomic writes**: Sử dụng temp file + rename để tránh corruption
5. **Reload sau save**: Luôn reload từ file sau khi save để đảm bảo đồng bộ
6. **Stats protection**: Analytics data được merge trong memory, không reset

### Các điểm cần lưu ý:

- **Graph refresh**: Frontend merge với graph hiện có, không ghi đè
- **Graph save**: Backend merge với graph hiện có trước khi save
- **Graph regenerate**: Merge với graph hiện có, giữ lại nodes cũ
- **Analytics**: Merge trong memory, không reset khi load
- **Scenes/Tours**: Reload từ file sau khi save để đồng bộ

---

## 📝 KẾT LUẬN

Ứng dụng 360 Web hoạt động theo mô hình:
- **Frontend**: React + Marzipano.js cho viewer, React Router cho CMS
- **Backend**: Flask REST API với JSON file storage
- **Communication**: HTTP/REST API
- **Data**: JSON files (scenes.json, tours.json, graph.json, stats.json)
- **Features**: 
  - 360° viewing với WebGL/CSS fallback
  - Hotspots navigation (đồng bộ giữa Viewer và CMS)
  - Voice control với TTS
  - Minimap routing với visualization và label visibility
  - Tour navigation với path finding
  - Analytics tracking (bảo vệ dữ liệu)
  - **Data protection**: MERGE logic đảm bảo không mất dữ liệu

Tất cả các component tương tác qua API calls và events, tạo nên một hệ thống modular và dễ mở rộng.

**Điểm quan trọng**: Hệ thống được thiết kế để **bảo vệ dữ liệu** - không ghi đè dữ liệu cũ khi update/refresh, đảm bảo dữ liệu quan trọng (vị trí nodes, analytics) không bị mất.

---

**Tài liệu này giúp hiểu rõ cách mọi thứ hoạt động, từ user interaction đến data persistence, giúp cả developer và AI có thể nắm bắt được toàn bộ flow của ứng dụng.**
