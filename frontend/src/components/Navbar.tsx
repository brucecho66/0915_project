import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { usePosts } from '../context/PostContext';
import profileImg from '../assets/images/profile.jpg';

export const Navbar: React.FC = () => {
  const { user, logout, switchToAdmin, switchToUser } = usePosts();
  const [isSwitching, setIsSwitching] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSwitchToAdmin = async () => {
    setIsSwitching(true);
    try {
      const res = await switchToAdmin();
      if (res.success) {
        navigate('/admin');
      } else {
        navigate('/admin/login');
      }
    } catch {
      navigate('/admin/login');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSwitchToUser = async () => {
    setIsSwitching(true);
    try {
      await switchToUser();
      navigate('/');
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <header className="navbar">
      <div className="nav-container">
        <Link to="/" className="nav-logo">
          <span className="logo-icon">📋</span>
          <span className="logo-text">커뮤니티 보드</span>
        </Link>

        <nav className="nav-menu">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            홈
          </NavLink>
          <NavLink to="/posts" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            게시판
          </NavLink>
          <NavLink to="/posts/create" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            새 글 쓰기
          </NavLink>
          <NavLink to="/payment" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')} style={{ color: '#2563eb', fontWeight: 600 }}>
            💳 멤버십/후원
          </NavLink>
          {user?.role === 'admin' && (
            <NavLink
              to="/admin/posts"
              className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
              style={{ color: '#2563eb', fontWeight: 700 }}
              title="관리자 전용 게시글 관리"
            >
              📝 게시글 관리
            </NavLink>
          )}
        </nav>

        <div className="nav-auth">
          {user ? (
            <div className="user-menu">
              {user.role === 'admin' ? (
                <>
                  <Link
                    to="/admin/posts"
                    className="nav-admin-badge"
                    style={{ backgroundColor: '#2563eb' }}
                    title="관리자 게시글 관리 바로가기"
                  >
                    📝 게시글 관리
                  </Link>
                  <Link to="/admin" className="nav-admin-badge" title="관리자 페이지 바로가기">
                    ⚙️ 관리자 콘솔
                  </Link>
                  <button
                    onClick={handleSwitchToUser}
                    className="nav-switch-btn"
                    title="일반 테스트 계정(홍길동)으로 전환"
                    disabled={isSwitching}
                  >
                    ⚡ 일반회원 전환
                  </button>
                </>
              ) : (
                <button
                  onClick={handleSwitchToAdmin}
                  className="nav-admin-switch-btn"
                  title=".env 관리자 계정으로 즉시 전환하여 콘솔 접속"
                  disabled={isSwitching}
                >
                  🛡️ 관리자 계정 전환
                </button>
              )}
              <Link to="/profile" className="user-greeting" title="마이페이지 / 내 정보 이동" style={{ textDecoration: 'none', color: 'inherit' }}>
                <span className="avatar-mini">
                  <img src={profileImg} alt="프로필" />
                </span>
                <span><strong>{user.username}</strong> 님</span>
              </Link>
              <Link to="/profile" className="nav-profile-btn" style={{ padding: '0.35rem 0.75rem', borderRadius: '6px', background: '#f3f4f6', color: '#374151', textDecoration: 'none', fontSize: '0.875rem', fontWeight: 600 }} title="내 정보 및 내가 쓴 글 확인">
                👤 내 정보
              </Link>
              <button onClick={handleLogout} className="btn-logout">
                로그아웃
              </button>
            </div>
          ) : (
            <div className="auth-buttons">
              <Link to="/admin/login" className="nav-switch-btn" title="관리자 로그인">
                🛡️ 관리자
              </Link>
              <Link to="/login" className="btn btn-outline">
                로그인
              </Link>
              <Link to="/register" className="btn btn-primary">
                회원가입
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
