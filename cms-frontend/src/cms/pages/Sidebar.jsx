import React from "react";
import { NavLink } from "react-router-dom";

const NavItem = ({ to, icon, label }) => (
  <NavLink to={to} className={({isActive}) => `sidebar-item ${isActive ? "active" : ""}`}>
    <span className="icon">{icon}</span>
    <span className="label">{label}</span>
  </NavLink>
);

export default function Sidebar() {
  return (
    <aside className="cms-sidebar">
      <div className="brand">
        <div className="logo">BDU</div>
        <div className="brand-text">CMS Admin</div>
      </div>

      <nav className="sidebar-nav">
        <NavItem to="/cms/dashboard" icon="🏠" label="Dashboard" />
        <NavItem to="/cms/scenes" icon="🗺️" label="Scenes" />
        <NavItem to="/cms/hotspots" icon="📍" label="Hotspots" />
        <NavItem to="/cms/tours" icon="🧭" label="Tours" />
      </nav>

      <div style={{padding:12, borderTop:"1px solid rgba(15,23,42,0.03)"}}>
        <NavItem to="/login" icon="🔒" label="Logout" />
        <div style={{marginTop:8, fontSize:12, color:"#9ca3af"}}>© BDU 2025</div>
      </div>
    </aside>
  );
}
