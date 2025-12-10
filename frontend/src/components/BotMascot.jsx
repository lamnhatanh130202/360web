// src/components/BotMascot.jsx
import React, { useEffect, useState } from 'react';
import { botInit, botPath, botNarration } from '../bot/botService';
import useSpeech from '../bot/useSpeech';

export default function BotMascot({ onOpenScene }) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [faculties, setFaculties] = useState([]);
  const [greeting, setGreeting] = useState('');
  const { speak, stop } = useSpeech();

  useEffect(() => {
    let mounted = true;
    botInit()
      .then(data => {
        if (!mounted) return;
        setGreeting(data.greeting || 'Xin chào');
        setFaculties(data.faculties || []);
        setLoading(false);
        // auto-speak greeting
        if (data.greeting) speak(data.greeting);
      })
      .catch(err => {
        console.error('botInit error', err);
        setGreeting('Xin chào!'); setLoading(false);
      });
    return () => { mounted = false; stop(); };
  }, []);

  async function handleFacultyClick(facId) {
    // faculties here only contain id and name and count.
    // We'll present scenes in a simple flow: ask backend for scenes via /api/scenes or use onOpenScene to open first scene.
    setOpen(false);
    // try to fetch scenes list from /api/scenes and pick first scene that starts with facId_
    try {
      const res = await fetch('/api/scenes');
      const scenes = await res.json();
      const candidate = scenes.find(s => s.id && s.id.startsWith(facId + '_'));
      if (candidate) {
        // open the scene directly and speak narration
        onOpenScene(candidate.id);
        const narr = await botNarration(candidate.id);
        if (narr && narr.narration) speak(narr.narration);
      } else {
        // fallback: speak message
        speak(`Không tìm thấy scene cho khoa ${facId}`);
      }
    } catch (e) {
      console.error(e);
      speak('Lỗi lấy dữ liệu scenes.');
    }
  }

  async function handleGoTo(from, to) {
    try {
      const r = await botPath(from, to);
      if (!r.ok) {
        speak('Không tìm thấy đường đi.');
        return;
      }
      const path = r.path || [];
      // sequentially open scenes with small delay
      for (let i = 0; i < path.length; i++) {
        const sid = path[i];
        onOpenScene(sid);
        // fetch narration per scene and speak
        const narr = await botNarration(sid);
        if (narr && narr.narration) speak(narr.narration);
        // wait a bit for UX animation (1s)
        await new Promise(res => setTimeout(res, 1200));
      }
    } catch (e) {
      console.error('handleGoTo error', e);
      speak('Lỗi khi tìm đường.');
    }
  }

  if (!open) return null;
  return (
    <div style={{
      position: 'fixed', right: 16, bottom: 16, zIndex: 9999,
      width: 320, background: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
      borderRadius: 12, padding: 12, fontFamily: 'sans-serif'
    }}>
      <div style={{display:'flex', gap:12}}>
        <img src="/assets/mascot.png" alt="mascot" style={{width:72,height:72,objectFit:'cover'}}/>
        <div style={{flex:1}}>
          <div style={{fontWeight:700}}>{loading ? 'Đang tải...' : 'Trợ lý AI'}</div>
          <div style={{fontSize:13, color:'#444', marginTop:6}}>{greeting}</div>
          <div style={{marginTop:8, display:'flex', gap:8, flexWrap:'wrap'}}>
            <button onClick={() => setOpen(false)} style={{padding:'6px 10px'}}>Đóng</button>
          </div>
        </div>
      </div>

      <div style={{marginTop:12}}>
        <div style={{fontSize:13, fontWeight:600}}>Khám phá theo khoa</div>
        <div style={{marginTop:8, display:'flex', flexWrap:'wrap', gap:8}}>
          {faculties.map(f => (
            <button key={f.id}
              onClick={() => handleFacultyClick(f.id)}
              style={{padding:'8px', borderRadius:8, border:'1px solid #ddd', background:'#f7f7f7', cursor:'pointer'}}>
              {f.name || f.id} ({f.count})
            </button>
          ))}
        </div>
      </div>

      <div style={{marginTop:12, fontSize:12, color:'#666'}}>
        Hoặc nhập 2 scene id để tìm đường:
        <FindPathForm onGo={handleGoTo} />
      </div>
    </div>
  );
}

function FindPathForm({ onGo }) {
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  return (
    <div style={{marginTop:8, display:'flex', gap:8}}>
      <input value={from} onChange={e=>setFrom(e.target.value)} placeholder="from scene" style={{flex:1,padding:6}}/>
      <input value={to} onChange={e=>setTo(e.target.value)} placeholder="to scene" style={{flex:1,padding:6}}/>
      <button onClick={()=>onGo(from,to)} style={{padding:'6px 10px'}}>Go</button>
    </div>
  );
}
