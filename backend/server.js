import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db, { initDatabase, syncAdminCredentialsFromEnv } from './db.js';

// 환경 변수 설정 (.env 로드)
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_2026_community_admin_secure!';
const SESSION_EXPIRY = process.env.SESSION_EXPIRY || '24h';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

// SQLite 데이터베이스 및 테이블 초기화 (관리자 계정 bcrypt 동기화 포함)
initDatabase();

// 미들웨어 설정
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// .env 파일 내 관리자 계정 정보 동기화 헬퍼 함수
function updateEnvAdminCredentials({ email, username, password }) {
  try {
    const envPath = path.resolve(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;
    let content = fs.readFileSync(envPath, 'utf8');

    if (email) {
      content = content.replace(/^ADMIN_EMAIL=.*$/m, `ADMIN_EMAIL=${email}`);
      process.env.ADMIN_EMAIL = email;
    }
    if (username) {
      if (/^ADMIN_NAME=/m.test(content)) {
        content = content.replace(/^ADMIN_NAME=.*$/m, `ADMIN_NAME=${username}`);
      } else if (/^ADMIN_USERNAME=/m.test(content)) {
        content = content.replace(/^ADMIN_USERNAME=.*$/m, `ADMIN_USERNAME=${username}`);
      } else {
        content += `\nADMIN_NAME=${username}\n`;
      }
      process.env.ADMIN_NAME = username;
      process.env.ADMIN_USERNAME = username;
    }
    if (password) {
      content = content.replace(/^ADMIN_PASSWORD=.*$/m, `ADMIN_PASSWORD=${password}`);
      process.env.ADMIN_PASSWORD = password;
    }

    fs.writeFileSync(envPath, content, 'utf8');
    console.log('.env 파일 내 관리자 계정 설정이 성공적으로 갱신되었습니다.');
  } catch (err) {
    console.error('.env 갱신 실패:', err);
  }
}

// 일반 사용자/관리자 JWT 토큰 검증 미들웨어
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰(Bearer)이 누락되었습니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않거나 만료된 세션 토큰입니다.' });
  }
};

// 관리자 전용 JWT 세션 검증 미들웨어
const authenticateAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '인증 토큰(Bearer)이 누락되었습니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: '관리자 전용 접근 권한이 필요합니다.' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않거나 만료된 세션 토큰입니다.' });
  }
};

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ message: 'Express + SQLite 백엔드 서버가 정상적으로 실행 중입니다.' });
});

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: 'sqlite',
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// [1. 회원 인증 API (실제 DB 연동)]
// ==========================================

