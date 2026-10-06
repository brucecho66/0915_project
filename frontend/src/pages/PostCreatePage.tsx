import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePosts } from '../context/PostContext';

export const PostCreatePage: React.FC = () => {
  const { addPost, user, adminUser } = usePosts();
  const navigate = useNavigate();

  const currentAuthor = user?.username || adminUser?.username || '';
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 비로그인 사용자 작성 제한 (로그인 필요 안내)
  if (!user && !adminUser) {
    return (
      <div className="empty-state-box">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔐</div>
        <h2>로그인이 필요한 서비스입니다</h2>
        <p>게시글을 작성하려면 먼저 회원 로그인 또는 관리자 계정으로 로그인해 주세요.</p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link to="/login" className="btn btn-primary">
            일반 회원 로그인
          </Link>
          <Link to="/admin/login" className="btn btn-outline">
            관리자 로그인
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
    try {
      const newId = await addPost(title.trim(), content.trim(), currentAuthor);
      if (newId) {
        alert('게시글이 성공적으로 등록되었습니다! (Supabase DB 저장 완료)');
        navigate(`/posts/${newId}`);
      } else {
        alert('게시글 등록에 실패했습니다. 다시 시도해 주세요.');
      }
    } catch (err) {
      console.error(err);
      alert('게시글 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="page-create-post">
      <div className="form-card">
        <div className="form-card-header">
          <h2>게시글 작성</h2>
          <p>새로운 소식이나 궁금한 점을 자유롭게 작성해 보세요.</p>
        </div>

        <form onSubmit={handleSubmit} className="post-form">
          <div className="form-group">
            <label htmlFor="post-title">제목</label>
            <input
              id="post-title"
              type="text"
              placeholder="제목을 입력하세요"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="post-author">작성자 (로그인된 계정)</label>
            <input
              id="post-author"
              type="text"
              value={currentAuthor}
              disabled
              style={{ backgroundColor: '#f1f5f9', cursor: 'not-allowed', color: '#334155', fontWeight: 600 }}
            />
            <small style={{ color: '#64748b', marginTop: '0.3rem', display: 'block' }}>
              현재 로그인된 <strong>{currentAuthor}</strong> 계정으로 게시글이 등록되며 본인만 수정/삭제가 가능합니다.
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="post-content">내용</label>
            <textarea
              id="post-content"
              rows={12}
              placeholder="게시글 내용을 자유롭게 작성해주세요."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
            />
          </div>

          <div className="form-actions">
            <Link to="/posts" className="btn btn-outline">
              취소
            </Link>
            <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
              {isSubmitting ? '등록 중...' : '게시글 등록하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
