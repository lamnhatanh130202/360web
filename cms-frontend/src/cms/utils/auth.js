// Authentication utility
// Lưu JWT token và thông tin user cho CMS
const AUTH_KEY = 'cms_auth';
const AUTH_USER_KEY = 'cms_user';

const API_BASE = '/api';

export function isAuthenticated() {
  const auth = localStorage.getItem(AUTH_KEY);
  if (!auth) return false;
  
  try {
    const authData = JSON.parse(auth);
    // Check if token is expired (24 hours client-side check)
    if (authData.expires && authData.expires < Date.now()) {
      logout();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function login(username, password) {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }

    if (!res.ok) {
      const msg = data?.error || 'Tên đăng nhập hoặc mật khẩu không đúng';
      return { success: false, error: msg };
    }

    const token = data?.token;
    const user = data?.username || username;
    const expires = Date.now() + (24 * 60 * 60 * 1000); // 24h client-side

    const authData = { username: user, token, expires };
    localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
    localStorage.setItem(AUTH_USER_KEY, user);

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || 'Không thể kết nối máy chủ' };
  }
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
  // Optional: Redirect về login ngay lập tức nếu cần
  // window.location.href = '/login'; 
}

export function getCurrentUser() {
  return localStorage.getItem(AUTH_USER_KEY) || null;
}

export function getAuthData() {
  const auth = localStorage.getItem(AUTH_KEY);
  if (!auth) return null;
  try {
    return JSON.parse(auth);
  } catch {
    return null;
  }
}

export function getToken() {
  const data = getAuthData();
  return data?.token || null;
}

// ==========================================
// PHẦN THÊM MỚI: Wrapper gọi API an toàn
// ==========================================

/**
 * Dùng hàm này thay cho fetch thông thường khi gọi API cần đăng nhập.
 * Nó tự động thêm Header Authorization và xử lý lỗi 401.
 */
export async function authFetch(endpoint, options = {}) {
  // 1. Lấy token hiện tại
  const token = getToken();

  // 2. Chuẩn bị headers mặc định
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers // Cho phép ghi đè headers nếu cần
  };

  // 3. Nếu có token, gắn vào Header Authorization
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Xử lý URL (nếu endpoint chưa có /api thì tự thêm vào, tùy logic dự án của bạn)
  // Nếu bạn truyền full URL thì giữ nguyên, nếu truyền path thì nối với API_BASE
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    // 4. QUAN TRỌNG: Chặn đứng vòng lặp Redirect
    // Nếu server trả về 401 (Unauthorized) -> Token hết hạn hoặc sai
    if (response.status === 401) {
      console.warn("Phiên đăng nhập hết hạn. Đang đăng xuất...");
      logout(); // Xóa token cũ ngay lập tức
      window.location.href = '/login'; // Đá về trang login
      // window.location.reload(); 
      console.log("Đã chặn reload để sửa lỗi");
      return null; // Dừng xử lý
    }

    return response;
  } catch (error) {
    console.error("Lỗi kết nối API:", error);
    throw error;
  }
}