// 회원가입 (실제 SQLite 저장 & bcrypt 암호화)
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: '이메일, 닉네임, 비밀번호를 모두 입력해주세요.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(trimmedEmail);
    if (existing) {
      return res.status(400).json({ error: '이미 등록된 이메일 계정입니다.' });
    }

    const hashedPassword = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
    const insert = db.prepare(`
      INSERT INTO users (email, username, password, role, bio)
      VALUES (?, ?, ?, 'user', '새로 가입한 회원입니다.')
    `);
    const result = insert.run(trimmedEmail, trimmedUsername, hashedPassword);

    const newUser = db.prepare('SELECT id, email, username, role, bio, created_at as joinedAt FROM users WHERE id = ?').get(result.lastInsertRowid);
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    res.status(201).json({ success: true, user: newUser, token });
  } catch (error) {
    console.error('회원가입 에러:', error);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// .env 관리자 계정 정보 조회 (DB 동기화 보장)
app.get('/api/auth/admin-info', (req, res) => {
  try {
    const synced = syncAdminCredentialsFromEnv();
    const admin = db.prepare("SELECT id, email, username, role, bio, created_at as joinedAt FROM users WHERE role = 'admin'").get();
    res.json({
      success: true,
      email: admin ? admin.email : (synced?.adminEmail || 'iicbruce@naver.com'),
      username: admin ? admin.username : (synced?.adminName || 'bodyguard'),
      name: admin ? admin.username : (synced?.adminName || 'bodyguard'),
    });
  } catch (error) {
    res.status(500).json({ error: '관리자 정보 조회 실패' });
  }
});

// 일반 회원 상태에서 관리자 계정으로 즉시 전환 API
app.post('/api/auth/switch-to-admin', (req, res) => {
  try {
    syncAdminCredentialsFromEnv();
    const admin = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
    if (!admin) {
      return res.status(404).json({ error: '관리자 계정을 찾을 수 없습니다.' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    const { password: _, ...adminData } = admin;
    res.json({
      success: true,
      message: '관리자 계정으로 성공적으로 전환되었습니다.',
      admin: adminData,
      user: adminData,
      token,
    });
  } catch (error) {
    console.error('관리자 계정 전환 에러:', error);
    res.status(500).json({ error: '관리자 계정 전환 처리 중 오류가 발생했습니다.' });
  }
});

// 관리자 상태에서 일반 테스트 계정(user@example.com)으로 전환 API
app.post('/api/auth/switch-to-user', (req, res) => {
  try {
    const user = db.prepare("SELECT * FROM users WHERE email = 'user@example.com'").get();
    if (!user) {
      return res.status(404).json({ error: '일반 테스트 계정을 찾을 수 없습니다.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: 'user' },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    const { password: _, ...userData } = user;
    res.json({
      success: true,
      message: '일반 회원 계정으로 전환되었습니다.',
      user: userData,
      token,
    });
  } catch (error) {
    console.error('일반 계정 전환 에러:', error);
    res.status(500).json({ error: '일반 계정 전환 처리 중 오류가 발생했습니다.' });
  }
});

// 로그인 (실제 SQLite 사용자 검증 & bcrypt 비교, .env 관리자 동기화 포함)
app.post('/api/auth/login', (req, res) => {
  try {
    // 로그인 시도 전 최신 .env 관리자 계정 정보를 DB에 즉시 동기화
    syncAdminCredentialsFromEnv();

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 모두 입력해주세요.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(trimmedEmail);

    if (!user) {
      return res.status(401).json({ error: '가입되지 않은 이메일 주소입니다.' });
    }

    const isPasswordValid = user.password.startsWith('$2')
      ? bcrypt.compareSync(password, user.password)
      : user.password === password;

    if (!isPasswordValid) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다.' });
    }

    // 평문 비밀번호일 경우 bcrypt 해시로 자동 업그레이드
    if (!user.password.startsWith('$2')) {
      const hashed = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
    }

    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      bio: user.bio,
      joinedAt: user.created_at,
    };

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    res.json({ success: true, user: userData, token });
  } catch (error) {
    console.error('로그인 에러:', error);
    res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
  }
});

// 내 정보 조회
app.get('/api/auth/me', authenticateUser, (req, res) => {
  try {
    const user = db.prepare('SELECT id, email, username, role, bio, created_at as joinedAt FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: '회원 정보를 찾을 수 없습니다.' });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: '회원 정보 조회 실패' });
  }
});

// 프로필 정보 수정 (닉네임, 자기소개)
app.put('/api/auth/profile', authenticateUser, (req, res) => {
  try {
    const { username, bio } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: '닉네임을 입력해주세요.' });
    }

    db.prepare('UPDATE users SET username = ?, bio = ? WHERE id = ?').run(
      username.trim(),
      bio !== undefined ? bio : '',
      req.user.id
    );

    const updated = db.prepare('SELECT id, email, username, role, bio, created_at as joinedAt FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, user: updated });
  } catch (error) {
    console.error('프로필 수정 에러:', error);
    res.status(500).json({ error: '프로필 수정에 실패했습니다.' });
  }
});

// ==========================================
// [2. 게시판(Posts) 및 댓글(Comments) API (SQLite 연동)]
// ==========================================

// 게시글 목록 조회 (SQLite DB 연동)
app.get('/api/posts', (req, res) => {
  try {
    const rawPosts = db.prepare(`
      SELECT p.id, p.title, p.content, p.author, p.user_id as userId, 
             p.views, p.likes, COALESCE(p.dislikes, 0) as dislikes,
             p.is_hidden as isHidden,
             strftime('%Y-%m-%d', p.created_at) as createdAt,
             strftime('%Y-%m-%d %H:%M', p.updated_at) as updatedAt,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as commentCount
      FROM posts p
      ORDER BY p.id DESC
    `).all();

    const posts = rawPosts.map((p) => ({
      ...p,
      views: Number(p.views || 0),
      likes: Number(p.likes || 0),
      dislikes: Number(p.dislikes || 0),
      isHidden: Boolean(p.isHidden),
      commentCount: Number(p.commentCount || 0),
    }));

    res.json(posts);
  } catch (error) {
    console.error('게시글 목록 조회 에러:', error);
    res.status(500).json({ error: '게시글 목록을 불러오지 못했습니다.' });
  }
});

// 게시글 상세 조회 (SQLite DB 연동 & 조회수 증가 & 사용자 반응 확인)
app.get('/api/posts/:id', (req, res) => {
  try {
    const post = db.prepare(`
      SELECT p.id, p.title, p.content, p.author, p.user_id as userId, 
             p.views, p.likes, COALESCE(p.dislikes, 0) as dislikes,
             p.is_hidden as isHidden,
             strftime('%Y-%m-%d', p.created_at) as createdAt,
             strftime('%Y-%m-%d %H:%M', p.updated_at) as updatedAt,
             (SELECT COUNT(*) FROM comments c WHERE c.post_id = p.id) as commentCount
      FROM posts p 
      WHERE p.id = ?
    `).get(req.params.id);

    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    // 조회수 1 증가 (SQLite UPDATE)
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(req.params.id);
    post.views = Number(post.views || 0) + 1;
    post.likes = Number(post.likes || 0);
    post.dislikes = Number(post.dislikes || 0);
    post.isHidden = Boolean(post.isHidden);
    post.commentCount = Number(post.commentCount || 0);

    // 요청자 식별 후 기존 좋아요/싫어요 반응 상태 확인
    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        currentUserId = decoded.id;
      } catch (e) {}
    }
    if (!currentUserId && req.query.userId) {
      currentUserId = Number(req.query.userId);
    }
    const identifier = currentUserId ? `user_${currentUserId}` : (req.query.identifier || `guest_${req.ip || 'anon'}`);

    const reaction = db.prepare(`
      SELECT reaction_type FROM post_reactions 
      WHERE post_id = ? AND user_identifier = ?
    `).get(req.params.id, identifier);

    post.userReaction = reaction ? reaction.reaction_type : null;

    res.json(post);
  } catch (error) {
    console.error('게시글 상세 조회 에러:', error);
    res.status(500).json({ error: '게시글을 불러오지 못했습니다.' });
  }
});

// 게시글 조회수 전용 증가 API (명시적 호출용)
app.post('/api/posts/:id/view', (req, res) => {
  try {
    const post = db.prepare('SELECT id, views FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }
    db.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').run(req.params.id);
    res.json({ success: true, views: post.views + 1 });
  } catch (error) {
    console.error('조회수 증가 에러:', error);
    res.status(500).json({ error: '조회수 증가에 실패했습니다.' });
  }
});

// 게시글 반응(좋아요/싫어요) 토글 및 DB 저장 API
app.post('/api/posts/:id/react', (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { type, userId, identifier: clientIdentifier } = req.body;

    if (!type || (type !== 'like' && type !== 'dislike')) {
      return res.status(400).json({ error: "type은 'like' 또는 'dislike'여야 합니다." });
    }

    const post = db.prepare('SELECT id, likes, COALESCE(dislikes, 0) as dislikes FROM posts WHERE id = ?').get(postId);
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    // 사용자 식별
    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        currentUserId = decoded.id;
      } catch (e) {}
    }
    if (!currentUserId && userId) {
      currentUserId = Number(userId);
    }
    const identifier = currentUserId ? `user_${currentUserId}` : (clientIdentifier || `guest_${req.ip || 'anon'}`);

    const existingReaction = db.prepare(`
      SELECT id, reaction_type FROM post_reactions 
      WHERE post_id = ? AND user_identifier = ?
    `).get(postId, identifier);

    let userReaction = null;

    if (existingReaction) {
      if (existingReaction.reaction_type === type) {
        // 이미 같은 반응을 누른 상태: 반응 취소
        db.prepare('DELETE FROM post_reactions WHERE id = ?').run(existingReaction.id);
        if (type === 'like') {
          db.prepare('UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?').run(postId);
        } else {
          db.prepare('UPDATE posts SET dislikes = MAX(0, dislikes - 1) WHERE id = ?').run(postId);
        }
        userReaction = null;
      } else {
        // 반대 반응으로 교체 (좋아요 <-> 싫어요)
        db.prepare(`
          UPDATE post_reactions 
          SET reaction_type = ?, created_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(type, existingReaction.id);

        if (type === 'like') {
          db.prepare('UPDATE posts SET likes = likes + 1, dislikes = MAX(0, dislikes - 1) WHERE id = ?').run(postId);
        } else {
          db.prepare('UPDATE posts SET dislikes = dislikes + 1, likes = MAX(0, likes - 1) WHERE id = ?').run(postId);
        }
        userReaction = type;
      }
    } else {
      // 신규 반응 등록
      db.prepare(`
        INSERT INTO post_reactions (post_id, user_id, user_identifier, reaction_type)
        VALUES (?, ?, ?, ?)
      `).run(postId, currentUserId || null, identifier, type);

      if (type === 'like') {
        db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId);
      } else {
        db.prepare('UPDATE posts SET dislikes = dislikes + 1 WHERE id = ?').run(postId);
      }
      userReaction = type;
    }

    const updatedPost = db.prepare('SELECT likes, COALESCE(dislikes, 0) as dislikes FROM posts WHERE id = ?').get(postId);
    res.json({
      success: true,
      likes: Number(updatedPost.likes || 0),
      dislikes: Number(updatedPost.dislikes || 0),
      userReaction,
    });
  } catch (error) {
    console.error('게시글 반응 처리 에러:', error);
    res.status(500).json({ error: '게시글 반응 처리에 실패했습니다.' });
  }
});

// 하위 호환 좋아요(추천) API
app.post('/api/posts/:id/like', (req, res) => {
  try {
    const postId = Number(req.params.id);
    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        currentUserId = decoded.id;
      } catch (e) {}
    }
    const identifier = currentUserId ? `user_${currentUserId}` : (req.body?.identifier || `guest_${req.ip || 'anon'}`);

    const existingReaction = db.prepare(`
      SELECT id, reaction_type FROM post_reactions WHERE post_id = ? AND user_identifier = ?
    `).get(postId, identifier);

    if (existingReaction && existingReaction.reaction_type === 'like') {
      // 이미 좋아요 -> 취소
      db.prepare('DELETE FROM post_reactions WHERE id = ?').run(existingReaction.id);
      db.prepare('UPDATE posts SET likes = MAX(0, likes - 1) WHERE id = ?').run(postId);
    } else if (existingReaction && existingReaction.reaction_type === 'dislike') {
      db.prepare('UPDATE post_reactions SET reaction_type = "like" WHERE id = ?').run(existingReaction.id);
      db.prepare('UPDATE posts SET likes = likes + 1, dislikes = MAX(0, dislikes - 1) WHERE id = ?').run(postId);
    } else {
      db.prepare('INSERT INTO post_reactions (post_id, user_id, user_identifier, reaction_type) VALUES (?, ?, ?, "like")')
        .run(postId, currentUserId || null, identifier);
      db.prepare('UPDATE posts SET likes = likes + 1 WHERE id = ?').run(postId);
    }

    const post = db.prepare('SELECT likes, COALESCE(dislikes, 0) as dislikes FROM posts WHERE id = ?').get(postId);
    res.json({ success: true, likes: post ? post.likes : 0, dislikes: post ? post.dislikes : 0 });
  } catch (error) {
    res.status(500).json({ error: '추천 처리 실패' });
  }
});

// 게시글 싫어요 API
app.post('/api/posts/:id/dislike', (req, res) => {
  try {
    const postId = Number(req.params.id);
    let currentUserId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
        currentUserId = decoded.id;
      } catch (e) {}
    }
    const identifier = currentUserId ? `user_${currentUserId}` : (req.body?.identifier || `guest_${req.ip || 'anon'}`);

    const existingReaction = db.prepare(`
      SELECT id, reaction_type FROM post_reactions WHERE post_id = ? AND user_identifier = ?
    `).get(postId, identifier);

    if (existingReaction && existingReaction.reaction_type === 'dislike') {
      // 이미 싫어요 -> 취소
      db.prepare('DELETE FROM post_reactions WHERE id = ?').run(existingReaction.id);
      db.prepare('UPDATE posts SET dislikes = MAX(0, dislikes - 1) WHERE id = ?').run(postId);
    } else if (existingReaction && existingReaction.reaction_type === 'like') {
      db.prepare('UPDATE post_reactions SET reaction_type = "dislike" WHERE id = ?').run(existingReaction.id);
      db.prepare('UPDATE posts SET dislikes = dislikes + 1, likes = MAX(0, likes - 1) WHERE id = ?').run(postId);
    } else {
      db.prepare('INSERT INTO post_reactions (post_id, user_id, user_identifier, reaction_type) VALUES (?, ?, ?, "dislike")')
        .run(postId, currentUserId || null, identifier);
      db.prepare('UPDATE posts SET dislikes = dislikes + 1 WHERE id = ?').run(postId);
    }

    const post = db.prepare('SELECT likes, COALESCE(dislikes, 0) as dislikes FROM posts WHERE id = ?').get(postId);
    res.json({ success: true, likes: post ? post.likes : 0, dislikes: post ? post.dislikes : 0 });
  } catch (error) {
    res.status(500).json({ error: '싫어요 처리 실패' });
  }
});

// 새 게시글 등록 (SQLite INSERT)
app.post('/api/posts', (req, res) => {
  try {
    const { title, content, author, userId } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: '제목과 내용을 입력해주세요.' });
    }

    let validUserId = null;
    if (userId) {
      const userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (userExists) {
        validUserId = userExists.id;
      }
    }
    if (!validUserId && author) {
      const userByAuthor = db.prepare('SELECT id FROM users WHERE username = ?').get(author.trim());
      if (userByAuthor) {
        validUserId = userByAuthor.id;
      }
    }

    const insert = db.prepare(`
      INSERT INTO posts (title, content, author, user_id, views, likes, dislikes, is_hidden)
      VALUES (?, ?, ?, ?, 0, 0, 0, 0)
    `);
    const result = insert.run(title.trim(), content.trim(), author?.trim() || '익명', validUserId);

    const createdPost = db.prepare(`
      SELECT id, title, content, author, user_id as userId, 
             views, likes, COALESCE(dislikes, 0) as dislikes,
             is_hidden as isHidden,
             strftime('%Y-%m-%d', created_at) as createdAt,
             strftime('%Y-%m-%d %H:%M', updated_at) as updatedAt
      FROM posts 
      WHERE id = ?
    `).get(result.lastInsertRowid);

    createdPost.isHidden = Boolean(createdPost.isHidden);
    res.status(201).json(createdPost);
  } catch (error) {
    console.error('게시글 작성 에러:', error);
    res.status(500).json({ error: '게시글 등록에 실패했습니다.' });
  }
});

// 게시글 수정 (SQLite UPDATE - 작성자 또는 관리자만 가능)
app.put('/api/posts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, author, requesterRole } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: '제목과 내용을 모두 입력해주세요.' });
    }

    const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: '수정할 게시글을 찾을 수 없습니다.' });
    }

    // 토큰 기반 권한 확인 (헤더에 Bearer 토큰이 있을 경우)
    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    const isAdmin = requesterRole === 'admin' || (tokenUser && tokenUser.role === 'admin');
    const isAuthor = (author && existing.author === author) || (tokenUser && tokenUser.username === existing.author);

    // 작성자 본인이거나 관리자가 아니면 수정 불가
    if (author || requesterRole || tokenUser) {
      if (!isAdmin && !isAuthor) {
        return res.status(403).json({ error: '게시글 수정 권한이 없습니다. (작성자 또는 관리자만 수정 가능)' });
      }
    }

    db.prepare(`
      UPDATE posts 
      SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(title.trim(), content.trim(), id);

    const updated = db.prepare(`
      SELECT id, title, content, author, user_id as userId, 
             views, likes, COALESCE(dislikes, 0) as dislikes,
             is_hidden as isHidden,
             strftime('%Y-%m-%d', created_at) as createdAt,
             strftime('%Y-%m-%d %H:%M', updated_at) as updatedAt
      FROM posts 
      WHERE id = ?
    `).get(id);

    updated.isHidden = Boolean(updated.isHidden);
    res.json({ success: true, message: '게시글이 성공적으로 수정되었습니다.', post: updated });
  } catch (error) {
    console.error('게시글 수정 에러:', error);
    res.status(500).json({ error: '게시글 수정에 실패했습니다.' });
  }
});

// 게시글 숨김 토글 (관리자 권한)
app.patch('/api/posts/:id/toggle-hide', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT id, is_hidden FROM posts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: '대상 게시글을 찾을 수 없습니다.' });
    }

    const newHidden = existing.is_hidden ? 0 : 1;
    db.prepare('UPDATE posts SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHidden, id);

    res.json({
      success: true,
      isHidden: Boolean(newHidden),
      message: newHidden ? '게시글이 숨김 처리되었습니다.' : '게시글 숨김이 해제되었습니다.',
    });
  } catch (error) {
    console.error('게시글 숨김 처리 에러:', error);
    res.status(500).json({ error: '게시글 숨김 처리에 실패했습니다.' });
  }
});

