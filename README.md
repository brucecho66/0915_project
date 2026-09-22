# 0915-project

풀스택 웹 커뮤니티 게시판 애플리케이션 (React 19 + Express + Supabase PostgreSQL)

---

## 📌 주요 기능
- **게시글 관리**:
  - 게시글 목록, 상세 조회, 작성, 수정, 삭제
  - 로그인 세션 기반 실시간 조회수 증가 및 Supabase DB 저장
  - 추천(좋아요) / 비추천(싫어요) 상호 토글 및 Supabase DB 저장 (중복 방지)
  - 공유 기능 버튼 제외 및 관리자 게시글 숨김 처리 지원
- **댓글 관리**:
  - 다른 유저의 댓글 작성 지원
  - **작성한 유저 본인만 댓글 수정 및 삭제 가능** (인라인 실시간 수정 지원)
  - **관리자 전용 댓글 관리**: 관리자 대시보드에서 댓글 숨김/숨김해제 토글, 댓글 삭제 지원
  - 일반 사용자 대상 숨김 처리된 댓글 마스킹 보호
- **회원 및 관리자 시스템**:
  - 회원가입, 로그인 (JWT 세션 토큰 + bcrypt 해시 암호화)
  - 관리자 대시보드 (통계 요약, 게시글 관리, 회원 관리, 댓글 관리, 보안 현황)
  - 간편 계정 전환 (관리자 <-> 테스트 일반 회원)

---

## 🛠️ 기술 스택
- **Frontend**: React 19, TypeScript, Vite, React Router v7 (Vercel 배포)
- **Backend**: Node.js, Express, `@supabase/supabase-js`, JWT, bcryptjs
- **Database**: Supabase PostgreSQL (Row Level Security & 인덱스 최적화)

---

## ⚡ Supabase 데이터베이스 설정 가이드

### 1. Supabase 프로젝트 생성 및 SQL 스키마 실행
1. [Supabase 대시보드](https://supabase.com)에 로그인 후 새 프로젝트를 생성합니다.
2. 왼쪽 메뉴에서 **SQL Editor**로 이동합니다.
3. [`backend/schema.sql`](./backend/schema.sql) 파일의 내용을 복사하여 붙여넣고 **Run**을 클릭하여 실행합니다.
   - `users`, `posts`, `comments`, `post_reactions` 테이블 및 인덱스, 초기 관리자/테스트 계정이 자동으로 생성됩니다.

### 2. 백엔드 환경 변수 설정 (`backend/.env`)
Supabase 대시보드의 **Project Settings** -> **API** 메뉴에서 URL과 Key를 확인하여 `backend/.env` 파일에 설정합니다:

```env
PORT=5000
CLIENT_URL=*

# Supabase API 설정
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_ANON_KEY=your-supabase-anon-key

# JWT & 암호화 설정
JWT_SECRET=your_jwt_secret_key_here
SESSION_EXPIRY=24h
BCRYPT_SALT_ROUNDS=10

# 관리자 계정 초기 설정
ADMIN_EMAIL=iicbruce@naver.com
ADMIN_PASSWORD=admin660520!
ADMIN_NAME=bodyguard
```

### 3. Vercel 프론트엔드 환경 변수 설정
Vercel 대시보드의 **Settings** -> **Environment Variables**에서 다음 항목을 추가합니다:
- `VITE_API_URL`: 배포된 백엔드 서버의 API 주소 (예: `https://your-backend.railway.app/api` 또는 `https://your-backend.onrender.com/api`)

---

## 🚀 로컬 실행 방법
```bash
# 전체 실행 (프론트엔드 + 백엔드 동시 실행)
npm run dev

# 프론트엔드 개별 실행 (http://localhost:5173)
npm run dev:front

# 백엔드 개별 실행 (http://localhost:5000)
npm run dev:back
```
