import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePosts } from '../context/PostContext';
import profileImg from '../assets/images/profile.jpg';

export const ProfilePage: React.FC = () => {
  const { user, posts, updateProfile, logout, switchToAdmin, deletePost } = usePosts();
  const navigate = useNavigate();

  const [isEditing, setIsEditing] = useState(false);
  const [editUsername, setEditUsername] = useState(user?.username || '');
  const [editBio, setEditBio] = useState(user?.bio || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setEditUsername(user.username);
      setEditBio(user.bio || '');
    }
  }, [user]);

  if (!user) {
    return (
      <div className="empty-state-box">
        <h2>로그인이 필요한 페이지입니다</h2>
        <p>프로필을 확인하려면 먼저 로그인해 주세요.</p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link to="/login" className="btn btn-primary">
            로그인하러 가기
          </Link>
          <Link to="/" className="btn btn-outline">
            홈으로 이동
          </Link>
        </div>
      </div>
    );
  }

  // 실제 로그인한 사용자가 작성한 게시글만 필터링 (하드코딩 제거)
  const userPosts = posts.filter(
    (p) => p.author === user.username || (p.userId && p.userId === user.id)
  );

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    const result = await updateProfile(editUsername, editBio);
    setIsSaving(false);

    if (result.success) {
      alert('프로필이 성공적으로 수정되었습니다. (DB 반영 완료)');
      setIsEditing(false);
    } else {
      alert(result.message || '프로필 수정에 실패했습니다.');
    }
  };

  const handleDeletePost = async (postId: number, postTitle: string) => {
    if (window.confirm(`'${postTitle}' 게시글을 삭제하시겠습니까? (SQLite DB에서 영구 삭제됩니다)`)) {
      await deletePost(postId);
      alert('게시글이 삭제되었습니다.');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="page-profile">
      <div className="profile-header-card">
        <div className="profile-avatar-large">
          <img src={profileImg} alt="프로필 사진" />
        </div>
        <div className="profile-info">
          <div className="profile-title-row">
            <h2>
              {user.username}
              {user.role === 'admin' && <span className="role-badge admin" style={{ marginLeft: '0.5rem', fontSize: '0.8rem' }}>관리자</span>}
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {user.role !== 'admin' ? (
                <button
                  className="btn btn-sm btn-outline"
                  style={{ borderColor: '#2563eb', color: '#2563eb', fontWeight: 600 }}
                  onClick={async () => {
                    const res = await switchToAdmin();
                    if (res.success) {
                      navigate('/admin');
                    }
                  }}
                  title=".env 관리자 계정으로 즉시 전환"
                >
                  🛡️ 관리자 계정 전환
                </button>
              ) : (
                <>
                  <Link
                    to="/admin/posts"
                    className="btn btn-sm btn-primary"
                    style={{ backgroundColor: '#2563eb' }}
                    title="관리자 게시글 관리"
                  >
                    📝 게시글 관리
                  </Link>
                  <Link to="/admin" className="btn btn-sm btn-outline">
                    ⚙️ 관리자 콘솔
                  </Link>
                </>
              )}
              <button
                className="btn btn-sm btn-outline"
                onClick={() => {
                  setEditUsername(user.username);
                  setEditBio(user.bio || '');
                  setIsEditing(!isEditing);
                }}
              >
                {isEditing ? '취소' : '프로필 수정'}
              </button>
            </div>
          </div>
          <p className="profile-email">{user.email}</p>
          <p className="profile-bio">{user.bio || '등록된 자기소개가 없습니다.'}</p>
          <div className="profile-meta">
            <span>가입일: {user.joinedAt}</span>
            <span>· 내가 작성한 글: {userPosts.length}개</span>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="profile-edit-box">
          <h3>프로필 정보 수정 (SQLite DB 실시간 반영)</h3>
          <form onSubmit={handleSaveProfile} className="auth-form">
            <div className="form-group">
              <label>닉네임</label>
              <input
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>자기소개</label>
              <textarea
                rows={3}
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="자기소개를 자유롭게 작성해주세요."
              />
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
              >
                취소
              </button>
              <button type="submit" className="btn btn-primary" disabled={isSaving}>
                {isSaving ? '저장 중...' : '저장하기'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User's posts section */}
      <section className="user-posts-section">
        <div className="section-header">
          <h3>내가 작성한 글 ({userPosts.length})</h3>
          <Link to="/posts/create" className="btn btn-sm btn-primary">
            ✍️ 새 글 작성
          </Link>
        </div>

        {userPosts.length === 0 ? (
          <p className="empty-notice">아직 작성한 게시글이 없습니다. 첫 글을 작성해 보세요!</p>
        ) : (
          <div className="post-table-container">
            <table className="post-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>번호</th>
                  <th>제목</th>
                  <th style={{ width: '110px' }}>작성일</th>
                  <th style={{ width: '70px' }}>조회</th>
                  <th style={{ width: '70px' }}>추천</th>
                  <th style={{ width: '190px' }}>관리</th>
                </tr>
              </thead>
              <tbody>
                {userPosts.map((post) => (
                  <tr key={post.id}>
                    <td className="center">{post.id}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Link to={`/posts/${post.id}`} className="table-post-title">
                          {post.title}
                        </Link>
                        {post.isHidden && (
                          <span
                            className="status-badge hidden"
                            title="관리자에 의해 일반 목록에서 숨김 처리되었습니다."
                            style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                          >
                            🔒 관리자 숨김
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="center">{post.createdAt}</td>
                    <td className="center">{post.views}</td>
                    <td className="center">{post.likes}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'center' }}>
                        <Link to={`/posts/${post.id}`} className="btn-table-view" title="게시글 상세 확인">
                          확인
                        </Link>
                        <Link to={`/posts/${post.id}/edit`} className="btn-table-edit" title="게시글 수정">
                          ✏️ 수정
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeletePost(post.id, post.title)}
                          className="btn-table-delete"
                          title="게시글 삭제"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <button onClick={handleLogout} className="btn btn-outline text-danger">
            로그아웃
          </button>
        </div>
      </section>
    </div>
  );
};