// 게시글 삭제 (작성자 또는 관리자만 가능)
app.delete('/api/posts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { author, requesterRole } = req.body || {};

    const existing = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: '삭제할 게시글을 찾을 수 없습니다.' });
    }

    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    const isAdmin = requesterRole === 'admin' || (tokenUser && tokenUser.role === 'admin');
    const isAuthor = (author && existing.author === author) || (tokenUser && tokenUser.username === existing.author);

    if (author || requesterRole || tokenUser) {
      if (!isAdmin && !isAuthor) {
        return res.status(403).json({ error: '게시글을 삭제할 권한이 없습니다. (작성자 또는 관리자만 가능)' });
      }
    }

    // 관련 반응 및 댓글 삭제 후 게시글 삭제
    db.prepare('DELETE FROM post_reactions WHERE post_id = ?').run(id);
    db.prepare('DELETE FROM comments WHERE post_id = ?').run(id);
    const result = db.prepare('DELETE FROM posts WHERE id = ?').run(id);

    if (result.changes === 0) {
      return res.status(404).json({ error: '삭제할 게시글을 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '게시글이 성공적으로 삭제되었습니다.' });
  } catch (error) {
    console.error('게시글 삭제 에러:', error);
    res.status(500).json({ error: '게시글 삭제에 실패했습니다.' });
  }
});

