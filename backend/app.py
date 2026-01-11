# app.py (stable for docker + cms/data + bot endpoints + Google Cloud TTS) - UPDATED
from flask import Flask, jsonify, request, abort, send_from_directory
from flask_cors import CORS
import os, json, base64, uuid, math, time, threading
from datetime import datetime, timedelta
from collections import deque
from functools import wraps
from contextlib import contextmanager
import jwt
import requests

# Import thư viện xử lý ảnh
from werkzeug.utils import secure_filename
from PIL import Image

try:
    from google.cloud import texttospeech
    print("✓ Google Cloud TTS imported")
except ImportError:
    texttospeech = None
    print("⚠ Warning: google-cloud-texttospeech not installed.")

# --- Cấu hình Server & Đường dẫn ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Cho phép cấu hình thư mục dữ liệu & uploads qua ENV để dùng Persistent Disk trên Render
DATA_DIR_ENV = os.environ.get("DATA_DIR")  # ví dụ: /data/data
UPLOADS_DIR_ENV = os.environ.get("UPLOADS_DIR")  # ví dụ: /data/uploads

# Thư mục dữ liệu CMS (scenes.json, graph.json, tours.json)
CMS_DATA_DIR = (
    DATA_DIR_ENV if DATA_DIR_ENV else os.path.join(BASE_DIR, "cms", "data")
)

# Thư mục uploads (ảnh panorama, mp3)
UPLOAD_DIR = (
    UPLOADS_DIR_ENV if UPLOADS_DIR_ENV else os.path.join(BASE_DIR, 'uploads')
)

# Stats file nên nằm cùng DATA_DIR để bền vững qua deploy
STATS_FILE = os.path.join(DATA_DIR_ENV if DATA_DIR_ENV else BASE_DIR, 'stats.json')

# scenes.json đường dẫn ưu tiên ghi vào CMS_DATA_DIR
SCENES_FILE_WRITE = os.path.join(CMS_DATA_DIR, "scenes.json")

# Frontend paths
FRONTEND_DIST = os.path.normpath(os.path.join(BASE_DIR, '..', 'frontend', 'dist'))
FRONTEND_PUBLIC = os.path.normpath(os.path.join(BASE_DIR, '..', 'frontend', 'public'))
FRONTEND_ASSETS = os.path.join(FRONTEND_PUBLIC, 'assets')
CANDIDATE_SCENES = [
    SCENES_FILE_WRITE,
    os.path.join(CMS_DATA_DIR, "scenes.json"),
    os.path.normpath(os.path.join(BASE_DIR, "..", "cms", "data", "scenes.json")),
]
# Tạo thư mục
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(FRONTEND_ASSETS, exist_ok=True)
os.makedirs(CMS_DATA_DIR, exist_ok=True)

# Bootstrap dữ liệu lần đầu nếu DATA_DIR rỗng nhưng repo có sẵn file
def _bootstrap_persistent_data():
    try:
        scenes_target = os.path.join(CMS_DATA_DIR, 'scenes.json')
        repo_candidates = [
            os.path.join(BASE_DIR, 'cms', 'data', 'scenes.json'),
            os.path.normpath(os.path.join(BASE_DIR, '..', 'cms', 'data', 'scenes.json')),
            os.path.join(BASE_DIR, 'scenes.json'),
        ]
        if not os.path.exists(scenes_target):
            for src in repo_candidates:
                if os.path.exists(src) and os.path.getsize(src) > 0:
                    os.makedirs(os.path.dirname(scenes_target), exist_ok=True)
                    import shutil
                    shutil.copy(src, scenes_target)
                    print(f"[Bootstrap] Copied scenes.json from {src} -> {scenes_target}")
                    break

        tours_target = os.path.join(CMS_DATA_DIR, 'tours.json')
        tours_candidates = [
            os.path.join(BASE_DIR, 'cms', 'data', 'tours.json'),
            os.path.normpath(os.path.join(BASE_DIR, '..', 'cms', 'data', 'tours.json')),
        ]
        if not os.path.exists(tours_target):
            for src in tours_candidates:
                if os.path.exists(src) and os.path.getsize(src) > 0:
                    os.makedirs(os.path.dirname(tours_target), exist_ok=True)
                    import shutil
                    shutil.copy(src, tours_target)
                    print(f"[Bootstrap] Copied tours.json from {src} -> {tours_target}")
                    break

        graph_target = os.path.join(CMS_DATA_DIR, 'graph.json')
        graph_candidates = [
            os.path.join(BASE_DIR, 'cms', 'data', 'graph.json'),
            os.path.normpath(os.path.join(BASE_DIR, '..', 'cms', 'data', 'graph.json')),
        ]
        if not os.path.exists(graph_target):
            for src in graph_candidates:
                if os.path.exists(src) and os.path.getsize(src) > 0:
                    os.makedirs(os.path.dirname(graph_target), exist_ok=True)
                    import shutil
                    shutil.copy(src, graph_target)
                    print(f"[Bootstrap] Copied graph.json from {src} -> {graph_target}")
                    break
    except Exception as e:
        print(f"[Bootstrap] Warning: {e}")

_bootstrap_persistent_data()
# Thêm sau dòng os.makedirs(CMS_DATA_DIR, exist_ok=True)

print(f"[DEBUG] BASE_DIR: {BASE_DIR}")
print(f"[DEBUG] CMS_DATA_DIR: {CMS_DATA_DIR}")
print(f"[DEBUG] SCENES_FILE_WRITE: {SCENES_FILE_WRITE}")
print(f"[DEBUG] CANDIDATE_SCENES: {CANDIDATE_SCENES}")
print(f"[DEBUG] CMS_DATA_DIR exists: {os.path.exists(CMS_DATA_DIR)}")
print(f"[DEBUG] scenes.json exists: {os.path.exists(os.path.join(CMS_DATA_DIR, 'scenes.json'))}")
print(f"[DEBUG] graph.json exists: {os.path.exists(os.path.join(CMS_DATA_DIR, 'graph.json'))}")
app = Flask(__name__, static_folder=FRONTEND_DIST, static_url_path='')
CORS(app, resources={r"/api/*": {"origins": "*"}})

# Giới hạn file upload 32MB
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024 

