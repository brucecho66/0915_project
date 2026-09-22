import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

export const Layout: React.FC = () => {
  return (
    <div className="app-layout">
      <Navbar />
      <main className="main-container">
        <Outlet />
      </main>
      <footer style={{ borderTop: '1px solid var(--border)', padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        <p>© 2026 커뮤니티 보드 프로젝트. All rights reserved. · <a href="/admin/login" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>관리자 포털</a></p>
      </footer>
    </div>
  );
};