// ==========================================
// [댓글(Comments) API: 등록, 조회, 수정(작성자 전용), 삭제(작성자/관리자), 숨김(관리자)]
// ==========================================

// 특정 게시글의 댓글 목록 조회 (일반 사용자에게 숨김 댓글 마스킹)
app.get('/api/posts/:id/comments', (req, res) => {
  try {
    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    const isAdmin = tokenUser?.role === 'admin';
    const comments = db.prepare(`
      SELECT id, post_id as postId, user_id as userId, author, content, 
             COALESCE(is_hidden, 0) as isHidden,
             strftime('%Y-%m-%d %H:%M', created_at) as createdAt,
             strftime('%Y-%m-%d %H:%M', updated_at) as updatedAt
      FROM comments 
      WHERE post_id = ? 
      ORDER BY id ASC
    `).all(req.params.id);

    const processedComments = comments.map((c) => {
      const isHidden = Boolean(c.isHidden);
      const isOwner = tokenUser && (
        (c.userId && tokenUser.id === c.userId) ||
        tokenUser.username === c.author
      );

      // 숨김 처리된 댓글: 관리자나 본인이 아니면 내용을 마스킹 처리하여 보호
      if (isHidden && !isAdmin && !isOwner) {
        return {
          ...c,
          content: '관리자에 의해 숨김 처리된 댓글입니다.',
          isHidden: true,
          isMasked: true,
        };
      }

      return {
        ...c,
        isHidden,
        isMasked: false,
      };
    });

    res.json(processedComments);
  } catch (error) {
    console.error('댓글 목록 조회 에러:', error);
    res.status(500).json({ error: '댓글 목록을 불러오지 못했습니다.' });
  }
});

