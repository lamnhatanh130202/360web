# 🔧 NGUYÊN LÝ VẬN HÀNH VÀ KIẾN TRÚC ỨNG DỤNG 360 WEB

Tài liệu mô tả chi tiết cách hoạt động của toàn bộ hệ thống, giúp cả người và AI hiểu được nguyên lý vận hành.

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
│         │  tours.json)│  │   static/tts/) │           │
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
2. Login → Xác thực (backend/routes/auth.py)
   ↓
3. Redirect → /cms/dashboard
   ↓
4. ProtectedRoute kiểm tra authentication
   ↓
5. Render CMS pages (ScenesPage, Hotspots, Tours...)
   ↓
6. User thao tác (CRUD) → Gọi API endpoints
   ↓
7. Backend xử lý → Lưu vào JSON files
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

#### Code flow chi tiết:

```javascript
// frontend/src/core/app.js

// 1. Khởi tạo với WebGL check
const checkWebGLSupport = () => {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && 
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) { return false; }
};

const hasWebGL = checkWebGLSupport();
const viewerOptions = { controls: { mouseViewMode: 'drag' } };
if (hasWebGL) {
  viewerOptions.stageType = "webgl";
} else {
  viewerOptions.stageType = "css"; // Fallback
}

const viewer = new Marzipano.Viewer(root, viewerOptions);
const geometry = new Marzipano.EquirectGeometry([{ width: 4096 }]);

// 2. Tạo scene
function createScene(s) {
  const source = Marzipano.ImageUrlSource.fromString(s.url);
  const scene = viewer.createScene({ source, geometry, view });
  return scene;
}

// 3. Chuyển scene
async function loadScene(sceneId, fromId = null) {
  await fade(1); // Fade out
  const scene = sceneCache[sceneId] || createScene(sceneData);
  scene.switchTo({ transitionDuration: 300 });
  await fade(0); // Fade in
  _emit('scenechange', { id: sceneId, name: sceneData.name });
  
  // Update minimap
  if (minimap) minimap.setCurrentScene(sceneId);
}
```

---

### 2. HOTSPOTS SYSTEM (Điểm tương tác)

#### Nguyên lý:
- Hotspots là các điểm clickable trên 360° image
- Mỗi hotspot có tọa độ (yaw, pitch) và target scene
- Hiển thị tooltip khi hover

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
│    - Thêm event listeners                   │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. User Interaction                         │
│    - Hover → Show tooltip                   │
│    - Click → Navigate to target scene       │
└─────────────────────────────────────────────┘
```

#### Code implementation:

```javascript
// frontend/src/core/app.js

function addHotspot(scene, h) {
  // 1. Tạo DOM element
  const el = document.createElement('div');
  el.className = 'hotspot';
  
  // 2. Event handlers
  el.addEventListener('click', async () => {
    await fade(1);
    await loadScene(h.target);
    await fade(0);
  });
  
  // 3. Đặt vị trí trên panorama
  scene.hotspotContainer().createHotspot(el, {
    yaw: +h.yaw,
    pitch: +h.pitch
  });
}
```

---

### 3. VOICE BOT (Điều khiển bằng giọng nói)

#### Kiến trúc:
- **File**: `frontend/src/bot/voiceBot.js`
- **API**: Web Speech Recognition API
- **TTS**: Google Cloud Text-to-Speech (qua backend)

#### Flow hoạt động:

```
┌─────────────────────────────────────────────┐
│ 1. Khởi tạo Voice Bot                       │
│    - Kiểm tra browser support               │
│    - Setup SpeechRecognition                │
│    - Tạo UI (button + bubble)               │
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

#### Code flow:

```javascript
// frontend/src/bot/voiceBot.js

// 1. Setup recognition
const recognition = new SpeechRecognition();
recognition.lang = 'vi-VN';

// 2. Handle result
recognition.onresult = async (event) => {
  const text = event.results[0][0].transcript;
  await handleSpokenText(text);
};

// 3. Process text
async function handleSpokenText(text) {
  // Normalize
  const normalized = normalize(text);
  
  // Find scene match
  const scene = findBestSceneMatch(normalized);
  if (scene) {
    await speak(`Đang di chuyển đến ${scene.name}`);
    await navigateToSceneStepByStep(currentSceneId, scene.id);
  }
  
  // Find tour match
  const tour = findBestTourMatch(normalized);
  if (tour) {
    await playTour(tour);
  }
}

// 4. TTS
async function speak(text) {
  // Gọi backend API
  const res = await fetch('/tts/generate', {
    method: 'POST',
    body: JSON.stringify({ text, voice: 'vi-VN-Wavenet-B' })
  });
  const { url } = await res.json();
  
  // Play audio
  const audio = new Audio(url);
  await audio.play();
}
```

