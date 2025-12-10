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
    // Check if token is expired (24 hours)
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

// Lấy JWT token (tiện dùng cho api.js nếu cần)
export function getToken() {
  const data = getAuthData();
  return data?.token || null;
}