// 댓글 등록 (다른 유저 누구나 작성 가능, user_id 연동)
app.post('/api/posts/:id/comments', (req, res) => {
  try {
    const { author, content, userId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    }

    const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
      return res.status(404).json({ error: '댓글을 작성할 대상 게시글을 찾을 수 없습니다.' });
    }

    // 작성 유저 정보 파악 (토큰 우선, body 보조)
    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    let finalUserId = tokenUser?.id || (userId ? Number(userId) : null);
    let finalAuthor = (tokenUser?.username || author || '').trim();
    if (!finalAuthor) {
      finalAuthor = '익명 방문자';
    }

    // 유효한 user_id 검증
    if (finalUserId) {
      const u = db.prepare('SELECT id FROM users WHERE id = ?').get(finalUserId);
      if (!u) finalUserId = null;
    }

    const insert = db.prepare(`
      INSERT INTO comments (post_id, user_id, author, content, is_hidden)
      VALUES (?, ?, ?, ?, 0)
    `);
    const result = insert.run(req.params.id, finalUserId, finalAuthor, content.trim());

    const newComment = db.prepare(`
      SELECT id, post_id as postId, user_id as userId, author, content, 
             COALESCE(is_hidden, 0) as isHidden,
             strftime('%Y-%m-%d %H:%M', created_at) as createdAt,
             strftime('%Y-%m-%d %H:%M', updated_at) as updatedAt
      FROM comments 
      WHERE id = ?
    `).get(result.lastInsertRowid);

    newComment.isHidden = Boolean(newComment.isHidden);
    newComment.isMasked = false;

    res.status(201).json(newComment);
  } catch (error) {
    console.error('댓글 작성 에러:', error);
    res.status(500).json({ error: '댓글 등록에 실패했습니다.' });
  }
});

