import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePosts } from '../context/PostContext';

export const HomePage: React.FC = () => {
  const { posts, fetchPosts, user } = usePosts();

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const visiblePosts = posts.filter((p) => !p.isHidden);
  const recentPosts = visiblePosts.slice(0, 3);

  return (
    <div className="page-home">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-content">
          <span className="badge">Welcome to Community</span>
          <h1 className="hero-title">
            자유롭게 소통하고<br />지식을 공유하는 <span className="highlight">게시판</span>
          </h1>
          <p className="hero-subtitle">
            다양한 주제로 사람들과 소통하고, 유용한 정보와 아이디어를 나눠보세요.
          </p>
          <div className="hero-actions">
            <Link to="/posts" className="btn btn-primary btn-lg">
              게시판 둘러보기
            </Link>
            <Link to="/posts/create" className="btn btn-outline btn-lg">
              새 글 작성하기 ✍️
            </Link>
          </div>
        </div>
      </section>

      {/* Summary Stats */}
      <section className="stats-section">
        <div className="stat-card">
          <span className="stat-number">{posts.length}</span>
          <span className="stat-label">등록된 게시글</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">{user ? '로그인 중' : '손님'}</span>
          <span className="stat-label">현재 접속 상태</span>
        </div>
        <div className="stat-card">
          <span className="stat-number">React 19 + Express</span>
          <span className="stat-label">기술 스택</span>
        </div>
      </section>

      {/* Recent Posts Section */}
      <section className="recent-posts-section">
        <div className="section-header">
          <h2>최신 게시글</h2>
          <Link to="/posts" className="link-more">
            전체 보기 &rarr;
          </Link>
        </div>

        <div className="post-grid">
          {recentPosts.map((post) => (
            <Link to={`/posts/${post.id}`} key={post.id} className="post-card">
              <div className="post-card-header">
                <span className="post-id">#{post.id}</span>
                <span className="post-date">{post.createdAt}</span>
              </div>
              <h3 className="post-card-title">{post.title}</h3>
              <p className="post-card-desc">{post.content.slice(0, 80)}...</p>
              <div className="post-card-footer">
                <span className="post-author">✍️ {post.author}</span>
                <span className="post-meta">조회 {post.views} · 👍 {post.likes} · 👎 {post.dislikes || 0} · 💬 {post.commentCount || 0}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
