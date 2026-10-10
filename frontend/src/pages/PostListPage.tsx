import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePosts } from '../context/PostContext';

export const PostListPage: React.FC = () => {
  const { posts, fetchPosts, user, adminUser } = usePosts();
  const [searchTerm, setSearchTerm] = useState('');

  // 게시판 진입 시 최신 게시글 목록 (조회수, 댓글수 등) 새로고침
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const isAdmin = user?.role === 'admin' || !!adminUser;

  // 일반 사용자에게는 관리자에 의해 숨김 처리된 게시글 숨김 (본인 작성 글이나 관리자는 열람 가능)
  const visiblePosts = (Array.isArray(posts) ? posts : []).filter((p) => {
    if (!p) return false;
    const isHidden = Boolean(p.isHidden ?? (p as any).is_hidden);
    if (isHidden && !isAdmin && p.author !== user?.username && p.userId !== user?.id) {
      return false;
    }
    return true;
  });

  const q = searchTerm.trim().toLowerCase();
  const filteredPosts = visiblePosts.filter((p) => {
    if (!p) return false;
    const title = (p.title || '').toLowerCase();
    const author = (p.author || '').toLowerCase();
    const content = (p.content || '').toLowerCase();
    return !q || title.includes(q) || author.includes(q) || content.includes(q);
  });

  return (
    <div className="page-posts">
      <div className="board-header">
        <div>
          <h2>자유 게시판</h2>
          <p className="board-desc">자유롭게 이야기를 나누고 질문을 남겨보세요.</p>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
          {isAdmin && (
            <Link
              to="/admin/posts"
              className="btn btn-secondary"
              style={{ backgroundColor: '#1e293b', color: '#fff', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              title="관리자 전용 게시글 관리 콘솔로 이동"
            >
              🛡️ 관리자 게시글 관리
            </Link>
          )}
          <Link to="/posts/create" className="btn btn-primary">
            ✍️ 새 글 작성
          </Link>
        </div>
      </div>

      <div className="board-toolbar">
        <div className="search-box">
          <input
            type="text"
            placeholder="제목, 내용 또는 작성자 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button className="btn-clear" onClick={() => setSearchTerm('')}>
              ✕
            </button>
          )}
        </div>
        <div className="post-count">총 <strong>{filteredPosts.length}</strong>개의 글</div>
      </div>

      <div className="post-table-container">
        <table className="post-table">
          <thead>
            <tr>
              <th style={{ width: '70px' }}>번호</th>
              <th>제목</th>
              <th style={{ width: '120px' }}>작성자</th>
              <th style={{ width: '120px' }}>작성일</th>
              <th style={{ width: '65px' }}>조회</th>
              <th style={{ width: '65px' }}>추천</th>
              <th style={{ width: '65px' }}>비추천</th>
            </tr>
          </thead>
          <tbody>
            {filteredPosts.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-row">
                  {searchTerm ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'}
                </td>
              </tr>
            ) : (
              filteredPosts.map((post) => (
                <tr key={post.id} style={post.isHidden ? { opacity: 0.85, backgroundColor: '#fef2f2' } : {}}>
                  <td className="center">{post.id}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <Link to={`/posts/${post.id}`} className="table-post-title">
                        {post.title}
                      </Link>
                      {post.commentCount !== undefined && post.commentCount > 0 && (
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            color: '#2563eb',
                            backgroundColor: '#eff6ff',
                            border: '1px solid #dbeafe',
                            borderRadius: '12px',
                            padding: '0.1rem 0.45rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.2rem',
                          }}
                          title={`댓글 ${post.commentCount}개`}
                        >
                          💬 {post.commentCount}
                        </span>
                      )}
                      {post.isHidden && (
                        <span
                          className="status-badge hidden"
                          title="관리자에 의해 일반 목록에서 숨김 처리되었습니다."
                          style={{ fontSize: '0.7rem', padding: '0.1rem 0.4rem' }}
                        >
                          🔒 숨김 처리됨
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="center">{post.author}</td>
                  <td className="center">{post.createdAt}</td>
                  <td className="center">{post.views}</td>
                  <td className="center">{post.likes}</td>
                  <td className="center" style={{ color: (post.dislikes || 0) > 0 ? '#ea580c' : undefined }}>
                    {post.dislikes || 0}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