// 댓글 수정 (작성한 유저만 수정 가능!)
app.put('/api/comments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { content, author, userId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '수정할 댓글 내용을 입력해주세요.' });
    }

    const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: '수정할 댓글을 찾을 수 없습니다.' });
    }

    // 작성 유저 권한 검증 (토큰 또는 전달된 유저 정보 대조)
    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    const isTokenOwner = tokenUser && (
      (existing.user_id && tokenUser.id === existing.user_id) ||
      tokenUser.username === existing.author
    );
    const isBodyOwner = (
      (existing.user_id && userId && Number(userId) === existing.user_id) ||
      (author && author.trim() === existing.author)
    );

    if (!isTokenOwner && !isBodyOwner) {
      return res.status(403).json({ error: '해당 댓글은 작성한 유저만 수정할 수 있습니다.' });
    }

    db.prepare(`
      UPDATE comments 
      SET content = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(content.trim(), id);

    const updated = db.prepare(`
      SELECT id, post_id as postId, user_id as userId, author, content, 
             COALESCE(is_hidden, 0) as isHidden,
             strftime('%Y-%m-%d %H:%M', created_at) as createdAt,
             strftime('%Y-%m-%d %H:%M', updated_at) as updatedAt
      FROM comments 
      WHERE id = ?
    `).get(id);

    updated.isHidden = Boolean(updated.isHidden);
    res.json({ success: true, message: '댓글이 성공적으로 수정되었습니다.', comment: updated });
  } catch (error) {
    console.error('댓글 수정 에러:', error);
    res.status(500).json({ error: '댓글 수정에 실패했습니다.' });
  }
});

// 댓글 삭제 (작성한 유저 또는 관리자만 삭제 가능)
app.delete('/api/comments/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { author, userId, requesterRole } = req.body || {};

    const existing = db.prepare('SELECT * FROM comments WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: '삭제할 댓글을 찾을 수 없습니다.' });
    }

    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    const isAdmin = (tokenUser && tokenUser.role === 'admin') || requesterRole === 'admin';
    const isTokenOwner = tokenUser && (
      (existing.user_id && tokenUser.id === existing.user_id) ||
      tokenUser.username === existing.author
    );
    const isBodyOwner = (
      (existing.user_id && userId && Number(userId) === existing.user_id) ||
      (author && author === existing.author)
    );

    if (!isAdmin && !isTokenOwner && !isBodyOwner) {
      return res.status(403).json({ error: '해당 댓글은 작성한 유저 또는 관리자만 삭제할 수 있습니다.' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(id);
    res.json({ success: true, message: '댓글이 성공적으로 삭제되었습니다.', postId: existing.post_id });
  } catch (error) {
    console.error('댓글 삭제 에러:', error);
    res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
  }
});

// 댓글 숨김 토글 API (관리자 전용)
app.patch('/api/comments/:id/toggle-hide', (req, res) => {
  try {
    const { id } = req.params;
    const { requesterRole } = req.body || {};

    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    const isAdmin = (tokenUser && tokenUser.role === 'admin') || requesterRole === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ error: '댓글 숨김 관리는 관리자 권한이 필요합니다.' });
    }

    const existing = db.prepare('SELECT id, is_hidden FROM comments WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: '대상 댓글을 찾을 수 없습니다.' });
    }

    const newHidden = existing.is_hidden ? 0 : 1;
    db.prepare('UPDATE comments SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHidden, id);

    res.json({
      success: true,
      isHidden: Boolean(newHidden),
      message: newHidden ? '댓글이 숨김 처리되었습니다.' : '댓글 숨김이 해제되었습니다.',
    });
  } catch (error) {
    console.error('댓글 숨김 토글 에러:', error);
    res.status(500).json({ error: '댓글 숨김 처리에 실패했습니다.' });
  }
});

// ==========================================
// [3. 관리자(Admin) 전용 API: 인증, 세션, 계정 수정, 통계]
// ==========================================

// 관리자 로그인 (bcrypt 해시 검증 & JWT 세션 토큰 발급, .env 관리자 동기화 포함)
app.post('/api/admin/login', (req, res) => {
  try {
    // 로그인 시도 전 최신 .env 관리자 계정 정보를 DB에 즉시 동기화
    syncAdminCredentialsFromEnv();

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 모두 입력해주세요.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const user = db.prepare("SELECT * FROM users WHERE email = ? AND role = 'admin'").get(trimmedEmail);

    if (!user) {
      return res.status(401).json({ error: '존재하지 않는 관리자 계정입니다. (.env의 ADMIN_EMAIL 설정을 확인하세요)' });
    }

    // bcrypt 해시 비밀번호 대조
    const isPasswordValid = user.password.startsWith('$2')
      ? bcrypt.compareSync(password, user.password)
      : user.password === password;

    if (!isPasswordValid) {
      return res.status(401).json({ error: '비밀번호가 일치하지 않습니다. (.env의 ADMIN_PASSWORD 설정을 확인하세요)' });
    }

    // 비밀번호가 평문이었던 경우 bcrypt 해시로 자동 업그레이드
    if (!user.password.startsWith('$2')) {
      const hashed = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
      db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);
    }

    // 암호화된 JWT 세션 서명 토큰 생성
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    const { password: _, ...adminData } = user;

    res.json({
      success: true,
      message: '관리자 인증 성공 (JWT 세션 발급 완료)',
      admin: adminData,
      token,
    });
  } catch (error) {
    console.error('관리자 로그인 에러:', error);
    res.status(500).json({ error: '관리자 로그인 처리 중 서버 오류가 발생했습니다.' });
  }
});

// 관리자 보안 및 암호화 설정 정보 조회
app.get('/api/admin/security-info', authenticateAdmin, (req, res) => {
  try {
    const maskedSecret = JWT_SECRET.slice(0, 4) + '****************' + JWT_SECRET.slice(-4);
    res.json({
      hashAlgorithm: `bcrypt (${BCRYPT_SALT_ROUNDS} salt rounds)`,
      sessionType: 'JWT (JSON Web Token)',
      sessionExpiry: SESSION_EXPIRY,
      jwtSecretStatus: '보호 중 (암호화 서명 활성화)',
      maskedSecret,
      currentAdminEmail: req.admin.email,
    });
  } catch (error) {
    res.status(500).json({ error: '보안 정보 조회 실패' });
  }
});

// 관리자 계정 정보 및 비밀번호 변경 API
app.put('/api/admin/account', authenticateAdmin, (req, res) => {
  try {
    const { email, username, bio, currentPassword, newPassword } = req.body;
    const adminId = req.admin.id;

    const admin = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'admin'").get(adminId);
    if (!admin) {
      return res.status(404).json({ error: '관리자 계정을 찾을 수 없습니다.' });
    }

    if (newPassword || (email && email !== admin.email)) {
      if (!currentPassword) {
        return res.status(400).json({ error: '보안을 위해 현재 비밀번호를 입력해주세요.' });
      }

      const isCurrentPasswordCorrect = admin.password.startsWith('$2')
        ? bcrypt.compareSync(currentPassword, admin.password)
        : admin.password === currentPassword;

      if (!isCurrentPasswordCorrect) {
        return res.status(401).json({ error: '현재 비밀번호가 일치하지 않습니다.' });
      }
    }

    const updatedEmail = email?.trim() || admin.email;
    if (updatedEmail !== admin.email) {
      const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(updatedEmail, adminId);
      if (existing) {
        return res.status(400).json({ error: '이미 다른 사용자가 사용 중인 이메일입니다.' });
      }
    }

    const updatedUsername = username?.trim() || admin.username;
    const updatedBio = bio !== undefined ? bio : admin.bio;

    let updatedPasswordHash = admin.password;
    if (newPassword) {
      if (newPassword.length < 6) {
        return res.status(400).json({ error: '새 비밀번호는 최소 6자 이상이어야 합니다.' });
      }
      updatedPasswordHash = bcrypt.hashSync(newPassword, BCRYPT_SALT_ROUNDS);
    }

    db.prepare(`
      UPDATE users 
      SET email = ?, username = ?, bio = ?, password = ? 
      WHERE id = ? AND role = 'admin'
    `).run(updatedEmail, updatedUsername, updatedBio, updatedPasswordHash, adminId);

    updateEnvAdminCredentials({
      email: updatedEmail,
      username: updatedUsername,
      password: newPassword || undefined,
    });

    const newToken = jwt.sign(
      {
        id: admin.id,
        email: updatedEmail,
        username: updatedUsername,
        role: 'admin',
      },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    const updatedAdmin = db.prepare('SELECT id, email, username, role, bio, created_at as joinedAt FROM users WHERE id = ?').get(adminId);

    res.json({
      success: true,
      message: '관리자 계정 정보가 성공적으로 변경되었습니다. (DB 및 .env 동기화 완료)',
      admin: updatedAdmin,
      token: newToken,
    });
  } catch (error) {
    console.error('관리자 계정 변경 에러:', error);
    res.status(500).json({ error: '계정 정보 변경 중 오류가 발생했습니다.' });
  }
});

// 관리자 대시보드 요약 통계
app.get('/api/admin/stats', authenticateAdmin, (req, res) => {
  try {
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalPosts = db.prepare('SELECT COUNT(*) as count FROM posts').get().count;
    const totalComments = db.prepare('SELECT COUNT(*) as count FROM comments').get().count;
    const totalViews = db.prepare('SELECT COALESCE(SUM(views), 0) as total FROM posts').get().total;

    const recentPosts = db.prepare(`
      SELECT id, title, author, views, likes, strftime('%Y-%m-%d', created_at) as createdAt 
      FROM posts 
      ORDER BY id DESC LIMIT 5
    `).all();

    const recentUsers = db.prepare(`
      SELECT id, email, username, role, strftime('%Y-%m-%d', created_at) as joinedAt 
      FROM users 
      ORDER BY id DESC LIMIT 5
    `).all();

    res.json({
      totalUsers,
      totalPosts,
      totalComments,
      totalViews,
      recentPosts,
      recentUsers,
    });
  } catch (error) {
    console.error('통계 조회 에러:', error);
    res.status(500).json({ error: '통계 정보를 불러오지 못했습니다.' });
  }
});

// 관리자 회원 관리: 회원 목록 조회
app.get('/api/admin/users', authenticateAdmin, (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, email, username, role, bio, strftime('%Y-%m-%d', created_at) as joinedAt 
      FROM users 
      ORDER BY id DESC
    `).all();
    res.json(users);
  } catch (error) {
    console.error('회원 목록 조회 에러:', error);
    res.status(500).json({ error: '회원 목록을 불러오지 못했습니다.' });
  }
});

