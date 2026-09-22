import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePosts } from '../context/PostContext';
import type { Post } from '../types';

export const PostEditPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getPost, updatePost, user, adminUser } = usePosts();

  const [post, setPost] = useState<Post | undefined>(() => (id ? getPost(Number(id)) : undefined));
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(!post);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 게시글 정보 로드 (직접 URL 접근 시 백엔드 API에서 조회)
  useEffect(() => {
    if (!id) return;
    const fetchPost = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/posts/${id}`);
        if (res.ok) {
          const data: Post = await res.json();
          setPost(data);
          setTitle(data.title);
          setContent(data.content);
        } else {
          setPost(undefined);
        }
      } catch (err) {
        console.error('게시글 불러오기 실패:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (post) {
      setTitle(post.title);
      setContent(post.content);
      setIsLoading(false);
    } else {
      fetchPost();
    }
  }, [id, post]);

  const isAdmin = user?.role === 'admin' || !!adminUser;
  const isAuthor = post && (user?.username === post.author || (user?.id && post.userId === user.id) || isAdmin);

  if (isLoading) {
    return (
      <div className="empty-state-box">
        <p>게시글 정보를 불러오는 중입니다...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="empty-state-box">
        <h2>게시글을 찾을 수 없습니다</h2>
        <p>요청하신 게시글이 존재하지 않거나 삭제되었습니다.</p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link to="/posts" className="btn btn-primary">
            게시판 목록으로 이동
          </Link>
        </div>
      </div>
    );
  }

  // 작성자 또는 관리자 본인이 아닌 경우 접근 차단
  if (!isAuthor) {
    return (
      <div className="empty-state-box">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⛔</div>
        <h2>수정 권한이 없습니다</h2>
        <p>게시글은 작성한 유저 본인(또는 최고 관리자)만 수정할 수 있습니다.</p>
        <p style={{ color: '#64748b', fontSize: '0.9rem', marginTop: '0.5rem' }}>
          현재 접속 계정: {user ? user.username : '비로그인'} / 작성자: {post.author}
        </p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link to={`/posts/${post.id}`} className="btn btn-primary">
            게시글 보기
          </Link>
          <Link to="/posts" className="btn btn-outline">
            게시판 목록으로 이동
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      alert('제목과 내용을 모두 입력해주세요.');
      return;
    }

    setIsSubmitting(true);
    const result = await updatePost(post.id, title.trim(), content.trim());
    setIsSubmitting(false);

    if (result.success) {
      alert('게시글이 성공적으로 수정되었습니다! (SQLite DB 반영 완료)');
      navigate(`/posts/${post.id}`);
    } else {
      alert(result.message || '게시글 수정에 실패했습니다.');
    }
  };

  return (
    <div className="page-create-post">
      <div className="form-card">
        <div className="form-card-header">
          <h2>게시글 수정</h2>
          <p>작성자: <strong>{post.author}</strong> | 등록일: {post.createdAt}</p>
        </div>

        <form onSubmit={handleSubmit} className="post-form">
          <div className="form-group">
            <label htmlFor="edit-title">게시글 제목</label>
            <input
              id="edit-title"
              type="text"
              placeholder="수정할 제목을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>작성자 (수정 불가)</label>
            <input
              type="text"
              value={post.author}
              disabled
              style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#64748b' }}
            />
          </div>

          <div className="form-group">
            <label htmlFor="edit-content">게시글 내용</label>
            <textarea
              id="edit-content"
              rows={12}
              placeholder="수정할 본문 내용을 입력해주세요."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => navigate(-1)}
              disabled={isSubmitting}
            >
              취소
            </button>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? '저장 중...' : '수정 완료 (DB 저장)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
