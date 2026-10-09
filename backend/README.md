# 0915 Community Board Backend (Supabase Edge Function & Express)

본 백엔드는 **Supabase PostgreSQL** 클라우드 데이터베이스를 기반으로 동작하며,  
**Supabase Edge Functions (Deno + Hono)** 및 **Node.js Express** 환경을 모두 완벽하게 지원합니다.

---

## 🚀 1. Supabase Edge Function 배포 (클라우드 프로덕션)

Supabase Edge Functions는 글로벌 엣지 런타임(Deno 기반)에서 서버리스로 즉각 실행됩니다.

### 배포 명령어
```bash
# 백엔드 디렉터리에서 바로 배포
npm run deploy:edge

# 또는 프로젝트 루트에서 배포
npm run edge:deploy
```

> **배포된 Edge Function 엔드포인트 URL**:  
> `https://wfvmnouudayelbbomgzs.supabase.co/functions/v1/api`

---

## 🛠️ 2. 로컬 개발 환경 실행

### Express 서버 실행 (기본 포트: 5000)
```bash
npm run dev
```

### Supabase Edge Function 로컬 시뮬레이션
```bash
npm run serve:edge
```

---

## 🔑 3. 환경 변수 (.env) 설정

`.env` 파일에 아래 키값들을 설정하여 CLI 및 클라우드 서비스에 접근할 수 있습니다:

```env
# Vercel 키값 (프론트엔드 배포 및 CLI)
VERCEL_ACCESS_TOKEN=

# 슈퍼베이스 키값 (CLI 및 엣지함수 접속)
SUPABASE_ACCESS_TOKEN=your_supabase_access_token_here
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_PROJECT_ID=your-project-ref
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
```

---

## 📋 4. 지원하는 전체 API 엔드포인트 (33개)

| 분류 | 메서드 & 경로 | 설명 |
| :--- | :--- | :--- |
| **헬스체크** | `GET /health`, `GET /api/health` | 엣지 런타임 및 DB 연결 상태 확인 |
| **인증** | `POST /api/auth/register` | 회원가입 (Auth + DB + 아바타/자기소개) |
| | `POST /api/auth/login` | 로그인 (JWT 발급 및 Auth 동기화) |
| | `GET /api/auth/me` | 내 정보 조회 |
| | `PUT /api/auth/profile` | 프로필(닉네임, 자기소개, 아바타) 수정 |
| | `GET /api/auth/admin-info` | 관리자 공개 정보 조회 |
| | `POST /api/auth/switch-to-admin` | 관리자 계정 즉시 전환 |
| | `POST /api/auth/switch-to-user` | 일반 유저 계정 즉시 전환 |
| **게시글** | `GET /api/posts` | 게시글 목록 조회 (검색, 카테고리, 댓글 수) |
| | `GET /api/posts/:id` | 게시글 상세 조회 |
| | `POST /api/posts` | 게시글 작성 |
| | `PUT /api/posts/:id` | 게시글 수정 (작성자 또는 관리자) |
| | `PATCH /api/posts/:id/toggle-hide` | 게시글 숨김/표시 토글 |
| | `DELETE /api/posts/:id` | 게시글 삭제 (댓글 및 반응 연쇄 정리) |
| | `POST /api/posts/:id/view` | 조회수 실시간 증가 (IP 및 뷰어 추적) |
| | `POST /api/posts/:id/react` | 좋아요/싫어요 반응 토글 |
| | `POST /api/posts/:id/like` | 좋아요 토글 |
| | `POST /api/posts/:id/dislike` | 싫어요 토글 |
| **댓글** | `GET /api/posts/:id/comments` | 특정 게시글 댓글 목록 |
| | `POST /api/posts/:id/comments` | 댓글 작성 |
| | `PUT /api/comments/:id` | 댓글 수정 (본인 작성자 한정) |
| | `DELETE /api/comments/:id` | 댓글 삭제 (본인 또는 관리자) |
| | `PATCH /api/comments/:id/toggle-hide` | 댓글 숨김/표시 토글 |
| **관리자** | `POST /api/admin/login` | 관리자 로그인 |
| | `GET /api/admin/security-info` | 보안 및 암호화 설정 조회 |
| | `PUT /api/admin/account` | 관리자 계정/비밀번호 변경 |
| | `GET /api/admin/stats` | 대시보드 통계 (회원/글/댓글/조회수) |
| | `GET /api/admin/users` | 전체 회원 목록 조회 |
| | `DELETE /api/admin/users/:id` | 회원 강제 삭제 |
| | `GET /api/admin/posts` | 관리자용 전체 글 목록 (숨김글 포함) |
| | `GET /api/admin/comments` | 관리자용 전체 댓글 목록 |
| | `DELETE /api/admin/comments/:id` | 관리자 댓글 강제 삭제 |
| | `PATCH /api/admin/comments/:id/toggle-hide` | 댓글 관리자 숨김 토글 |