// 관리자 회원 삭제
app.delete('/api/admin/users/:id', authenticateAdmin, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) {
      return res.status(404).json({ error: '해당 사용자를 찾을 수 없습니다.' });
    }
    if (user.role === 'admin') {
      return res.status(400).json({ error: '최고 관리자 계정은 삭제할 수 없습니다.' });
    }

    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ message: '회원 계정이 삭제되었습니다.' });
  } catch (error) {
    console.error('회원 삭제 에러:', error);
    res.status(500).json({ error: '회원 삭제 중 오류가 발생했습니다.' });
  }
});

// 관리자 전체 댓글 조회 (숨김 여부 isHidden, 작성자 user_id 포함)
app.get('/api/admin/comments', authenticateAdmin, (req, res) => {
  try {
    const comments = db.prepare(`
      SELECT c.id, c.post_id as postId, c.user_id as userId, c.author, c.content, 
             COALESCE(c.is_hidden, 0) as isHidden,
             strftime('%Y-%m-%d %H:%M', c.created_at) as createdAt, 
             strftime('%Y-%m-%d %H:%M', c.updated_at) as updatedAt,
             COALESCE(p.title, '삭제된 게시글') as postTitle
      FROM comments c
      LEFT JOIN posts p ON c.post_id = p.id
      ORDER BY c.id DESC
    `).all();

    const formatted = comments.map((c) => ({
      ...c,
      isHidden: Boolean(c.isHidden),
    }));

    res.json(formatted);
  } catch (error) {
    console.error('관리자 댓글 목록 조회 에러:', error);
    res.status(500).json({ error: '댓글 목록을 불러오지 못했습니다.' });
  }
});