---

### 4. MINIMAP (Bản đồ thu nhỏ)

#### Nguyên lý:
- Hiển thị sơ đồ tòa nhà với các nodes (scenes)
- Cho phép tìm đường đi giữa 2 scenes (Dijkstra algorithm)
- Visualize route trên minimap với hiệu ứng làm mờ và zoom
- Hỗ trợ multi-floor với chuyển tầng tự động

#### Flow:

```
┌─────────────────────────────────────────────┐
│ 1. Load Graph Data                          │
│    - Fetch /api/graph → {nodes, edges}     │
│    - Nodes: [{id, x, y, floor, label}]      │
│    - Edges: [{from, to, weight}]            │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 2. Render Minimap                           │
│    - Vẽ nodes trên canvas/SVG                │
│    - Highlight current scene                 │
│    - Vẽ edges (connections)                  │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. User Select Route                        │
│    - Chọn "From" scene                      │
│    - Chọn "To" scene                         │
│    - Click "Find Route"                      │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. Calculate Path (Dijkstra)                │
│    - Chạy Dijkstra algorithm                 │
│    - Trả về path: [scene1, scene2, ...]      │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 5. Visualize & Navigate                     │
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

#### Algorithm (Dijkstra):

```javascript
// frontend/src/utils/dijkstra.js

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
  GET    → Lấy danh sách scenes
  POST   → Tạo scene mới
  PUT    → Cập nhật scene
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
  GET    → Lấy graph data (nodes, edges)
           * Luôn reload từ file để có dữ liệu mới nhất
           * Không cache trong memory
           * Reload sau khi save để đảm bảo đồng bộ
  POST   → Cập nhật graph (deprecated, dùng PUT)
  PUT    → Lưu graph data
           * Atomic write (temp file + rename)
           * Reload từ file sau khi save để đồng bộ
           * Update global graph_data
           * Trả về path và số lượng nodes/edges
  /api/graph/cleanup (POST)
           → Xóa các node "rác" không có scene tương ứng
           * Tự động xóa edges liên quan
           * Trả về danh sách node đã xóa
  /api/graph/regenerate (POST)
           → Tạo lại graph từ scenes hiện có
           * Generate nodes từ scenes
           * Generate edges từ hotspots
           * Lưu vào file và update memory

/api/upload
  POST   → Upload file (image, audio)

/tts/generate
  POST   → Generate TTS audio

