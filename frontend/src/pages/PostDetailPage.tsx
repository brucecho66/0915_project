import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { usePosts, API_BASE } from '../context/PostContext';
import type { Post, Comment } from '../types';

export const PostDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    getPost,
    deletePost,
    toggleHidePost,
    reactPost,
    incrementPostView,
    user,
    adminUser,
    addComment,
    updateComment,
    deleteComment,
    toggleHideComment,
  } = usePosts();

  const isAdmin = user?.role === 'admin' || !!adminUser;
  const currentCommenterName = user?.username || adminUser?.username;

  // 1. 캐시된 게시글이 이미 존재하면 즉시 렌더링하고 로딩 대기 생략
  const cachedPost = id ? getPost(Number(id)) : undefined;
  const [post, setPost] = useState<Post | undefined>(cachedPost);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedPost);

  // 좋아요 / 싫어요 상태
  const [likes, setLikes] = useState<number>(cachedPost?.likes || 0);
  const [dislikes, setDislikes] = useState<number>(cachedPost?.dislikes || 0);
  const [userReaction, setUserReaction] = useState<'like' | 'dislike' | null>(
    cachedPost?.userReaction || null
  );

  // 댓글 관련 상태
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [commentAuthor, setCommentAuthor] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [commentSuccessMsg, setCommentSuccessMsg] = useState<string | null>(null);

  // 댓글 수정 모드 상태
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  // 2. 게시글 최신 정보 및 댓글 목록 로드
  useEffect(() => {
    if (!id) return;
    const postId = Number(id);

    // 캐시에 데이터가 있으면 즉시 상태에 반영
    const existing = getPost(postId);
    if (existing) {
      setPost(existing);
      setLikes(existing.likes || 0);
      setDislikes(existing.dislikes || 0);
      setUserReaction(existing.userReaction || null);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    let isCurrent = true;

    // 백엔드 API에서 최신 상세 정보, 댓글 목록, 조회수 갱신 병렬 실행
    const token = localStorage.getItem('user_token') || localStorage.getItem('admin_token');
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    const guestId = localStorage.getItem('guest_identifier') || '';
    const currentUid = user?.id || adminUser?.id;
    const identParam = currentUid ? `userId=${currentUid}` : (guestId ? `identifier=${guestId}` : '');
    const postUrl = identParam ? `${API_BASE}/posts/${postId}?${identParam}` : `${API_BASE}/posts/${postId}`;

    Promise.all([
      fetch(postUrl, { headers: authHeaders }).then(async (res) => {
        if (res.ok) return await res.json();
        return null;
      }),
      fetch(`${API_BASE}/posts/${postId}/comments`, { headers: authHeaders }).then(async (res) => {
        if (res.ok) return await res.json();
        return [];
      }),
      incrementPostView(postId),
    ])
      .then(([postData, commentsData, viewCount]) => {
        if (isCurrent) {
          if (postData) {
            const finalViews = typeof viewCount === 'number' && viewCount > 0
              ? Math.max(postData.views || 0, viewCount)
              : (postData.views || 0);
            setPost({ ...postData, views: finalViews });
            setLikes(postData.likes || 0);
            setDislikes(postData.dislikes || 0);
            setUserReaction(postData.userReaction || null);
          } else if (!existing) {
            setPost(undefined);
          }
          if (commentsData) {
            setComments(commentsData);
          }
        }
      })
      .catch((err) => {
        console.error('게시글 및 댓글 조회 실패:', err);
      })
      .finally(() => {
        if (isCurrent) {
          setIsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [id, getPost, incrementPostView, user, adminUser]);

  const isAuthor = Boolean(
    post &&
      (user?.username === post.author ||
        (user?.id && post.userId === user.id) ||
        isAdmin)
  );

  if (isLoading) {
    return (
      <div className="empty-state-box">
        <p>게시글을 불러오는 중입니다...</p>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="empty-state-box">
        <h2>게시글을 찾을 수 없습니다</h2>
        <p>요청하신 게시글이 삭제되었거나 존재하지 않는 게시글입니다.</p>
        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          {isAdmin && (
            <Link to="/admin/posts" className="btn btn-primary">
              📝 관리자 게시글 관리로 복귀
            </Link>
          )}
          <Link to="/posts" className="btn btn-outline">
            게시판 목록으로 이동
          </Link>
        </div>
      </div>
    );
  }

  // 관리자에 의해 숨김 처리된 게시글이고, 작성자나 관리자가 아닌 경우 열람 차단
  if (post.isHidden && !isAuthor) {
    return (
      <div className="empty-state-box">
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔒</div>
        <h2>숨김 처리된 게시글입니다</h2>
        <p>해당 게시글은 관리자에 의해 숨김 처리되어 열람할 수 없습니다.</p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link to="/posts" className="btn btn-primary">
            게시판 목록으로 이동
          </Link>
        </div>
      </div>
    );
  }

  // 좋아요 / 싫어요 토글 핸들러
  const handleReaction = async (type: 'like' | 'dislike') => {
    if (!post) return;
    const result = await reactPost(post.id, type);
    setLikes(result.likes);
    setDislikes(result.dislikes);
    setUserReaction(result.userReaction);
    setPost((prev) =>
      prev ? { ...prev, likes: result.likes, dislikes: result.dislikes, userReaction: result.userReaction } : prev
    );
  };

  // 관리자 게시글 숨김 토글 핸들러
  const handleToggleHidePost = async () => {
    if (!post) return;
    const actionName = post.isHidden ? '공개로 전환' : '숨김 처리';
    if (!window.confirm(`이 게시글을 ${actionName}하시겠습니까?`)) return;

    const result = await toggleHidePost(post.id);
    if (result.success) {
      setPost((prev) => (prev ? { ...prev, isHidden: result.isHidden ?? !prev.isHidden } : prev));
      alert(result.message || `게시글이 ${actionName}되었습니다.`);
    } else {
      alert(result.message || '게시글 숨김 처리에 실패했습니다.');
    }
  };

  const handleDelete = async () => {
    if (!post) return;
    if (window.confirm('정말로 이 게시글을 삭제하시겠습니까? (Supabase DB에서 영구 삭제됩니다)')) {
      const result = await deletePost(post.id);
      if (result.success) {
        alert(result.message || '게시글이 성공적으로 삭제되었습니다.');
        if (isAdmin) {
          navigate('/admin/posts');
        } else {
          navigate('/posts');
        }
      } else {
        alert(result.message || '게시글 삭제에 실패했습니다.');
      }
    }
  };

  // 댓글 등록 핸들러 (다른 유저 누구나 작성 가능)
  const handleAddComment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!commentInput.trim() || !id) return;

    setIsSubmittingComment(true);
    const authorName = currentCommenterName || commentAuthor.trim() || '익명 방문자';
    const result = await addComment(Number(id), commentInput.trim(), authorName);
    setIsSubmittingComment(false);

    if (result.success && result.comment) {
      setComments((prev) => [...prev, result.comment!]);
      setCommentInput('');
      setCommentSuccessMsg('댓글이 성공적으로 등록되었습니다! ✨');
      setTimeout(() => setCommentSuccessMsg(null), 3500);
      if (!currentCommenterName) {
        setCommentAuthor('');
      }
    } else {
      alert(result.message || '댓글 등록에 실패했습니다.');
    }
  };

  // 댓글 수정 시작 핸들러
  const handleStartEdit = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingContent(comment.content);
  };

  // 댓글 수정 취소
  const handleCancelEdit = () => {
    setEditingCommentId(null);
    setEditingContent('');
  };

  // 댓글 수정 저장 핸들러 (작성 유저만 가능)
  const handleSaveEdit = async (commentId: number) => {
    if (!editingContent.trim()) {
      alert('댓글 내용을 입력해주세요.');
      return;
    }

    setIsSavingComment(true);
    const result = await updateComment(commentId, editingContent.trim());
    setIsSavingComment(false);

    if (result.success && result.comment) {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, ...result.comment } : c))
      );
      setEditingCommentId(null);
      setEditingContent('');
      alert('댓글이 수정되었습니다.');
    } else {
      alert(result.message || '댓글 수정에 실패했습니다.');
    }
  };

  // 댓글 삭제 핸들러 (작성 유저 또는 관리자만 가능)
  const handleDeleteComment = async (commentId: number) => {
    if (window.confirm('이 댓글을 삭제하시겠습니까? (Supabase DB에서 영구 삭제됩니다)')) {
      const result = await deleteComment(commentId, Number(id));
      if (result.success) {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      } else {
        alert(result.message || '댓글 삭제에 실패했습니다.');
      }
    }
  };

  // 관리자 댓글 숨김 토글 핸들러
  const handleToggleHideComment = async (commentId: number) => {
    const target = comments.find((c) => c.id === commentId);
    const actionName = target?.isHidden ? '숨김 해제' : '숨김 처리';
    if (!window.confirm(`이 댓글을 ${actionName}하시겠습니까?`)) return;

    const result = await toggleHideComment(commentId);
    if (result.success) {
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...c, isHidden: result.isHidden } : c))
      );
      alert(result.message || `댓글이 ${actionName}되었습니다.`);
    } else {
      alert(result.message || '댓글 숨김 처리에 실패했습니다.');
    }
  };

  return (
    <div className="page-post-detail">
      <div className="detail-card">
        {post.isHidden && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '0.85rem 1.25rem',
              borderRadius: '8px',
              marginBottom: '1.25rem',
              fontSize: '0.925rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>🔒</span>
            <span>
              <strong>관리자 숨김 알림:</strong> 본 게시글은 현재 관리자에 의해 일반 사용자 목록에서 숨김 처리되었습니다. (작성자 및 관리자만 확인 가능)
            </span>
          </div>
        )}

        {/* Post Header */}
        <div className="detail-header">
          <div className="detail-badge">
            게시글 #{post.id}
            {post.isHidden && (
              <span style={{ marginLeft: '0.5rem', color: '#dc2626', fontWeight: 700 }}>
                [숨김 상태]
              </span>
            )}
          </div>
          <h1 className="detail-title">{post.title}</h1>
          <div className="detail-meta">
            <div className="meta-left">
              <span className="author">👤 {post.author}</span>
              <span className="date">📅 {post.createdAt}</span>
              {post.updatedAt && post.updatedAt !== post.createdAt && (
                <span className="text-muted" style={{ fontSize: '0.8rem' }}>
                  (수정됨: {post.updatedAt})
                </span>
              )}
            </div>
            <div className="meta-right">
              <span>조회 {post.views}</span>
              <span>추천 {likes}</span>
              <span>비추천 {dislikes}</span>
            </div>
          </div>
        </div>

        {/* Post Content */}
        <div className="detail-content">
          <p>{post.content}</p>
        </div>

        {/* Post Actions (좋아요, 싫어요 버튼 & 관리/목록 버튼) - 공유 기능 버튼 제외 */}
        <div className="detail-actions" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {/* 좋아요 버튼 */}
            <button
              onClick={() => handleReaction('like')}
              className={`btn-like ${userReaction === 'like' ? 'liked' : ''}`}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.6rem 1.1rem',
                borderRadius: '8px',
                border: userReaction === 'like' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                backgroundColor: userReaction === 'like' ? '#eff6ff' : '#ffffff',
                color: userReaction === 'like' ? '#1d4ed8' : '#334155',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="게시글 좋아요 (추천)"
            >
              <span>{userReaction === 'like' ? '👍' : '👍'}</span>
              <span>좋아요</span>
              <strong style={{ marginLeft: '0.2rem' }}>{likes}</strong>
            </button>

            {/* 싫어요 버튼 */}
            <button
              onClick={() => handleReaction('dislike')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.6rem 1.1rem',
                borderRadius: '8px',
                border: userReaction === 'dislike' ? '2px solid #ea580c' : '1px solid #cbd5e1',
                backgroundColor: userReaction === 'dislike' ? '#fff7ed' : '#ffffff',
                color: userReaction === 'dislike' ? '#c2410c' : '#334155',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="게시글 싫어요 (비추천)"
            >
              <span>{userReaction === 'dislike' ? '👎' : '👎'}</span>
              <span>싫어요</span>
              <strong style={{ marginLeft: '0.2rem' }}>{dislikes}</strong>
            </button>
          </div>

          <div className="action-buttons-right" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={handleToggleHidePost}
                  className="btn btn-outline"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    borderColor: post.isHidden ? '#16a34a' : '#d97706',
                    color: post.isHidden ? '#16a34a' : '#d97706',
                    fontWeight: 600,
                  }}
                  title={post.isHidden ? '일반 사용자에게 게시글 다시 공개' : '일반 게시판 목록에서 게시글 숨김'}
                >
                  {post.isHidden ? '🔓 숨김 해제' : '🔒 숨김'}
                </button>
                <Link
                  to="/admin/posts"
                  className="btn btn-primary"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                >
                  📝 관리자 게시글 관리
                </Link>
              </>
            )}
            <Link to="/posts" className="btn btn-outline">
              게시글 목록
            </Link>
            {isAuthor && (
              <Link
                to={`/posts/${post.id}/edit`}
                className="btn btn-outline"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              >
                ✏️ 수정
              </Link>
            )}
            {(isAdmin || isAuthor) && (
              <button
                type="button"
                onClick={handleDelete}
                className="btn btn-outline text-danger"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', fontWeight: 600 }}
              >
                🗑️ 삭제
              </button>
            )}
          </div>
        </div>

        {/* Comment Section (실제 Supabase 연동: 작성, 수정, 삭제, 숨김) */}
        <section className="comments-section" style={{ marginTop: '2.5rem' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>💬 댓글</span>
              <span style={{ color: '#2563eb', fontSize: '1.1rem' }}>({comments.length})</span>
            </h3>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              댓글은 작성한 회원만 수정/삭제할 수 있으며, 관리자는 숨김/삭제가 가능합니다.
            </span>
          </div>

          {/* 댓글 등록 성공 피드백 알림 */}
          {commentSuccessMsg && (
            <div
              style={{
                padding: '0.75rem 1.25rem',
                marginBottom: '1rem',
                backgroundColor: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '8px',
                color: '#15803d',
                fontSize: '0.95rem',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                animation: 'fadeIn 0.2s ease',
              }}
            >
              <span>✅</span>
              <span>{commentSuccessMsg}</span>
            </div>
          )}

          {/* 댓글 작성 폼 (누구나 작성 가능) */}
          <form
            onSubmit={handleAddComment}
            className="comment-card-form"
            style={{
              marginBottom: '1.75rem',
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '10px',
              padding: '1rem 1.25rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.6rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.1rem' }}>✍️</span>
                {currentCommenterName ? (
                  <span style={{ fontSize: '0.925rem', fontWeight: 600, color: '#1e293b' }}>
                    <strong>{currentCommenterName}</strong> 님으로 작성 중
                    {isAdmin && (
                      <span
                        className="role-badge admin"
                        style={{ marginLeft: '0.4rem', fontSize: '0.75rem' }}
                      >
                        관리자
                      </span>
                    )}
                  </span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.875rem', color: '#64748b' }}>작성자 닉네임:</span>
                    <input
                      type="text"
                      placeholder="닉네임 (기본: 익명 방문자)"
                      value={commentAuthor}
                      onChange={(e) => setCommentAuthor(e.target.value)}
                      style={{
                        padding: '0.35rem 0.65rem',
                        fontSize: '0.875rem',
                        border: '1px solid #cbd5e1',
                        borderRadius: '6px',
                        width: '180px',
                        backgroundColor: '#fff',
                      }}
                    />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>💡 Ctrl + Enter로 즉시 등록</span>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{commentInput.length}자</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
              <textarea
                placeholder={
                  currentCommenterName
                    ? `${currentCommenterName}님, 의견이나 피드백을 자유롭게 남겨보세요. (Ctrl + Enter로 등록)`
                    : '자유롭게 댓글을 입력해 보세요... (Ctrl + Enter로 등록)'
                }
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    if (!isSubmittingComment && commentInput.trim()) {
                      handleAddComment();
                    }
                  }
                }}
                required
                rows={2}
                style={{
                  flex: 1,
                  padding: '0.75rem 1rem',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '0.95rem',
                  resize: 'vertical',
                  minHeight: '60px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  backgroundColor: '#fff',
                }}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSubmittingComment || !commentInput.trim()}
                style={{
                  padding: '0.75rem 1.4rem',
                  height: '60px',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: isSubmittingComment || !commentInput.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {isSubmittingComment ? '등록 중...' : '댓글 등록'}
              </button>
            </div>
          </form>

          {/* 댓글 목록 */}
          <div className="comments-list">
            {comments.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '2.5rem 1rem',
                  backgroundColor: '#f8fafc',
                  borderRadius: '10px',
                  border: '1px dashed #e2e8f0',
                  color: '#64748b',
                }}
              >
                <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>💬</span>
                <p style={{ margin: 0, fontWeight: 500 }}>아직 등록된 댓글이 없습니다.</p>
                <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.875rem', color: '#94a3b8' }}>
                  가장 먼저 소중한 첫 번째 댓글을 남겨보세요!
                </p>
              </div>
            ) : (
              comments.map((c) => {
                // 댓글 작성자 본인 확인: user_id 일치 우선, 비로그인 작성자면 username 대조
                const isCommentOwner = Boolean(
                  (user &&
                    ((c.userId && user.id === c.userId) ||
                      (!c.userId && user.username === c.author))) ||
                    (adminUser &&
                      ((c.userId && adminUser.id === c.userId) ||
                        (!c.userId && adminUser.username === c.author)))
                );

                const isEditingThis = editingCommentId === c.id;

                return (
                  <div
                    key={c.id}
                    className="comment-item"
                    style={{
                      backgroundColor: c.isHidden ? '#fff5f5' : '#fff',
                      border: c.isHidden ? '1px solid #fecaca' : '1px solid #e2e8f0',
                      borderLeft: c.isHidden
                        ? '4px solid #ef4444'
                        : c.author === post.author
                        ? '4px solid #2563eb'
                        : '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '1rem 1.25rem',
                      marginBottom: '0.75rem',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    {/* 댓글 헤더 */}
                    <div
                      className="comment-header"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '0.5rem',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className="comment-author" style={{ fontWeight: 600, color: '#1e293b' }}>
                          👤 {c.author}
                        </span>

                        {c.author === post.author && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.4rem',
                              backgroundColor: '#dbeafe',
                              color: '#1e40af',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            작성자
                          </span>
                        )}

                        {(c.author === 'bodyguard' || (adminUser && c.author === adminUser.username)) && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.4rem',
                              backgroundColor: '#fef3c7',
                              color: '#92400e',
                              borderRadius: '4px',
                              fontWeight: 600,
                            }}
                          >
                            관리자
                          </span>
                        )}

                        {c.isHidden && (
                          <span
                            style={{
                              fontSize: '0.7rem',
                              padding: '0.15rem 0.45rem',
                              backgroundColor: '#fee2e2',
                              color: '#991b1b',
                              borderRadius: '4px',
                              fontWeight: 700,
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                            }}
                          >
                            🔒 관리자 숨김
                          </span>
                        )}

                        {c.updatedAt && (
                          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                            (수정됨: {c.updatedAt})
                          </span>
                        )}
                      </div>

                      {/* 작업 버튼: 작성 유저만 수정/삭제 가능, 관리자는 숨김/삭제 가능 */}
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <span className="comment-date" style={{ fontSize: '0.825rem', color: '#94a3b8' }}>
                          {c.createdAt}
                        </span>

                        {/* 작성 유저 본인 전용: [수정] 버튼 */}
                        {isCommentOwner && !isEditingThis && !c.isMasked && (
                          <button
                            onClick={() => handleStartEdit(c)}
                            style={{
                              background: 'none',
                              border: '1px solid #cbd5e1',
                              color: '#2563eb',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                            }}
                            title="댓글 내용 수정 (본인만 가능)"
                          >
                            ✏️ 수정
                          </button>
                        )}

                        {/* 관리자 전용: [숨김 / 숨김 해제] 토글 버튼 */}
                        {isAdmin && (
                          <button
                            onClick={() => handleToggleHideComment(c.id)}
                            style={{
                              background: 'none',
                              border: c.isHidden ? '1px solid #16a34a' : '1px solid #d97706',
                              color: c.isHidden ? '#16a34a' : '#d97706',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                            }}
                            title={c.isHidden ? '일반 사용자에게 댓글 다시 공개' : '일반 사용자에게 댓글 숨김'}
                          >
                            {c.isHidden ? '🔓 숨김 해제' : '🔒 숨김'}
                          </button>
                        )}

                        {/* 작성 유저 본인 또는 관리자만: [삭제] 버튼 */}
                        {(isCommentOwner || isAdmin) && !isEditingThis && (
                          <button
                            onClick={() => handleDeleteComment(c.id)}
                            style={{
                              background: 'none',
                              border: '1px solid #fca5a5',
                              color: '#ef4444',
                              cursor: 'pointer',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.5rem',
                              borderRadius: '4px',
                            }}
                            title={isAdmin && !isCommentOwner ? '관리자 권한으로 댓글 삭제' : '본인 댓글 삭제'}
                          >
                            🗑️ 삭제
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 댓글 내용 영역: 일반 텍스트 vs 인라인 수정 폼 */}
                    {isEditingThis ? (
                      <div style={{ marginTop: '0.5rem' }}>
                        <textarea
                          value={editingContent}
                          onChange={(e) => setEditingContent(e.target.value)}
                          rows={2}
                          style={{
                            width: '100%',
                            padding: '0.6rem 0.8rem',
                            border: '1px solid #2563eb',
                            borderRadius: '6px',
                            fontSize: '0.925rem',
                            fontFamily: 'inherit',
                            resize: 'vertical',
                            boxSizing: 'border-box',
                            outline: 'none',
                          }}
                        />
                        <div style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
                          <button
                            onClick={() => handleSaveEdit(c.id)}
                            disabled={isSavingComment || !editingContent.trim()}
                            className="btn btn-primary"
                            style={{ padding: '0.3rem 0.8rem', fontSize: '0.825rem' }}
                          >
                            {isSavingComment ? '저장 중...' : '저장'}
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            disabled={isSavingComment}
                            className="btn btn-outline"
                            style={{ padding: '0.3rem 0.8rem', fontSize: '0.825rem' }}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p
                        className="comment-text"
                        style={{
                          whiteSpace: 'pre-wrap',
                          margin: '0.3rem 0 0 0',
                          color: c.isMasked ? '#94a3b8' : '#334155',
                          fontStyle: c.isMasked ? 'italic' : 'normal',
                          lineHeight: 1.6,
                          fontSize: '0.95rem',
                        }}
                      >
                        {c.content}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