// 관리자 댓글 숨김/숨김해제 토글
app.patch('/api/admin/comments/:id/toggle-hide', authenticateAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT id, is_hidden FROM comments WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '대상 댓글을 찾을 수 없습니다.' });
    }

    const newHidden = existing.is_hidden ? 0 : 1;
    db.prepare('UPDATE comments SET is_hidden = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHidden, req.params.id);

    res.json({
      success: true,
      isHidden: Boolean(newHidden),
      message: newHidden ? '댓글이 숨김 처리되었습니다.' : '댓글 숨김이 해제되었습니다.',
    });
  } catch (error) {
    console.error('관리자 댓글 숨김 토글 에러:', error);
    res.status(500).json({ error: '댓글 숨김 처리에 실패했습니다.' });
  }
});

// 관리자 댓글 영구 삭제
app.delete('/api/admin/comments/:id', authenticateAdmin, (req, res) => {
  try {
    const existing = db.prepare('SELECT id, post_id as postId FROM comments WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: '삭제할 댓글을 찾을 수 없습니다.' });
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(req.params.id);
    res.json({ success: true, message: '댓글이 성공적으로 삭제되었습니다.', postId: existing.postId });
  } catch (error) {
    console.error('관리자 댓글 삭제 에러:', error);
    res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
  }
});

// 404 라우트 처리
app.use((req, res) => {
  res.status(404).json({ error: '요청한 엔드포인트를 찾을 수 없습니다.' });
});

// 글로벌 에러 핸들러
app.use((err, req, res, next) => {
  console.error('서버 에러:', err);
  res.status(500).json({ error: '서버 내부 오류가 발생했습니다.' });
});

// 서버 실행
app.listen(PORT, () => {
  console.log(`서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
