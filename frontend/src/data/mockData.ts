import type { Post, User } from '../types';

export const initialPosts: Post[] = [
  {
    id: 1,
    title: 'React 19 & Vite로 구축하는 모던 웹 애플리케이션',
    content: 'React 19 버전의 새로운 기능들과 Vite 번들러의 빠른 빌드 속도를 경험해 보세요. 컴포넌트 기반 아키텍처와 타입스크립트의 안정성을 결합하여 견고한 웹을 만들 수 있습니다.',
    author: '개발자A',
    createdAt: '2026-09-15',
    views: 128,
    likes: 15,
    dislikes: 0,
  },
  {
    id: 2,
    title: 'Node.js Express 백엔드와 프런트엔드 연동 가이드',
    content: 'CORS 설정부터 RESTful API 설계 및 데이터 페칭까지, 실무에서 자주 사용되는 프런트-백엔드 통신 패턴을 공유합니다.',
    author: '코딩마스터',
    createdAt: '2026-09-14',
    views: 95,
    likes: 8,
    dislikes: 0,
  },
  {
    id: 3,
    title: '자유 게시판에 첫 글을 남겨봅니다!',
    content: '안녕하세요! 프로젝트 게시판이 완성되어 첫 테스트 게시글을 작성합니다. 많은 소통과 의견 나눔 부탁드립니다.',
    author: '뉴비러너',
    createdAt: '2026-09-13',
    views: 42,
    likes: 3,
    dislikes: 0,
  },
];

export const mockUser: User = {
  id: 1,
  email: 'user@example.com',
  username: '홍길동',
  bio: '풀스택 웹 개발자를 꿈꾸는 개발자입니다. React와 Node.js를 공부하고 있습니다.',
  joinedAt: '2026-01-10',
};
