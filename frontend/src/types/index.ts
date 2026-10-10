export interface Post {
  id: number;
  title: string;
  content: string;
  author: string;
  userId?: number | null;
  createdAt: string;
  updatedAt?: string;
  views: number;
  likes: number;
  dislikes?: number;
  userReaction?: 'like' | 'dislike' | null;
  isHidden?: boolean;
  commentCount?: number;
}

export interface User {
  id: number;
  email: string;
  username: string;
  name?: string;
  nickname?: string;
  phone?: string;
  role?: 'admin' | 'user';
  bio?: string;
  avatarUrl?: string;
  joinedAt: string;
  hasUser?: boolean;
  hasAdmin?: boolean;
  hasProfile?: boolean;
  sourceTable?: string;
  statusType?: 'all' | 'admin' | 'user' | 'user_only' | 'profile_only';
}

export interface Comment {
  id: number;
  postId: number;
  userId?: number | null;
  author: string;
  content: string;
  isHidden?: boolean;
  isMasked?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface AdminComment extends Comment {
  postTitle?: string;
}

