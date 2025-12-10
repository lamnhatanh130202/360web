// src/cms/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { login, isAuthenticated } from '../utils/auth';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated()) {
      navigate('/cms/dashboard', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username.trim() || !password.trim()) {
      setError('Vui lòng nhập đầy đủ thông tin');
      setLoading(false);
      return;
    }
    const result = await login(username.trim(), password);
    
    if (result.success) {
      navigate('/cms/dashboard', { replace: true });
    } else {
      setError(result.error || 'Đăng nhập thất bại');
    }
    
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      padding: 20
    }}>
      <div style={{
        maxWidth: 420,
        width: '100%',
        background: 'white',
        borderRadius: 16,
        padding: 40,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            BDU CMS
          </div>
          <div style={{ fontSize: 14, color: '#64748b' }}>
            Đăng nhập để tiếp tục
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#0f172a',
              marginBottom: 8
            }}>
              Tên đăng nhập
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#0f172a',
              marginBottom: 8
            }}>
              Mật khẩu
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              disabled={loading}
              style={{
                width: '100%',
                padding: '12px 16px',
                fontSize: 14,
                border: '1px solid #e2e8f0',
                borderRadius: 8,
                outline: 'none',
                transition: 'border-color 0.2s',
                boxSizing: 'border-box'
              }}
              onFocus={(e) => e.target.style.borderColor = '#667eea'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
            />
          </div>

          {error && (
            <div style={{
              padding: '12px 16px',
              background: '#fee2e2',
              color: '#dc2626',
              borderRadius: 8,
              fontSize: 14,
              marginBottom: 20
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 600,
              color: 'white',
              background: loading ? '#94a3b8' : '#667eea',
              border: 'none',
              borderRadius: 8,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.2s'
            }}
            onMouseOver={(e) => {
              if (!loading) e.target.style.background = '#5568d3';
            }}
            onMouseOut={(e) => {
              if (!loading) e.target.style.background = '#667eea';
            }}
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>

          <div style={{
            marginTop: 24,
            padding: 16,
            background: '#f1f5f9',
            borderRadius: 8,
            fontSize: 12,
            color: '#64748b',
            textAlign: 'center'
          }}>
            <strong>Thông tin đăng nhập mặc định:</strong><br />
            Tên đăng nhập: <code>admin</code><br />
            Mật khẩu: <code>admin123</code>
          </div>
        </form>
      </div>
    </div>
  );
}