/api/analytics/*
  POST   → Track visits, pings
  GET    → Get statistics
  /api/analytics/stats (GET)
           → Lấy thống kê với optional filters
           * Parameters: period (day/week/month), year, month
           * Filter theo năm cho tất cả period
           * Filter theo tháng chỉ khi period = "day"
           * Trả về data theo khoảng thời gian đã chọn
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
│ 2. Load Data                                │
│    - Đọc scenes.json từ file system         │
│    - Parse JSON → Python dict               │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. Process Request                          │
│    - CRUD operations                        │
│    - Validation                            │
│    - Business logic                        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. Save Data                                │
│    - Update Python dict                     │
│    - Write to scenes.json                   │
│    - Sync to multiple paths (nếu cần)        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 5. Response                                 │
│    - Return JSON response                   │
│    - Status code                            │
└─────────────────────────────────────────────┘
```

#### Code example:

```python
# backend/app.py

@app.route("/api/scenes", methods=["GET"])
def list_scenes():
    # QUAN TRỌNG: Reload từ file để đảm bảo có dữ liệu mới nhất
    if scenes_path and os.path.exists(scenes_path):
        load_scenes_from_file(scenes_path)
    
    # Process và trả về scenes
    scenes_list = []
    for s in list(_scenes.values()):
        scenes_list.append(s)
    return jsonify(scenes_list)

@app.route("/api/scenes", methods=["POST"])
def create_scene():
    # 1. Parse request
    data = request.get_json()
    
    # 2. Validate
    if not data.get('id'):
        return jsonify({"error": "id required"}), 400
    
    # 3. Add to memory
    _scenes[data['id']] = data
    
    # 4. Save to file
    save_scenes()
    
    # 5. QUAN TRỌNG: Reload từ file sau khi save để đảm bảo đồng bộ
    if scenes_path and os.path.exists(scenes_path):
        load_scenes_from_file(scenes_path)
    
    # 6. Response
    return jsonify(data), 201

@app.route("/api/scenes/<scene_id>", methods=["PUT"])
def update_scene(scene_id):
    # 1. Reload từ file TRƯỚC KHI UPDATE để catch manual edits
    if scenes_path and os.path.exists(scenes_path):
        load_scenes_from_file(scenes_path)
    
    # 2. Update scene
    _scenes[scene_id].update(data)
    
    # 3. Save to file
    save_scenes()
    
    # 4. QUAN TRỌNG: Reload lại từ file sau khi save để đảm bảo đồng bộ
    if scenes_path and os.path.exists(scenes_path):
        load_scenes_from_file(scenes_path)
    
    # 5. Return updated scene
    return jsonify(_scenes[scene_id])

@app.route("/api/graph", methods=["PUT", "POST"])
def save_graph():
    """Save graph data - unified handler"""
    global graph_data, graph_path
    
    new_graph = request.get_json()
    if not new_graph or "nodes" not in new_graph or "edges" not in new_graph:
        return jsonify({"error": "Invalid graph data"}), 400
    
    # Find correct path
    save_path = find_graph_path()
    
    try:
        # Atomic write: temp file + rename
        temp_path = save_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(new_graph, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        
        # Atomic rename
        if os.path.exists(save_path):
            os.replace(temp_path, save_path)
        else:
            os.rename(temp_path, save_path)
        
        # Update global variables - reload từ file để đảm bảo đồng bộ
        try:
            with open(save_path, 'r', encoding='utf-8') as f:
                graph_data = json.load(f)
        except Exception as e:
            graph_data = new_graph
        
        graph_path = save_path
        
        return jsonify({
            "status": "ok", 
            "path": save_path,
            "nodes": len(new_graph.get('nodes', [])),
            "edges": len(new_graph.get('edges', []))
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/graph", methods=["GET"])
def get_graph():
    """Get graph data - luôn reload từ file để đảm bảo dữ liệu mới nhất"""
    global graph_data, graph_path
    
    # Luôn reload từ file để đảm bảo có dữ liệu mới nhất (đặc biệt sau khi save)
    if graph_path and os.path.exists(graph_path):
        try:
            with open(graph_path, 'r', encoding='utf-8') as f:
                graph_data = json.load(f)
        except Exception as e:
            print(f"✗ Error loading graph from {graph_path}: {e}")
            if not graph_data or len(graph_data.get('nodes', [])) < 10:
                if _scenes:
                    graph_data = generate_graph_from_scenes(_scenes)
                else:
                    graph_data = {"nodes": [], "edges": []}
    elif not graph_data or len(graph_data.get('nodes', [])) < 10:
        if _scenes:
            graph_data = generate_graph_from_scenes(_scenes)
        else:
            graph_data = {"nodes": [], "edges": []}
    
    return jsonify(graph_data), 200

@app.route("/api/graph/cleanup", methods=["POST"])
def cleanup_graph():
    """Xóa các node rác không có scene tương ứng"""
    # Tìm nodes không có scene tương ứng
    # Xóa nodes và edges liên quan
    # Lưu lại graph đã được làm sạch
    # Trả về danh sách node đã xóa

@app.route("/api/graph/regenerate", methods=["POST"])
def regenerate_graph():
    """Tạo lại graph từ scenes - khôi phục dữ liệu graph từ scenes"""
    # Generate graph từ scenes
    # Update memory
    # Save to file
    # Trả về số lượng nodes và edges
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
│    - Hotspots: Quản lý hotspots              │
│    - Tours: Quản lý tours                   │
│    - MinimapEditor: Chỉnh sửa graph         │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. User Actions                            │
│    - Form submit → API call                 │
│    - Upload file → /api/upload              │
│    - Update state → Re-render              │
└─────────────────────────────────────────────┘
```

#### Component Structure:

```jsx
// cms-frontend/src/cms/pages/ScenesPage.jsx

function ScenesPage() {
  const [scenes, setScenes] = useState([]);
  
  // Load data
  useEffect(() => {
    fetch('/api/scenes')
      .then(r => r.json())
      .then(setScenes);
  }, []);
  
  // Create scene
  const handleCreate = async (data) => {
    const res = await fetch('/api/scenes', {
      method: 'POST',
      body: JSON.stringify(data)
    });
    const newScene = await res.json();
    setScenes([...scenes, newScene]);
  };
  
  return (
    <div>
      <SceneList scenes={scenes} />
      <SceneForm onSubmit={handleCreate} />
    </div>
  );
}
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

#### Code:

```python
# backend/app.py

@app.route("/tts/generate", methods=["POST"])
def generate_tts():
    data = request.get_json()
    text = data.get('text')
    scene_id = data.get('sceneId')
    voice = data.get('voice', 'vi-VN-Wavenet-B')
    
    # Generate filename
    filename = filename_for(scene_id=scene_id, text=text, voice_name=voice)
    filepath = os.path.join(TTS_DIR, filename)
    
    # Check cache
    if os.path.exists(filepath):
        return jsonify({"url": f"/static/tts/{filename}", "cached": True})
    
    # Generate
    client = texttospeech.TextToSpeechClient()
    synthesis_input = texttospeech.SynthesisInput(text=text)
    voice_config = texttospeech.VoiceSelectionParams(
        language_code='vi-VN',
        name=voice
    )
    audio_config = texttospeech.AudioConfig(
        audio_encoding=texttospeech.AudioEncoding.MP3
    )
    
    response = client.synthesize_speech(
        input=synthesis_input,
        voice=voice_config,
        audio_config=audio_config
    )
    
    # Save
    with open(filepath, 'wb') as out:
        out.write(response.audio_content)
    
    return jsonify({"url": f"/static/tts/{filename}", "cached": False})
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
│    - Load stats.json                       │
│    - Update daily/weekly/monthly counts    │
│    - Track active sessions                 │
│    - Save to file                          │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 3. Ping (Keep-alive)                       │
│    - POST /api/analytics/ping              │
│    - Update last_activity timestamp        │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│ 4. Get Statistics                          │
│    - GET /api/analytics/stats              │
│    - Return aggregated data                │
└─────────────────────────────────────────────┘
```

---

## 🔗 TƯƠNG TÁC GIỮA CÁC COMPONENT

### Viewer ↔ Backend:

```
Viewer                    Backend
  │                         │
  │── GET /api/scenes ──────>│
  │<─── [{scenes}] ──────────│
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
  │                         │── Add new scene
  │                         │── Save scenes.json
  │<─── {scene} ────────────│
  │                         │
  │── POST /api/upload ─────>│
  │                         │── Save file
  │<─── {url: "/uploads/..."}│
```

### Voice Bot ↔ Viewer:

```
Voice Bot                 Viewer App
  │                         │
  │── getScenes() ─────────>│
  │<─── [{scenes}] ─────────│
  │                         │
  │── onGotoScene(id) ─────>│
  │                         │── navigateTo(id)
  │                         │── loadScene(id)
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
    {"from": "a0_1", "to": "a0_2", "weight": 1}
  ]
}
```

**Lưu ý**: Nodes có thể có `positions` object để lưu vị trí trên nhiều tầng khác nhau. Nếu không có `positions`, dùng `x`, `y` trực tiếp.

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
  └── #voice-bot-btn (Voice bot button)
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
      ├── Hotspots
      ├── Tours
      └── MinimapEditor
```

---

## 🚀 STARTUP SEQUENCE

### Frontend Viewer:

1. **HTML Load** → Parse index.html
2. **Scripts Load** → Load marzipano.js, main.jsx
3. **React Mount** → Mount CMS (nếu ở /cms)
4. **Viewer Bootstrap** → Check #pano element
5. **Load Scenes** → Fetch /api/scenes
6. **Init Viewer** → Create Marzipano instance
7. **Load First Scene** → Load và render scene đầu tiên
8. **Init Components** → Minimap, Voice Bot, Controls
9. **Ready** → App sẵn sàng

### Backend:

1. **Flask Init** → Create app instance
2. **Load Data** → Read scenes.json, tours.json, graph.json
3. **Register Routes** → Setup API endpoints
4. **Start Server** → 
   - Development: Flask dev server (hot reload)
   - Production: Gunicorn với 4 workers, 1 thread/worker, sync worker class
5. **Ready** → Accept requests

---

## 🔄 STATE MANAGEMENT

### Frontend Viewer:
- **Scenes**: Loaded từ API, cache trong memory
- **Current Scene**: Track trong `active` object
- **Graph**: Load từ API, cache
- **Language**: localStorage + state

### CMS:
- **React State**: useState hooks
- **Data**: Fetch từ API khi cần
- **Auth**: localStorage (token)

### Backend:
- **In-memory**: Scenes, tours, graph dicts (được reload từ file khi cần)
- **Persistent**: JSON files (scenes.json, tours.json, graph.json, stats.json)
- **Stats**: JSON file + in-memory tracking với session cleanup
- **Data Sync**: Luôn reload từ file sau khi save để đảm bảo đồng bộ

---

## 📝 CÁC CẢI TIẾN MỚI (2025)

### 1. WebGL Support với CSS Fallback
- **Vấn đề**: Một số trình duyệt không hỗ trợ WebGL hoặc bị tắt
- **Giải pháp**: 
  - Tự động phát hiện WebGL support
  - Dùng `stageType: "webgl"` nếu có, `stageType: "css"` nếu không
  - Đảm bảo element có kích thước hợp lệ trước khi khởi tạo

### 2. Minimap Visualization Enhancement
- **Tính năng mới**:
  - Làm mờ nodes và edges không trong path (opacity 0.15-0.25)
  - Highlight path với màu đỏ và class `mm-edge--hl`
  - Zoom tự động vào path với animation mượt (500ms)
  - Chuyển tầng tự động nếu path đi qua nhiều tầng
  - Reset view sau khi navigate xong

### 3. Voice Bot Integration với Minimap
- **Cải tiến**:
  - Voice bot gọi `minimap.visualizePath()` khi di chuyển
  - Tour navigation dùng `navigateToSceneStepByStep()` thay vì `onGotoScene()` trực tiếp
  - Tự động tìm đường đi và visualize trên minimap
  - Đợi 300ms để minimap render trước khi bắt đầu navigate

### 4. Graph Save Improvement
- **Vấn đề**: Graph không lưu được hoặc trở về dữ liệu cũ
- **Giải pháp**:
  - Xóa route trùng lặp (`update_graph()`)
  - Dùng atomic write (temp file + rename) để tránh corruption
  - GET graph luôn reload từ file (không cache)
  - Đồng bộ `find_graph_path()` với `find_graph_file()`
  - Update global variables sau khi save thành công

### 5. Tour Navigation Enhancement
- **Cải tiến**:
  - Tour navigation giờ dùng path finding thay vì jump trực tiếp
  - Visualize toàn bộ tour path trên minimap
  - Làm mờ các phần không liên quan
  - Zoom vào tour path

### 6. Voice Bot Natural Narration
- **Cải tiến**:
  - Tour introduction: "Bắt đầu thăm quan các phòng thuộc [tên tour]" thay vì "Bắt đầu tour [tên]"
  - Giới thiệu số lượng và tên phòng theo từng tầng
  - Bỏ thông báo "bắt đầu tìm đường đến" khi di chuyển trong tour (silent mode)
  - Bỏ thông báo tầng khi giới thiệu từng phòng (đã giới thiệu ở đầu tầng)

### 7. Data Persistence Fixes
- **Vấn đề**: Dữ liệu scenes và graph không được lưu đúng hoặc bị revert sau khi save
- **Giải pháp**:
  - `list_scenes()`: Luôn reload từ file trước khi trả về để đảm bảo dữ liệu mới nhất
  - `update_scene()`: Reload từ file sau khi save để đồng bộ
  - `delete_scene()`: Reload từ file sau khi xóa để đảm bảo scene đã bị xóa
  - `get_graph()`: Luôn reload từ file (không dùng memory cache) để đảm bảo dữ liệu mới nhất
  - `save_graph()`: Reload từ file sau khi save để đồng bộ memory và file
  - `save_tours()`: Sử dụng `tours_file_path` để đảm bảo save/load cùng file, reload sau khi save

### 8. Graph Management Endpoints
- **Endpoint mới**: `/api/graph/cleanup` (POST)
  - Xóa các node "rác" không có scene tương ứng
  - Tự động xóa các edge liên quan đến node bị xóa
  - Trả về danh sách node đã xóa và số lượng còn lại
- **Endpoint mới**: `/api/graph/regenerate` (POST)
  - Tạo lại graph từ scenes hiện có
  - Hữu ích khi graph bị mất hoặc cần đồng bộ lại
  - Tự động tạo nodes và edges từ scenes và hotspots

### 9. Server Performance Optimization
- **Gunicorn Configuration**:
  - Workers: 4 (có thể override bằng `GUNICORN_WORKERS`)
  - Threads: 1 thread/worker (có thể override bằng `GUNICORN_THREADS`)
  - Worker class: `sync` (đơn giản, ổn định)
  - Timeout: 120 giây
- **Docker Configuration**:
  - Production mode: `FLASK_ENV=production`, `FLASK_DEBUG=0`
  - Resource limits: CPU 2.0 cores, Memory 2GB
  - Resource reservations: CPU 1.0 core, Memory 1GB
- **Nginx Optimization**:
  - Proxy buffering: Bật với buffer size 4k, 8 buffers
  - Tối ưu proxy timeouts và connection handling
- **Lưu ý**: Caching decorator đã được tắt tạm thời để tránh vấn đề với response parsing

### 10. Analytics Dashboard Improvements
- **Lọc theo năm/tháng**:
  - Dropdown chọn năm (hiện tại và 2 năm trước)
  - Dropdown chọn tháng (1-12) khi period = "day"
  - API hỗ trợ `year` và `month` parameters
  - Filter theo năm cho tất cả period (day/week/month)
  - Filter theo tháng chỉ khi period = "day"
- **Biểu đồ cải thiện**:
  - Chiều cao tăng: 400px (từ 320px)
  - Chiều cao tối thiểu: 30px cho bar có giá trị > 0
  - Bar = 0: Hiển thị bar nhỏ 4px (màu xám) để người dùng thấy có dữ liệu
  - Màu sắc gradient theo giá trị (cao = đậm, thấp = nhạt)
  - Giá trị hiển thị trên đầu mỗi bar
  - Hover effect với scale và shadow
  - Y-axis labels rõ ràng hơn
- **Card "Cao nhất cùng lúc"**:
  - Gradient xanh lá nổi bật
  - Font lớn hơn (48px)
  - Format ngày tháng đầy đủ và dễ đọc

### 11. ScenePreview Navigation Fix
- **Vấn đề**: Nút "Quay lại" không hoạt động vì nút "Xem" mở trong tab mới
- **Giải pháp**:
  - Bỏ `target="_blank"` khỏi nút "Xem" trong ScenesList
  - Sửa nút "Quay lại" từ `navigate(-1)` sang `navigate('/cms/scenes')`
  - Đảm bảo navigation hoạt động đúng trong cùng tab

### 12. Session Management Optimization
- **Vấn đề**: Concurrent user count tăng không ngừng vượt quá số users thực tế
- **Giải pháp**:
  - Giảm `session_timeout` từ 600 giây (10 phút) xuống 120 giây (2 phút)
  - Gọi `cleanup_inactive_sessions()` trước khi thêm session mới trong `track_visit()` và `ping_session()`
  - Đảm bảo cleanup được thực hiện trong `stats_lock` context

---

## 📝 KẾT LUẬN

Ứng dụng 360 Web hoạt động theo mô hình:
- **Frontend**: React + Marzipano.js cho viewer, React Router cho CMS
- **Backend**: Flask REST API với JSON file storage
- **Communication**: HTTP/REST API
- **Data**: JSON files (scenes.json, tours.json, graph.json)
- **Features**: 
  - 360° viewing với WebGL/CSS fallback
  - Hotspots navigation
  - Voice control với TTS
  - Minimap routing với visualization
  - Tour navigation với path finding
  - Analytics tracking

Tất cả các component tương tác qua API calls và events, tạo nên một hệ thống modular và dễ mở rộng.

---

**Tài liệu này giúp hiểu rõ cách mọi thứ hoạt động, từ user interaction đến data persistence, giúp cả developer và AI có thể nắm bắt được toàn bộ flow của ứng dụng.**