# --- Auth Config ---
SECRET_KEY = os.environ.get("AUTH_SECRET_KEY", "change_me_in_production")
ADMIN_USERNAME = os.environ.get("ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
TOKEN_EXPIRE_HOURS = 8

# --- GitHub Commit Config (optional) ---
GH_TOKEN = os.environ.get("GH_TOKEN")
GH_REPO = os.environ.get("GH_REPO")  # owner/repo
GH_BRANCH = os.environ.get("GH_BRANCH", "main")
GH_PATH_SCENES = os.environ.get("GH_PATH_SCENES", "backend/scenes.json")
GH_PATH_TOURS = os.environ.get("GH_PATH_TOURS", "cms/data/tours.json")
GH_PATH_GRAPH = os.environ.get("GH_PATH_GRAPH", "cms/data/graph.json")

def _gh_headers():
    return {
        "Authorization": f"token {GH_TOKEN}" if GH_TOKEN else "",
        "Accept": "application/vnd.github+json"
    }

def _gh_get_sha(path):
    if not (GH_TOKEN and GH_REPO):
        return None
    try:
        url = f"https://api.github.com/repos/{GH_REPO}/contents/{path}?ref={GH_BRANCH}"
        r = requests.get(url, headers=_gh_headers(), timeout=20)
        if r.status_code == 200:
            return r.json().get("sha")
    except Exception as e:
        print(f"[GH] get_sha error: {e}")
    return None

def _gh_upsert_json(path, data, message):
    if not (GH_TOKEN and GH_REPO):
        return False
    try:
        url = f"https://api.github.com/repos/{GH_REPO}/contents/{path}"
        content_b64 = base64.b64encode(
            json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
        ).decode("utf-8")
        payload = {
            "message": message,
            "branch": GH_BRANCH,
            "content": content_b64
        }
        sha = _gh_get_sha(path)
        if sha:
            payload["sha"] = sha
        r = requests.put(url, headers=_gh_headers(), json=payload, timeout=30)
        if 200 <= r.status_code < 300:
            print(f"[GH] ✓ Committed {path} @ {GH_BRANCH}")
            return True
        else:
            print(f"[GH] ✗ Commit failed {path}: {r.status_code} {r.text[:200]}")
    except Exception as e:
        print(f"[GH] upsert error: {e}")
    return False

# --- Global Variables ---
_scenes = {}
db_tours = []
tours_file_path = None  # Lưu path của file tours để đảm bảo save/load cùng file
loaded_from = None
scenes_path = None
active_sessions = {}
stats_lock = threading.Lock()
stats_data = {
    "daily": {}, "weekly": {}, "monthly": {},
    "peak_concurrent": 0, "peak_concurrent_date": None
}

# --- Analytics Helpers ---
def get_date_key(date=None):
    if date is None: date = datetime.now()
    return date.strftime('%Y-%m-%d')

def get_week_key(date=None):
    if date is None: date = datetime.now()
    monday = date - timedelta(days=date.weekday())
    return monday.strftime('%Y-W%W')

def get_month_key(date=None):
    if date is None: date = datetime.now()
    return date.strftime('%Y-%m')

# Tìm hàm load_stats_from_file cũ và thay bằng hàm này
def load_stats_from_file():
    default_stats = {
        "daily": {}, "weekly": {}, "monthly": {},
        "peak_concurrent": 0, "peak_concurrent_date": None
    }
    
    if not os.path.exists(STATS_FILE):
        print(f"[Analytics] Stats file not found, creating new: {STATS_FILE}")
        return default_stats

    try:
        with open(STATS_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # Validate sơ bộ
            if not isinstance(data, dict):
                raise ValueError("JSON root is not a dictionary")
            
            print(f"[Analytics] ✓ Loaded stats: {len(data.get('daily', {}))} days recorded")
            return data
            
    except Exception as e:
        print(f"[Analytics] ☠ CRITICAL ERROR loading stats: {e}")
        
        # --- CƠ CHẾ BẢO VỆ: BACKUP FILE LỖI ---
        try:
            timestamp = int(time.time())
            backup_path = f"{STATS_FILE}.corrupt.{timestamp}.bak"
            import shutil
            shutil.copy(STATS_FILE, backup_path)
            print(f"[Analytics] ⚠ Backed up corrupted file to: {backup_path}")
        except Exception as backup_err:
            print(f"[Analytics] ✗ Failed to backup corrupted file: {backup_err}")
            
        # Vẫn trả về default để server chạy được, nhưng file cũ đã được backup
        # để bạn có thể khôi phục thủ công nếu cần.
        return default_stats


def _atomic_write_json(path, data):
    """Write JSON atomically to avoid truncated/corrupt files on crashes.

    Approach: write to a temp file in the same directory, then os.replace().
    """
    import tempfile
    directory = os.path.dirname(path) or '.'
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(prefix='._tmp_', suffix='.json', dir=directory)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            try:
                f.flush()
                os.fsync(f.fileno())
            except Exception:
                # Best-effort; some filesystems may not support fsync
                pass
        os.replace(tmp_path, path)
    finally:
        try:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
        except Exception:
            pass


@contextmanager
def _stats_file_lock():
    """Inter-process lock for stats.json (needed with multiple Gunicorn workers).

    Without this, each worker can overwrite stats.json with its own stale in-memory
    copy, causing apparent 'resets' or data loss.
    """
    lock_path = f"{STATS_FILE}.lock"
    os.makedirs(os.path.dirname(STATS_FILE) or '.', exist_ok=True)
    lock_f = open(lock_path, 'w', encoding='utf-8')
    try:
        try:
            import fcntl
            fcntl.flock(lock_f.fileno(), fcntl.LOCK_EX)
        except Exception:
            # On platforms without fcntl, we fall back to best-effort.
            pass
        yield
    finally:
        try:
            import fcntl
            fcntl.flock(lock_f.fileno(), fcntl.LOCK_UN)
        except Exception:
            pass
        try:
            lock_f.close()
        except Exception:
            pass

stats_data = load_stats_from_file() # Load lần đầu

# --- Simple In-Memory Cache ---
_cache = {}
_cache_lock = threading.Lock()

def cached_response(ttl_seconds=30):
    """Decorator để cache response của API endpoint"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            # Chỉ cache GET requests
            if request.method != 'GET':
                return f(*args, **kwargs)
            
            cache_key = f"{request.path}?{request.query_string.decode()}"
            
            with _cache_lock:
                if cache_key in _cache:
                    cached_data, cached_time = _cache[cache_key]
                    if time.time() - cached_time < ttl_seconds:
                        # Return cached response
                        return jsonify(cached_data), 200
            
            # Execute function and cache result
            result = f(*args, **kwargs)
            
            # Extract JSON data from response tuple (jsonify(...), status_code)
            if isinstance(result, tuple) and len(result) >= 1:
                try:
                    # result[0] là Response object từ jsonify()
                    response_obj = result[0]
                    if hasattr(response_obj, 'get_json'):
                        json_data = response_obj.get_json()
                        with _cache_lock:
                            _cache[cache_key] = (json_data, time.time())
                except Exception:
                    # Nếu không parse được, không cache
                    pass
            
            return result
        return decorated_function
    return decorator

def clear_cache(pattern=None):
    """Xóa cache, có thể xóa theo pattern"""
    with _cache_lock:
        if pattern:
            keys_to_delete = [k for k in _cache.keys() if pattern in k]
            for k in keys_to_delete:
                _cache.pop(k, None)
        else:
            _cache.clear()

def normalize_url(url, keep_query=False):
    if not isinstance(url, str):
        return url
    
    # Don't modify external URLs
    if url.startswith('http://') or url.startswith('https://'):
        return url
    
    # Remove query parameters if requested
    if not keep_query and ('?' in url or '&' in url):
        url = url.split('?')[0].split('&')[0]
    
    # Fix duplicate /assets/assets/ to /assets/
    if '/assets/assets/' in url:
        url = url.replace('/assets/assets/', '/assets/')
    
    # Ensure URL starts with /assets/
    if url.startswith('/assets/'):
        return url
    
    # Handle relative paths
    if url.startswith('./assets/') or url.startswith('assets/'):
        clean = url.replace('./assets/', '').replace('assets/', '')
        return '/assets/' + clean
    
    # If already starts with /, return as-is
    if url.startswith('/'):
        return url
    
    # Default: return unchanged
    return url
# --- Theo dõi phân tích ---
active_sessions = {}  # session_id -> last_activity timestamp
stats_lock = threading.Lock()
app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024

def load_stats():
    """Backward-compatible loader; delegates to the safer loader with backup."""
    return load_stats_from_file()

def save_stats(stats, lock_acquired=False):
    """Save stats to file. If lock_acquired=True, assumes caller already has stats_lock"""
    try:
        today_visits = stats.get('daily', {}).get(get_date_key(), 0)
        should_log = (today_visits % 10 == 0) if today_visits > 0 else True
        
        if lock_acquired:
            # Người gọi đã khóa, không lấy lại nữa
            _atomic_write_json(STATS_FILE, stats)
            # Chỉ ghi nhật ký thỉnh thoảng để giảm I/O
            if should_log:
                print(f"[Analytics] Stats saved to {STATS_FILE} (today: {today_visits} visits)")
        else:
            # Có được khóa nếu chưa được giữ
            with stats_lock:
                _atomic_write_json(STATS_FILE, stats)
                if should_log:
                    print(f"[Analytics] Stats saved to {STATS_FILE} (today: {today_visits} visits)")
    except Exception as e:
        print(f"[Analytics] Error saving stats: {e}")

# NOTE: stats_data is initialized earlier via load_stats_from_file();
# do not overwrite it here (doing so can drop data if stats.json is temporarily invalid).

def get_date_key(date=None):
    if date is None:
        date = datetime.now()
    return date.strftime('%Y-%m-%d')

def get_week_key(date=None):
    if date is None:
        date = datetime.now()
    # Get Monday of the week
    monday = date - timedelta(days=date.weekday())
    return monday.strftime('%Y-W%W')

def get_month_key(date=None):
    if date is None:
        date = datetime.now()
    return date.strftime('%Y-%m')


# --- Auth helpers (JWT cho admin CMS) ---
def generate_token(username):
    """Tạo JWT token cho tài khoản admin."""
    payload = {
        "sub": username,
        "role": "admin",
        "exp": datetime.utcnow() + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def verify_token(token):
    """Giải mã và kiểm tra JWT token. Trả về payload nếu hợp lệ, ngược lại trả về None."""
    try:
        data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        return data
    except jwt.ExpiredSignatureError:
        print("[Auth] Token expired")
        return None
    except Exception as e:
        print(f"[Auth] Invalid token: {e}")
        return None


@app.route("/api/auth/login", methods=["POST"])
def auth_login():
    """Đăng nhập admin CMS.

    Request body: {"username": "...", "password": "..."}
    Response:
      - 200: {"token": "...", "username": "..."}
      - 400: thiếu tham số
      - 401: sai tài khoản / mật khẩu
    """
    data = request.get_json() or {}
    username = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))

    if not username or not password:
        return jsonify({"error": "Missing username or password"}), 400

    # Hiện tại hệ thống chỉ có 1 tài khoản admin cấu hình trong ENV hoặc mặc định.
    if username != ADMIN_USERNAME or password != ADMIN_PASSWORD:
        return jsonify({"error": "Invalid credentials"}), 401

    token = generate_token(username)
    print(f"[Auth] Admin '{username}' logged in")
    return jsonify({"token": token, "username": username}), 200


def periodic_cleanup():
    while True:
        time.sleep(300)  # 5 phút
        try:
            with stats_lock:
                cleanup_inactive_sessions()
                # IMPORTANT: Do not write stats_data here.
                # With multiple Gunicorn workers, each worker has its own in-memory stats_data.
                # Writing it periodically can overwrite newer data from other workers.
                    
        except Exception as e:
            print(f"[Cleanup] ✗ Error in periodic cleanup: {e}")

# Start background cleanup thread
cleanup_thread = threading.Thread(target=periodic_cleanup, daemon=True)
cleanup_thread.start()
print("[Background] Started periodic cleanup thread")


def record_visit():
    """
    Record a visit in daily/weekly/monthly stats.
    Should be called within stats_lock context.
    """
    now = datetime.now()
    current_concurrent = len(active_sessions)

    # Multi-worker safe: lock + read-modify-write on disk
    with _stats_file_lock():
        disk_stats = load_stats_from_file()
        if not isinstance(disk_stats, dict):
            disk_stats = {"daily": {}, "weekly": {}, "monthly": {}, "peak_concurrent": 0, "peak_concurrent_date": None}

        # Update daily stats
        day_key = get_date_key(now)
        disk_stats.setdefault('daily', {})
        disk_stats['daily'][day_key] = disk_stats['daily'].get(day_key, 0) + 1

        # Update weekly stats
        week_key = get_week_key(now)
        disk_stats.setdefault('weekly', {})
        disk_stats['weekly'][week_key] = disk_stats['weekly'].get(week_key, 0) + 1

        # Update monthly stats
        month_key = get_month_key(now)
        disk_stats.setdefault('monthly', {})
        disk_stats['monthly'][month_key] = disk_stats['monthly'].get(month_key, 0) + 1

        # Update peak concurrent (best-effort; note: active_sessions is per-worker)
        if current_concurrent > disk_stats.get('peak_concurrent', 0):
            disk_stats['peak_concurrent'] = current_concurrent
            disk_stats['peak_concurrent_date'] = now.isoformat()
            print(f"[Analytics] New peak concurrent users: {current_concurrent}")

        _atomic_write_json(STATS_FILE, disk_stats)
        # Keep this worker's in-memory view in sync
        stats_data.clear()
        stats_data.update(disk_stats)

def cleanup_inactive_sessions():
    """Remove sessions inactive for more than 2 minutes"""
    # Note: This should be called WITHIN stats_lock context
    now = datetime.now()
    inactive = [sid for sid, last_activity in active_sessions.items() 
                if (now - last_activity).total_seconds() > 120]  # 2 minutes - giảm từ 10 phút để cleanup nhanh hơn
    for sid in inactive:
        active_sessions.pop(sid, None)
    if inactive:
        print(f"[Analytics] Cleaned up {len(inactive)} inactive sessions")

def get_concurrent_users():
    """Get current concurrent users without cleanup (cleanup should be called separately)"""
    return len(active_sessions)

# --- Load scenes ---
def find_scenes_file():
    """
    Find scenes.json file with priority:
    1. backend/scenes.json (primary source)
    2. Migrate from other locations if needed
    3. Create empty file if none exists
    """
    backend_scenes = os.path.join(BASE_DIR, "scenes.json")
    
    # Check if primary file exists and is valid
    if os.path.exists(backend_scenes) and os.path.getsize(backend_scenes) > 0:
        print(f"✓ Found backend/scenes.json, using as primary source")
        return backend_scenes
    
    # Try to migrate from other locations
    for candidate_path in CANDIDATE_SCENES:
        if candidate_path == backend_scenes:
            continue
        try:
            if candidate_path and os.path.exists(candidate_path) and os.path.getsize(candidate_path) > 0:
                print(f"⚠ Migrating scenes from {candidate_path} to backend/scenes.json")
                if load_scenes_from_file(candidate_path):
                    save_scenes()
                    print(f"✓ Migration completed")
                return backend_scenes
        except Exception as e:
            print(f"⚠ Error checking {candidate_path}: {e}")
            continue
    
    # Create empty file if none exists
    print(f"⚠ No scenes.json found, creating empty backend/scenes.json")
    try:
        os.makedirs(os.path.dirname(backend_scenes), exist_ok=True)
        with open(backend_scenes, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False, indent=2)
        print(f"✓ Created empty scenes file")
    except Exception as e:
        print(f"✗ Could not create backend/scenes.json: {e}")
    
    return backend_scenes

_scenes = {}
loaded_from = None
scenes_path = None

def find_tours_file():
    """
    Find tours.json file with priority:
    1. cms/data/tours.json (primary source)
    2. backend/cms/data/tours.json (fallback)
    3. Create empty file if none exists
    """
    candidate_tours_paths = [
        # 0. DATA_DIR (ưu tiên nếu khai báo ENV)
        os.path.join(CMS_DATA_DIR, 'tours.json'),
        # 1. Root project cms/data (ưu tiên cao nhất)
        os.path.normpath(os.path.join(BASE_DIR, '..', 'cms', 'data', 'tours.json')),
        # 2. Docker mount path
        "/app/cms/data/tours.json",
        # 3. Backend cms/data (fallback)
        os.path.join(BASE_DIR, 'cms', 'data', 'tours.json'),
    ]
    
    for path in candidate_tours_paths:
        try:
            if path and os.path.exists(path) and os.path.getsize(path) > 0:
                print(f"✓ Found tours.json at: {path}")
                return path
        except Exception as e:
            print(f"⚠ Error checking {path}: {e}")
            continue
    
    # Create empty file if none exists
    default_path = os.path.join(CMS_DATA_DIR, 'tours.json')
    print(f"⚠ No tours.json found, creating empty file at {default_path}")
    try:
        os.makedirs(os.path.dirname(default_path), exist_ok=True)
        with open(default_path, 'w', encoding='utf-8') as f:
            json.dump([], f, ensure_ascii=False, indent=2)
        print(f"✓ Created empty tours file")
        return default_path
    except Exception as e:
        print(f"✗ Could not create tours.json: {e}")
        return None

def load_tours():
    """Load tours from tours.json"""
    global db_tours, tours_file_path
    tours_path = find_tours_file()
    
    # Lưu path để dùng cho save_tours()
    if tours_path:
        tours_file_path = tours_path
    
    if not tours_path:
        print("⚠ No tours.json found, starting with empty tours")
        db_tours = []
        # Set default path nếu chưa có
        if not tours_file_path:
            tours_file_path = os.path.join(CMS_DATA_DIR, 'tours.json')
        return
    
    try:
        with open(tours_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                db_tours = data
            else:
                db_tours = []
        print(f"✓ Loaded {len(db_tours)} tours from {tours_path}")
    except Exception as e:
        print(f"✗ Error loading tours: {e}")
        db_tours = []

def pathfinding(start_id, end_id):
    """
    Find shortest path between two scenes using BFS algorithm.
    Returns list of scene IDs forming the path, or empty list if no path found.
    
    Args:
        start_id: Starting scene ID
        end_id: Target scene ID
    
    Returns:
        List of scene IDs representing the path from start to end
    """
    if start_id == end_id:
        return [start_id]
    
    # Build adjacency graph from scenes
    graph = {}
    for scene_id, scene_data in _scenes.items():
        hotspots = scene_data.get('hotspots', [])
        neighbors = [h.get('target') for h in hotspots if h.get('target')]
        graph[scene_id] = neighbors
    
    # BFS to find shortest path
    from collections import deque
    
    queue = deque([(start_id, [start_id])])
    visited = {start_id}
    
    while queue:
        current_id, path = queue.popleft()
        
        # Check neighbors
        for neighbor_id in graph.get(current_id, []):
            if neighbor_id == end_id:
                return path + [neighbor_id]
            
            if neighbor_id not in visited:
                visited.add(neighbor_id)
                queue.append((neighbor_id, path + [neighbor_id]))
    
    # No path found
    print(f"⚠ No path found from {start_id} to {end_id}")
    return []


def find_graph_file():
    """Find graph.json file with correct priority"""
    candidate_graph_paths = [
        # 0. DATA_DIR (ưu tiên nếu khai báo ENV)
        os.path.join(CMS_DATA_DIR, 'graph.json'),
        # 1. Root project cms/data (ưu tiên cao nhất)
        os.path.normpath(os.path.join(BASE_DIR, '..', 'cms', 'data', 'graph.json')),
        # 2. Docker mount path
        "/app/cms/data/graph.json",
        # 3. Backend cms/data (fallback)
        os.path.join(BASE_DIR, 'cms', 'data', 'graph.json'),
    ]
    
    for path in candidate_graph_paths:
        try:
            if path and os.path.exists(path) and os.path.getsize(path) > 0:
                print(f"✓ Found graph.json at: {path}")
                return path
        except Exception as e:
            print(f"⚠ Error checking {path}: {e}")
            continue
    
    print(f"⚠ No graph.json found")
    return None

# Lưu graph_path để dùng trong các hàm khác
graph_path = find_graph_file()
print(f"DEBUG: Graph path: {graph_path}")


def load_graph():
    """Load graph data from graph.json"""
    global graph_data
    
    if not graph_path or not os.path.exists(graph_path):
        print("⚠ No graph.json found, minimap will not work")
        graph_data = {"nodes": [], "edges": []}
        return
    
    try:
        with open(graph_path, 'r', encoding='utf-8') as f:
            graph_data = json.load(f)
        print(f"✓ Loaded graph with {len(graph_data.get('nodes', []))} nodes")
    except Exception as e:
        print(f"✗ Error loading graph: {e}")
        graph_data = {"nodes": [], "edges": []}


graph_data = {}

load_graph()
def load_scenes_from_file(file_path):
    """Load scenes from a specific file path"""
    global _scenes, loaded_from
    try:
        _scenes = {}
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if isinstance(data, list):
                for s in data:
                    if isinstance(s, dict) and "id" in s:
                        _scenes[s['id']] = s
            elif isinstance(data, dict):
                for k, v in data.items():
                    if isinstance(v, dict) and "id" in v:
                        _scenes[v['id']] = v
                    else:
                        _scenes[k] = v
        loaded_from = file_path
        print(f"DEBUG: Loaded {len(_scenes)} scenes from {file_path}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to load scenes from {file_path}: {e}")
        import traceback
        traceback.print_exc()
        return False

scenes_path = find_scenes_file()
print("DEBUG: Candidate scenes paths:", CANDIDATE_SCENES)
print("DEBUG: Selected scenes path:", scenes_path)
if scenes_path:
    load_scenes_from_file(scenes_path)
    print(f"DEBUG: loaded_from variable set to: {loaded_from}")
    print(f"DEBUG: SCENES_FILE_WRITE is: {SCENES_FILE_WRITE}")
else:
    print("DEBUG: No valid scenes.json found in candidates; starting with empty scenes.")

# Load tours on startup
load_tours()

# Helper function để normalize URL (dùng chung cho nhiều nơi)
def normalize_url(u, keep_query=False):
    """
    Normalize URL, loại bỏ query string (timestamp) để lưu vào database.
    Query string sẽ được thêm lại khi hiển thị để bypass cache.
    
    Args:
        u: URL cần normalize
        keep_query: Nếu True, giữ query string (mặc định False)
    """
    if not isinstance(u, str):
        return u
    # if already absolute or external, keep
    if u.startswith('http://') or u.startswith('https://'):
        return u
    
    # Tách URL và query string để xử lý riêng
    url_parts = u.split('?', 1)
    base_url = url_parts[0]
    query_string = '?' + url_parts[1] if len(url_parts) > 1 and keep_query else ''
    
    # QUAN TRỌNG: Giữ nguyên /uploads/ và /assets/ (không chuyển đổi)
    # Fix duplicate /assets/assets/... to /assets/...
    if base_url.startswith('/assets/assets/'):
        normalized = '/assets/' + base_url.replace('/assets/assets/', '')
    # if already starts with /assets/, keep as is
    elif base_url.startswith('/assets/'):
        normalized = base_url
    # if already starts with /uploads/, keep as is (QUAN TRỌNG)
    elif base_url.startswith('/uploads/'):
        normalized = base_url
    # handle ./assets/... or assets/...
    elif base_url.startswith('./assets/') or base_url.startswith('assets/'):
        # Remove leading ./ or assets/ and ensure single /assets/
        clean = base_url.replace('./assets/', '').replace('assets/', '')
        normalized = '/assets/' + clean
    # handle ./uploads/... or uploads/...
    elif base_url.startswith('./uploads/') or base_url.startswith('uploads/'):
        # Remove leading ./ or uploads/ and ensure single /uploads/
        clean = base_url.replace('./uploads/', '').replace('uploads/', '')
        normalized = '/uploads/' + clean
    # if starts with /, keep as is
    elif base_url.startswith('/'):
        normalized = base_url
    else:
        normalized = base_url
    
    # Trả về URL đã normalize (không có query string để lưu vào database)
    return normalized + query_string

def save_scenes():
    """
    Save scenes to backend/scenes.json and sync to all candidate locations.
    Uses atomic write with r+ mode to preserve inode.
    """
    global loaded_from
    try:
        target_file = SCENES_FILE_WRITE
        
        print(f"[Scenes] Saving {len(_scenes)} scenes to {target_file}")
        
        # Prepare data - preserve all fields
        scenes_to_write = []
        for scene in list(_scenes.values()):
            scene_copy = dict(scene)
            # Only normalize URL
            if 'url' in scene_copy:
                scene_copy['url'] = normalize_url(scene_copy['url'])
            scenes_to_write.append(scene_copy)
        
        # Atomic write with r+ mode to preserve inode
        mode = 'r+' if os.path.exists(target_file) else 'w'
        
        with open(target_file, mode, encoding='utf-8') as f:
            if mode == 'r+':
                f.seek(0)
                f.truncate()
            
            json.dump(scenes_to_write, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        
        # Verify write
        if os.path.exists(target_file):
            file_size = os.path.getsize(target_file)
            print(f"✓ Saved {len(scenes_to_write)} scenes ({file_size} bytes)")
            
            # Reload to verify
            original_loaded_from = loaded_from
            max_retries = 3
            retry_delay = 0.1
            
            for attempt in range(max_retries):
                if load_scenes_from_file(target_file):
                    print(f"✓ Verified reload ({len(_scenes)} scenes)")
                    break
                elif attempt < max_retries - 1:
                    time.sleep(retry_delay)
            
            # Restore loaded_from
            if original_loaded_from and original_loaded_from != target_file:
                loaded_from = original_loaded_from
        else:
            print(f"✗ File {target_file} was not created!")
        
        # Sync to all candidate locations
        target_file_abs = os.path.abspath(target_file)
        sync_files = []
        
        for candidate_path in CANDIDATE_SCENES:
            if not candidate_path:
                continue
            try:
                abs_path = os.path.abspath(candidate_path)
                if abs_path != target_file_abs:
                    sync_files.append(abs_path)
            except Exception:
                continue
        
        # Add SCENES_FILE_WRITE if not in list
        scenes_file_write_abs = os.path.abspath(SCENES_FILE_WRITE)
        if scenes_file_write_abs not in sync_files and scenes_file_write_abs != target_file_abs:
            sync_files.append(scenes_file_write_abs)

        # CRITICAL: Also sync to the file currently used by the server (scenes_path)
        try:
            if scenes_path:
                scenes_path_abs = os.path.abspath(scenes_path)
                if scenes_path_abs not in sync_files and scenes_path_abs != target_file_abs:
                    sync_files.append(scenes_path_abs)
        except Exception:
            pass

        # Also include backend/scenes.json for compatibility
        backend_scenes = os.path.abspath(os.path.join(BASE_DIR, 'scenes.json'))
        if backend_scenes not in sync_files and backend_scenes != target_file_abs:
            sync_files.append(backend_scenes)
        
        # Sync to all files
        for sync_file in sync_files:
            try:
                os.makedirs(os.path.dirname(sync_file), exist_ok=True)
                with open(sync_file, 'w', encoding='utf-8') as f:
                    json.dump(scenes_to_write, f, ensure_ascii=False, indent=2)
                print(f"✓ Synced to {sync_file}")
            except Exception as e:
                print(f"⚠ Failed to sync to {sync_file}: {e}")
    
        # Optional: commit to GitHub
        _gh_upsert_json(GH_PATH_SCENES, scenes_to_write, "CMS: update scenes.json")

    except Exception as e:
        print(f"✗ Failed to save scenes: {e}")
        import traceback
        traceback.print_exc()

# --- Serve frontend ---
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_frontend(path):
    if app.static_folder:
        candidate = os.path.join(app.static_folder, path)
        if path and os.path.exists(candidate) and os.path.isfile(candidate):
            return send_from_directory(app.static_folder, path)
        index_path = os.path.join(app.static_folder, 'index.html')
        if os.path.exists(index_path):
            return send_from_directory(app.static_folder, 'index.html')
    return jsonify({"status": "ok", "msg": "Backend running (no frontend built)"}), 200

def save_tours():
    """Save tours to JSON file with correct priority"""
    global db_tours, tours_file_path
    try:
        # ✅ Sử dụng tours_file_path đã được lưu từ load_tours() để đảm bảo dùng cùng file
        if not tours_file_path:
            # Nếu chưa có path, tìm file hoặc tạo mới
            tours_path = find_tours_file()
            if not tours_path:
                tours_path = os.path.normpath(os.path.join(BASE_DIR, '..', 'cms', 'data', 'tours.json'))
                os.makedirs(os.path.dirname(tours_path), exist_ok=True)
            tours_file_path = tours_path
        else:
            tours_path = tours_file_path
        
        # Đảm bảo thư mục tồn tại
        os.makedirs(os.path.dirname(tours_path), exist_ok=True)
        
        # Atomic write với r+ mode để preserve inode
        mode = 'r+' if os.path.exists(tours_path) else 'w'
        
        with open(tours_path, mode, encoding='utf-8') as f:
            if mode == 'r+':
                f.seek(0)
                f.truncate()
            
            json.dump(db_tours, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        
        print(f"✓ Saved {len(db_tours)} tours to {tours_path}")
        
        # ✅ Reload tours từ file sau khi save để đảm bảo đồng bộ
        # Nhưng không gọi load_tours() vì nó sẽ tìm lại file, thay vào đó reload trực tiếp
        try:
            with open(tours_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if isinstance(data, list):
                    db_tours = data
                    print(f"✓ Reloaded {len(db_tours)} tours from {tours_path}")
        except Exception as e:
            print(f"⚠ Warning: Could not reload tours after save: {e}")
        
        # Optional: commit to GitHub
        _gh_upsert_json(GH_PATH_TOURS, db_tours, "CMS: update tours.json")
        return True
        
    except Exception as e:
        print(f"✗ Error saving tours: {e}")
        import traceback
        traceback.print_exc()
        return False

@app.route('/api/tours', methods=['GET'])
# @cached_response(ttl_seconds=60)  # Tạm tắt để test
def get_tours():
    """Get all tours"""
    print(f"[API] /api/tours called, returning {len(db_tours)} tours")
    return jsonify(db_tours), 200

@app.route('/api/tours', methods=['POST'])
def create_tour():
    """Create a new tour"""
    clear_cache("/api/tours")  # Clear cache khi tạo tour mới
    global db_tours
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({"error": "Tour name is required"}), 400
        
        # Generate ID if not provided
        tour_id = data.get('id') or f"tour_{int(time.time())}"
        
        # Check if ID already exists
        if any(t.get('id') == tour_id for t in db_tours):
            return jsonify({"error": f"Tour with ID '{tour_id}' already exists"}), 400
        
        new_tour = {
            "id": tour_id,
            "name": data.get('name', ''),
            "keywords": data.get('keywords', []),
            "scenes": data.get('scenes', [])
        }
        
        db_tours.append(new_tour)
        
        if save_tours():
            print(f"[Tours] Created tour: {tour_id}")
            return jsonify(new_tour), 201
        else:
            return jsonify({"error": "Failed to save tour"}), 500
            
    except Exception as e:
        print(f"[Tours] Error creating tour: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/tours/<tour_id>', methods=['PUT'])
def update_tour(tour_id):
    """Update an existing tour"""
    clear_cache("/api/tours")  # Clear cache khi update tour
    global db_tours
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Find tour
        tour_index = None
        for i, tour in enumerate(db_tours):
            if tour.get('id') == tour_id:
                tour_index = i
                break
        
        if tour_index is None:
            return jsonify({"error": f"Tour '{tour_id}' not found"}), 404
        
        # Update tour
        updated_tour = {
            "id": tour_id,  # Keep original ID
            "name": data.get('name', db_tours[tour_index].get('name', '')),
            "keywords": data.get('keywords', db_tours[tour_index].get('keywords', [])),
            "scenes": data.get('scenes', db_tours[tour_index].get('scenes', []))
        }
        
        db_tours[tour_index] = updated_tour
        
        if save_tours():
            print(f"[Tours] Updated tour: {tour_id}")
            return jsonify(updated_tour), 200
        else:
            return jsonify({"error": "Failed to save tour"}), 500
            
    except Exception as e:
        print(f"[Tours] Error updating tour: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/tours/<tour_id>', methods=['DELETE'])
def delete_tour(tour_id):
    """Delete a tour"""
    clear_cache("/api/tours")  # Clear cache khi xóa tour
    global db_tours
    try:
        # Find and remove tour
        initial_count = len(db_tours)
        db_tours = [t for t in db_tours if t.get('id') != tour_id]
        
        if len(db_tours) == initial_count:
            return jsonify({"error": f"Tour '{tour_id}' not found"}), 404
        
        if save_tours():
            print(f"[Tours] Deleted tour: {tour_id}")
            return jsonify({"message": f"Tour '{tour_id}' deleted"}), 200
        else:
            return jsonify({"error": "Failed to save tours"}), 500
            
    except Exception as e:
        print(f"[Tours] Error deleting tour: {e}")
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "msg": "Flask backend running"})

# --- Graph ---
def generate_graph_from_scenes(scenes_dict):
    """
    Generate graph data from scenes.
    Returns dict with nodes and edges.
    """
    nodes = []
    edges = []
    
    for scene_id, scene in scenes_dict.items():
        # Add node
        nodes.append({
            "id": scene_id,
            "label": scene.get('name', {}).get('vi', scene_id),
            "floor": scene.get('floor', 0)
        })
        
        # Add edges from hotspots
        hotspots = scene.get('hotspots', [])
        for hs in hotspots:
            target = hs.get('target')
            if target:
                edges.append({
                    "from": scene_id,
                    "to": target,
                    "label": hs.get('label', '')
                })
    
    return {
        "nodes": nodes,
        "edges": edges
    }

def find_graph_path():
    """Find the correct path for graph.json - same logic as find_graph_file()"""
    # Use same priority as find_graph_file()
    candidate_graph_paths = [
        # 0. DATA_DIR (ưu tiên nếu khai báo ENV)
        os.path.join(CMS_DATA_DIR, 'graph.json'),
        # 1. Root project cms/data (ưu tiên cao nhất)
        os.path.normpath(os.path.join(BASE_DIR, '..', 'cms', 'data', 'graph.json')),
        # 2. Docker mount path
        "/app/cms/data/graph.json",
        # 3. Backend cms/data (fallback)
        os.path.join(BASE_DIR, 'cms', 'data', 'graph.json'),
    ]
    
    # First, try to find existing file
    for path in candidate_graph_paths:
        try:
            abs_path = os.path.abspath(path) if not os.path.isabs(path) else path
            if os.path.exists(abs_path) and os.path.getsize(abs_path) > 0:
                print(f"✓ Found graph.json at: {abs_path}")
                return abs_path
        except Exception as e:
            print(f"⚠ Error checking {path}: {e}")
            continue
    
    # If not found, use first path that has existing directory or create it
    for path in candidate_graph_paths:
        try:
            abs_path = os.path.abspath(path) if not os.path.isabs(path) else path
            dir_path = os.path.dirname(abs_path)
            if os.path.exists(dir_path) or path.startswith('/app'):
                print(f"✓ Will save graph.json to: {abs_path}")
                return abs_path
        except Exception as e:
            print(f"⚠ Error checking {path}: {e}")
            continue
    
    # Default to DATA_DIR
    default_path = os.path.join(CMS_DATA_DIR, 'graph.json')
    print(f"✓ Using default path for graph.json: {default_path}")
    return default_path

@app.route('/api/graph', methods=['GET'])
# @cached_response(ttl_seconds=30)  # Tạm tắt để test
def get_graph():
    """Get graph data for minimap - luôn reload từ file để đảm bảo dữ liệu mới nhất"""
    global graph_data, graph_path
    
    # Luôn reload từ file để đảm bảo có dữ liệu mới nhất (đặc biệt sau khi save)
    if graph_path and os.path.exists(graph_path):
        try:
            with open(graph_path, 'r', encoding='utf-8') as f:
                graph_data = json.load(f)
            # Chỉ log nếu có nhiều thay đổi (tránh spam log)
            # print(f"[API] GET /api/graph - Loaded {len(graph_data.get('nodes', []))} nodes from {graph_path}")
        except Exception as e:
            print(f"✗ Error loading graph from {graph_path}: {e}")
            # Nếu không load được, dùng memory hoặc generate từ scenes
            if not graph_data or len(graph_data.get('nodes', [])) < 10:
                if _scenes:
                    print("⚠ Generating graph from scenes as fallback")
                    graph_data = generate_graph_from_scenes(_scenes)
                else:
                    graph_data = {"nodes": [], "edges": []}
    elif not graph_data or len(graph_data.get('nodes', [])) < 10:
        # Nếu không có file, generate từ scenes
        if _scenes:
            print("⚠ No graph.json, generating from scenes")
            graph_data = generate_graph_from_scenes(_scenes)
        else:
            graph_data = {"nodes": [], "edges": []}
    
    # --- Always sync edges from scenes/hotspots (source of truth) ---
    # graph.json is used primarily for node positions; edges should reflect current hotspots.
    try:
        if _scenes and isinstance(graph_data, dict):
            generated = generate_graph_from_scenes(_scenes)

            old_nodes = graph_data.get('nodes', []) if isinstance(graph_data.get('nodes', []), list) else []
            old_map = {str(n.get('id')): n for n in old_nodes if isinstance(n, dict) and n.get('id') is not None}

            merged_nodes = []
            for new_node in generated.get('nodes', []):
                node_id = str(new_node.get('id'))
                old_node = old_map.get(node_id)
                if old_node:
                    merged_nodes.append({
                        **old_node,           # keep positions (x/y/positions)
                        **new_node,           # update id/label/floor from scenes
                        'x': old_node.get('x') if old_node.get('x') is not None else new_node.get('x'),
                        'y': old_node.get('y') if old_node.get('y') is not None else new_node.get('y'),
                        'positions': old_node.get('positions') or new_node.get('positions')
                    })
                else:
                    merged_nodes.append(new_node)

            # Optionally keep old nodes that are not present in scenes (avoid sudden disappearance)
            new_ids = {str(n.get('id')) for n in merged_nodes if isinstance(n, dict) and n.get('id') is not None}
            for old_node in old_nodes:
                oid = str(old_node.get('id'))
                if oid and oid not in new_ids:
                    merged_nodes.append(old_node)

            graph_data = {
                'nodes': merged_nodes,
                'edges': generated.get('edges', [])
            }
    except Exception as e:
        print(f"⚠ Warning: could not sync graph edges from scenes: {e}")

    return jsonify(graph_data), 200

@app.route("/api/graph/cleanup", methods=["POST"])
def cleanup_graph():
    """Xóa các node rác không có scene tương ứng"""
    global graph_data, graph_path
    
    try:
        # Lấy danh sách scene IDs hiện có
        scene_ids = set(_scenes.keys())
        
        # Lấy graph hiện tại
        if not graph_data:
            if graph_path and os.path.exists(graph_path):
                with open(graph_path, 'r', encoding='utf-8') as f:
                    graph_data = json.load(f)
            else:
                return jsonify({"error": "No graph data found"}), 404
        
        nodes = graph_data.get('nodes', [])
        edges = graph_data.get('edges', [])
        
        # Tìm các node không có scene tương ứng
        orphaned_nodes = []
        valid_node_ids = set()
        
        for node in nodes:
            node_id = node.get('id')
            if node_id not in scene_ids:
                orphaned_nodes.append(node_id)
            else:
                valid_node_ids.add(node_id)
        
        # Xóa các node rác
        cleaned_nodes = [n for n in nodes if n.get('id') in scene_ids]
        
        # Xóa các edge liên quan đến node rác
        cleaned_edges = []
        for edge in edges:
            from_id = edge.get('from')
            to_id = edge.get('to')
            if from_id in valid_node_ids and to_id in valid_node_ids:
                cleaned_edges.append(edge)
        
        # Cập nhật graph
        graph_data = {
            "nodes": cleaned_nodes,
            "edges": cleaned_edges
        }
        
        # Lưu file
        save_path = find_graph_path()
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        
        temp_path = save_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(graph_data, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        
        if os.path.exists(save_path):
            os.replace(temp_path, save_path)
        else:
            os.rename(temp_path, save_path)
        
        graph_path = save_path
        
        print(f"✓ Cleaned graph: Removed {len(orphaned_nodes)} orphaned nodes")
        print(f"  Orphaned node IDs: {orphaned_nodes}")
        print(f"  Remaining: {len(cleaned_nodes)} nodes, {len(cleaned_edges)} edges")
        
        return jsonify({
            "status": "ok",
            "message": "Graph cleaned successfully",
            "removed_nodes": orphaned_nodes,
            "removed_count": len(orphaned_nodes),
            "remaining_nodes": len(cleaned_nodes),
            "remaining_edges": len(cleaned_edges)
        }), 200
        
    except Exception as e:
        print(f"✗ Error cleaning graph: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/graph/regenerate", methods=["POST"])
def regenerate_graph():
    """Regenerate graph from scenes - MERGE với dữ liệu hiện có, KHÔNG ghi đè vị trí x, y"""
    global graph_data, graph_path
    
    try:
        # Load graph hiện có để giữ lại vị trí x, y
        existing_graph = {"nodes": [], "edges": []}
        save_path = find_graph_path()
        if save_path and os.path.exists(save_path):
            try:
                with open(save_path, 'r', encoding='utf-8') as f:
                    existing_graph = json.load(f)
                print(f"✓ Loaded existing graph: {len(existing_graph.get('nodes', []))} nodes with positions")
            except Exception as e:
                print(f"⚠ Could not load existing graph: {e}")
        
        # Tạo map để tìm node cũ nhanh
        old_nodes_map = {}
        if existing_graph.get('nodes'):
            for node in existing_graph['nodes']:
                old_nodes_map[str(node.get('id'))] = node
        
        # Generate graph mới từ scenes
        new_graph = generate_graph_from_scenes(_scenes)
        
        # MERGE: Giữ lại vị trí x, y, positions từ graph cũ
        merged_nodes = []
        for new_node in new_graph.get('nodes', []):
            node_id = str(new_node.get('id'))
            old_node = old_nodes_map.get(node_id)
            
            if old_node:
                # MERGE: Giữ lại tất cả thông tin từ node cũ, chỉ cập nhật thông tin mới
                merged_node = {
                    **old_node,  # Giữ nguyên node cũ (bao gồm x, y, positions)
                    **new_node,  # Cập nhật thông tin mới (id, label, floor)
                    # Đặc biệt: Ưu tiên giữ lại x, y, positions từ node cũ
                    'x': new_node.get('x') if new_node.get('x') is not None else old_node.get('x'),
                    'y': new_node.get('y') if new_node.get('y') is not None else old_node.get('y'),
                    'positions': new_node.get('positions') if new_node.get('positions') else old_node.get('positions')
                }
                merged_nodes.append(merged_node)
            else:
                # Node mới, không có trong graph cũ
                merged_nodes.append(new_node)
        
        # Thêm các nodes cũ không có trong scenes mới (giữ lại nodes đã bị xóa khỏi scenes)
        for old_node in existing_graph.get('nodes', []):
            node_id = str(old_node.get('id'))
            if not any(str(n.get('id')) == node_id for n in merged_nodes):
                merged_nodes.append(old_node)
                print(f"⚠ Preserved old node not in scenes: {node_id}")
        
        # Tạo graph đã merge
        merged_graph = {
            "nodes": merged_nodes,
            "edges": new_graph.get('edges', [])  # Edges luôn lấy mới từ hotspots
        }
        
        # Update memory
        graph_data = merged_graph
        
        # Save to file
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        
        temp_path = save_path + '.tmp'
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(merged_graph, f, ensure_ascii=False, indent=2)
            f.flush()
            os.fsync(f.fileno())
        
        if os.path.exists(save_path):
            os.replace(temp_path, save_path)
        else:
            os.rename(temp_path, save_path)
        
        graph_path = save_path
        
        nodes_with_pos = sum(1 for n in merged_nodes if n.get('x') is not None or n.get('y') is not None or n.get('positions'))
        print(f"✓ Regenerated graph: {len(merged_nodes)} nodes ({nodes_with_pos} with positions), {len(merged_graph.get('edges', []))} edges")
        
        return jsonify({
            "status": "ok",
            "message": "Graph regenerated from scenes (positions preserved)",
            "nodes": len(merged_nodes),
            "edges": len(merged_graph.get('edges', [])),
            "nodes_with_positions": nodes_with_pos
        }), 200
        
    except Exception as e:
        print(f"✗ Error regenerating graph: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@app.route("/api/graph", methods=["POST", "PUT"])
def save_graph():
    """Save graph data - MERGE với dữ liệu hiện có, KHÔNG ghi đè hoàn toàn"""
    clear_cache("/api/graph")  # Clear cache khi save graph
    global graph_data, graph_path
    
    new_graph = request.get_json()
    if not new_graph or "nodes" not in new_graph or "edges" not in new_graph:
        return jsonify({"error": "Invalid graph data. Must have 'nodes' and 'edges'"}), 400
    
    # Find the correct graph file path
    save_path = find_graph_path()
    
    # Load graph hiện có để merge (nếu có)
    existing_graph = {"nodes": [], "edges": []}
    if save_path and os.path.exists(save_path):
        try:
            with open(save_path, 'r', encoding='utf-8') as f:
                existing_graph = json.load(f)
        except Exception:
            pass  # Nếu không load được, dùng graph mới
    
    # MERGE nodes: Giữ lại thông tin từ nodes cũ nếu node mới không có
    old_nodes_map = {str(n.get('id')): n for n in existing_graph.get('nodes', [])}
    merged_nodes = []
    
    for new_node in new_graph.get('nodes', []):
        node_id = str(new_node.get('id'))
        old_node = old_nodes_map.get(node_id)
        
        if old_node:
            # MERGE: Giữ lại thông tin cũ, cập nhật thông tin mới
            merged_node = {
                **old_node,
                **new_node,
                # Ưu tiên giữ lại x, y, positions nếu node mới không có
                'x': new_node.get('x') if new_node.get('x') is not None else old_node.get('x'),
                'y': new_node.get('y') if new_node.get('y') is not None else old_node.get('y'),
                'positions': new_node.get('positions') if new_node.get('positions') else old_node.get('positions')
            }
            merged_nodes.append(merged_node)
        else:
            # Node mới
            merged_nodes.append(new_node)
    
    # Giữ lại các nodes cũ không có trong graph mới (nếu cần)
    # (Tùy chọn: có thể bỏ qua nếu muốn xóa nodes không có trong graph mới)
    
    # Graph cuối cùng: nodes đã merge + edges mới
    final_graph = {
        "nodes": merged_nodes,
        "edges": new_graph.get('edges', [])
    }
    
    # Ensure directory exists
    try:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
    except Exception as e:
        print(f"⚠ Warning: Could not create directory for graph: {e}")
    
    try:
        # MERGE với graph hiện có trước khi save
        # Load graph hiện có để merge (nếu có)
        existing_graph = {"nodes": [], "edges": []}
        if save_path and os.path.exists(save_path):
            try:
                with open(save_path, 'r', encoding='utf-8') as f:
                    existing_graph = json.load(f)
            except Exception:
                pass  # Nếu không load được, dùng graph mới
        
        # MERGE nodes: Giữ lại thông tin từ nodes cũ nếu node mới không có
        old_nodes_map = {str(n.get('id')): n for n in existing_graph.get('nodes', [])}
        merged_nodes = []
        
        for new_node in new_graph.get('nodes', []):
            node_id = str(new_node.get('id'))
            old_node = old_nodes_map.get(node_id)
            
            if old_node:
                # MERGE: Giữ lại thông tin cũ, cập nhật thông tin mới
                merged_node = {
                    **old_node,
                    **new_node,
                    # Ưu tiên giữ lại x, y, positions nếu node mới không có
                    'x': new_node.get('x') if new_node.get('x') is not None else old_node.get('x'),
                    'y': new_node.get('y') if new_node.get('y') is not None else old_node.get('y'),
                    'positions': new_node.get('positions') if new_node.get('positions') else old_node.get('positions')
                }
                merged_nodes.append(merged_node)
            else:
                # Node mới
                merged_nodes.append(new_node)
        
        # Graph cuối cùng: nodes đã merge + edges mới
        final_graph = {
            "nodes": merged_nodes,
            "edges": new_graph.get('edges', [])
        }
        
        # Atomic write: write to temp file first, then rename
        import tempfile
        temp_path = save_path + '.tmp'
        
        with open(temp_path, 'w', encoding='utf-8') as f:
            json.dump(final_graph, f, ensure_ascii=False, indent=2)
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
            print(f"✓ Reloaded graph_data from file after save")
        except Exception as e:
            # Nếu không reload được, dùng final_graph
            graph_data = final_graph
            print(f"⚠ Could not reload from file, using final_graph: {e}")
        
        graph_path = save_path
        
        nodes_with_pos = sum(1 for n in merged_nodes if n.get('x') is not None or n.get('y') is not None or n.get('positions'))
        print(f"✓ Successfully saved graph.json to {save_path}")
        print(f"✓ Saved {len(merged_nodes)} nodes ({nodes_with_pos} with positions) and {len(final_graph.get('edges', []))} edges")

        # Optional: commit to GitHub
        _gh_upsert_json(GH_PATH_GRAPH, final_graph, "CMS: update graph.json")
        
        return jsonify({
            "status": "ok", 
            "path": save_path,
            "nodes": len(new_graph.get('nodes', [])),
            "edges": len(new_graph.get('edges', []))
        }), 200
        
    except Exception as e:
        print(f"✗ ERROR: Failed to save graph.json to {save_path}: {e}")
        import traceback
        traceback.print_exc()
        # Clean up temp file if exists
        if os.path.exists(save_path + '.tmp'):
            try:
                os.remove(save_path + '.tmp')
            except:
                pass
        return jsonify({"error": f"Failed to save graph file: {str(e)}"}), 500

# --- Scenes CRUD ---
@app.route("/api/scenes", methods=["GET"])
# @cached_response(ttl_seconds=30)  # Tạm tắt để test
def list_scenes():
    # QUAN TRỌNG: Reload từ file để đảm bảo có dữ liệu mới nhất (đặc biệt sau khi save/update/delete)
    global scenes_path
    if scenes_path and os.path.exists(scenes_path):
        try:
            load_scenes_from_file(scenes_path)
        except Exception as e:
            print(f"⚠ Error reloading scenes from {scenes_path}: {e}")
    
    # Helper normalize (giữ nguyên logic của bạn)
    def normalize_url(u):
        if not isinstance(u, str): return u
        if u.startswith(('http://', 'https://')): return u
        if '/assets/assets/' in u: u = u.replace('/assets/assets/', '/assets/')
        if u.startswith('./assets/'): u = u.replace('./assets/', '/assets/')
        if not u.startswith('/'): u = '/' + u
        return u
    
    scenes_list = []
    # Chỉ trả về scene hợp lệ
    for s in list(_scenes.values()):
        ss = dict(s)
        if 'url' in ss:
            ss['url'] = normalize_url(ss['url'])
        scenes_list.append(ss)
    
    # Log để kiểm tra xem có dữ liệu không
    print(f"[API] Trả về {len(scenes_list)} scenes cho Frontend")
    return jsonify(scenes_list)
    
    scenes_list = []
    for s in list(_scenes.values()):
        ss = dict(s)
        if 'url' in ss:
            ss['url'] = normalize_url(ss['url'])
        scenes_list.append(ss)
    
    return jsonify(scenes_list)

@app.route("/api/scenes/<scene_id>", methods=["GET"])
def get_scene(scene_id):
    # --- FIX: Đọc lại file để lấy dữ liệu mới nhất bạn vừa sửa tay ---
    if scenes_path and os.path.exists(scenes_path):
        load_scenes_from_file(scenes_path)
    # ----------------------------------------------------------------
    
    scene = _scenes.get(scene_id)
    if not scene:
        abort(404)
    
    scene_copy = dict(scene)
    if 'url' in scene_copy:
        scene_copy['url'] = normalize_url(scene_copy['url'])
    return jsonify(scene_copy)

@app.route("/api/scenes", methods=["POST"])
def create_scene():
    clear_cache("/api/scenes")  # Clear cache khi tạo scene mới
    # Bảo đảm trả về JSON lỗi rõ ràng
    data = None
    try:
        data = request.get_json(silent=True)
    except Exception:
        data = None
    if not data:
        return jsonify({"error": "No JSON body provided"}), 400
    if "id" not in data or not str(data.get("id")).strip():
        return jsonify({"error": "scene id required"}), 400
    
    scene_id = data["id"]
    if scene_id in _scenes:
        return jsonify({"error": f"Scene '{scene_id}' already exists"}), 400
    
    try:
        print(f"[Create Scene] Creating scene {scene_id}")
        _scenes[scene_id] = data
        save_scenes()
        
        # QUAN TRỌNG: Reload lại từ file sau khi save để đảm bảo đồng bộ hoàn toàn
        if scenes_path and os.path.exists(scenes_path):
            load_scenes_from_file(scenes_path)
        
        print(f"[Create Scene] Successfully created scene {scene_id}")
        # Regenerate graph so graph.json includes the new scene
        try:
            regenerate_graph()
        except Exception as e:
            print(f"⚠ Could not regenerate graph after create_scene: {e}")
        return jsonify(data), 201
    except Exception as e:
        print(f"[Create Scene] Error: {e}")
        import traceback
        traceback.print_exc()
        abort(500, str(e))

@app.route("/api/scenes/<scene_id>", methods=["PUT"])
def update_scene(scene_id):
    clear_cache("/api/scenes")  # Clear cache khi update scene
    # --- FIX: Đọc lại file TRƯỚC KHI UPDATE ---
    if scenes_path and os.path.exists(scenes_path):
        print(f"[Update Scene] Reloading from disk to catch manual edits...")
        load_scenes_from_file(scenes_path)
    # -------------------------------------------

    data = request.get_json()
    if not data:
        abort(400, "No data provided")
    # ... (phần còn lại giữ nguyên)
    
    try:
        # Log để debug
        print(f"[Update Scene] Updating scene {scene_id}")
        print(f"[Update Scene] Old URL: {_scenes[scene_id].get('url', 'N/A')}")
        print(f"[Update Scene] New URL from payload: {data.get('url', 'N/A')}")
        print(f"[Update Scene] Payload keys: {list(data.keys())}")
        print(f"[Update Scene] Current scene keys: {list(_scenes[scene_id].keys())}")
        
        # QUAN TRỌNG: Giữ nguyên các trường không được gửi từ frontend
        # Lập một danh sách các trường nên giữ nguyên nếu không có trong payload
        required_fields = ['id', 'name', 'type', 'url', 'floor', 'hotspots', 'initialView']
        
        # Bảo toàn các trường cũ nếu không có trong payload
        for field in ['floors', 'description', 'keywords', 'author', 'created_at', 'updated_at']:
            if field in _scenes[scene_id] and field not in data:
                data[field] = _scenes[scene_id][field]
        
        # Update scene với data mới (merge an toàn)
        old_url = _scenes[scene_id].get('url', 'N/A')
        _scenes[scene_id].update(data)
        
        # Đảm bảo URL được normalize (loại bỏ query string, GIỮ NGUYÊN timestamp trong tên file)
        if 'url' in _scenes[scene_id]:
            original_url = _scenes[scene_id]['url']
            # Normalize URL: loại bỏ query string (nếu có), GIỮ NGUYÊN timestamp trong tên file
            # Ví dụ: /assets/a1_1_1763396715738.jpg?v=123 -> /assets/a1_1_1763396715738.jpg
            normalized_url = normalize_url(_scenes[scene_id]['url'], keep_query=False)
            _scenes[scene_id]['url'] = normalized_url
            if original_url != normalized_url:
                print(f"[Update Scene] URL normalized: {original_url} -> {normalized_url}")
            
            # So sánh URL để xác định có thay đổi không
            old_url_normalized = normalize_url(old_url, keep_query=False)
            
            if old_url_normalized != normalized_url:
                print(f"[Update Scene] URL CHANGED: {old_url_normalized} -> {normalized_url}")
            else:
                print(f"[Update Scene] URL UNCHANGED: {normalized_url} (file has been replaced, frontend will force reload)")
        
        print(f"[Update Scene] Final URL after update: {_scenes[scene_id].get('url', 'N/A')}")
        print(f"[Update Scene] Scene data keys after merge: {list(_scenes[scene_id].keys())}")
        
        # Save scenes (sẽ reload scenes từ file để đảm bảo đồng bộ)
        save_scenes()
        
        # QUAN TRỌNG: Reload lại từ file sau khi save để đảm bảo đồng bộ hoàn toàn
        if scenes_path and os.path.exists(scenes_path):
            load_scenes_from_file(scenes_path)
        
        # QUAN TRỌNG: Đảm bảo trả về dữ liệu mới nhất từ _scenes (đã được reload từ file)
        # Tạo một copy để tránh thay đổi dữ liệu gốc
        scene_response = dict(_scenes[scene_id])
        print(f"[Update Scene] Returning scene data with URL: {scene_response.get('url', 'N/A')}")
        print(f"[Update Scene] Final response keys: {list(scene_response.keys())}")
        # Regenerate graph so graph.json reflects the updated scenes
        try:
            regenerate_graph()
        except Exception as e:
            print(f"⚠ Could not regenerate graph after update_scene: {e}")
        
        return jsonify(scene_response)
    except Exception as e:
        print(f"[Update Scene] Error: {e}")
        import traceback
        traceback.print_exc()
        abort(500, str(e))

@app.route("/api/scenes/<scene_id>", methods=["DELETE"])
def delete_scene(scene_id):
    clear_cache("/api/scenes")  # Clear cache khi xóa scene
    # Debug: Log tất cả scene IDs để kiểm tra
    print(f"[Delete Scene] Attempting to delete scene: {scene_id}")
    print(f"[Delete Scene] Total scenes in memory: {len(_scenes)}")
    print(f"[Delete Scene] All scene IDs: {list(_scenes.keys())}")
    
    # Kiểm tra scene có tồn tại không (case-insensitive nếu cần)
    scene_found = None
    if scene_id in _scenes:
        scene_found = scene_id
    else:
        # Thử tìm case-insensitive
        for sid in _scenes.keys():
            if sid.lower() == scene_id.lower():
                scene_found = sid
                print(f"[Delete Scene] Found scene with different case: {sid} (requested: {scene_id})")
                break
    
    if not scene_found:
        print(f"[Delete Scene] Scene {scene_id} not found in _scenes")
        print(f"[Delete Scene] Available scene IDs (first 20): {list(_scenes.keys())[:20]}")
        abort(404, f"Scene {scene_id} not found")
    
    # Sử dụng scene_found thay vì scene_id để đảm bảo xóa đúng
    actual_scene_id = scene_found
    
    try:
        print(f"[Delete Scene] Deleting scene {actual_scene_id} (requested: {scene_id})")
        print(f"[Delete Scene] Scene data before delete: {_scenes[actual_scene_id].get('id', 'N/A')}, URL: {_scenes[actual_scene_id].get('url', 'N/A')}")
        
        # Xóa scene khỏi memory
        del _scenes[actual_scene_id]
        print(f"[Delete Scene] Scene removed from memory. Remaining scenes: {len(_scenes)}")
        
        # Lưu file
        save_scenes()
        
        # QUAN TRỌNG: Reload lại từ file sau khi save để đảm bảo đồng bộ hoàn toàn
        if scenes_path and os.path.exists(scenes_path):
            load_scenes_from_file(scenes_path)
        
        # Verify scene was deleted
        if actual_scene_id in _scenes:
            print(f"[Delete Scene] WARNING: Scene {actual_scene_id} still exists in _scenes after delete!")
            # Force remove again
            del _scenes[actual_scene_id]
            save_scenes()
            # Reload lại sau lần save thứ 2
            if scenes_path and os.path.exists(scenes_path):
                load_scenes_from_file(scenes_path)
        else:
            print(f"[Delete Scene] Verified: Scene {actual_scene_id} no longer in _scenes")
        
        print(f"[Delete Scene] Successfully deleted scene {actual_scene_id}")
        # Regenerate graph so graph.json no longer contains deleted node
        try:
            regenerate_graph()
        except Exception as e:
            print(f"⚠ Could not regenerate graph after delete_scene: {e}")
        return "", 204
    except Exception as e:
        print(f"[Delete Scene] Error: {e}")
        import traceback
        traceback.print_exc()
        # Restore scene if delete failed
        if actual_scene_id not in _scenes:
            print(f"[Delete Scene] Attempting to restore scene {actual_scene_id}...")
            # Try to reload from file
            if loaded_from and os.path.exists(loaded_from):
                try:
                    load_scenes_from_file(loaded_from)
                    print(f"[Delete Scene] Reloaded scenes from {loaded_from}")
                except Exception as reload_error:
                    print(f"[Delete Scene] Failed to reload scenes: {reload_error}")
        abort(500, str(e))

# --- BOT logic ---
def build_adjacency_from_scenes():
    adj = {}
    for sid, s in _scenes.items():
        adj.setdefault(sid, [])
        for hs in s.get("hotspots", []):
            tgt = hs.get("target") or hs.get("targetScene") or hs.get("targetSceneId")
            if tgt:
                if tgt not in adj[sid]:
                    adj[sid].append(tgt)
                adj.setdefault(tgt, [])
    return adj

def bfs_path(adj, start, goal):
    if start == goal:
        return [start]
    if start not in adj or goal not in adj:
        return None
    q = deque([[start]])
    visited = set([start])
    while q:
        path = q.popleft()
        node = path[-1]
        for nb in adj.get(node, []):
            if nb in visited:
                continue
            newp = path + [nb]
            if nb == goal:
                return newp
            visited.add(nb)
            q.append(newp)
    return None

def infer_faculties_from_scenes():
    faculties = {}
    for sid, s in _scenes.items():
        parts = sid.split("_", 1)
        fac = parts[0] if parts else "misc"
        if fac not in faculties:
            faculties[fac] = {"id": fac, "name": fac.upper(), "scenes": []}
        faculties[fac]["scenes"].append(sid)
    return faculties

# --- Helper Functions ---
def convert_to_webp(file_stream, output_path, quality=80):
    try:
        file_stream.seek(0) # Reset stream
        img = Image.open(file_stream)
        if img.mode in ("RGBA", "P"):
            img = img.convert("RGBA")
        elif img.mode != "RGB":
            img = img.convert("RGB")
        img.save(output_path, 'WEBP', quality=quality)
        return True
    except Exception as e:
        print(f"WebP Error: {e}")
        return False
# --- Upload ---
ALLOWED_EXT = {'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp3'}

def allowed(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXT

def cleanup_old_files(base_name):
    """Xóa tất cả các file cũ (jpg, png, webp...) của scene này"""
    if not base_name: return
    
    import glob
    for folder in [UPLOAD_DIR, FRONTEND_ASSETS]:
        if os.path.exists(folder):
            # Tìm file bắt đầu bằng base_name (vd: a1_*)
            pattern = os.path.join(folder, f"{base_name}*")
            for f in glob.glob(pattern):
                try:
                    if os.path.isfile(f):
                        os.remove(f)
                        print(f"✓ Cleaned up old file: {os.path.basename(f)}")
                except Exception as e:
                    print(f"⚠ Warning cleaning {f}: {e}")

@app.route("/api/upload", methods=["POST"])
def upload_file():
    # 1. Check file part
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
        
    f = request.files['file']
    
    # 2. Check filename
    if f.filename == '':
        return jsonify({"error": "No selected file"}), 400
        
    # 3. Check extension
    if not allowed(f.filename):
        return jsonify({"error": "File type not allowed"}), 400

    # Fix lỗi 2: Sử dụng secure_filename (đã import ở đầu file)
    original_filename = secure_filename(f.filename)
    original_ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else ''
    timestamp = int(time.time() * 1000)

    # --- TRƯỜNG HỢP 1: AUDIO (MP3) ---
    if original_ext == 'mp3':
        name_only = original_filename.rsplit('.', 1)[0]
        final_name = f"{name_only}_{timestamp}.mp3"
        save_path = os.path.join(UPLOAD_DIR, final_name)
        
        # Save file (không cần convert)
        f.save(save_path)
        return jsonify({"url": f"/uploads/{final_name}"}), 201

    # --- TRƯỜNG HỢP 2: ẢNH (Convert WebP) ---
    scene_id = request.form.get('scene_id', '')
    
    try:
        # Xác định tên file
        if scene_id:
            cleanup_old_files(scene_id) # Fix lỗi 4: Gọi hàm dọn dẹp file cũ
            new_filename = f"{scene_id}_{timestamp}.webp"
        else:
            base_name = original_filename.rsplit('.', 1)[0]
            new_filename = f"{base_name}_{timestamp}.webp"

        dest_path = os.path.join(UPLOAD_DIR, new_filename)

        # Fix lỗi 1: Gọi hàm convert (hàm này đã có f.seek(0))
        success = convert_to_webp(f, dest_path)
        
        if success:
            print(f"✓ Converted & Saved: {new_filename}")
            return jsonify({"url": f"/uploads/{new_filename}"}), 201
        else:
            # Fallback: Nếu convert lỗi -> Lưu file gốc
            print("⚠ Convert failed, saving original file")
            
            # QUAN TRỌNG: Reset con trỏ file về 0 vì convert_to_webp đã đọc nó
            f.seek(0) 
            
            f.save(os.path.join(UPLOAD_DIR, original_filename))
            return jsonify({"url": f"/uploads/{original_filename}"}), 201

    except Exception as e:
        print(f"Server Upload Error: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/uploads/<path:filename>')
def uploaded_file(filename):
    resp = send_from_directory(UPLOAD_DIR, filename, conditional=True)
    # Cache images aggressively; they are content-addressed by unique filenames
    resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return resp

# Fallback API path for uploads so Static Site can proxy via /api
@app.route('/api/uploads/<path:filename>')
def uploaded_file_api(filename):
    resp = send_from_directory(UPLOAD_DIR, filename, conditional=True)
    resp.headers['Cache-Control'] = 'public, max-age=31536000, immutable'
    return resp

# --- Storage Health Check ---
@app.route('/health/storage', methods=['GET'])
def health_storage():
    """Report effective data and uploads directories and basic file presence.
    Optional query: ?file=<name> to test existence under uploads.
    """
    test_file = request.args.get('file')
    exists = None
    if test_file:
        try:
            path = os.path.join(UPLOAD_DIR, test_file)
            exists = os.path.exists(path)
        except Exception:
            exists = False
    return jsonify({
        "cms_data_dir": CMS_DATA_DIR,
        "uploads_dir": UPLOAD_DIR,
        "scenes_file_write": SCENES_FILE_WRITE,
        "graph_path": graph_path,
        "tours_file_path": tours_file_path,
        "test_file": test_file,
        "test_file_exists": exists
    }), 200

# --- Sync Health Check (Disk vs GitHub) ---
def _file_info(path):
    try:
        abs_path = os.path.abspath(path) if path else None
        exists = bool(abs_path and os.path.exists(abs_path))
        size = os.path.getsize(abs_path) if exists else None
        mtime = os.path.getmtime(abs_path) if exists else None
        sha256 = None
        if exists:
            import hashlib
            with open(abs_path, 'rb') as f:
                sha256 = hashlib.sha256(f.read()).hexdigest()
        return {
            "path": abs_path,
            "exists": exists,
            "size": size,
            "mtime": mtime,
            "sha256": sha256,
        }
    except Exception as e:
        return {"path": path, "error": str(e)}

def _gh_content_info(repo_path):
    if not (GH_TOKEN and GH_REPO and repo_path):
        return {"configured": False}
    try:
        url = f"https://api.github.com/repos/{GH_REPO}/contents/{repo_path}?ref={GH_BRANCH}"
        r = requests.get(url, headers=_gh_headers(), timeout=20)
        if r.status_code == 200:
            j = r.json()
            content_b64 = j.get("content")
            gh_sha = j.get("sha")
            decoded = None
            gh_sha256 = None
            if content_b64:
                try:
                    decoded = base64.b64decode(content_b64)
                    import hashlib
                    gh_sha256 = hashlib.sha256(decoded).hexdigest()
                except Exception:
                    pass
            return {
                "configured": True,
                "gh_path": repo_path,
                "gh_sha": gh_sha,
                "gh_sha256": gh_sha256,
                "size": j.get("size"),
            }
        else:
            return {"configured": True, "gh_path": repo_path, "error": f"status {r.status_code}"}
    except Exception as e:
        return {"configured": True, "gh_path": repo_path, "error": str(e)}

@app.route('/health/sync', methods=['GET'])
def health_sync():
    """Compare local disk files with GitHub repo content for scenes/tours/graph."""
    scenes_disk = _file_info(SCENES_FILE_WRITE)
    tours_disk = _file_info(tours_file_path or os.path.join(CMS_DATA_DIR, 'tours.json'))
    graph_disk = _file_info(graph_path or os.path.join(CMS_DATA_DIR, 'graph.json'))

    scenes_gh = _gh_content_info(GH_PATH_SCENES)
    tours_gh = _gh_content_info(GH_PATH_TOURS)
    graph_gh = _gh_content_info(GH_PATH_GRAPH)

    def _in_sync(disk, gh):
        try:
            d = disk.get("sha256")
            g = gh.get("gh_sha256")
            return bool(d and g and d == g)
        except Exception:
            return False

    return jsonify({
        "github": {
            "configured": bool(GH_TOKEN and GH_REPO),
            "repo": GH_REPO,
            "branch": GH_BRANCH,
        },
        "scenes": {**scenes_disk, **{"gh": scenes_gh, "in_sync": _in_sync(scenes_disk, scenes_gh)}},
        "tours": {**tours_disk, **{"gh": tours_gh, "in_sync": _in_sync(tours_disk, tours_gh)}},
        "graph": {**graph_disk, **{"gh": graph_gh, "in_sync": _in_sync(graph_disk, graph_gh)}},
    }), 200

# --- Analytics endpoints ---
@app.route("/api/analytics/visit", methods=["POST"])
def track_visit():
    """Track a page visit and update active sessions"""
    # Cleanup inactive sessions trước khi thêm session mới
    with stats_lock:
        cleanup_inactive_sessions()
    
    session_id = request.headers.get('X-Session-ID') or str(uuid.uuid4())
    now = datetime.now()
    
    with stats_lock:
        active_sessions[session_id] = now
        record_visit()
        concurrent = len(active_sessions)
    
    # Only log occasionally to reduce log spam
    if len(active_sessions) % 5 == 0 or concurrent == 1:  # Log every 5th session or when concurrent is 1
      print(f"[Analytics] Visit tracked - Session: {session_id[:8]}..., Concurrent: {concurrent}, Total active sessions: {len(active_sessions)}")
    return jsonify({"session_id": session_id, "concurrent": concurrent}), 200

@app.route("/api/analytics/ping", methods=["POST"])
def ping_session():
    """Keep session alive"""
    session_id = request.headers.get('X-Session-ID')
    if session_id:
        with stats_lock:
            active_sessions[session_id] = datetime.now()
            concurrent = len(active_sessions)
        # Only log occasionally to reduce log spam
        if concurrent % 5 == 0 or concurrent <= 2:  # Log every 5th ping or when concurrent <= 2
          print(f"[Analytics] Ping - Session: {session_id[:8]}..., Concurrent: {concurrent}, Total active sessions: {len(active_sessions)}")
    else:
        print("[Analytics] Ping - No session ID")
    return jsonify({"concurrent": len(active_sessions)}), 200

@app.route("/api/analytics/stats", methods=["GET"])
def get_analytics():
    """Get analytics statistics with optional year and month filters"""
    period = request.args.get('period', 'day')  # day, week, month
    year = request.args.get('year')  # Optional: filter by year (e.g., "2025")
    month = request.args.get('month')  # Optional: filter by month (1-12), only used when period='day'
    
    # Reload stats from file to ensure we have latest data, then cleanup and get concurrent users
    global stats_data
    with stats_lock:
        # Reload stats from file to get latest saved data
        try:
            if os.path.exists(STATS_FILE):
                with open(STATS_FILE, 'r', encoding='utf-8') as f:
                    loaded_data = json.load(f)
                    if isinstance(loaded_data, dict) and any(k in loaded_data for k in ('daily', 'weekly', 'monthly', 'peak_concurrent')):
                        stats_data = loaded_data
                        print(f"[Analytics] Reloaded stats: {len(loaded_data.get('daily', {}))} daily, peak: {loaded_data.get('peak_concurrent', 0)}")
                    else:
                        print(f"[Analytics] Warning: stats.json has unexpected structure; keeping in-memory stats.")
            else:
                print(f"[Analytics] Warning: Stats file not found: {STATS_FILE}")
        except Exception as e:
            print(f"[Analytics] Error reloading stats in get_analytics: {e}")
            # Backup the corrupted/truncated file if possible (prevents silent data loss)
            try:
                if os.path.exists(STATS_FILE):
                    timestamp = int(time.time())
                    backup_path = f"{STATS_FILE}.corrupt.{timestamp}.bak"
                    import shutil
                    shutil.copy(STATS_FILE, backup_path)
                    print(f"[Analytics] ⚠ Backed up corrupted stats file to: {backup_path}")
            except Exception as backup_err:
                print(f"[Analytics] ✗ Failed to backup corrupted stats file: {backup_err}")
            import traceback
            traceback.print_exc()
        
        cleanup_inactive_sessions()
        current_concurrent = get_concurrent_users()
        # Only log occasionally to reduce log spam
        if len(active_sessions) % 10 == 0 or current_concurrent > 0:  # Log every 10th request or when there are users
          print(f"[Analytics] Stats requested - Concurrent: {current_concurrent}, Active sessions: {len(active_sessions)}")
    
    now = datetime.now()
    
    # Calculate total visits (all time)
    total_visits_all_time = sum(stats_data.get('daily', {}).values())
    
    # Calculate today's visits
    today_key = get_date_key(now)
    today_visits = stats_data.get('daily', {}).get(today_key, 0)
    
    if period == 'day':
        data = []
        if year and month:
            # Filter by specific year and month
            try:
                year_int = int(year)
                month_int = int(month)
                # Get all days in that month
                from calendar import monthrange
                days_in_month = monthrange(year_int, month_int)[1]
                for day in range(1, days_in_month + 1):
                    date = datetime(year_int, month_int, day)
                    key = get_date_key(date)
                    data.append({
                        "date": key,
                        "visits": stats_data.get('daily', {}).get(key, 0)
                    })
            except (ValueError, TypeError):
                # Invalid year/month, fall back to last 30 days
                for i in range(29, -1, -1):
                    date = now - timedelta(days=i)
                    key = get_date_key(date)
                    data.append({
                        "date": key,
                        "visits": stats_data.get('daily', {}).get(key, 0)
                    })
        elif year:
            # Filter by year only - show all months in that year
            try:
                year_int = int(year)
                for month_num in range(1, 13):
                    date = datetime(year_int, month_num, 1)
                    key = get_month_key(date)
                    data.append({
                        "month": key,
                        "visits": stats_data.get('monthly', {}).get(key, 0)
                    })
                # Change period to month for display
                period = 'month'
            except (ValueError, TypeError):
                # Invalid year, fall back to last 30 days
                for i in range(29, -1, -1):
                    date = now - timedelta(days=i)
                    key = get_date_key(date)
                    data.append({
                        "date": key,
                        "visits": stats_data.get('daily', {}).get(key, 0)
                    })
        else:
            # Last 30 days (default)
            for i in range(29, -1, -1):
                date = now - timedelta(days=i)
                key = get_date_key(date)
                data.append({
                    "date": key,
                    "visits": stats_data.get('daily', {}).get(key, 0)
                })
    elif period == 'week':
        # Last 12 weeks
        data = []
        for i in range(11, -1, -1):
            date = now - timedelta(weeks=i)
            key = get_week_key(date)
            data.append({
                "week": key,
                "visits": stats_data.get('weekly', {}).get(key, 0)
            })
    else:  # month
        data = []
        if year:
            # Filter by year - show all months in that year
            try:
                year_int = int(year)
                for month_num in range(1, 13):
                    date = datetime(year_int, month_num, 1)
                    key = get_month_key(date)
                    data.append({
                        "month": key,
                        "visits": stats_data.get('monthly', {}).get(key, 0)
                    })
            except (ValueError, TypeError):
                # Invalid year, fall back to last 12 months
                for i in range(11, -1, -1):
                    date = now - timedelta(days=i*30)
                    key = get_month_key(date)
                    data.append({
                        "month": key,
                        "visits": stats_data.get('monthly', {}).get(key, 0)
                    })
        else:
            # Last 12 months (default)
            for i in range(11, -1, -1):
                date = now - timedelta(days=i*30)
                key = get_month_key(date)
                data.append({
                    "month": key,
                    "visits": stats_data.get('monthly', {}).get(key, 0)
                })
    
    return jsonify({
        "current_concurrent": current_concurrent,
        "peak_concurrent": stats_data.get('peak_concurrent', 0),
        "peak_concurrent_date": stats_data.get('peak_concurrent_date'),
        "total_visits_all_time": total_visits_all_time,
        "today_visits": today_visits,
        "data": data,
        "period": period
    }), 200

@app.route("/api/analytics/concurrent", methods=["GET"])
def get_concurrent():
    """Get current concurrent users"""
    with stats_lock:
        cleanup_inactive_sessions()
        concurrent = get_concurrent_users()
    # Only log occasionally to reduce log spam
    if concurrent % 5 == 0 or concurrent <= 2:  # Log every 5th request or when concurrent <= 2
        print(f"[Analytics] Get concurrent: {concurrent}")
    return jsonify({"concurrent": concurrent}), 200

# --- Google Cloud TTS ---
def _ensure_gcp_credentials():
    """Ensure GOOGLE_APPLICATION_CREDENTIALS is set and points to a valid file.
    Supports:
    - Render Secret Files at /etc/secrets/google-tts-key.json
    - GOOGLE_CREDENTIALS_JSON (raw JSON)
    - GOOGLE_CREDENTIALS_JSON_BASE64 (base64 of JSON)
    """
    # If already set and file exists, keep
    cred = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred and os.path.exists(cred):
        # Validate JSON structure; if invalid, ignore and continue
        try:
            with open(cred, 'r', encoding='utf-8') as f:
                json.load(f)
            print(f"[GCP] Using existing credentials: {cred}")
            return cred
        except Exception as e:
            print(f"[GCP] Existing credentials invalid ({cred}): {e}; attempting fallbacks...")

    # Render Secret Files default path
    secret_path = "/etc/secrets/google-tts-key.json"
    if os.path.exists(secret_path):
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = secret_path
        print(f"[GCP] Using Render secret file: {secret_path}")
        return secret_path

    # Raw JSON via env
    raw_json = os.environ.get("GOOGLE_CREDENTIALS_JSON") or os.environ.get("GOOGLE_TTS_KEY_JSON")
    raw_b64 = os.environ.get("GOOGLE_CREDENTIALS_JSON_BASE64")
    if not raw_json and not raw_b64:
        print("[GCP] No credentials found in env; expecting file on disk.")
        return None

    try:
        if not raw_json and raw_b64:
            raw_json = base64.b64decode(raw_b64).decode("utf-8")
    except Exception as e:
        print(f"[GCP] Failed to decode base64 credentials: {e}")
        return None

    # Write to /tmp which is writable on Render
    tmp_path = "/tmp/google-tts-key.json"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            f.write(raw_json)
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = tmp_path
        print(f"[GCP] Wrote credentials to {tmp_path}")
        return tmp_path
    except Exception as e:
        print(f"[GCP] Failed to write credentials: {e}")
        return None

_ensure_gcp_credentials()
try:
    tts_client = texttospeech.TextToSpeechClient()
    print("DEBUG: Google TTS client initialized")
except Exception as e:
    tts_client = None
    print("WARNING: Google TTS client NOT initialized:", e)

@app.route("/health/tts", methods=["GET"])
def health_tts():
    return jsonify({
        "initialized": tts_client is not None,
        "GOOGLE_APPLICATION_CREDENTIALS": os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"),
        "exists": bool(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS") and os.path.exists(os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")))
    }), 200

def _clamp(val, lo, hi):
    try:
        v = float(val)
    except Exception:
        return lo
    return max(lo, min(hi, v))

@app.route("/tts/generate", methods=["POST"])
def tts_generate():
    if tts_client is None:
        abort(500, "TTS client not initialized on server")

    data = request.get_json(silent=True) or {}
    text = data.get("text") or data.get("q") or ""
    if not text:
        abort(400, "text field required")

    use_ssml = bool(data.get("ssml", False))
    lang = data.get("language_code", "vi-VN")
    # prefer WaveNet voices for natural sound
    voice_name = data.get("voice", "vi-VN-Wavenet-A")
    audio_format = data.get("format", "MP3")

    # sensible defaults and clamps
    speaking_rate = _clamp(data.get("speakingRate", 1.0), 0.5, 2.0)
    pitch = _clamp(data.get("pitch", 0.0), -20.0, 20.0)
    volume_gain_db = _clamp(data.get("volumeGainDb", 0.0), -10.0, 20.0)
    sample_rate_hz = int(_clamp(data.get("sampleRateHertz", 24000), 8000, 48000))

    # Generate cache key from text and TTS parameters
    import hashlib
    cache_key = hashlib.md5(
        f"{text}|{voice_name}|{lang}|{speaking_rate}|{pitch}|{volume_gain_db}|{sample_rate_hz}|{audio_format}".encode('utf-8')
    ).hexdigest()
    
    ext = "mp3" if str(audio_format).upper() == "MP3" else "wav"
    cached_filename = f"tts_cache_{cache_key}.{ext}"
    cached_path = os.path.join(UPLOAD_DIR, cached_filename)
    
    # Check if cached file exists
    if os.path.exists(cached_path):
        print(f"[TTS] Using cached file: {cached_filename}")
        url = f"/uploads/{cached_filename}"
        return jsonify({
            "url": url,
            "cached": True,
            "voice": voice_name,
            "speakingRate": speaking_rate,
            "pitch": pitch,
            "volumeGainDb": volume_gain_db,
            "sampleRateHertz": sample_rate_hz
        }), 200

    # Cache miss - generate new audio
    print(f"[TTS] Cache miss, generating new audio for: {text[:50]}...")

    # prepare input (ssml or plain)
    if use_ssml:
        input_obj = texttospeech.SynthesisInput(ssml=text)
    else:
        input_obj = texttospeech.SynthesisInput(text=text)

    voice = texttospeech.VoiceSelectionParams(language_code=lang, name=voice_name)

    # build audio config
    audio_encoding = texttospeech.AudioEncoding.MP3 if str(audio_format).upper() == "MP3" else texttospeech.AudioEncoding.LINEAR16
    audio_config = texttospeech.AudioConfig(
        audio_encoding=audio_encoding,
        speaking_rate=speaking_rate,
        pitch=pitch,
        volume_gain_db=volume_gain_db,
        sample_rate_hertz=sample_rate_hz
    )

    # effects_profile_id tùy chọn (mảng), được truyền nếu được cung cấp
    effects = data.get("effects_profile_id")
    if effects and isinstance(effects, list):
        # google api expects effects_profile_id on AudioConfig constructor; but python client accepts effects_profile_id param name in older versions.
        try:
            audio_config.effects_profile_id = effects
        except Exception:
            # ignore if not supported by client lib
            pass

    try:
        resp = tts_client.synthesize_speech(input=input_obj, voice=voice, audio_config=audio_config)
    except Exception as e:
        print("ERROR: TTS synth failed:", e)
        abort(500, f"TTS synth failed: {e}")

    # lưu tệp với tên bộ nhớ đệm
    dest = cached_path
    try:
        with open(dest, "wb") as fh:
            fh.write(resp.audio_content)
        print(f"[TTS] Saved cached file: {cached_filename}")
    except Exception as e:
        print("ERROR: saving tts file:", e)
        abort(500, "Failed to save audio file")

    b64 = base64.b64encode(resp.audio_content).decode("utf-8")
    url = f"/uploads/{cached_filename}"
    # echo back params để gỡ lỗi dễ dàng hơn
    return jsonify({
        "url": url,
        "base64": b64,
        "cached": False,
        "voice": voice_name,
        "speakingRate": speaking_rate,
        "pitch": pitch,
        "volumeGainDb": volume_gain_db,
        "sampleRateHertz": sample_rate_hz
    }), 201
app = app
if __name__ == "__main__":
    # Get port from environment variable or default to 5000
    port = int(os.environ.get("PORT", 5000))
    
    # Get debug mode from environment variable
    debug_mode = os.environ.get("FLASK_DEBUG", "1") == "1"
    
    # Run the Flask application
    app.run(
        host="0.0.0.0",
        port=port,
        debug=debug_mode,
        threaded=True  # Enable threading for concurrent requests
    )
