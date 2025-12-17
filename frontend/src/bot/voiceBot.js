// src/bot/voiceBot.js
// Voice Bot module (updated)
// - Now uses backend /tts/generate to synthesize and cache MP3 files on server
// - Options: baseUrl to point to backend (default: '' => same origin)

export function createVoiceBot(opts = {}) {
  const {
    container = document.body,
    buttonId = 'voice-bot-btn',
    bubbleId = 'voice-bot-bubble',
    getScenes = () => [],                  // should return [{id, name},...]
    getCurrentSceneId = () => null,
    onGotoScene = async (sceneId) => {},   // should perform navigation
    onPathPlay = async (path) => {},       // should animate minimap along path
    getTours = async () => [],            // should return [{id, name, keywords, scenes},...]
    getGraph = () => null,                // should return graph {nodes, edges} from minimap
    tts = { enabled: true, useGoogle: true, prefixText: 'Đang di chuyển tới', voice: 'vi-VN-Wavenet-B' },
    recognitionConfig = { lang: 'vi-VN' },
    baseUrl = '' // backend base URL, e.g. 'http://127.0.0.1:5000'
  } = opts;

  // normalize baseUrl (no trailing slash)
  const BASE = (baseUrl || '').replace(/\/$/, '');

  let listening = false;
  let supported = true;
  let recognition = null;
  let recognitionState = 'idle'; // 'idle', 'starting', 'listening', 'stopping'
  let isRestarting = false;
  let cachedTours = null;

  async function refreshTours() {
    try {
      if (typeof getTours === 'function') {
        const t = await getTours();
        cachedTours = Array.isArray(t) ? t : (t && typeof t === 'object' ? Object.values(t) : []);
        console.log('[VoiceBot] Refreshed tours via broadcast, count:', cachedTours.length);
        try { showBubble('Danh sách tours đã cập nhật', 2000); } catch (e) {}
      }
    } catch (e) {
      console.warn('[VoiceBot] refreshTours failed:', e);
    }
  }

  // ---- Utilities ----
  function normalize(s) {
    return (s || '').toString().trim().toLowerCase()
      .normalize('NFD').replace(/\p{Diacritic}/gu, '')
      .replace(/[\"'’‘`,.?¡!¿:;()\[\]{}<>\/\\]/g, '')
      .replace(/\s+/g, ' ');
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const al = a.length, bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    const v0 = new Array(bl + 1), v1 = new Array(bl + 1);
    for (let j = 0; j <= bl; j++) v0[j] = j;
    for (let i = 0; i < al; i++) {
      v1[0] = i + 1;
      for (let j = 0; j < bl; j++) {
        const cost = a[i] === b[j] ? 0 : 1;
        v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
      }
      for (let j = 0; j <= bl; j++) v0[j] = v1[j];
    }
    return v1[bl];
  }

  function findBestSceneMatch(spokenRaw) {
    // 1. Lấy dữ liệu scenes an toàn hơn
    let rawScenes = getScenes();
    let scenes = [];

    // Xử lý trường hợp getScenes trả về Object (thường gặp trong web 360) thay vì Array
    if (Array.isArray(rawScenes)) {
      scenes = rawScenes;
    } else if (rawScenes && typeof rawScenes === 'object') {
      // Convert Object { id: scene } thành Array [scene]
      scenes = Object.values(rawScenes);
    }

    console.log(`[VoiceBot] Total scenes loaded: ${scenes.length}`);
    if (scenes.length > 0) {
      // Log thử scene đầu tiên để check cấu trúc field (name hay title?)
      console.log('[VoiceBot] Sample scene structure:', scenes[0]); 
    }

    const spoken = normalize(spokenRaw || '');
    if (!spoken) return null;

    let best = null; 
    let bestScore = Infinity;

    // Tokenize câu nói để so sánh từ khóa
    const spokenWords = spoken.split(' ').filter(w => w.length > 1);

    for (const s of scenes) {
      // 2. Fallback nhiều trường tên: name (vi/en), title, hoặc id
      const rawName = s.name?.vi || s.name || s.title || s.id || '';
      const name = normalize(rawName);
      
      // Lấy thêm keywords của scene (nếu có)
      const sceneKeywords = (s.keywords || []).map(k => normalize(k));

      if (!name) continue;

      // --- LOGIC SO SÁNH ---

      // A. Khớp chính xác hoàn toàn
      if (name === spoken) return s;
      if (sceneKeywords.includes(spoken)) return s;

      // B. Khớp chứa nhau (User nói: "cho tôi xem phòng khách" -> Match "phòng khách")
      if (name.includes(spoken) || spoken.includes(name)) {
        return s;
      }

      // C. Khớp từ khóa quan trọng (Match word-by-word)
      // Ví dụ: User nói "Phòng công nghệ", Scene là "Khoa Công nghệ" -> khớp chữ "công nghệ"
      const nameWords = name.split(' ').filter(w => w.length > 1);
      const commonWords = spokenWords.filter(w => nameWords.includes(w));
      
      // Nếu khớp được trên 70% số từ của tên scene -> Chọn luôn
      if (nameWords.length > 0 && (commonWords.length / nameWords.length) > 0.7) {
        console.log(`[VoiceBot] Match by word overlap: ${rawName} (${commonWords.join(',')})`);
        return s;
      }

      // D. So khớp mờ (Fuzzy - Levenshtein)
      // Chỉ dùng khi chưa tìm thấy match ngon
      const dist = levenshtein(name, spoken);
      // Chuẩn hóa điểm số dựa trên độ dài chuỗi dài nhất
      const norm = dist / Math.max(1, Math.max(name.length, spoken.length));
      
      // Ngưỡng 0.45 là ok, nhưng ưu tiên thằng có điểm thấp nhất
      if (norm < bestScore && norm < 0.45) { 
        bestScore = norm; 
        best = s; 
      }
    }
    
    if (best) {
      console.log(`[VoiceBot] Fuzzy match best result: ${best.name || best.id} (Score: ${bestScore})`);
    }
    return best;
  }

  async function findBestTourMatch(spokenRaw) {
    console.log('[VoiceBot] findBestTourMatch called with:', spokenRaw);
    
    // Đảm bảo getTours được gọi và chờ kết quả
    let tours = [];
    try {
      tours = await getTours();
    } catch (e) {
      console.error('[VoiceBot] Error calling getTours:', e);
      return null;
    }

    console.log(`[VoiceBot] Loaded tours count: ${Array.isArray(tours) ? tours.length : 0}`);
    
    if (!Array.isArray(tours) || tours.length === 0) {
      console.warn('[VoiceBot] No tours available to match.');
      return null;
    }

    const spoken = normalize(spokenRaw || '');
    if (!spoken) return null;

    const spokenWords = spoken.split(' ').filter(w => w.length > 1);
    
    let best = null; 
    let bestScore = Infinity; 
    
    for (const tour of tours) {
      const name = normalize(tour.name || '');
      const keywords = (tour.keywords || []).map(k => normalize(k));
      
      // 1. Exact match
      if (name === spoken || keywords.includes(spoken)) {
        return tour;
      }
      
      // 2. Contains match
      if (name && (spoken.includes(name) || name.includes(spoken))) {
        return tour;
      }
      
      // 3. Keyword overlap (Logic cũ của bạn khá ổn, tôi tinh chỉnh nhẹ)
      let tourScore = Infinity;
      
      // Check overlap với tên tour
      if (name) {
        const nameWords = name.split(' ').filter(w => w.length > 1);
        const commonWords = spokenWords.filter(sw => nameWords.includes(sw));
        
        // Nếu khớp được ít nhất 2 từ hoặc 50% số từ
        if (commonWords.length >= 2 || (nameWords.length > 0 && commonWords.length/nameWords.length >= 0.5)) {
           // Score càng thấp càng tốt. Lấy độ lệch độ dài làm score
           const score = Math.abs(nameWords.length - commonWords.length);
           if (score < bestScore) {
             bestScore = score;
             best = tour;
           }
           continue; // Đã tìm thấy match tiềm năng, skip fuzzy check
        }
      }
      
      // 4. Fuzzy match fallback
      if (name) {
        const dist = levenshtein(name, spoken);
        const norm = dist / Math.max(1, Math.max(name.length, spoken.length));
        if (norm < 0.4 && norm < bestScore) { // Siết chặt fuzzy hơn chút (0.4) cho tour
          bestScore = norm;
          best = tour;
        }
      }
    }
    
    // Chỉ trả về nếu điểm số đủ tin cậy (Với logic overlap ở trên, bestScore thường là số nguyên nhỏ)
    if (best) {
       console.log('[VoiceBot] Tour matched:', best.name, 'Score:', bestScore);
       return best;
    }
    
    return null;
  }

  // ---- TTS via backend /tts/generate ----
  async function speakViaServer(text, sceneId = null) {
    if (!tts || !tts.enabled) return false;
    if (!tts.useGoogle) return false;

    try {
      // Backend route is /tts/generate (not /api/tts/generate)
      // Nginx proxies /tts/ to backend:5000
      // So we call /tts/generate directly (not through /api)
      const endpoint = '/tts/generate';
      console.log('[TTS] Calling endpoint:', endpoint);
      
      const payload = { text };
      if (sceneId) payload.sceneId = sceneId;
      if (tts.voice) payload.voice = tts.voice;
      
      console.log('[TTS] Request payload:', payload);
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('[TTS] Response status:', res.status, res.statusText);

      if (!res.ok) {
        const errorText = await res.text();
        console.error('[TTS] Server error:', errorText);
        throw new Error('TTS server responded ' + res.status + ' ' + res.statusText + ': ' + errorText);
      }
      
      const j = await res.json();
      console.log('[TTS] Response data:', j);
      
      if (!j || !j.url) throw new Error('Invalid TTS response: ' + JSON.stringify(j));

      // Handle both absolute and relative URLs
      let audioUrl = j.url;
      if (!audioUrl.startsWith('http')) {
        // If relative URL starting with /uploads/, use it directly (Nginx proxies /uploads/ to backend)
        // Don't prepend BASE if it's /uploads/ because Nginx handles it
        if (j.url.startsWith('/uploads/')) {
          audioUrl = window.location.origin + j.url;
        } else {
          // For other relative URLs, prepend baseUrl or use current origin
          audioUrl = (BASE || window.location.origin) + (j.url.startsWith('/') ? j.url : '/' + j.url);
        }
      }
      
      console.log('[TTS] Audio URL:', audioUrl);

      // Try to play the audio and wait for it to finish
      try {
        const a = new Audio(audioUrl);
        a.onerror = (e) => {
          console.error('[TTS] Audio playback error:', e);
        };
        await a.play();
        console.log('[TTS] Audio playing successfully');
        
        // Wait for audio to finish playing
        return new Promise((resolve) => {
          a.onended = () => {
            console.log('[TTS] Audio playback completed');
            resolve(true);
          };
          a.onerror = () => {
            console.error('[TTS] Audio playback error');
            resolve(false);
          };
          // Fallback timeout (max 30 seconds)
          setTimeout(() => {
            console.warn('[TTS] Audio playback timeout');
            resolve(true); // Assume it played
          }, 30000);
        });
      } catch (playErr) {
        console.warn('[TTS] Direct play failed, trying blob method:', playErr);
        // If direct play failed, try fetching blob and playing objectURL (helps CORS/content-type issues)
        try {
          const b = await fetch(audioUrl).then(r => {
            if (!r.ok) throw new Error('Failed to fetch audio: ' + r.status);
            return r.blob();
          });
          const obj = URL.createObjectURL(b);
          const a2 = new Audio(obj);
          a2.onerror = (e) => {
            console.error('[TTS] Blob audio playback error:', e);
            URL.revokeObjectURL(obj);
          };
          await a2.play();
          console.log('[TTS] Audio playing via blob successfully');
          
          // Wait for audio to finish playing
          return new Promise((resolve) => {
            a2.onended = () => {
              console.log('[TTS] Blob audio playback completed');
              URL.revokeObjectURL(obj);
              resolve(true);
            };
            a2.onerror = () => {
              console.error('[TTS] Blob audio playback error');
              URL.revokeObjectURL(obj);
              resolve(false);
            };
            // Fallback timeout (max 30 seconds)
            setTimeout(() => {
              console.warn('[TTS] Blob audio playback timeout');
              URL.revokeObjectURL(obj);
              resolve(true); // Assume it played
            }, 30000);
          });
        } catch (err2) {
          console.error('[TTS] Blob playback also failed:', err2);
          return false;
        }
      }
    } catch (err) {
      console.error('[TTS] speakViaServer failed:', err);
      return false;
    }
  }

  // ---- Fallback TTS (browser) ----
  function speakBrowser(text) {
    if (!text || !tts || !tts.enabled) return;
    if ('speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel(); // Cancel any ongoing speech
        const u = new SpeechSynthesisUtterance(text);
        u.lang = recognitionConfig.lang || 'vi-VN';
        u.rate = 1.0;
        u.pitch = 1.0;
        u.volume = 1.0;
        
        // Try to find Vietnamese voice
        const voices = window.speechSynthesis.getVoices();
        const viVoice = voices.find(v => v.lang.startsWith('vi') || v.name.includes('Vietnamese'));
        if (viVoice) {
          u.voice = viVoice;
        }
        
        u.onerror = (e) => {
          console.warn('speechSynthesis error:', e);
        };
        
        window.speechSynthesis.speak(u);
      } catch (e) { 
        console.warn('speechSynthesis error', e); 
      }
    } else {
      console.warn('Browser TTS not supported');
    }
  }

  async function speak(text, sceneId = null) {
    if (!text || !tts || !tts.enabled) return Promise.resolve();
    
    // Always try Google Cloud TTS first if enabled
    if (tts.useGoogle) {
      try {
        const ok = await speakViaServer(text, sceneId);
        if (ok) {
          console.log('[TTS] Successfully used Google Cloud TTS');
          return Promise.resolve();
        }
        console.warn('[TTS] Google Cloud TTS failed, but continuing...');
        // Don't fallback to browser TTS - user wants Google Cloud only
        return Promise.resolve();
      } catch (err) {
        console.error('[TTS] Google Cloud TTS error:', err);
        // Don't fallback to browser TTS - user wants Google Cloud only
        return Promise.resolve();
      }
    }
    // Only use browser TTS if Google Cloud is disabled
    return new Promise((resolve) => {
      speakBrowser(text);
      // Browser TTS doesn't have a reliable way to know when it's done
      // Estimate based on text length (roughly 150 words per minute)
      const words = text.split(/\s+/).length;
      const estimatedMs = (words / 150) * 60 * 1000;
      setTimeout(resolve, Math.max(estimatedMs, 1000));
    });
  }
function getSafeName(item) {
    if (!item) return '';
    // Nếu name là chuỗi -> dùng luôn
    if (typeof item.name === 'string') return item.name;
    // Nếu name là object (đa ngữ) -> ưu tiên vi, fallback sang en hoặc id
    if (item.name && typeof item.name === 'object') {
      return item.name.vi || item.name.en || item.id || '';
    }
    // Fallback cuối cùng
    return item.title || item.id || '';
  }
  // ---- UI ----
  function createButton() {
    const btn = document.createElement('button');
    btn.id = buttonId;
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    btn.title = 'Bật / tắt voice bot';
    btn.className = 'voice-bot-button'; // Sử dụng class từ bot.css
    btn.innerText = 'BOT';
    return btn;
  }
  function createBubble() {
    const b = document.createElement('div');
    b.id = bubbleId;
    b.className = 'voice-bot-bubble'; // Sử dụng class từ bot.css
    return b;
  }
  function showBubble(msg, autoHideMs = 3500) {
    if (!bubbleEl) return;
    bubbleEl.innerText = msg;
    bubbleEl.style.display = 'block';
    if (autoHideMs) setTimeout(() => { if (bubbleEl) bubbleEl.style.display = 'none'; }, autoHideMs);
  }

  // ---- Recognition ----
  function initRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    if (!SpeechRecognition) { 
      supported = false; 
      console.warn('SpeechRecognition not available'); 
      showBubble('Trình duyệt không hỗ trợ nhận diện giọng nói. Vui lòng dùng Chrome hoặc Edge.');
      return null; 
    }
    
    try {
      const r = new SpeechRecognition();
      r.lang = recognitionConfig.lang || 'vi-VN';
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.continuous = false; // Stop after each result to avoid conflicts

      r.addEventListener('result', async (ev) => {
        try {
          console.log('[VoiceBot] Recognition result event:', ev);
          if (ev.results && ev.results.length > 0 && ev.results[0].length > 0) {
            const txt = ev.results[0][0].transcript;
            console.log('[VoiceBot] Heard:', txt);
            showBubble('Nghe: ' + txt, 3000);
            await handleSpokenText(txt);
          } else {
            console.warn('[VoiceBot] Empty result');
          }
        } catch (e) { 
          console.error('[VoiceBot] Recognition result handler error', e);
          showBubble('Lỗi xử lý giọng nói: ' + e.message);
        }
      });

      // Use outer scope variables
      isRestarting = false;
      recognitionState = 'idle';
      
      r.addEventListener('end', () => { 
        recognitionState = 'idle';
        // Only restart if we're still supposed to be listening
        if (listening && !isRestarting) {
          isRestarting = true;
          recognitionState = 'starting';
          setTimeout(() => {
            if (listening && recognitionState === 'starting') {
              try { 
                r.start();
                recognitionState = 'listening';
                isRestarting = false;
              } catch (e) { 
                isRestarting = false;
                recognitionState = 'idle';
                // Ignore "already started" errors - this means it's already running
                if (e.name === 'InvalidStateError' || e.message?.includes('already started')) {
                  recognitionState = 'listening'; // It's actually running
                  // Don't log or stop - this is fine
                } else {
                  console.warn('recognition restart failed', e);
                  // Only stop on real errors
                  if (e.name === 'NotAllowedError' || e.name === 'NotReadableError') {
                    listening = false;
                    recognitionState = 'idle';
                    if (btnEl) {
                      btnEl.setAttribute('aria-pressed', 'false');
                      btnEl.innerText = 'BOT';
                    }
                    showBubble('Không thể truy cập microphone. Vui lòng kiểm tra quyền truy cập.');
                  }
                }
              } 
            } else {
              isRestarting = false;
              recognitionState = 'idle';
            }
          }, 500); // Delay to avoid rapid restarts
        }
      });
      
      let lastErrorTime = 0;
      r.addEventListener('error', (e) => { 
        const errorMsg = e.error || 'unknown';
        const now = Date.now();
        
        // Throttle error logging to avoid spam
        if (now - lastErrorTime < 1000) {
          return; // Ignore rapid repeated errors
        }
        lastErrorTime = now;
        
        console.warn('recognition error', errorMsg, e);
        
        // Ignore 'aborted' errors - these are usually from normal stop/restart cycles
        if (errorMsg === 'aborted') {
          recognitionState = 'idle';
          return; // Don't show error or restart for aborted
        }
        
        // Update state on error
        if (errorMsg === 'no-speech') {
          recognitionState = 'idle'; // Will restart automatically via 'end' event
        } else {
          recognitionState = 'idle'; // Most errors reset to idle
        }
        
        let userMsg = 'Lỗi voice: ' + errorMsg;
        
        // Translate common errors
        if (errorMsg === 'no-speech') {
          userMsg = 'Không nghe thấy giọng nói. Vui lòng nói lại.';
        } else if (errorMsg === 'audio-capture') {
          userMsg = 'Không thể truy cập microphone. Vui lòng kiểm tra quyền truy cập.';
          listening = false;
          if (btnEl) {
            btnEl.setAttribute('aria-pressed', 'false');
            btnEl.innerText = 'BOT';
          }
        } else if (errorMsg === 'not-allowed') {
          userMsg = 'Microphone bị chặn. Vui lòng cho phép truy cập microphone.';
          listening = false;
          if (btnEl) {
            btnEl.setAttribute('aria-pressed', 'false');
            btnEl.innerText = 'BOT';
          }
        } else if (errorMsg === 'network') {
          userMsg = 'Lỗi kết nối. Vui lòng kiểm tra internet.';
        } else if (errorMsg === 'service-not-allowed') {
          userMsg = 'Dịch vụ nhận diện giọng nói không khả dụng.';
          listening = false;
          if (btnEl) {
            btnEl.setAttribute('aria-pressed', 'false');
            btnEl.innerText = 'BOT';
          }
        }
        
        showBubble(userMsg);
        
        // Auto restart only for recoverable errors, and only if not already restarting
        if (listening && (errorMsg === 'no-speech' || errorMsg === 'network') && !isRestarting) {
          setTimeout(() => {
            if (listening && !isRestarting) {
              try { 
                r.start(); 
              } catch (err) { 
                console.warn('Auto-restart failed', err);
              }
            }
          }, 2000); // Longer delay for error recovery
        }
      });
      
      r.addEventListener('start', () => {
        console.log('[VoiceBot] Speech recognition started event');
        recognitionState = 'listening';
        isRestarting = false;
        showBubble('Đang nghe...', 2000);
      });
      
      console.log('[VoiceBot] Recognition object created successfully');
      return r;
    } catch (e) {
      console.error('[VoiceBot] Failed to initialize SpeechRecognition:', e);
      supported = false;
      showBubble('Không thể khởi tạo nhận diện giọng nói: ' + e.message);
      return null;
    }
  }

  async function navigateToSceneStepByStep(fromSceneId, toSceneId, scenes, getGraph = null, silent = false) {
    if (!fromSceneId || !toSceneId) {
      await onGotoScene(toSceneId);
      return;
    }

    if (fromSceneId === toSceneId) {
      return; // Already at target
    }

    // Try to get graph from minimap or build from scenes
    let graph = null;
    if (getGraph && typeof getGraph === 'function') {
      graph = getGraph();
    }

    // If no graph provided, build from scenes
    if (!graph || !graph.nodes || !graph.edges) {
      graph = { nodes: [], edges: [] };
      const sceneMap = {};
      
      scenes.forEach(s => {
        sceneMap[s.id] = s;
        graph.nodes.push({ id: s.id });
        (s.hotspots || []).forEach(h => {
          if (h.target) {
            graph.edges.push({ from: s.id, to: h.target });
          }
        });
      });
    }

    // Find path using BFS
    function findPath(start, goal) {
      if (start === goal) return [start];
      const q = [[start]];
      const visited = new Set([start]);
      const adj = {};
      
      // Build adjacency list
      graph.edges.forEach(e => {
        if (!adj[e.from]) adj[e.from] = [];
        if (!adj[e.to]) adj[e.to] = [];
        adj[e.from].push(e.to);
        adj[e.to].push(e.from);
      });

      while (q.length) {
        const path = q.shift();
        const node = path[path.length - 1];
        const neighbors = adj[node] || [];
        
        for (const n of neighbors) {
          if (visited.has(n)) continue;
          const newPath = path.concat(n);
          if (n === goal) return newPath;
          visited.add(n);
          q.push(newPath);
        }
      }
      return null;
    }

    const path = findPath(fromSceneId, toSceneId);
    if (!path || path.length === 0) {
      // No path found, try direct navigation
      if (!silent) {
        showBubble(`Không tìm thấy đường. Chuyển trực tiếp đến: ${toSceneId}`);
      }
      await onGotoScene(toSceneId);
      return;
    }

    // Navigate step by step
    // Chỉ nói "Đang tìm đường" nếu không phải silent mode (khi đang trong tour)
    if (!silent) {
      const sceneMap = {};
      scenes.forEach(s => { sceneMap[s.id] = s; });
      
      // Dùng getSafeName để lấy tên chuỗi thay vì object
      const targetScene = sceneMap[toSceneId];
      const targetName = getSafeName(targetScene) || toSceneId;
      
      showBubble(`Đang tìm đường đến: ${targetName}`);
      if (tts && tts.enabled) await speak(`Đang tìm đường đến ${targetName}`);
    }
    
    // Use onPathPlay to navigate step by step
    try {
      await onPathPlay(path);
    } catch (e) {
      console.warn('onPathPlay error', e);
      // Fallback: navigate directly
      await onGotoScene(toSceneId);
    }
  }

  // Helper function to speak scene name + floor + custom voice when arriving at a scene
  // Helper: Đọc tên scene và tầng khi đến nơi
  // skipFloor: Nếu true, không nói tầng (dùng khi đang trong tour, đã giới thiệu tầng rồi)
  async function speakSceneIntro(sceneId, skipFloor = false) {
    try {
      const allScenes = getScenes();
      const scene = allScenes.find(s => s.id === sceneId);
      if (!scene) return;
      
      // 1. Lấy tên chuẩn
      const sceneName = getSafeName(scene);
      
      // 2. Xử lý tên tầng (Logic tùy chỉnh cho dự án 360)
      const floorNum = scene.floor ?? 0;
      let floorLabel = '';
      if (floorNum === 0) floorLabel = 'tầng trệt';
      else if (floorNum === 5.5) floorLabel = 'tầng lửng 5'; // Ví dụ đặc thù
      else floorLabel = `tầng ${floorNum}`;
      
      // 3. Ưu tiên: voiceIntro (file riêng) > voice (link) > Tự tổng hợp lời thoại
      if (scene.voiceIntro) {
        console.log('[VoiceBot] Speaking custom intro');
        if (tts && tts.enabled) await speak(scene.voiceIntro);
        return;
      }
      
      if (scene.voice) {
        if (tts && tts.enabled) await speak(scene.voice);
        return;
      }
      
      // 4. Tự tạo lời thoại nếu không có file ghi âm sẵn
      // Nếu skipFloor = true (đang trong tour), chỉ nói tên phòng
      let infoText = '';
      if (skipFloor) {
        infoText = `Đây là ${sceneName}`;
      } else {
        infoText = `Đây là ${sceneName}, nằm tại ${floorLabel}`;
      }
      console.log('[VoiceBot] Auto speaking:', infoText);
      
      if (tts && tts.enabled) {
        await speak(infoText);
      }
    } catch (e) {
      console.warn('[VoiceBot] Error speaking scene intro:', e);
    }
  }

  async function handleSpokenText(text) {
    const normalizedText = normalize(text);
    console.log('[VoiceBot] Handling spoken text:', text, 'normalized:', normalizedText);
    
    // Stop voice recognition to avoid interference during navigation
    if (recognition && listening) {
      console.log('[VoiceBot] Stopping recognition to avoid interference');
      listening = false;
      recognitionState = 'stopping';
      try {
        recognition.stop();
        recognitionState = 'idle';
      } catch (e) {
        console.warn('[VoiceBot] Failed to stop recognition:', e);
        recognitionState = 'idle';
      }
      if (btnEl) {
        btnEl.setAttribute('aria-pressed', 'false');
        btnEl.innerText = 'BOT';
      }
    }
    
    // Check if user explicitly wants to see multiple rooms/scenes (tour request)
    // Keywords that indicate user wants to see multiple places, not just one scene
    const tourKeywords = [
      'tour', 'tham quan', 'xem tour',
      'cac phong', 'các phòng', 'xem cac phong', 'xem các phòng',
      'phong cua', 'phòng của', 'cac phong cua', 'các phòng của',
      'danh sach phong', 'danh sách phòng',
      'tat ca phong', 'tất cả phòng', 'xem tat ca', 'xem tất cả',
      'toan bo', 'toàn bộ', 'xem toan bo', 'xem toàn bộ',
      'moi phong', 'mọi phòng', 'xem moi phong', 'xem mọi phòng',
      'nhieu phong', 'nhiều phòng', 'xem nhieu phong', 'xem nhiều phòng'
    ];
    
    const hasTourKeyword = tourKeywords.some(keyword => normalizedText.includes(keyword));
    console.log('[VoiceBot] Has tour keyword:', hasTourKeyword);
    
    // Find both scene and tour
    // Only search for tour if user explicitly has tour keywords
    const scene = findBestSceneMatch(text);
    const tour = hasTourKeyword ? await findBestTourMatch(text) : null;
    
    console.log('[VoiceBot] Scene match result:', scene ? (scene.name || scene.id) : 'null');
    console.log('[VoiceBot] Tour match result:', tour ? tour.name : 'null');
    
    // Handle case where both scene and tour match (harmonious approach)
    if (scene && tour) {
      const tourScenes = tour.scenes || [];
      const sceneInTour = tourScenes.includes(scene.id);
      
      if (hasTourKeyword) {
        // User muốn chạy tour ngay: "Tour khoa công nghệ"
        // Cải thiện câu giới thiệu tour để tự nhiên hơn
        const tourName = getSafeName(tour) || tour.name || 'tour';
        const introMessage = `Bắt đầu thăm quan các phòng thuộc ${tourName}`;
        showBubble(introMessage);
        if (tts && tts.enabled) await speak(introMessage);
        
        // --- TOUR THEO TẦNG ---
        let current = getCurrentSceneId() || tourScenes[0];
        const scenes = getScenes();
        
        // Nhóm scenes theo tầng
        const scenesByFloor = {};
        tourScenes.forEach(sceneId => {
          const scene = scenes.find(s => s.id === sceneId);
          if (scene) {
            const floor = scene.floor ?? 0;
            if (!scenesByFloor[floor]) {
              scenesByFloor[floor] = [];
            }
            scenesByFloor[floor].push(sceneId);
          }
        });
        
        // Sắp xếp các tầng (từ thấp đến cao)
        const floors = Object.keys(scenesByFloor).map(Number).sort((a, b) => a - b);
        
        console.log('[VoiceBot] Tour grouped by floors:', floors.map(f => `Tầng ${f}: ${scenesByFloor[f].length} scenes`));
        
        // Duyệt qua từng tầng
        for (let floorIdx = 0; floorIdx < floors.length; floorIdx++) {
          const floor = floors[floorIdx];
          const floorScenes = scenesByFloor[floor];
          
          // 1. Giới thiệu tầng
          const floorName = floor === 0 ? 'tầng trệt' : `tầng ${floor}`;
          const sceneCount = floorScenes.length;
          const sceneNames = floorScenes.map(id => {
            const s = scenes.find(sc => sc.id === id);
            return getSafeName(s);
          }).filter(Boolean);
          
          // Cải thiện câu giới thiệu tầng để tự nhiên hơn
          let floorIntro = '';
          if (floorIdx === 0) {
            // Tầng đầu tiên
            floorIntro = `Đầu tiên, ở ${floorName} có ${sceneCount} ${sceneCount === 1 ? 'phòng' : 'phòng'}: ${sceneNames.join(', ')}.`;
          } else {
            // Các tầng tiếp theo
            floorIntro = `Tiếp đến, ở ${floorName} có ${sceneCount} ${sceneCount === 1 ? 'phòng' : 'phòng'}: ${sceneNames.join(', ')}.`;
          }
          
          showBubble(floorIntro);
          if (tts && tts.enabled) {
            await speak(floorIntro);
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          // 2. Di chuyển và giới thiệu từng scene trong tầng
          for (let sceneIdx = 0; sceneIdx < floorScenes.length; sceneIdx++) {
            const targetSceneId = floorScenes[sceneIdx];
            
            try {
              // Di chuyển với path visualization (silent mode để không nói "Đang tìm đường")
              if (current && current !== targetSceneId) {
                await navigateToSceneStepByStep(current, targetSceneId, scenes, getGraph, true);
              } else if (!current) {
                await onGotoScene(targetSceneId);
              }
              current = targetSceneId;
              
              // Giới thiệu scene (chỉ tên, không nói tầng vì đã giới thiệu tầng rồi)
              await speakSceneIntro(targetSceneId, true);
              
              // Nghỉ ngơi (trừ scene cuối cùng của tầng cuối)
              const isLastSceneOfLastFloor = (floorIdx === floors.length - 1 && sceneIdx === floorScenes.length - 1);
              if (!isLastSceneOfLastFloor) {
                await new Promise(resolve => setTimeout(resolve, 2000));
              }
            } catch (e) { break; }
          }
          
          // 3. Nếu chưa phải tầng cuối, thông báo chuyển tầng
          if (floorIdx < floors.length - 1) {
            const nextFloor = floors[floorIdx + 1];
            const nextFloorName = nextFloor === 0 ? 'tầng trệt' : `tầng ${nextFloor}`;
            const transitionMsg = `Bây giờ chúng ta sẽ lên ${nextFloorName}.`;
            
            showBubble(transitionMsg);
            if (tts && tts.enabled) {
              await speak(transitionMsg);
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        }
        
        showBubble(`Hoàn thành cuộc thăm quan: ${tour.name}`);
        if (tts && tts.enabled) await speak(`Hoàn thành thăm quan ${tour.name}`);
        return;
        
      } else if (sceneInTour) {
        // Scene is part of the tour - go to scene first, then offer/start tour
        const targetId = scene.id;
        const currentSceneId = getCurrentSceneId();
        const scenes = getScenes();
        
        showBubble(`Đến ${scene.name || targetId}. Bắt đầu tour ${tour.name}...`);
        
        if (tts && tts.enabled) {
          await speak(`Đang đến ${scene.name || targetId}`);
        }
        
        // Navigate to the scene first
        await navigateToSceneStepByStep(currentSceneId, targetId, scenes, getGraph);
        
        // Wait a moment, then start the tour from this scene
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        showBubble(`Bắt đầu tour: ${tour.name}`);
        if (tts && tts.enabled) {
          await speak(`Bắt đầu tour ${tour.name}`);
        }
        
        // Tìm tầng của scene hiện tại và tiếp tục tour từ đó
        const currentScene = scenes.find(s => s.id === targetId);
        if (currentScene) {
          const currentFloor = currentScene.floor ?? 0;
          
          // Nhóm scenes theo tầng
          const scenesByFloor = {};
          tourScenes.forEach(sceneId => {
            const scene = scenes.find(s => s.id === sceneId);
            if (scene) {
              const floor = scene.floor ?? 0;
              if (!scenesByFloor[floor]) {
                scenesByFloor[floor] = [];
              }
              scenesByFloor[floor].push(sceneId);
            }
          });
          
          // Sắp xếp các tầng
          const floors = Object.keys(scenesByFloor).map(Number).sort((a, b) => a - b);
          
          // Tìm index của tầng hiện tại
          const currentFloorIdx = floors.indexOf(currentFloor);
          if (currentFloorIdx >= 0) {
            // Bắt đầu từ tầng hiện tại
            let current = targetId;
            
            for (let floorIdx = currentFloorIdx; floorIdx < floors.length; floorIdx++) {
              const floor = floors[floorIdx];
              const floorScenes = scenesByFloor[floor];
              
              // Tìm index của scene hiện tại trong tầng
              const sceneIdxInFloor = floorScenes.indexOf(targetId);
              const startSceneIdx = (floorIdx === currentFloorIdx && sceneIdxInFloor >= 0) 
                ? sceneIdxInFloor + 1 
                : 0;
              
              // Nếu là tầng đầu tiên và scene đầu tiên, giới thiệu tầng
              if (floorIdx === currentFloorIdx && startSceneIdx === 0) {
                const floorName = floor === 0 ? 'tầng trệt' : `tầng ${floor}`;
                const sceneCount = floorScenes.length;
                const sceneNames = floorScenes.map(id => {
                  const s = scenes.find(sc => sc.id === id);
                  return getSafeName(s);
                }).filter(Boolean);
                
                const floorIntro = `Ở ${floorName} có ${sceneCount} ${sceneCount === 1 ? 'phòng' : 'phòng'}: ${sceneNames.join(', ')}.`;
                showBubble(floorIntro);
                if (tts && tts.enabled) {
                  await speak(floorIntro);
                  await new Promise(resolve => setTimeout(resolve, 1000));
                }
              }
              
              // Di chuyển qua các scene còn lại trong tầng
              for (let sceneIdx = startSceneIdx; sceneIdx < floorScenes.length; sceneIdx++) {
                const targetSceneId = floorScenes[sceneIdx];
                
                try {
                  if (current && current !== targetSceneId) {
                    await navigateToSceneStepByStep(current, targetSceneId, scenes, getGraph, true);
                  }
                  current = targetSceneId;
                  
                  // Giới thiệu scene (chỉ tên, không nói tầng vì đã giới thiệu tầng rồi)
                  await speakSceneIntro(targetSceneId, true);
                  
                  const isLastSceneOfLastFloor = (floorIdx === floors.length - 1 && sceneIdx === floorScenes.length - 1);
                  if (!isLastSceneOfLastFloor) {
                    await new Promise(resolve => setTimeout(resolve, 2000));
                  }
                } catch (e) {
                  console.error('[VoiceBot] Tour navigation failed:', e);
                  break;
                }
              }
              
              // Thông báo chuyển tầng
              if (floorIdx < floors.length - 1) {
                const nextFloor = floors[floorIdx + 1];
                const nextFloorName = nextFloor === 0 ? 'tầng trệt' : `tầng ${nextFloor}`;
                const transitionMsg = `Bây giờ chúng ta sẽ lên ${nextFloorName}.`;
                
                showBubble(transitionMsg);
                if (tts && tts.enabled) {
                  await speak(transitionMsg);
                  await new Promise(resolve => setTimeout(resolve, 1500));
                }
              }
            }
          }
        }
        
        showBubble(`Hoàn thành tour: ${tour.name}`);
        if (tts && tts.enabled) {
          await speak(`Hoàn thành tour ${tour.name}`);
        }
        return;
      } else {
        // Scene exists but not in tour - just go to scene
        const targetId = scene.id;
        const currentSceneId = getCurrentSceneId();
        const scenes = getScenes();
        
        //Dùng getSafeName
        showBubble(`Chuyển tới: ${getSafeName(scene)}`);
        
        // Lệnh speak() ở đây để tránh lặp. 
        // Hàm navigateToSceneStepByStep sẽ tự nói.
        
        await navigateToSceneStepByStep(currentSceneId, targetId, scenes, getGraph);
        return;
      }
    }
    
    // Only scene found
    if (scene && !tour) {
      const targetId = scene.id;
      const currentSceneId = getCurrentSceneId();
      const scenes = getScenes();
      
      // Dùng getSafeName
      showBubble(`Chuyển tới: ${getSafeName(scene)}`);
      
      
      await navigateToSceneStepByStep(currentSceneId, targetId, scenes, getGraph);
      return;
    }
    
    // Chỉ tìm thấy tour (hoặc người dùng đã yêu cầu tour một cách rõ ràng)
    if (tour && (!scene || hasTourKeyword)) {
      // Cải thiện câu giới thiệu tour để tự nhiên hơn
      const tourName = getSafeName(tour) || tour.name || 'tour';
      const introMessage = `Bắt đầu thăm quan các phòng thuộc ${tourName}`;
      showBubble(introMessage);
      if (tts && tts.enabled) {
        await speak(introMessage);
      }
      
      const tourScenes = tour.scenes || [];
      if (tourScenes.length === 0) {
        showBubble('Tour không có scene nào.');
        return;
      }

      // Xác định điểm bắt đầu
      const currentSceneId = getCurrentSceneId();
      let startIndex = 0;
      
      // Nếu user đang đứng ở 1 điểm trong tour, bắt đầu từ đó luôn (thông minh hơn)
      if (tourScenes.includes(currentSceneId)) {
          startIndex = tourScenes.indexOf(currentSceneId);
      } else {
          // Nếu không, nhảy tới điểm đầu tiên
          try { await onGotoScene(tourScenes[0]); } catch(e){}
      }
      
      console.log('[VoiceBot] Starting tour loop from index:', startIndex);

      // --- TOUR THEO TẦNG ---
      const scenes = getScenes();
      
      // Nhóm scenes theo tầng
      const scenesByFloor = {};
      tourScenes.forEach(sceneId => {
        const scene = scenes.find(s => s.id === sceneId);
        if (scene) {
          const floor = scene.floor ?? 0;
          if (!scenesByFloor[floor]) {
            scenesByFloor[floor] = [];
          }
          scenesByFloor[floor].push(sceneId);
        }
      });
      
      // Sắp xếp các tầng (từ thấp đến cao)
      const floors = Object.keys(scenesByFloor).map(Number).sort((a, b) => a - b);
      
      console.log('[VoiceBot] Tour grouped by floors:', floors.map(f => `Tầng ${f}: ${scenesByFloor[f].length} scenes`));
      
      let current = currentSceneId;
      
      // Duyệt qua từng tầng
      for (let floorIdx = 0; floorIdx < floors.length; floorIdx++) {
        const floor = floors[floorIdx];
        const floorScenes = scenesByFloor[floor];
        
        // 1. Giới thiệu tầng
        const floorName = floor === 0 ? 'tầng trệt' : `tầng ${floor}`;
        const sceneCount = floorScenes.length;
        const sceneNames = floorScenes.map(id => {
          const s = scenes.find(sc => sc.id === id);
          return getSafeName(s);
        }).filter(Boolean);
        
        // Cải thiện câu giới thiệu tầng để tự nhiên hơn
        let floorIntro = '';
        if (floorIdx === 0) {
          // Tầng đầu tiên
          floorIntro = `Đầu tiên, ở ${floorName} có ${sceneCount} ${sceneCount === 1 ? 'phòng' : 'phòng'}: ${sceneNames.join(', ')}.`;
        } else {
          // Các tầng tiếp theo
          floorIntro = `Tiếp đến, ở ${floorName} có ${sceneCount} ${sceneCount === 1 ? 'phòng' : 'phòng'}: ${sceneNames.join(', ')}.`;
        }
        
        showBubble(floorIntro);
        if (tts && tts.enabled) {
          await speak(floorIntro);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Nghỉ 1 giây sau giới thiệu tầng
        }
        
        // 2. Di chuyển và giới thiệu từng scene trong tầng
        for (let sceneIdx = 0; sceneIdx < floorScenes.length; sceneIdx++) {
          const targetSceneId = floorScenes[sceneIdx];
          
          try {
            // Di chuyển với path visualization (silent mode để không nói "Đang tìm đường")
            if (current && current !== targetSceneId) {
              await navigateToSceneStepByStep(current, targetSceneId, scenes, getGraph, true);
            } else if (!current) {
              await onGotoScene(targetSceneId);
            }
            current = targetSceneId;
            
            // Giới thiệu scene (chỉ tên, không nói tầng vì đã giới thiệu tầng rồi)
            await speakSceneIntro(targetSceneId, true);
            
            // Nghỉ ngơi để ngắm cảnh (trừ scene cuối cùng của tầng cuối)
            const isLastSceneOfLastFloor = (floorIdx === floors.length - 1 && sceneIdx === floorScenes.length - 1);
            if (!isLastSceneOfLastFloor) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
            
          } catch (e) {
            console.error('[VoiceBot] Tour navigation failed:', e);
            break;
          }
        }
        
        // 3. Nếu chưa phải tầng cuối, thông báo chuyển tầng
        if (floorIdx < floors.length - 1) {
          const nextFloor = floors[floorIdx + 1];
          const nextFloorName = nextFloor === 0 ? 'tầng trệt' : `tầng ${nextFloor}`;
          const transitionMsg = `Bây giờ chúng ta sẽ lên ${nextFloorName}.`;
          
          showBubble(transitionMsg);
          if (tts && tts.enabled) {
            await speak(transitionMsg);
            await new Promise(resolve => setTimeout(resolve, 1500));
          }
        }
      }
      
      showBubble(`Hoàn thành tour: ${tour.name}`);
      if (tts && tts.enabled) {
        await speak(`Đã kết thúc tour tham quan ${tour.name}`);
      }
      return;
    }
    
    // No match found
    showBubble('Không tìm thấy scene hoặc tour tương ứng. Hãy thử lại.');
    if (tts && tts.enabled) {
      await speak('Không tìm thấy địa điểm hoặc tour. Mời bạn thử lại');
    }
  }

  // ---- Public API ----
  let btnEl = null, bubbleEl = null;

  function mountUI() {
    btnEl = document.getElementById(buttonId) || createButton();
    bubbleEl = document.getElementById(bubbleId) || createBubble();
    if (!document.getElementById(buttonId)) container.appendChild(btnEl);
    if (!document.getElementById(bubbleId)) container.appendChild(bubbleEl);

    btnEl.addEventListener('click', async () => {
      console.log('[VoiceBot] Button clicked, supported:', supported, 'recognition:', recognition ? 'OK' : 'NULL', 'listening:', listening, 'state:', recognitionState);
      
      if (!supported) { 
        console.warn('[VoiceBot] Not supported');
        showBubble('Trình duyệt không hỗ trợ nhận diện giọng nói. Vui lòng dùng Chrome hoặc Edge.'); 
        return; 
      }
      
      if (!recognition) {
        console.error('[VoiceBot] Recognition not initialized');
        showBubble('Voice recognition chưa được khởi tạo. Vui lòng tải lại trang.');
        return;
      }
      
      listening = !listening;
      btnEl.setAttribute('aria-pressed', String(listening));
      btnEl.innerText = listening ? 'ON' : 'BOT';
      console.log('[VoiceBot] Listening set to:', listening);
      
      if (listening) { 
        showBubble('Đang nghe... ');
        // Check if already started
        if (recognitionState === 'listening' || recognitionState === 'starting') {
          console.log('[VoiceBot] Recognition already active, skipping start');
          return;
        }
        try { 
          recognitionState = 'starting';
          console.log('[VoiceBot] Starting recognition...');
          recognition.start();
          console.log('[VoiceBot] Recognition start() called');
        } catch (startErr) {
          recognitionState = 'idle';
          console.error('[VoiceBot] Start error:', startErr);
          // If already started, that's fine - just update state
          if (startErr.name === 'InvalidStateError' || startErr.message?.includes('already started')) {
            recognitionState = 'listening';
            console.log('[VoiceBot] Recognition already started, continuing');
          } else {
            console.warn('[VoiceBot] Failed to start recognition:', startErr);
            listening = false;
            btnEl.setAttribute('aria-pressed', 'false');
            btnEl.innerText = 'BOT';
            showBubble('Không thể bắt đầu nhận diện giọng nói. Vui lòng kiểm tra microphone.');
          }
        } 
      } else { 
        showBubble('Đã tắt voice'); 
        recognitionState = 'stopping';
        console.log('[VoiceBot] Stopping recognition...');
        try { 
          recognition.stop(); 
          recognitionState = 'idle';
          console.log('[VoiceBot] Recognition stopped');
        } catch (e) { 
          // Ignore stop errors - recognition might already be stopped
          recognitionState = 'idle';
          console.warn('[VoiceBot] Failed to stop recognition (may already be stopped):', e);
        } 
      }
    });

    btnEl.addEventListener('dblclick', () => { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); showBubble('Đã hủy mọi TTS'); });
  }

  function unmount() { 
    try { 
      if (recognition) { 
        recognition.stop(); 
        recognition = null; 
      } 
    } catch (e) { 
      console.warn('Error unmounting recognition:', e);
    } 
    if (btnEl && btnEl.parentNode) btnEl.parentNode.removeChild(btnEl); 
    if (bubbleEl && bubbleEl.parentNode) bubbleEl.parentNode.removeChild(bubbleEl); 
  }

  async function mount() { 
    console.log('[VoiceBot] Mounting...');
    recognition = initRecognition(); 
    console.log('[VoiceBot] Recognition initialized:', recognition ? 'OK' : 'FAILED');
    console.log('[VoiceBot] Supported:', supported);
    
    mountUI(); 
    console.log('[VoiceBot] UI mounted, button:', btnEl ? 'OK' : 'FAILED');
    // Listen for cross-tab tour updates (BroadcastChannel preferred, fallback to storage event)
    try {
      if (window.BroadcastChannel) {
        const bc = new BroadcastChannel('cms_updates');
        bc.addEventListener('message', (ev) => {
          if (ev && ev.data === 'tours-updated') refreshTours();
        });
      }
    } catch (e) { console.warn('BroadcastChannel not available', e); }

    window.addEventListener('storage', (e) => {
      if (e.key === 'tours-updated') refreshTours();
    });
    window.addEventListener('tours-updated', () => refreshTours());

    // Preload tours once
    try { refreshTours(); } catch (e) {}
    
    // Load voices for browser TTS (some browsers need this)
    if ('speechSynthesis' in window) {
      // Chrome needs voices to be loaded
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener('voiceschanged', () => {
          console.log('[VoiceBot] Voices loaded:', window.speechSynthesis.getVoices().length);
        });
      }
    }
    
    return { btnEl, bubbleEl, recognition }; 
  }

  return { mount, unmount, isListening: () => listening, isSupported: () => supported, handleText: async (text) => await handleSpokenText(text) };
}
