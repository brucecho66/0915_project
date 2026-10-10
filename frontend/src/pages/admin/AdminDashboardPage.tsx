import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePosts } from '../../context/PostContext';
import profileImg from '../../assets/images/profile.jpg';

type AdminCategory = 'dashboard' | 'posts' | 'users' | 'comments' | 'account' | 'system';

export const AdminDashboardPage: React.FC<{ defaultCategory?: AdminCategory }> = ({
  defaultCategory = 'dashboard',
}) => {
  const {
    adminUser,
    adminLogout,
    posts,
    fetchPosts,
    deletePost,
    toggleHidePost,
    users,
    fetchUsers,
    deleteUser,
    comments,
    fetchAdminComments,
    deleteComment,
    toggleHideComment,
    updateAdminAccount,
    user,
    switchToAdmin,
  } = usePosts();

  const navigate = useNavigate();
  const effectiveAdmin = adminUser || (user?.role === 'admin' ? user : null);

  const [activeCategory, setActiveCategory] = useState<AdminCategory>(defaultCategory);
  const [postSearch, setPostSearch] = useState('');
  const [postFilter, setPostFilter] = useState<'all' | 'visible' | 'hidden'>('all');
  const [userSearch, setUserSearch] = useState('');
  const [userRoleFilter, setUserRoleFilter] = useState<'all' | 'admin' | 'user' | 'user_only' | 'profile_only'>('all');
  const [commentSearch, setCommentSearch] = useState('');
  const [commentFilter, setCommentFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  // defaultCategory 변경 시 (URL 라우트 변경 등) 탭 동기화
  useEffect(() => {
    if (defaultCategory) {
      setActiveCategory(defaultCategory);
    }
  }, [defaultCategory]);

  // 관리자 대시보드 진입 시 최신 데이터 일괄 조회
  useEffect(() => {
    fetchPosts();
    fetchUsers();
    fetchAdminComments();
  }, [fetchPosts, fetchUsers, fetchAdminComments]);

  // 계정 변경 폼 상태
  const [formEmail, setFormEmail] = useState(effectiveAdmin?.email || '');
  const [formUsername, setFormUsername] = useState(effectiveAdmin?.username || '');
  const [formBio, setFormBio] = useState(effectiveAdmin?.bio || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [accountStatusMessage, setAccountStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  // effectiveAdmin 변경 시 폼 동기화
  useEffect(() => {
    if (effectiveAdmin) {
      setFormEmail(effectiveAdmin.email);
      setFormUsername(effectiveAdmin.username);
      setFormBio(effectiveAdmin.bio || '');
    }
  }, [effectiveAdmin]);

  // 비인가 사용자 접근 차단 (effectiveAdmin이 없을 때만 안내)
  if (!effectiveAdmin) {
    return (
      <div className="admin-auth-guard">
        <div className="guard-card">
          <div className="guard-icon">🔒</div>
          <h2>관리자 인증이 필요합니다</h2>
          <div style={{ marginBottom: '1.25rem' }}>
            <p style={{ color: '#475569', fontSize: '0.95rem', marginBottom: '1rem' }}>
              {user ? (
                <>현재 일반 회원 <strong>'{user.username}' ({user.email})</strong> 계정으로 접속되어 있습니다.<br />관리자 대시보드에 접근하려면 관리자 권한이 필요합니다.</>
              ) : (
                <>관리자 대시보드에 접근하려면 관리자 권한이 필요합니다.<br />원클릭 최고관리자 접속 또는 직접 비밀번호로 입장하세요.</>
              )}
            </p>
            <button
              onClick={async () => {
                const res = await switchToAdmin();
                if (res.success) {
                  navigate('/admin');
                } else {
                  navigate('/admin/login');
                }
              }}
              className="btn btn-primary btn-block"
              style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', fontWeight: 700, backgroundColor: '#2563eb' }}
            >
              🛡️ 최고관리자(bodyguard)로 즉시 접속하여 입장
            </button>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <Link to="/admin/login" className="btn btn-outline">
              직접 비밀번호 입력
            </Link>
            <Link to="/" className="btn btn-outline">
              일반 홈으로 이동
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const handleSelectCategory = (category: AdminCategory) => {
    setActiveCategory(category);
    if (category === 'dashboard') {
      navigate('/admin');
    } else {
      navigate(`/admin/${category}`);
    }
  };

  const handleLogout = () => {
    adminLogout();
    navigate('/admin/login');
  };

  const totalViews = posts.reduce((sum, p) => sum + p.views, 0);

  // 검색 및 공개/숨김 필터링
  const filteredPosts = posts.filter((p) => {
    const matchesSearch =
      p.title.toLowerCase().includes(postSearch.toLowerCase()) ||
      p.author.toLowerCase().includes(postSearch.toLowerCase()) ||
      p.content.toLowerCase().includes(postSearch.toLowerCase());

    if (!matchesSearch) return false;
    if (postFilter === 'visible') return !p.isHidden;
    if (postFilter === 'hidden') return Boolean(p.isHidden);
    return true;
  });

  // 관리자가 users 목록에 누락되어 있다면 effectiveAdmin을 목록에 자동 병합
  const displayUsers = React.useMemo(() => {
    let list = [...users];
    const adminEmail = (effectiveAdmin?.email || 'iicbruce@naver.com').toLowerCase();
    const hasAdmin = list.some(
      (u) => u.role === 'admin' || (u.email && u.email.toLowerCase() === adminEmail)
    );
    if (!hasAdmin && effectiveAdmin) {
      list.unshift({
        id: effectiveAdmin.id || 8,
        email: effectiveAdmin.email,
        username: effectiveAdmin.username,
        name: effectiveAdmin.name || effectiveAdmin.username,
        nickname: effectiveAdmin.nickname || effectiveAdmin.username,
        phone: effectiveAdmin.phone || '',
        role: 'admin',
        bio: effectiveAdmin.bio || '시스템 총괄 최고관리자 계정입니다.',
        joinedAt: effectiveAdmin.joinedAt || '2026-09-28',
        hasUser: true,
        hasAdmin: true,
        hasProfile: true,
        sourceTable: 'admins',
        statusType: 'admin',
      });
    }
    return list;
  }, [users, effectiveAdmin]);

  const filteredUsers = displayUsers
    .filter((u) => {
      const matchesSearch =
        u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.name && u.name.toLowerCase().includes(userSearch.toLowerCase())) ||
        (u.nickname && u.nickname.toLowerCase().includes(userSearch.toLowerCase())) ||
        (u.phone && u.phone.includes(userSearch)) ||
        u.email.toLowerCase().includes(userSearch.toLowerCase());
      if (!matchesSearch) return false;
      if (userRoleFilter === 'admin') return u.role === 'admin';
      if (userRoleFilter === 'user') return u.role !== 'admin';
      if (userRoleFilter === 'user_only') return u.statusType === 'user_only';
      if (userRoleFilter === 'profile_only') return u.statusType === 'profile_only';
      return true;
    })
    .sort((a, b) => {
      // 👑 최고관리자 목록 상단 우선 정렬
      if (a.role === 'admin' && b.role !== 'admin') return -1;
      if (a.role !== 'admin' && b.role === 'admin') return 1;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

  const filteredComments = comments.filter((c) => {
    const matchesSearch =
      c.author.toLowerCase().includes(commentSearch.toLowerCase()) ||
      c.content.toLowerCase().includes(commentSearch.toLowerCase()) ||
      (c.postTitle && c.postTitle.toLowerCase().includes(commentSearch.toLowerCase()));

    if (!matchesSearch) return false;
    if (commentFilter === 'visible') return !c.isHidden;
    if (commentFilter === 'hidden') return Boolean(c.isHidden);
    return true;
  });

  // 관리자 계정 정보 및 비밀번호 변경 제출 핸들러
  const handleUpdateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountStatusMessage(null);

    // 새 비밀번호 변경 요청 시 확인 검증
    if (newPassword) {
      if (newPassword !== confirmPassword) {
        setAccountStatusMessage({ type: 'error', text: '새 비밀번호와 비밀번호 확인이 일치하지 않습니다.' });
        return;
      }
      if (newPassword.length < 6) {
        setAccountStatusMessage({ type: 'error', text: '새 비밀번호는 6자리 이상이어야 합니다.' });
        return;
      }
      if (!currentPassword) {
        setAccountStatusMessage({ type: 'error', text: '보안을 위해 현재 비밀번호를 입력해주세요.' });
        return;
      }
    }

    // 이메일 변경 시에도 현재 비밀번호 확인 필수
    if (formEmail !== effectiveAdmin.email && !currentPassword) {
      setAccountStatusMessage({ type: 'error', text: '관리자 이메일을 변경하려면 현재 비밀번호를 입력해주세요.' });
      return;
    }

    setIsSubmitting(true);
    const res = await updateAdminAccount({
      email: formEmail,
      username: formUsername,
      bio: formBio,
      currentPassword: currentPassword || undefined,
      newPassword: newPassword || undefined,
    });
    setIsSubmitting(false);

    if (res.success) {
      setAccountStatusMessage({
        type: 'success',
        text: res.message || '관리자 계정 정보가 성공적으로 변경되었습니다. (DB 및 .env 동기화 완료)',
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } else {
      setAccountStatusMessage({
        type: 'error',
        text: res.message || '계정 정보 변경에 실패했습니다.',
      });
    }
  };

  return (
    <div className="admin-layout">
      {/* 1. 왼쪽 카테고리 사이드바 */}
      <aside className="admin-sidebar">
        <div className="sidebar-brand">
          <span className="brand-badge">🛡️ Admin Studio</span>
          <h2>관리자 센터</h2>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">주요 메뉴</div>
          <button
            className={`sidebar-nav-item ${activeCategory === 'dashboard' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('dashboard')}
          >
            <span className="nav-icon">📊</span>
            <span>대시보드 홈</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeCategory === 'posts' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('posts')}
          >
            <span className="nav-icon">📝</span>
            <span>게시글 관리</span>
            <span className="item-count">{posts.length}</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeCategory === 'users' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('users')}
          >
            <span className="nav-icon">👥</span>
            <span>회원 관리 (유저 목록)</span>
            <span className="item-count">{users.length}</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeCategory === 'comments' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('comments')}
          >
            <span className="nav-icon">💬</span>
            <span>댓글 관리</span>
            <span className="item-count">{comments.length}</span>
          </button>

          <div className="nav-section-title" style={{ marginTop: '1.5rem' }}>
            계정 및 시스템 보안
          </div>
          <button
            className={`sidebar-nav-item ${activeCategory === 'account' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('account')}
          >
            <span className="nav-icon">🔐</span>
            <span>계정 & 보안 설정</span>
          </button>
          <button
            className={`sidebar-nav-item ${activeCategory === 'system' ? 'active' : ''}`}
            onClick={() => handleSelectCategory('system')}
          >
            <span className="nav-icon">⚙️</span>
            <span>환경설정 (.env / DB)</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="admin-profile-box">
            <div className="admin-avatar">
              <img src={profileImg} alt="관리자 프로필" />
            </div>
            <div className="admin-profile-details">
              <strong>{effectiveAdmin.username}</strong>
              <small>{effectiveAdmin.email}</small>
            </div>
          </div>
          <div className="sidebar-footer-actions">
            <Link to="/" className="btn btn-sm btn-outline btn-block">
              🌐 일반 사이트 바로가기
            </Link>
            <button onClick={handleLogout} className="btn btn-sm btn-danger-outline btn-block" style={{ marginTop: '0.4rem' }}>
              로그아웃
            </button>
          </div>
        </div>
      </aside>

      {/* 2. 오른쪽 메인 정보 영역 */}
      <main className="admin-main">
        {/* 상단 헤더 */}
        <header className="admin-header">
          <div>
            <div className="admin-breadcrumb">관리자 콘솔 &gt; {
              activeCategory === 'dashboard' ? '대시보드 홈' :
              activeCategory === 'posts' ? '게시글 관리' :
              activeCategory === 'users' ? '회원 관리' :
              activeCategory === 'comments' ? '댓글 관리' :
              activeCategory === 'account' ? '계정 & 보안 설정' : '환경설정 및 시스템'
            }</div>
            <h1 className="admin-header-title">
              {activeCategory === 'dashboard' && '종합 통계 대시보드'}
              {activeCategory === 'posts' && '게시판 게시글 관리'}
              {activeCategory === 'users' && '커뮤니티 회원 관리'}
              {activeCategory === 'comments' && '게시글 댓글 모니터링'}
              {activeCategory === 'account' && '관리자 계정 & 보안 설정 (비밀번호/해시/세션/시크릿)'}
              {activeCategory === 'system' && '서버 환경변수(.env) 및 SQLite 설정'}
            </h1>
          </div>
          <div className="admin-header-status">
            <span className="badge-status-online">🟢 bcrypt 해시 & JWT 보안 활성화</span>
            <span className="badge-port">PORT: 5000</span>
          </div>
        </header>

        {/* 카테고리별 컨텐츠 */}
        <div className="admin-content-body">
          {/* 카테고리 1: 대시보드 홈 */}
          {activeCategory === 'dashboard' && (
            <div className="admin-dashboard-view">
              {/* 요약 통계 카드 */}
              <div className="admin-stat-grid">
                <div className="admin-card-stat">
                  <div className="stat-icon-wrapper blue">📊</div>
                  <div className="stat-info">
                    <span className="stat-title">총 조회수</span>
                    <span className="stat-value">{totalViews.toLocaleString()}회</span>
                  </div>
                </div>
                <div
                  className="admin-card-stat"
                  onClick={() => handleSelectCategory('posts')}
                  style={{ cursor: 'pointer' }}
                  title="게시글 관리 페이지로 이동"
                >
                  <div className="stat-icon-wrapper green">📝</div>
                  <div className="stat-info">
                    <span className="stat-title">총 게시글</span>
                    <span className="stat-value">{posts.length}개</span>
                  </div>
                </div>
                <div
                  className="admin-card-stat"
                  onClick={() => handleSelectCategory('users')}
                  style={{ cursor: 'pointer' }}
                  title="회원 관리 페이지로 이동"
                >
                  <div className="stat-icon-wrapper purple">👥</div>
                  <div className="stat-info">
                    <span className="stat-title">등록 회원</span>
                    <span className="stat-value">{users.length}명</span>
                  </div>
                </div>
                <div
                  className="admin-card-stat"
                  onClick={() => handleSelectCategory('comments')}
                  style={{ cursor: 'pointer' }}
                  title="댓글 관리 페이지로 이동"
                >
                  <div className="stat-icon-wrapper orange">💬</div>
                  <div className="stat-info">
                    <span className="stat-title">누적 댓글</span>
                    <span className="stat-value">{comments.length}건</span>
                  </div>
                </div>
              </div>

              {/* 최근 게시글 & 회원 요약 */}
              <div className="admin-split-grid">
                <div className="admin-card">
                  <div className="admin-card-title-row">
                    <h3>최근 등록 게시글</h3>
                    <button onClick={() => handleSelectCategory('posts')} className="link-btn">
                      전체 관리 &rarr;
                    </button>
                  </div>
                  <div className="admin-mini-list">
                    {posts.slice(0, 4).map((p) => (
                      <Link
                        key={p.id}
                        to={`/posts/${p.id}`}
                        className="admin-mini-item admin-mini-item-link"
                        title="게시글 상세 화면으로 이동"
                      >
                        <div className="mini-item-left">
                          <span className="mini-id">#{p.id}</span>
                          <span className="mini-title">{p.title}</span>
                        </div>
                        <div className="mini-item-right">
                          <span>{p.author}</span>
                          <span className="text-muted">{p.createdAt}</span>
                          <span className="mini-badge-view">게시글 확인 &rarr;</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="admin-card">
                  <div className="admin-card-title-row">
                    <h3>가입 회원 목록</h3>
                    <button onClick={() => handleSelectCategory('users')} className="link-btn">
                      전체 관리 &rarr;
                    </button>
                  </div>
                  <div className="admin-mini-list">
                    {users.map((u) => (
                      <div key={u.id} className="admin-mini-item">
                        <div className="mini-item-left">
                          <span className={`role-badge ${u.role === 'admin' ? 'admin' : 'user'}`}>
                            {u.role === 'admin' ? '관리자' : '일반'}
                          </span>
                          <span className="mini-title">{u.username}</span>
                        </div>
                        <span className="text-muted">{u.email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 카테고리 2: 게시글 관리 */}
          {activeCategory === 'posts' && (
            <div className="admin-card">
              <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
                  <div className="admin-search-input" style={{ maxWidth: '320px' }}>
                    <input
                      type="text"
                      placeholder="게시글 제목, 내용, 작성자 검색..."
                      value={postSearch}
                      onChange={(e) => setPostSearch(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button
                      type="button"
                      className={`btn btn-sm ${postFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setPostFilter('all')}
                    >
                      전체 ({posts.length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${postFilter === 'visible' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setPostFilter('visible')}
                    >
                      공개 ({posts.filter((p) => !p.isHidden).length})
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm ${postFilter === 'hidden' ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setPostFilter('hidden')}
                    >
                      숨김 ({posts.filter((p) => p.isHidden).length})
                    </button>
                  </div>
                </div>
                <div className="toolbar-info">
                  총 <strong>{filteredPosts.length}</strong>개의 게시글
                </div>
              </div>

              <div className="admin-table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: '55px' }}>ID</th>
                      <th>게시글 제목 / 내용 요약</th>
                      <th style={{ width: '100px' }}>작성자</th>
                      <th style={{ width: '100px' }}>작성일</th>
                      <th style={{ width: '85px' }}>상태</th>
                      <th style={{ width: '55px' }}>조회</th>
                      <th style={{ width: '55px' }}>추천</th>
                      <th style={{ width: '55px' }}>비추천</th>
                      <th style={{ width: '215px' }}>관리 작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPosts.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '3rem 1rem', color: '#64748b' }}>
                          일치하는 게시글이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredPosts.map((post) => (
                        <tr
                          key={post.id}
                          style={post.isHidden ? { backgroundColor: '#fef2f2' } : {}}
                        >
                          <td className="center">{post.id}</td>
                          <td>
                            <div>
                              <Link
                                to={`/posts/${post.id}`}
                                className="table-link"
                                title="게시글 상세 화면으로 이동"
                                style={{ display: 'inline-block', fontWeight: 600 }}
                              >
                                {post.title}
                              </Link>
                              <p
                                style={{
                                  margin: '0.2rem 0 0 0',
                                  fontSize: '0.8rem',
                                  color: '#64748b',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  maxWidth: '360px',
                                }}
                              >
                                {post.content}
                              </p>
                            </div>
                          </td>
                          <td>{post.author}</td>
                          <td>{post.createdAt}</td>
                          <td className="center">
                            {post.isHidden ? (
                              <span className="status-badge hidden" title="관리자에 의해 일반 사용자에게 숨김 처리됨">
                                🔒 숨김
                              </span>
                            ) : (
                              <span className="status-badge active" title="모든 사용자에게 정상 공개 중">
                                🟢 공개
                              </span>
                            )}
                          </td>
                          <td className="center">{post.views}</td>
                          <td className="center">{post.likes}</td>
                          <td className="center">{post.dislikes || 0}</td>
                          <td>
                            <div className="table-actions">
                              <Link
                                to={`/posts/${post.id}`}
                                className="btn-table-view"
                                title="게시글 본문 상세 확인"
                              >
                                게시글 확인
                              </Link>
                              <button
                                type="button"
                                onClick={async () => {
                                  const actionMsg = post.isHidden ? '공개로 전환' : '숨김 처리';
                                  if (window.confirm(`'${post.title}' 게시글을 ${actionMsg}하시겠습니까?`)) {
                                    const res = await toggleHidePost(post.id);
                                    if (res.success) {
                                      alert(res.message || `게시글이 ${actionMsg}되었습니다.`);
                                      await fetchPosts();
                                    } else {
                                      alert(res.message || '게시글 숨김 처리에 실패했습니다.');
                                    }
                                  }
                                }}
                                className={`btn-table-hide ${post.isHidden ? 'unhide' : ''}`}
                                title={post.isHidden ? '일반 게시판 공개 상태로 복원' : '일반 게시판 목록에서 숨김'}
                              >
                                {post.isHidden ? '숨김 해제' : '숨김'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (
                                    window.confirm(
                                      `'${post.title}' 게시글을 영구 삭제하시겠습니까? (Supabase DB에서 완전히 삭제됩니다)`
                                    )
                                  ) {
                                    const res = await deletePost(post.id);
                                    if (res.success) {
                                      alert(res.message || '게시글이 성공적으로 삭제되었습니다.');
                                      await fetchPosts();
                                    } else {
                                      alert(res.message || '게시글 삭제에 실패했습니다.');
                                    }
                                  }
                                }}
                                className="btn-table-delete"
                                title="데이터베이스에서 영구 삭제"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 카테고리 3: 회원 관리 (Supabase 유저 목록) */}
          {activeCategory === 'users' && (
            <div className="admin-card">
              <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                <div className="admin-search-input">
                  <input
                    type="text"
                    placeholder="회원 닉네임 또는 이메일 검색..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                  />
                  <span className="search-icon">🔍</span>
                </div>

                {/* 권한 및 DB 분리 테이블별 필터 탭 */}
                <div className="admin-filter-tabs">
                  <button
                    type="button"
                    className={`btn-filter ${userRoleFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setUserRoleFilter('all')}
                  >
                    전체 ({displayUsers.length})
                  </button>
                  <button
                    type="button"
                    className={`btn-filter ${userRoleFilter === 'admin' ? 'active' : ''}`}
                    onClick={() => setUserRoleFilter('admin')}
                  >
                    👑 최고관리자 ({displayUsers.filter((u) => u.role === 'admin').length})
                  </button>
                  <button
                    type="button"
                    className={`btn-filter ${userRoleFilter === 'user' ? 'active' : ''}`}
                    onClick={() => setUserRoleFilter('user')}
                  >
                    👤 일반회원 ({displayUsers.filter((u) => u.role !== 'admin').length})
                  </button>
                  <button
                    type="button"
                    className={`btn-filter ${userRoleFilter === 'user_only' ? 'active' : ''}`}
                    onClick={() => setUserRoleFilter('user_only')}
                    title="users 테이블에만 존재 (프로필 미연동)"
                  >
                    👤 유저만 ({displayUsers.filter((u) => u.statusType === 'user_only').length})
                  </button>
                  <button
                    type="button"
                    className={`btn-filter ${userRoleFilter === 'profile_only' ? 'active' : ''}`}
                    onClick={() => setUserRoleFilter('profile_only')}
                    title="profiles 테이블에만 존재 (계정 미연동)"
                  >
                    📇 프로필만 ({displayUsers.filter((u) => u.statusType === 'profile_only').length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => fetchUsers()}
                  className="btn btn-sm btn-outline"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                  title="Supabase DB 최신 유저 목록 새로고침"
                >
                  🔄 새로고침
                </button>

                <div className="toolbar-info" style={{ marginLeft: 'auto' }}>
                  총 <strong>{filteredUsers.length}</strong>명 (👑 관리자 {displayUsers.filter((u) => u.role === 'admin').length}명 / 👤 회원 {displayUsers.filter((u) => u.role !== 'admin').length}명)
                </div>
              </div>

              <div className="admin-table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>ID</th>
                      <th style={{ width: '150px' }}>이름 / 닉네임</th>
                      <th>이메일</th>
                      <th style={{ width: '120px' }}>연락처</th>
                      <th style={{ width: '110px' }}>권한</th>
                      <th style={{ width: '140px' }}>분리 DB 테이블</th>
                      <th>자기소개</th>
                      <th style={{ width: '100px' }}>가입일</th>
                      <th style={{ width: '110px' }}>관리 작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
                          검색 조건과 일치하는 회원이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr
                          key={u.id}
                          style={
                            u.role === 'admin'
                              ? {
                                  backgroundColor: '#fffbeb',
                                  borderLeft: '4px solid #f59e0b',
                                }
                              : {}
                          }
                        >
                          <td className="center">{u.id}</td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                                <strong style={u.role === 'admin' ? { color: '#92400e' } : {}}>
                                  {u.nickname || u.username}
                                </strong>
                                {u.role === 'admin' && (
                                  <span
                                    style={{
                                      fontSize: '0.7rem',
                                      padding: '0.15rem 0.4rem',
                                      backgroundColor: '#fef3c7',
                                      color: '#b45309',
                                      borderRadius: '4px',
                                      fontWeight: 700,
                                      border: '1px solid #fde68a',
                                    }}
                                  >
                                    👑 관리자
                                  </span>
                                )}
                              </div>
                              {u.name && u.name !== (u.nickname || u.username) && (
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>실명: {u.name}</span>
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={u.role === 'admin' ? { fontWeight: 600, color: '#1e293b' } : {}}>
                              {u.email}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.85rem', color: u.phone ? '#1e293b' : '#94a3b8' }}>
                              {u.phone || '-'}
                            </span>
                          </td>
                          <td>
                            {u.role === 'admin' ? (
                              <span
                                className="role-badge admin"
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  padding: '0.25rem 0.55rem',
                                  fontWeight: 700,
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  border: '1px solid #fde68a',
                                  borderRadius: '6px',
                                  fontSize: '0.8rem',
                                }}
                              >
                                👑 최고관리자
                              </span>
                            ) : (
                              <span className="role-badge user">일반회원</span>
                            )}
                          </td>
                          <td>
                            {/* 분리 DB 테이블 출처 표시 */}
                            {u.role === 'admin' ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.75rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  backgroundColor: '#fef3c7',
                                  color: '#92400e',
                                  fontWeight: 600,
                                  border: '1px solid #fde68a',
                                }}
                              >
                                👑 admins
                              </span>
                            ) : u.statusType === 'user_only' ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.75rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  backgroundColor: '#fff1f2',
                                  color: '#be123c',
                                  fontWeight: 600,
                                  border: '1px solid #fecdd3',
                                }}
                                title="users 테이블에만 존재 (프로필 미연동)"
                              >
                                👤 users 만
                              </span>
                            ) : u.statusType === 'profile_only' ? (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.75rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  backgroundColor: '#eff6ff',
                                  color: '#1d4ed8',
                                  fontWeight: 600,
                                  border: '1px solid #bfdbfe',
                                }}
                                title="profiles 테이블에만 존재 (계정 미연동)"
                              >
                                📇 profiles 만
                              </span>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-block',
                                  fontSize: '0.75rem',
                                  padding: '0.2rem 0.5rem',
                                  borderRadius: '4px',
                                  backgroundColor: '#f0fdf4',
                                  color: '#15803d',
                                  fontWeight: 600,
                                  border: '1px solid #bbf7d0',
                                }}
                                title="users 및 profiles 테이블 연동 완료"
                              >
                                👥 users + profiles
                              </span>
                            )}
                          </td>
                          <td className="text-muted">{u.bio || '-'}</td>
                          <td>{u.joinedAt}</td>
                          <td>
                            {u.role !== 'admin' ? (
                              <button
                                onClick={async () => {
                                  if (window.confirm(`회원 '${u.username}' 계정을 정말 삭제하시겠습니까? (Supabase DB에서 영구 삭제됩니다)`)) {
                                    await deleteUser(u.id);
                                    await fetchUsers();
                                  }
                                }}
                                className="btn-table-delete"
                                title="회원 계정 강제 탈퇴"
                              >
                                강제탈퇴
                              </button>
                            ) : (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontSize: '0.8rem',
                                  color: '#047857',
                                  backgroundColor: '#ecfdf5',
                                  padding: '0.25rem 0.55rem',
                                  borderRadius: '6px',
                                  fontWeight: 600,
                                  border: '1px solid #a7f3d0',
                                }}
                              >
                                🛡️ 보호됨 (삭제 불가)
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 카테고리 4: 댓글 관리 (숨김, 삭제, 검색, 필터 기능) */}
          {activeCategory === 'comments' && (
            <div className="admin-card">
              <div className="admin-toolbar" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
                <div className="admin-search-input">
                  <input
                    type="text"
                    placeholder="작성자, 내용 또는 게시글 제목 검색..."
                    value={commentSearch}
                    onChange={(e) => setCommentSearch(e.target.value)}
                  />
                </div>

                <div className="filter-group" style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`btn-filter ${commentFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setCommentFilter('all')}
                  >
                    전체 ({comments.length})
                  </button>
                  <button
                    type="button"
                    className={`btn-filter ${commentFilter === 'visible' ? 'active' : ''}`}
                    onClick={() => setCommentFilter('visible')}
                  >
                    🟢 정상 ({comments.filter((c) => !c.isHidden).length})
                  </button>
                  <button
                    type="button"
                    className={`btn-filter ${commentFilter === 'hidden' ? 'active' : ''}`}
                    onClick={() => setCommentFilter('hidden')}
                  >
                    🔒 숨김 ({comments.filter((c) => c.isHidden).length})
                  </button>
                </div>

                <div className="toolbar-info" style={{ marginLeft: 'auto' }}>
                  총 <strong>{filteredComments.length}</strong>개의 댓글
                </div>
              </div>

              <div className="admin-table-responsive">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th style={{ width: '60px' }}>ID</th>
                      <th style={{ width: '200px' }}>대상 게시글</th>
                      <th style={{ width: '110px' }}>작성자</th>
                      <th>댓글 내용</th>
                      <th style={{ width: '120px' }}>작성일시</th>
                      <th style={{ width: '85px' }}>상태</th>
                      <th style={{ width: '190px' }}>관리 작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredComments.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem 1rem', color: '#64748b' }}>
                          {commentSearch ? '검색 결과와 일치하는 댓글이 없습니다.' : '등록된 댓글이 없습니다.'}
                        </td>
                      </tr>
                    ) : (
                      filteredComments.map((c) => (
                        <tr key={c.id} style={c.isHidden ? { backgroundColor: '#fef2f2' } : {}}>
                          <td className="center">{c.id}</td>
                          <td>
                            <Link to={`/posts/${c.postId}`} className="table-link" title="게시글 상세 화면으로 이동">
                              {c.postTitle || `게시글 #${c.postId}`}
                            </Link>
                          </td>
                          <td>
                            <strong>{c.author}</strong>
                            {c.author === 'bodyguard' && (
                              <span className="role-badge admin" style={{ marginLeft: '0.3rem', fontSize: '0.7rem' }}>
                                관리자
                              </span>
                            )}
                          </td>
                          <td>
                            <div
                              style={{
                                maxWidth: '320px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                              title={c.content}
                            >
                              {c.content}
                            </div>
                            {c.updatedAt && (
                              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                (수정: {c.updatedAt})
                              </span>
                            )}
                          </td>
                          <td>{c.createdAt}</td>
                          <td className="center">
                            {c.isHidden ? (
                              <span className="status-badge hidden" title="관리자에 의해 일반 사용자에게 숨김 처리됨">
                                🔒 숨김
                              </span>
                            ) : (
                              <span className="status-badge active" title="모든 사용자에게 정상 공개 중">
                                🟢 정상
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="table-actions">
                              <Link to={`/posts/${c.postId}`} className="btn-table-view" title="게시글 본문에서 댓글 확인">
                                확인
                              </Link>
                              <button
                                type="button"
                                onClick={async () => {
                                  const actionMsg = c.isHidden ? '정상 공개로 전환' : '숨김 처리';
                                  if (window.confirm(`'${c.author}'님의 댓글을 ${actionMsg}하시겠습니까?`)) {
                                    const res = await toggleHideComment(c.id);
                                    if (res.success) {
                                      alert(res.message || `댓글이 ${actionMsg}되었습니다.`);
                                      await fetchAdminComments();
                                    } else {
                                      alert(res.message || '댓글 숨김 처리에 실패했습니다.');
                                    }
                                  }
                                }}
                                className={`btn-table-hide ${c.isHidden ? 'unhide' : ''}`}
                                title={c.isHidden ? '일반 게시판 공개 상태로 복원' : '일반 사용자에게서 숨김'}
                              >
                                {c.isHidden ? '숨김 해제' : '숨김'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (
                                    window.confirm(
                                      `'${c.author}'님의 댓글을 영구 삭제하시겠습니까? (Supabase DB에서 완전히 삭제됩니다)`
                                    )
                                  ) {
                                    const res = await deleteComment(c.id, c.postId);
                                    if (res.success) {
                                      alert(res.message || '댓글이 성공적으로 삭제되었습니다.');
                                      await fetchAdminComments();
                                    } else {
                                      alert(res.message || '댓글 삭제에 실패했습니다.');
                                    }
                                  }
                                }}
                                className="btn-table-delete"
                                title="데이터베이스에서 영구 삭제"
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 카테고리 5: 계정 & 보안 설정 (비밀번호/해시, 세션, 시크릿) */}
          {activeCategory === 'account' && (
            <div className="admin-account-view">
              {/* 보안 현황 요약 카드 */}
              <div className="admin-stat-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="admin-card-stat">
                  <div className="stat-icon-wrapper purple">🔒</div>
                  <div className="stat-info">
                    <span className="stat-title">비밀번호 해시</span>
                    <span className="stat-value" style={{ fontSize: '1.15rem' }}>bcrypt (Salt 10)</span>
                  </div>
                </div>
                <div className="admin-card-stat">
                  <div className="stat-icon-wrapper blue">🎫</div>
                  <div className="stat-info">
                    <span className="stat-title">세션 토큰 (Session)</span>
                    <span className="stat-value" style={{ fontSize: '1.15rem' }}>JWT Bearer (24h)</span>
                  </div>
                </div>
                <div className="admin-card-stat">
                  <div className="stat-icon-wrapper green">🛡️</div>
                  <div className="stat-info">
                    <span className="stat-title">시크릿 키 (Secret)</span>
                    <span className="stat-value" style={{ fontSize: '1.15rem' }}>JWT_SECRET 보호</span>
                  </div>
                </div>
              </div>

              {/* 알림 메시지 배너 */}
              {accountStatusMessage && (
                <div
                  className={`admin-alert-${accountStatusMessage.type}`}
                  style={{
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1.5rem',
                    backgroundColor: accountStatusMessage.type === 'success' ? '#f0fdf4' : '#fef2f2',
                    border: `1px solid ${accountStatusMessage.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
                    color: accountStatusMessage.type === 'success' ? '#166534' : '#dc2626',
                    fontWeight: 500,
                  }}
                >
                  {accountStatusMessage.type === 'success' ? '✅ ' : '⚠️ '}
                  {accountStatusMessage.text}
                </div>
              )}

              {/* 계정 정보 및 비밀번호 수정 폼 */}
              <div className="admin-card">
                <div className="admin-card-title-row">
                  <h3>관리자 계정 정보 및 보안 변경</h3>
                  <span className="badge-status-online">실시간 .env & SQLite 자동 동기화</span>
                </div>

                <form onSubmit={handleUpdateAccount} className="admin-account-form">
                  <div className="form-section-header">
                    <h4>1. 기본 계정 정보</h4>
                    <p className="text-muted">관리자 계정의 이메일 및 서비스 내 표시명을 변경합니다.</p>
                  </div>

                  <div className="form-group-grid">
                    <div className="form-group">
                      <label>관리자 로그인 이메일 (ADMIN_EMAIL)</label>
                      <input
                        type="email"
                        value={formEmail}
                        onChange={(e) => setFormEmail(e.target.value)}
                        placeholder="iicbruce@naver.com"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>관리자 이름/닉네임 (ADMIN_USERNAME)</label>
                      <input
                        type="text"
                        value={formUsername}
                        onChange={(e) => setFormUsername(e.target.value)}
                        placeholder="최고관리자"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label>관리자 소개글</label>
                    <textarea
                      rows={3}
                      value={formBio}
                      onChange={(e) => setFormBio(e.target.value)}
                      placeholder="관리자 소개글을 입력하세요."
                    />
                  </div>

                  <div className="form-section-header" style={{ marginTop: '2rem' }}>
                    <h4>2. 비밀번호 및 보안 검증</h4>
                    <p className="text-muted">
                      비밀번호를 변경하거나 이메일을 수정할 경우 현재 비밀번호 검증이 필요합니다. (새 비밀번호는 bcrypt로 암호화 저장됩니다)
                    </p>
                  </div>

                  <div className="form-group">
                    <label>현재 비밀번호 (확인용)</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="현재 비밀번호를 입력하세요 (이메일 또는 비밀번호 변경 시 필수)"
                    />
                  </div>

                  <div className="form-group-grid">
                    <div className="form-group">
                      <label>새 비밀번호 (ADMIN_PASSWORD 변경 시 입력)</label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="변경할 새 비밀번호 (6자 이상)"
                      />
                    </div>
                    <div className="form-group">
                      <label>새 비밀번호 확인</label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="새 비밀번호 다시 입력"
                      />
                    </div>
                  </div>

                  <div className="form-actions-row" style={{ marginTop: '1.75rem', display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={isSubmitting}
                      style={{ padding: '0.75rem 1.75rem', fontWeight: 600 }}
                    >
                      {isSubmitting ? '동기화 저장 중...' : '💾 관리자 계정 변경사항 저장'}
                    </button>
                  </div>
                </form>
              </div>

              {/* 보안 설정 현황 상세 */}
              <div className="admin-card" style={{ marginTop: '1.5rem' }}>
                <div className="admin-card-title-row">
                  <h3>보안 메커니즘 상세 정보</h3>
                </div>
                <div className="env-config-table">
                  <div className="env-row">
                    <span className="env-key">BCRYPT_HASH</span>
                    <span className="env-val"><code>$2b$10$... (10 rounds)</code></span>
                    <span className="env-desc">단방향 솔트 해시 알고리즘으로 비밀번호 복호화 불가 보호</span>
                  </div>
                  <div className="env-row">
                    <span className="env-key">JWT_SECRET</span>
                    <span className="env-val"><code>.env 환경변수로 안전 은닉</code></span>
                    <span className="env-desc">세션 위변조를 방지하는 비밀 서명 키</span>
                  </div>
                  <div className="env-row">
                    <span className="env-key">SESSION_EXPIRY</span>
                    <span className="env-val"><code>24h (24시간)</code></span>
                    <span className="env-desc">관리자 JWT 인증 토큰의 유효 수명 주기</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 카테고리 6: 환경설정 (.env / DB) */}
          {activeCategory === 'system' && (
            <div className="admin-system-view">
              <div className="admin-card">
                <h3>백엔드 환경변수 (.env) 설정 현황</h3>
                <p className="section-desc">
                  <code>backend/.env</code> 파일에 정의되어 안전하게 관리되고 있는 시스템 주요 설정 값입니다.
                </p>

                <div className="env-config-table">
                  <div className="env-row">
                    <span className="env-key">PORT</span>
                    <span className="env-val"><code>5000</code></span>
                    <span className="env-desc">Express 백엔드 서버 구동 포트</span>
                  </div>
                  <div className="env-row">
                    <span className="env-key">DB_PATH</span>
                    <span className="env-val"><code>./database.sqlite</code></span>
                    <span className="env-desc">SQLite 데이터베이스 저장 파일</span>
                  </div>
                  <div className="env-row">
                    <span className="env-key">CLIENT_URL</span>
                    <span className="env-val"><code>http://localhost:5173</code></span>
                    <span className="env-desc">프런트엔드 Vite 교차출처(CORS) 허용</span>
                  </div>
                  <div className="env-row highlight">
                    <span className="env-key">ADMIN_EMAIL</span>
                    <span className="env-val"><code>{effectiveAdmin.email}</code></span>
                    <span className="env-desc">.env 지정 최고관리자 계정 이메일</span>
                  </div>
                  <div className="env-row highlight">
                    <span className="env-key">ADMIN_USERNAME</span>
                    <span className="env-val"><code>{effectiveAdmin.username}</code></span>
                    <span className="env-desc">.env 지정 최고관리자 표시명</span>
                  </div>
                  <div className="env-row highlight">
                    <span className="env-key">JWT_SECRET</span>
                    <span className="env-val"><code>sup***cure!</code></span>
                    <span className="env-desc">세션 토큰 암호화 서명 시크릿 키</span>
                  </div>
                  <div className="env-row">
                    <span className="env-key">NODE_ENV</span>
                    <span className="env-val"><code>development</code></span>
                    <span className="env-desc">실행 환경 모드</span>
                  </div>
                </div>
              </div>

              <div className="admin-card" style={{ marginTop: '1.5rem' }}>
                <h3>데이터베이스 상태 (SQLite)</h3>
                <div className="db-info-grid">
                  <div className="db-stat-box">
                    <span>저장소 엔진</span>
                    <strong>SQLite 3 (better-sqlite3)</strong>
                  </div>
                  <div className="db-stat-box">
                    <span>저널 모드</span>
                    <strong>WAL (Write-Ahead Logging)</strong>
                  </div>
                  <div className="db-stat-box">
                    <span>비밀번호 암호화</span>
                    <strong>bcrypt 해시 적용됨</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
