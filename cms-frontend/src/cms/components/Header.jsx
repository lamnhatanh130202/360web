// src/cms/components/Header.jsx
import React from 'react';

export default function Header() {
  return (
    <header className="cms-header">
      <div className="header-left">
        <h2>Quản trị Web360</h2>
      </div>
      <div className="header-right">
        <div className="user">
          <span className="avatar">A</span>
          <span className="username">Admin</span>
        </div>
      </div>
    </header>
  );
}
