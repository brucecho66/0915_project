# 0915-project

풀스택 웹 커뮤니티 게시판 애플리케이션 (React 19 + Express + SQLite)

## 📌 주요 기능
- **게시글 관리**:
  - 게시글 목록, 상세 조회, 작성, 수정, 삭제
  - 조회수 실시간 증가 및 DB 저장
  - 추천(좋아요) / 비추천(싫어요) 상호 토글 및 DB 저장 (중복 방지)
  - 관리자에 의한 게시글 숨김 처리 기능
- **댓글 관리**:
  - 회원 및 방문자 댓글 작성 지원
  - **작성자 본인만 댓글 수정 및 삭제 가능** (인라인 수정 모드)
  - **관리자 전용 댓글 관리**: 댓글 숨김/숨김해제 토글, 댓글 삭제 기능
  - 일반 사용자 대상 숨김 처리된 댓글 마스킹 보호
- **회원 및 관리자 시스템**:
  - 회원가입, 로그인 (JWT 세션 토큰 + bcrypt 암호화)
  - 관리자 대시보드 (게시글 관리, 회원 관리, 댓글 관리, 보안 현황)

## 🛠️ 기술 스택
- **Frontend**: React 19, TypeScript, Vite, React Router v7
- **Backend**: Node.js, Express, better-sqlite3, JWT, bcryptjs
- **Database**: SQLite3 (WAL 모드)

## 🚀 실행 방법
```bash
# 전체 실행 (프론트엔드 + 백엔드 동시 실행)
npm run dev

# 프론트엔드 개별 실행 (http://localhost:5173)
npm run dev:front

# 백엔드 개별 실행 (http://localhost:5000)
npm run dev:back
```
