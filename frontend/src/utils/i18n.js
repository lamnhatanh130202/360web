// i18n utility for managing translations
let currentLang = localStorage.getItem('lang') || 'vi';
export let translations = {};

// Load translations
export async function loadTranslations(lang) {
  try {
    const res = await fetch(`/language/${lang}.json`);
    if (!res.ok) throw new Error('Failed to load language file');
    translations = await res.json();
    currentLang = lang; // Chỉ cập nhật biến currentLang ở đây
    return translations;
  } catch (e) {
    console.warn('loadTranslations error:', e);
    // Fallback to default
    if (lang === 'en') {
      translations = {
        title: "Binh Duong University Virtual Tour 360°",
        sceneLabel: "Current Scene",
        btnRotateOn: "Stop",
        btnRotateOff: "Auto Rotate",
        minimapTitle: "Mini-map",
        routeBtn: "Find Route",
        footer: "© Binh Duong University"
      };
    } else {
      translations = {
        title: "Tham Quan Đại Học Bình Dương 360°",
        sceneLabel: "Tên khu vực",
        btnRotateOn: "Dừng lại",
        btnRotateOff: "Tự xoay",
        minimapTitle: "Mini-map",
        routeBtn: "Tìm đường",
        footer: "Bản quyền © Đại Học Bình Dương"
      };
    }
    currentLang = lang; // Đảm bảo currentLang cũng được cập nhật trong trường hợp lỗi
    return translations;
  }
}

// Get translation
export function t(key, fallback = '') {
  return translations[key] || fallback || key;
}

// Get current language
export function getCurrentLang() {
  return currentLang;
}

// Set language and reload translations
export async function setLanguage(lang) {
  // Lưu ngôn ngữ được chọn vào localStorage để ghi nhớ cho lần sau
  localStorage.setItem('lang', lang);
  
  await loadTranslations(lang);
  applyTranslations(); // <--- Bổ sung dòng này
  // Bắn sự kiện để các thành phần khác (UI, Minimap) cập nhật theo ngôn ngữ mới
  console.log('[i18n] Dispatching change-lang event:', lang);
  window.dispatchEvent(new CustomEvent('change-lang', { detail: lang }));
}

/**
 * Apply translations to all elements with data-i18n attributes
 */
export function applyTranslations() {
  // 1. Áp dụng bản dịch nội dung văn bản
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = t(key);
    
    if (translation && translation !== key) {
      // Logic trích xuất biểu tượng và vị trí gốc (Nếu có)
      const originalText = el.textContent || '';
      let icon = '';
      let translationOnly = translation;
      
      // Kiểm tra biểu tượng và lưu trữ trước
      if (originalText.includes('⟲')) {
        icon = '⟲ ';
      } else if (originalText.includes('⟳')) {
        icon = ' ⟳';
      } else if (originalText.includes('＋')) {
        icon = '＋ ';
      } else if (originalText.includes('－')) {
        icon = '－ ';
      }
      
      // [FIX] Ghép lại biểu tượng và bản dịch mới
      if (icon) {
        // Tùy theo vị trí (đầu/cuối), ghép biểu tượng lại
        if (icon.trim() === '⟳') { // Biểu tượng ở cuối
          el.textContent = `${translationOnly} ⟳`;
        } else { // Biểu tượng ở đầu
          el.textContent = `${icon.trim()} ${translationOnly}`;
        }
      } else {
        el.textContent = translation; // Không có biểu tượng, chỉ dịch văn bản
      }
    }
  });
  
  // 2. Apply title/tooltip translations (Giữ nguyên)
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const translation = t(key);
    if (translation && translation !== key) {
      el.title = translation;
    }
  });
  
  // 3. Apply placeholder translations (Giữ nguyên)
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = t(key);
    if (translation && translation !== key) {
      el.placeholder = translation;
    }
  });
}
// Initialize
export async function initI18n() {
  await loadTranslations(currentLang);
  return translations;
}
