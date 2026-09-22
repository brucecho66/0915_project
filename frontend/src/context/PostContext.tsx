import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { Post, User, Comment } from '../types';

export interface AdminComment extends Comment {
  postTitle?: string;
}

export interface UpdateAdminParams {
  email?: string;
  username?: string;
  bio?: string;
  currentPassword?: string;
  newPassword?: string;
}

interface PostContextType {
  posts: Post[];
  user: User | null;
  userToken: string | null;
  adminUser: User | null;
  adminToken: string | null;
  users: User[];
  comments: AdminComment[];
  isLoadingPosts: boolean;
  fetchPosts: () => Promise<void>;
  fetchPostDetail: (id: number) => Promise<Post | undefined>;
  fetchUsers: () => Promise<void>;
  fetchAdminComments: () => Promise<void>;
  addPost: (title: string, content: string, author?: string) => Promise<number>;
  updatePost: (id: number, title: string, content: string) => Promise<{ success: boolean; message?: string; post?: Post }>;
  toggleHidePost: (id: number) => Promise<{ success: boolean; isHidden?: boolean; message?: string }>;
  getPost: (id: number) => Post | undefined;
  incrementPostView: (id: number) => Promise<number>;
  deletePost: (id: number) => Promise<void>;
  deleteUser: (id: number) => Promise<void>;
  addComment: (postId: number, content: string, author?: string) => Promise<{ success: boolean; comment?: Comment; message?: string }>;
  updateComment: (id: number, content: string) => Promise<{ success: boolean; comment?: Comment; message?: string }>;
  deleteComment: (id: number, postId?: number) => Promise<{ success: boolean; message?: string }>;
  toggleHideComment: (id: number) => Promise<{ success: boolean; isHidden?: boolean; message?: string }>;
  likePost: (id: number) => Promise<number>;
  reactPost: (id: number, type: 'like' | 'dislike') => Promise<{ success: boolean; likes: number; dislikes: number; userReaction: 'like' | 'dislike' | null }>;
  login: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  register: (email: string, username: string, password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
  updateProfile: (username: string, bio: string) => Promise<{ success: boolean; message?: string }>;
  adminLogin: (email: string, password: string) => Promise<{ success: boolean; message?: string }>;
  adminLogout: () => void;
  updateAdminAccount: (params: UpdateAdminParams) => Promise<{ success: boolean; message?: string }>;
  switchToAdmin: () => Promise<{ success: boolean; message?: string }>;
  switchToUser: () => Promise<{ success: boolean; message?: string }>;
}

const PostContext = createContext<PostContextType | undefined>(undefined);

const API_BASE = 'http://localhost:5000/api';

export const PostProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isLoadingPosts, setIsLoadingPosts] = useState<boolean>(true);

  // 일반 사용자 세션 및 JWT 토큰
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('user_data');
    return saved ? JSON.parse(saved) : null;
  });

  const [userToken, setUserToken] = useState<string | null>(() => {
    return localStorage.getItem('user_token') || null;
  });

  // 관리자 세션 및 JWT 토큰
  const [adminUser, setAdminUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('admin_user');
    if (saved) return JSON.parse(saved);
    const userSaved = localStorage.getItem('user_data');
    if (userSaved) {
      try {
        const u = JSON.parse(userSaved);
        if (u.role === 'admin') return u;
      } catch (e) {}
    }
    return null;
  });

  const [adminToken, setAdminToken] = useState<string | null>(() => {
    const saved = localStorage.getItem('admin_token');
    if (saved) return saved;
    return localStorage.getItem('user_token') || null;
  });

  // 관리자 회원 및 댓글 관리 상태
  const [users, setUsers] = useState<User[]>([]);
  const [comments, setComments] = useState<AdminComment[]>([]);

  // user가 role === 'admin' 이면 adminUser도 자동 동기화
  useEffect(() => {
    if (user?.role === 'admin') {
      if (!adminUser || adminUser.email !== user.email) {
        setAdminUser(user);
      }
      if (userToken && !adminToken) {
        setAdminToken(userToken);
      }
    }
  }, [user, userToken, adminUser, adminToken]);

  // 유저 세션 로컬 스토리지 동기화
  useEffect(() => {
    if (user) {
      localStorage.setItem('user_data', JSON.stringify(user));
    } else {
      localStorage.removeItem('user_data');
    }
  }, [user]);

  useEffect(() => {
    if (userToken) {
      localStorage.setItem('user_token', userToken);
    } else {
      localStorage.removeItem('user_token');
    }
  }, [userToken]);

  // 관리자 세션 로컬 스토리지 동기화
  useEffect(() => {
    if (adminUser) {
      localStorage.setItem('admin_user', JSON.stringify(adminUser));
    } else {
      localStorage.removeItem('admin_user');
    }
  }, [adminUser]);

  useEffect(() => {
    if (adminToken) {
      localStorage.setItem('admin_token', adminToken);
    } else {
      localStorage.removeItem('admin_token');
    }
  }, [adminToken]);

  // ==========================================
  // [1. 게시글 실제 DB API 연동]
  // ==========================================

  // 게시글 목록 가져오기 (실제 SQLite DB)
  const fetchPosts = useCallback(async () => {
    setIsLoadingPosts(true);
    try {
      const res = await fetch(`${API_BASE}/posts`);
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } catch (err) {
      console.error('게시글 불러오기 실패:', err);
    } finally {
      setIsLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // 새 게시글 등록 (실제 SQLite DB 저장)
  const addPost = async (title: string, content: string, author = user?.username || '익명'): Promise<number> => {
    try {
      const res = await fetch(`${API_BASE}/posts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          content,
          author,
          userId: user?.id || null,
        }),
      });

      if (res.ok) {
        const createdPost: Post = await res.json();
        setPosts((prev) => [createdPost, ...prev.filter((p) => p.id !== createdPost.id)]);
        return createdPost.id;
      }
    } catch (err) {
      console.error('게시글 등록 실패:', err);
    }
    return 0;
  };

  const getPost = (id: number) => {
    return posts.find((p) => p.id === id);
  };

  // 로그인 유저 체크 & 로컬 스토리지 세션 확인 후 조회수 1회 증가
  const incrementPostView = async (id: number): Promise<number> => {
    // 1. 로그인 유저 여부 체크 (로그인 회원만 조회수 카운트)
    const currentUid = user?.id || adminUser?.id;
    if (!currentUid) {
      const current = posts.find((p) => p.id === id);
      return current?.views || 0;
    }

    // 2. 로컬 스토리지에서 해당 유저의 조회 기록 확인
    const storageKey = `viewed_posts_user_${currentUid}`;
    let viewedList: number[] = [];
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        viewedList = JSON.parse(saved);
      }
    } catch (e) {
      viewedList = [];
    }

    // 이미 해당 유저가 조회한 게시글이면 중복 증가하지 않고 현재 조회수 반환
    if (viewedList.includes(id)) {
      const current = posts.find((p) => p.id === id);
      return current?.views || 0;
    }

    // 3. 신규 조회: 로컬 스토리지에 즉시 기록하여 중복 호출 차단
    viewedList.push(id);
    localStorage.setItem(storageKey, JSON.stringify(viewedList));

    // 4. 백엔드 조회수 1 증가 API 호출 (로그인 유저 ID 전달)
    try {
      const token = userToken || adminToken || localStorage.getItem('user_token') || localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/posts/${id}/view`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ userId: currentUid }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && typeof data.views === 'number') {
          // 전체 posts 상태의 views 동기화
          setPosts((prev) =>
            prev.map((p) => (p.id === id ? { ...p, views: data.views } : p))
          );
          return data.views;
        }
      }
    } catch (err) {
      console.error('조회수 반영 실패:', err);
    }

    const current = posts.find((p) => p.id === id);
    return current?.views || 0;
  };

  // 게시글 상세 조회 및 조회수/댓글수 동기화 (SQLite DB 실시간 반영)
  const fetchPostDetail = useCallback(async (id: number): Promise<Post | undefined> => {
    try {
      const res = await fetch(`${API_BASE}/posts/${id}`);
      if (res.ok) {
        const postData: Post = await res.json();
        // 전체 posts 상태의 views 및 commentCount 즉시 동기화
        setPosts((prev) => {
          const exists = prev.some((p) => p.id === id);
          if (exists) {
            return prev.map((p) => (p.id === id ? postData : p));
          }
          return [postData, ...prev];
        });
        return postData;
      }
    } catch (err) {
      console.error('게시글 상세 조회 실패:', err);
    }
    return undefined;
  }, []);

  // 게시글 수정 (실제 SQLite DB UPDATE)
  const updatePost = async (
    id: number,
    title: string,
    content: string
  ): Promise<{ success: boolean; message?: string; post?: Post }> => {
    try {
      const token = userToken || adminToken || localStorage.getItem('user_token') || localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/posts/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          title,
          content,
          author: user?.username,
          requesterRole: adminUser || user?.role === 'admin' ? 'admin' : 'user',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const updatedPost: Post = data.post;
        setPosts((prev) => prev.map((p) => (p.id === id ? updatedPost : p)));
        return { success: true, message: data.message, post: updatedPost };
      } else {
        return { success: false, message: data.error || '게시글 수정에 실패했습니다.' };
      }
    } catch (err) {
      console.error('게시글 수정 실패:', err);
      return { success: false, message: '서버 연결 실패' };
    }
  };

  // 게시글 숨김/해제 토글 (관리자 권한으로 SQLite DB 갱신)
  const toggleHidePost = async (id: number): Promise<{ success: boolean; isHidden?: boolean; message?: string }> => {
    try {
      const token = adminToken || userToken || localStorage.getItem('admin_token') || localStorage.getItem('user_token');
      const res = await fetch(`${API_BASE}/posts/${id}/toggle-hide`, {
        method: 'PATCH',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPosts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, isHidden: data.isHidden } : p))
        );
        return { success: true, isHidden: data.isHidden, message: data.message };
      } else {
        return { success: false, message: data.error || '숨김 처리 실패' };
      }
    } catch (err) {
      console.error('게시글 숨김 토글 실패:', err);
      return { success: false, message: '서버 연결 실패' };
    }
  };

  // 게시글 삭제 (실제 SQLite DB 삭제)
  const deletePost = async (id: number) => {
    try {
      const token = userToken || adminToken || localStorage.getItem('user_token') || localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/posts/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          author: user?.username,
          requesterRole: adminUser || user?.role === 'admin' ? 'admin' : 'user',
        }),
      });
      if (res.ok) {
        setPosts((prev) => prev.filter((p) => p.id !== id));
      }
    } catch (err) {
      console.error('게시글 삭제 실패:', err);
    }
  };

  // 게시글 반응(좋아요/싫어요) 토글 (실제 SQLite DB 반영)
  const reactPost = async (
    id: number,
    type: 'like' | 'dislike'
  ): Promise<{ success: boolean; likes: number; dislikes: number; userReaction: 'like' | 'dislike' | null }> => {
    try {
      const token = userToken || adminToken || localStorage.getItem('user_token') || localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/posts/${id}/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          type,
          userId: user?.id || adminUser?.id,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setPosts((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  likes: data.likes,
                  dislikes: data.dislikes,
                  userReaction: data.userReaction,
                }
              : p
          )
        );
        return {
          success: true,
          likes: data.likes,
          dislikes: data.dislikes,
          userReaction: data.userReaction,
        };
      }
    } catch (err) {
      console.error('게시글 반응 요청 실패:', err);
    }
    const current = posts.find((p) => p.id === id);
    return {
      success: false,
      likes: current?.likes || 0,
      dislikes: current?.dislikes || 0,
      userReaction: current?.userReaction || null,
    };
  };

  // 게시글 추천/좋아요 (실제 SQLite DB 반영)
  const likePost = async (id: number): Promise<number> => {
    const result = await reactPost(id, 'like');
    return result.likes;
  };

  // ==========================================
  // [2. 사용자 인증 API (실제 DB 연동)]
  // ==========================================

  // 로그인 (실제 SQLite 사용자 검증)
  const login = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        setUserToken(data.token);
        if (data.user.role === 'admin') {
          setAdminUser(data.user);
          setAdminToken(data.token);
        }
        return { success: true };
      } else {
        return { success: false, message: data.error || '로그인에 실패했습니다.' };
      }
    } catch (err) {
      return { success: false, message: '서버 연결에 실패했습니다. 백엔드 서버가 켜져 있는지 확인하세요.' };
    }
  };

  // 회원가입 (실제 SQLite 사용자 등록)
  const register = async (
    email: string,
    username: string,
    password: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, username, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        setUserToken(data.token);
        return { success: true };
      } else {
        return { success: false, message: data.error || '회원가입에 실패했습니다.' };
      }
    } catch (err) {
      return { success: false, message: '서버 연결 실패' };
    }
  };

  const logout = () => {
    setUser(null);
    setUserToken(null);
    setAdminUser(null);
    setAdminToken(null);
  };

  // 프로필 정보 수정 (실제 SQLite DB 반영)
  const updateProfile = async (username: string, bio: string): Promise<{ success: boolean; message?: string }> => {
    if (!user || !userToken) {
      return { success: false, message: '로그인이 필요합니다.' };
    }
    try {
      const res = await fetch(`${API_BASE}/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ username, bio }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setUser(data.user);
        return { success: true, message: '프로필 정보가 수정되었습니다.' };
      } else {
        return { success: false, message: data.error || '프로필 수정 실패' };
      }
    } catch (err) {
      return { success: false, message: '서버 통신 실패' };
    }
  };

  // ==========================================
  // [3. 관리자 전용 인증 및 계정 관리]
  // ==========================================

  const adminLogin = async (email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const loggedAdmin: User = {
          id: data.admin.id || 1,
          email: data.admin.email,
          username: data.admin.username,
          role: 'admin',
          bio: data.admin.bio || '시스템 총괄 최고관리자',
          joinedAt: data.admin.joinedAt || '2026-01-01',
        };
        setAdminUser(loggedAdmin);
        setAdminToken(data.token);
        setUser(loggedAdmin);
        setUserToken(data.token);
        return { success: true };
      } else {
        return { success: false, message: data.error || '관리자 인증에 실패했습니다.' };
      }
    } catch (err) {
      return { success: false, message: '서버 연결 실패 또는 아이디/비밀번호 불일치' };
    }
  };

  // 일반 회원 상태에서 관리자 계정으로 즉시 전환
  const switchToAdmin = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/switch-to-admin`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdminUser(data.admin);
        setAdminToken(data.token);
        setUser(data.admin);
        setUserToken(data.token);
        return { success: true };
      } else {
        return { success: false, message: data.error || '관리자 전환에 실패했습니다.' };
      }
    } catch (err) {
      return { success: false, message: '관리자 전환 서버 연결 실패' };
    }
  };

  // 관리자 상태에서 일반 테스트 계정으로 즉시 전환
  const switchToUser = async (): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/auth/switch-to-user`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAdminUser(null);
        setAdminToken(null);
        setUser(data.user);
        setUserToken(data.token);
        return { success: true };
      } else {
        return { success: false, message: data.error || '일반 계정 전환에 실패했습니다.' };
      }
    } catch (err) {
      return { success: false, message: '일반 계정 전환 서버 연결 실패' };
    }
  };

  const updateAdminAccount = async (params: UpdateAdminParams): Promise<{ success: boolean; message?: string }> => {
    try {
      const token = adminToken || localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/admin/account`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(params),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        const updatedAdmin: User = {
          id: data.admin.id || adminUser?.id || 1,
          email: data.admin.email,
          username: data.admin.username,
          role: 'admin',
          bio: data.admin.bio,
          joinedAt: data.admin.joinedAt || '2026-01-01',
        };
        setAdminUser(updatedAdmin);
        setUser(updatedAdmin);
        if (data.token) {
          setAdminToken(data.token);
        }
        return { success: true, message: data.message || '관리자 계정 정보가 성공적으로 변경되었습니다.' };
      } else {
        return { success: false, message: data.error || '계정 정보 변경에 실패했습니다.' };
      }
    } catch (err) {
      return { success: false, message: '네트워크 통신 중 오류가 발생했습니다.' };
    }
  };

  // 회원 목록 가져오기 (실제 SQLite DB)
  const fetchUsers = useCallback(async () => {
    const token = adminToken || userToken || localStorage.getItem('admin_token') || localStorage.getItem('user_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('회원 목록 조회 실패:', err);
    }
  }, [adminToken, userToken]);

  // 관리자 댓글 목록 가져오기 (실제 SQLite DB)
  const fetchAdminComments = useCallback(async () => {
    const token = adminToken || userToken || localStorage.getItem('admin_token') || localStorage.getItem('user_token');
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/admin/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComments(data);
      }
    } catch (err) {
      console.error('관리자 댓글 목록 조회 실패:', err);
    }
  }, [adminToken, userToken]);

  useEffect(() => {
    const token = adminToken || userToken || localStorage.getItem('admin_token') || localStorage.getItem('user_token');
    if (token) {
      fetchUsers();
      fetchAdminComments();
    }
  }, [adminToken, userToken, fetchUsers, fetchAdminComments]);

  // 회원 강제 삭제 (실제 SQLite DB)
  const deleteUser = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE}/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || '회원 삭제에 실패했습니다.');
      }
    } catch (err) {
      console.error('회원 삭제 에러:', err);
    }
  };

  // 댓글 등록 (실제 SQLite DB 저장 & post.commentCount 동기화)
  const addComment = async (
    postId: number,
    content: string,
    author?: string
  ): Promise<{ success: boolean; comment?: Comment; message?: string }> => {
    try {
      const commenter = author || user?.username || adminUser?.username || '익명 방문자';
      const token = userToken || adminToken || localStorage.getItem('user_token') || localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/posts/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          author: commenter,
          content,
          userId: user?.id || adminUser?.id || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // 전체 posts의 해당 글 commentCount 1 증가
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p))
        );
        // 관리자 댓글 목록에도 동기화
        setComments((prev) => [
          {
            ...data,
            postTitle: posts.find((p) => p.id === postId)?.title || '게시글',
          },
          ...prev,
        ]);
        return { success: true, comment: data };
      } else {
        return { success: false, message: data.error || '댓글 등록에 실패했습니다.' };
      }
    } catch (err) {
      console.error('댓글 작성 실패:', err);
      return { success: false, message: '댓글 등록 중 서버 연결 실패' };
    }
  };

  // 댓글 수정 (작성한 유저만 수정 가능, 실제 SQLite DB UPDATE)
  const updateComment = async (
    id: number,
    content: string
  ): Promise<{ success: boolean; comment?: Comment; message?: string }> => {
    try {
      const token = userToken || adminToken || localStorage.getItem('user_token') || localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/comments/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content,
          author: user?.username || adminUser?.username,
          userId: user?.id || adminUser?.id || null,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === id
              ? { ...c, content: data.comment.content, updatedAt: data.comment.updatedAt }
              : c
          )
        );
        return { success: true, comment: data.comment, message: data.message };
      } else {
        return { success: false, message: data.error || '댓글 수정 실패' };
      }
    } catch (err) {
      console.error('댓글 수정 에러:', err);
      return { success: false, message: '서버 연결 실패' };
    }
  };

  // 댓글 삭제 (작성한 유저 또는 관리자만 가능)
  const deleteComment = async (
    id: number,
    postId?: number
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const token = userToken || adminToken || localStorage.getItem('user_token') || localStorage.getItem('admin_token');
      const res = await fetch(`${API_BASE}/comments/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          author: user?.username || adminUser?.username,
          userId: user?.id || adminUser?.id || null,
          requesterRole: adminUser || user?.role === 'admin' ? 'admin' : 'user',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setComments((prev) => prev.filter((c) => c.id !== id));
        const targetPostId = postId || data.postId;
        if (targetPostId) {
          setPosts((prev) =>
            prev.map((p) =>
              p.id === targetPostId
                ? { ...p, commentCount: Math.max(0, (p.commentCount || 1) - 1) }
                : p
            )
          );
        }
        return { success: true, message: data.message };
      } else {
        return { success: false, message: data.error || '댓글 삭제 실패' };
      }
    } catch (err) {
      console.error('댓글 삭제 에러:', err);
      return { success: false, message: '서버 연결 실패' };
    }
  };

  // 댓글 숨김 토글 (관리자 전용)
  const toggleHideComment = async (
    id: number
  ): Promise<{ success: boolean; isHidden?: boolean; message?: string }> => {
    try {
      const token = adminToken || userToken || localStorage.getItem('admin_token') || localStorage.getItem('user_token');
      const res = await fetch(`${API_BASE}/admin/comments/${id}/toggle-hide`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          requesterRole: adminUser || user?.role === 'admin' ? 'admin' : 'user',
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setComments((prev) =>
          prev.map((c) => (c.id === id ? { ...c, isHidden: data.isHidden } : c))
        );
        return { success: true, isHidden: data.isHidden, message: data.message };
      } else {
        return { success: false, message: data.error || '댓글 숨김 토글 실패' };
      }
    } catch (err) {
      console.error('댓글 숨김 토글 에러:', err);
      return { success: false, message: '서버 연결 실패' };
    }
  };

  const adminLogout = () => {
    setAdminUser(null);
    setAdminToken(null);
    setUser(null);
    setUserToken(null);
  };

  return (
    <PostContext.Provider
      value={{
        posts,
        user,
        userToken,
        adminUser,
        adminToken,
        users,
        comments,
        isLoadingPosts,
        fetchPosts,
        fetchPostDetail,
        fetchUsers,
        fetchAdminComments,
        addPost,
        updatePost,
        toggleHidePost,
        getPost,
        incrementPostView,
        deletePost,
        deleteUser,
        addComment,
        updateComment,
        deleteComment,
        toggleHideComment,
        likePost,
        reactPost,
        login,
        register,
        logout,
        updateProfile,
        adminLogin,
        adminLogout,
        updateAdminAccount,
        switchToAdmin,
        switchToUser,
      }}
    >
      {children}
    </PostContext.Provider>
  );
};

export const usePosts = () => {
  const context = useContext(PostContext);
  if (!context) {
    throw new Error('usePosts must be used within a PostProvider');
  }
  return context;
};
