import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import { logout, getCurrentUser } from "./utils/auth";
import "../cms/styles/cms.css";

export default function AppLayout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const isLoginPage = location.pathname === '/cms/login' || location.pathname === '/login';
  const currentUser = getCurrentUser();

  const handleLogout = () => {
    if (window.confirm('Bạn có chắc muốn đăng xuất?')) {
      logout();
      navigate('/cms/login', { replace: true });
    }
  };

  // Don't show sidebar/header on login page
  if (isLoginPage) {
    return <div>{children}</div>;
  }

  return (
    <div className="cms-app">
      <Sidebar />
      <div className="cms-main">
        <header className="cms-header">
          <div>
            <div className="cms-title">Quản trị Web360</div>
            <div className="cms-sub">Bảng điều khiển — quản lý scenes, hotspots, tours</div>
          </div>
          <div style={{display:"flex", gap:10, alignItems:"center"}}>
            <span style={{fontSize: 14, color: "var(--muted)"}}>
              {currentUser && `Xin chào, ${currentUser}`}
            </span>
            <button className="btn btn-ghost" onClick={handleLogout}>
              Đăng xuất
            </button>
          </div>
        </header>

        <div>{children}</div>
      </div>
    </div>
  );
}
