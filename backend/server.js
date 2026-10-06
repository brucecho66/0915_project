import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase, initDatabase, syncAdminCredentialsFromEnv } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 환경 변수 설정 (backend/.env 및 루트 .env 로드)
dotenv.config({ path: path.resolve(__dirname, '.env') });
dotenv.config({ path: path.resolve(__dirname, '../.env') });


const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_key_2026_community_admin_secure!';
const SESSION_EXPIRY = process.env.SESSION_EXPIRY || '24h';
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

// Supabase PostgreSQL 데이터베이스 및 관리자 계정 초기화/동기화
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

// 날짜/시간 포맷팅 헬퍼 함수 (ISO 문자열 -> 'YYYY-MM-DD', 'YYYY-MM-DD HH:mm')
const formatDate = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDateTime = (isoString) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

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
    const isAdmin =
      decoded.role === 'admin' ||
      (decoded.email && decoded.email.toLowerCase() === (process.env.ADMIN_EMAIL || '').toLowerCase()) ||
      (decoded.username && decoded.username === process.env.ADMIN_USERNAME);

    if (!isAdmin) {
      return res.status(403).json({ error: '관리자 전용 접근 권한이 필요합니다.' });
    }
    req.admin = {
      ...decoded,
      role: 'admin',
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: '유효하지 않거나 만료된 세션 토큰입니다.' });
  }
};

// 기본 라우트
app.get('/', (req, res) => {
  res.json({ message: 'Express + Supabase (PostgreSQL) 백엔드 API 서버가 정상적으로 실행 중입니다.' });
});

// 헬스체크
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    database: 'supabase_postgresql',
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// [1. 회원 인증 API (Supabase users 연동)]
// ==========================================

// 회원가입 (Supabase Auth 유저 생성 및 public.users 데이터베이스 직접 동기화)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, username, password } = req.body;
    if (!email || !username || !password) {
      return res.status(400).json({ error: '이메일, 닉네임, 비밀번호를 모두 입력해주세요.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '비밀번호는 최소 6자 이상이어야 합니다.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    // [1단계: Supabase Auth 유저 생성]
    // Supabase 대시보드 [Authentication -> Users]에 공식 인증 계정 생성
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: trimmedUsername,
        role: 'user',
        bio: '새로 가입한 회원입니다.',
      },
    });

    if (authError) {
      const errMsg = (authError.message || '').toLowerCase();
      if (errMsg.includes('already') || errMsg.includes('registered') || errMsg.includes('exists')) {
        // 이미 DB(public.users)에도 존재하는지 확인
        const { data: existingDbUser } = await supabase
          .from('users')
          .select('id')
          .eq('email', trimmedEmail)
          .maybeSingle();

        if (existingDbUser) {
          return res.status(400).json({ error: '이미 등록된 이메일 계정입니다.' });
        }

        // Auth에는 있으나 public.users DB에 누락된 경우: DB에 자동 생성하여 복구 동기화
        const hashedPassword = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
        const { data: recoveredUser, error: recoverErr } = await supabase
          .from('users')
          .upsert(
            {
              email: trimmedEmail,
              username: trimmedUsername,
              password: hashedPassword,
              role: 'user',
              bio: '새로 가입한 회원입니다.',
            },
            { onConflict: 'email' }
          )
          .select('id, email, username, role, bio, created_at')
          .single();

        if (!recoverErr && recoveredUser) {
          console.log(`[Supabase 회원가입 동기화 복구 완료] ${trimmedEmail} (DB ID: ${recoveredUser.id})`);
          const formattedUser = {
            id: recoveredUser.id,
            email: recoveredUser.email,
            username: recoveredUser.username,
            role: recoveredUser.role,
            bio: recoveredUser.bio,
            joinedAt: formatDate(recoveredUser.created_at),
          };
          const token = jwt.sign(
            { id: formattedUser.id, email: formattedUser.email, username: formattedUser.username, role: formattedUser.role },
            JWT_SECRET,
            { expiresIn: SESSION_EXPIRY }
          );
          return res.status(201).json({ success: true, user: formattedUser, token });
        }

        return res.status(400).json({ error: '이미 등록된 이메일 계정입니다.' });
      }
      return res.status(400).json({ error: `Supabase Auth 회원가입 오류: ${authError.message}` });
    }

    // [2단계: Supabase 데이터베이스 (public.users) 직접 저장]
    const hashedPassword = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
    const { data: newUser, error: insertError } = await supabase
      .from('users')
      .upsert(
        {
          email: trimmedEmail,
          username: trimmedUsername,
          password: hashedPassword,
          role: 'user',
          bio: '새로 가입한 회원입니다.',
        },
        { onConflict: 'email' }
      )
      .select('id, email, username, role, bio, created_at')
      .single();

    if (insertError) {
      console.error('Supabase 데이터베이스 회원 등록 실패:', insertError);
      if (authUser?.user?.id) {
        await supabase.auth.admin.deleteUser(authUser.user.id);
      }
      return res.status(500).json({ error: '데이터베이스 회원 정보 저장 중 오류가 발생했습니다.' });
    }

    console.log(`[Supabase 회원가입 성공] Auth ID: ${authUser?.user?.id}, DB ID: ${newUser.id}, Email: ${trimmedEmail}`);

    // [3단계: public.profiles 프로필 분리 테이블 동기화 (존재 시)]
    try {
      await supabase.from('profiles').upsert(
        {
          user_id: newUser.id,
          email: trimmedEmail,
          username: trimmedUsername,
          bio: '새로 가입한 회원입니다.',
          role: 'user',
        },
        { onConflict: 'email' }
      );
    } catch (profErr) {
      // profiles 테이블이 아직 없는 경우 무시
    }

    const formattedUser = {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role,
      bio: newUser.bio,
      joinedAt: formatDate(newUser.created_at),
    };

    const token = jwt.sign(
      { id: formattedUser.id, email: formattedUser.email, username: formattedUser.username, role: formattedUser.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    res.status(201).json({ success: true, user: formattedUser, token });
  } catch (error) {
    console.error('회원가입 에러:', error);
    res.status(500).json({ error: '회원가입 처리 중 오류가 발생했습니다.' });
  }
});

// .env 관리자 계정 정보 조회 (DB 동기화 보장)
app.get('/api/auth/admin-info', async (req, res) => {
  try {
    const synced = await syncAdminCredentialsFromEnv();
    const { data: admin } = await supabase
      .from('users')
      .select('id, email, username, role, bio, created_at')
      .eq('role', 'admin')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    res.json({
      success: true,
      email: admin ? admin.email : (synced?.adminEmail || 'iicbruce@naver.com'),
      username: admin ? admin.username : (synced?.adminName || 'bodyguard'),
      name: admin ? admin.username : (synced?.adminName || 'bodyguard'),
    });
  } catch (error) {
    console.error('관리자 정보 조회 에러:', error);
    res.status(500).json({ error: '관리자 정보 조회 실패' });
  }
});

// 일반 회원 상태에서 관리자 계정으로 즉시 전환 API
app.post('/api/auth/switch-to-admin', async (req, res) => {
  try {
    await syncAdminCredentialsFromEnv();
    const { data: admin, error } = await supabase
      .from('users')
      .select('*')
      .eq('role', 'admin')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !admin) {
      return res.status(404).json({ error: '관리자 계정을 찾을 수 없습니다.' });
    }

    const token = jwt.sign(
      { id: admin.id, email: admin.email, username: admin.username, role: 'admin' },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    const { password: _, ...adminData } = admin;
    const formattedAdmin = {
      ...adminData,
      joinedAt: formatDate(admin.created_at),
    };

    res.json({
      success: true,
      message: '관리자 계정으로 성공적으로 전환되었습니다.',
      admin: formattedAdmin,
      user: formattedAdmin,
      token,
    });
  } catch (error) {
    console.error('관리자 계정 전환 에러:', error);
    res.status(500).json({ error: '관리자 계정 전환 처리 중 오류가 발생했습니다.' });
  }
});

// 관리자 상태에서 일반 테스트 계정(user@example.com)으로 전환 API
app.post('/api/auth/switch-to-user', async (req, res) => {
  try {
    let { data: user } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'user@example.com')
      .maybeSingle();

    // 없을 경우 일반 user 중 첫 번째 계정 검색
    if (!user) {
      const { data: fallbackUser } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'user')
        .order('id', { ascending: true })
        .limit(1)
        .maybeSingle();
      user = fallbackUser;
    }

    if (!user) {
      return res.status(404).json({ error: '일반 테스트 계정을 찾을 수 없습니다.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    const { password: _, ...userData } = user;
    const formattedUser = {
      ...userData,
      joinedAt: formatDate(user.created_at),
    };

    res.json({
      success: true,
      message: '일반 회원 계정으로 전환되었습니다.',
      user: formattedUser,
      token,
    });
  } catch (error) {
    console.error('일반 계정 전환 에러:', error);
    res.status(500).json({ error: '일반 계정 전환 처리 중 오류가 발생했습니다.' });
  }
});

// 로그인 (Supabase 사용자 검증 & bcrypt 비교, .env 관리자 동기화 포함)
app.post('/api/auth/login', async (req, res) => {
  try {
    await syncAdminCredentialsFromEnv();

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 모두 입력해주세요.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('email', trimmedEmail)
      .maybeSingle();

    if (findError || !user) {
      // Supabase Auth에 등록되어 있는지 확인 후 public.users로 자동 복구 동기화
      try {
        const { data: authSignIn, error: authSignInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: password,
        });

        if (!authSignInError && authSignIn?.user) {
          const username = authSignIn.user.user_metadata?.username || trimmedEmail.split('@')[0];
          const role = authSignIn.user.user_metadata?.role || 'user';
          const bio = authSignIn.user.user_metadata?.bio || '새로 가입한 회원입니다.';
          const hashedPassword = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);

          const { data: syncedUser } = await supabase
            .from('users')
            .upsert(
              {
                email: trimmedEmail,
                username,
                password: hashedPassword,
                role,
                bio,
              },
              { onConflict: 'email' }
            )
            .select('*')
            .single();

          if (syncedUser) {
            console.log(`[Supabase Auth 로그인 동기화 성공] ${trimmedEmail} (DB ID: ${syncedUser.id})`);
            const userData = {
              id: syncedUser.id,
              email: syncedUser.email,
              username: syncedUser.username,
              role: syncedUser.role,
              bio: syncedUser.bio,
              joinedAt: formatDate(syncedUser.created_at),
            };

            const token = jwt.sign(
              { id: syncedUser.id, email: syncedUser.email, username: syncedUser.username, role: syncedUser.role },
              JWT_SECRET,
              { expiresIn: SESSION_EXPIRY }
            );

            return res.json({ success: true, user: userData, token });
          }
        }
      } catch (e) {
        console.error('Supabase Auth 폴백 로그인 에러:', e);
      }

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
      await supabase.from('users').update({ password: hashed }).eq('id', user.id);
    }

    const userData = {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
      bio: user.bio,
      joinedAt: formatDate(user.created_at),
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
app.get('/api/auth/me', authenticateUser, async (req, res) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, username, role, bio, created_at')
      .eq('id', req.user.id)
      .maybeSingle();

    if (error || !user) {
      return res.status(404).json({ error: '회원 정보를 찾을 수 없습니다.' });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
        bio: user.bio,
        joinedAt: formatDate(user.created_at),
      },
    });
  } catch (error) {
    console.error('내 정보 조회 에러:', error);
    res.status(500).json({ error: '회원 정보 조회 실패' });
  }
});

// 프로필 정보 수정 (닉네임, 자기소개)
app.put('/api/auth/profile', authenticateUser, async (req, res) => {
  try {
    const { username, bio } = req.body;
    if (!username || !username.trim()) {
      return res.status(400).json({ error: '닉네임을 입력해주세요.' });
    }

    const { data: updated, error } = await supabase
      .from('users')
      .update({
        username: username.trim(),
        bio: bio !== undefined ? bio : '',
      })
      .eq('id', req.user.id)
      .select('id, email, username, role, bio, created_at')
      .single();

    if (error) {
      console.error('프로필 수정 실패:', error);
      return res.status(500).json({ error: '프로필 수정에 실패했습니다.' });
    }

    // [profiles 분리 테이블 동기화 (존재 시)]
    try {
      await supabase.from('profiles').upsert(
        {
          user_id: updated.id,
          email: updated.email,
          username: updated.username,
          bio: updated.bio || '',
          role: updated.role || 'user',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );
    } catch (profErr) {
      // profiles 테이블이 아직 없으면 무시
    }

    res.json({
      success: true,
      user: {
        id: updated.id,
        email: updated.email,
        username: updated.username,
        role: updated.role,
        bio: updated.bio,
        joinedAt: formatDate(updated.created_at),
      },
    });
  } catch (error) {
    console.error('프로필 수정 에러:', error);
    res.status(500).json({ error: '프로필 수정에 실패했습니다.' });
  }
});

// ==========================================
// [2. 게시판(Posts) 및 댓글(Comments) API (Supabase 연동)]
// ==========================================

// 게시글 목록 조회
app.get('/api/posts', async (req, res) => {
  try {
    // 1. 게시글 목록 조회
    const { data: rawPosts, error: postsError } = await supabase
      .from('posts')
      .select('*')
      .order('id', { ascending: false });

    if (postsError) {
      console.error('게시글 목록 조회 에러:', postsError);
      return res.status(500).json({ error: '게시글 목록을 불러오지 못했습니다.' });
    }

    // 2. 게시글별 댓글 수 계산
    const { data: commentsCountData, error: countError } = await supabase
      .from('comments')
      .select('post_id');

    const commentCountMap = {};
    if (!countError && commentsCountData) {
      commentsCountData.forEach((c) => {
        commentCountMap[c.post_id] = (commentCountMap[c.post_id] || 0) + 1;
      });
    }

    const posts = (rawPosts || []).map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      author: p.author,
      userId: p.user_id,
      views: Number(p.views || 0),
      likes: Number(p.likes || 0),
      dislikes: Number(p.dislikes || 0),
      isHidden: Boolean(p.is_hidden),
      createdAt: formatDate(p.created_at),
      updatedAt: formatDateTime(p.updated_at),
      commentCount: Number(commentCountMap[p.id] || 0),
    }));

    res.json(posts);
  } catch (error) {
    console.error('게시글 목록 조회 에러:', error);
    res.status(500).json({ error: '게시글 목록을 불러오지 못했습니다.' });
  }
});

// 게시글 상세 조회 (사용자 반응 확인 포함, 조회수는 여기서 자동 증가하지 않음)
app.get('/api/posts/:id', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { data: post, error } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();

    if (error || !post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    // 댓글 수 조회
    const { count: commentCount } = await supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .eq('post_id', postId);

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

    const { data: reaction } = await supabase
      .from('post_reactions')
      .select('reaction_type')
      .eq('post_id', postId)
      .eq('user_identifier', identifier)
      .maybeSingle();

    const formattedPost = {
      id: post.id,
      title: post.title,
      content: post.content,
      author: post.author,
      userId: post.user_id,
      views: Number(post.views || 0),
      likes: Number(post.likes || 0),
      dislikes: Number(post.dislikes || 0),
      isHidden: Boolean(post.is_hidden),
      createdAt: formatDate(post.created_at),
      updatedAt: formatDateTime(post.updated_at),
      commentCount: Number(commentCount || 0),
      userReaction: reaction ? reaction.reaction_type : null,
    };

    res.json(formattedPost);
  } catch (error) {
    console.error('게시글 상세 조회 에러:', error);
    res.status(500).json({ error: '게시글을 불러오지 못했습니다.' });
  }
});

// 게시글 조회수 증가 API (회원 및 비회원 방문자 모두 카운트)
app.post('/api/posts/:id/view', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { data: post, error } = await supabase
      .from('posts')
      .select('id, views')
      .eq('id', postId)
      .maybeSingle();

    if (error || !post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const updatedViews = Number(post.views || 0) + 1;
    const { error: updateError } = await supabase
      .from('posts')
      .update({ views: updatedViews })
      .eq('id', postId);

    if (updateError) {
      console.error('조회수 업데이트 실패:', updateError);
      return res.status(500).json({ error: '조회수 증가에 실패했습니다.' });
    }

    res.json({ success: true, views: updatedViews });
  } catch (error) {
    console.error('조회수 증가 에러:', error);
    res.status(500).json({ error: '조회수 증가에 실패했습니다.' });
  }
});


// 게시글 반응(좋아요/싫어요) 토글 및 Supabase 저장 API
app.post('/api/posts/:id/react', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { type, userId, identifier: clientIdentifier } = req.body;

    if (!type || (type !== 'like' && type !== 'dislike')) {
      return res.status(400).json({ error: "type은 'like' 또는 'dislike'여야 합니다." });
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, likes, dislikes')
      .eq('id', postId)
      .maybeSingle();

    if (postError || !post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

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

    const { data: existingReaction } = await supabase
      .from('post_reactions')
      .select('id, reaction_type')
      .eq('post_id', postId)
      .eq('user_identifier', identifier)
      .maybeSingle();

    let userReaction = null;
    let newLikes = Number(post.likes || 0);
    let newDislikes = Number(post.dislikes || 0);

    if (existingReaction) {
      if (existingReaction.reaction_type === type) {
        // 동일한 반응 다시 클릭 -> 취소
        await supabase.from('post_reactions').delete().eq('id', existingReaction.id);
        if (type === 'like') {
          newLikes = Math.max(0, newLikes - 1);
        } else {
          newDislikes = Math.max(0, newDislikes - 1);
        }
        userReaction = null;
      } else {
        // 반대 반응으로 교체 (좋아요 <-> 싫어요)
        await supabase
          .from('post_reactions')
          .update({ reaction_type: type, created_at: new Date().toISOString() })
          .eq('id', existingReaction.id);

        if (type === 'like') {
          newLikes = newLikes + 1;
          newDislikes = Math.max(0, newDislikes - 1);
        } else {
          newDislikes = newDislikes + 1;
          newLikes = Math.max(0, newLikes - 1);
        }
        userReaction = type;
      }
    } else {
      // 신규 반응 등록
      await supabase.from('post_reactions').insert({
        post_id: postId,
        user_id: currentUserId || null,
        user_identifier: identifier,
        reaction_type: type,
      });

      if (type === 'like') {
        newLikes = newLikes + 1;
      } else {
        newDislikes = newDislikes + 1;
      }
      userReaction = type;
    }

    // posts 테이블 좋아요/싫어요 수 갱신
    await supabase
      .from('posts')
      .update({ likes: newLikes, dislikes: newDislikes })
      .eq('id', postId);

    res.json({
      success: true,
      likes: newLikes,
      dislikes: newDislikes,
      userReaction,
    });
  } catch (error) {
    console.error('게시글 반응 처리 에러:', error);
    res.status(500).json({ error: '게시글 반응 처리에 실패했습니다.' });
  }
});

// 하위 호환 좋아요(추천) API
app.post('/api/posts/:id/like', async (req, res) => {
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

    const { data: post } = await supabase.from('posts').select('id, likes, dislikes').eq('id', postId).maybeSingle();
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    let likes = Number(post.likes || 0);
    let dislikes = Number(post.dislikes || 0);

    const { data: existingReaction } = await supabase
      .from('post_reactions')
      .select('id, reaction_type')
      .eq('post_id', postId)
      .eq('user_identifier', identifier)
      .maybeSingle();

    if (existingReaction && existingReaction.reaction_type === 'like') {
      await supabase.from('post_reactions').delete().eq('id', existingReaction.id);
      likes = Math.max(0, likes - 1);
    } else if (existingReaction && existingReaction.reaction_type === 'dislike') {
      await supabase.from('post_reactions').update({ reaction_type: 'like' }).eq('id', existingReaction.id);
      likes = likes + 1;
      dislikes = Math.max(0, dislikes - 1);
    } else {
      await supabase.from('post_reactions').insert({
        post_id: postId,
        user_id: currentUserId || null,
        user_identifier: identifier,
        reaction_type: 'like',
      });
      likes = likes + 1;
    }

    await supabase.from('posts').update({ likes, dislikes }).eq('id', postId);
    res.json({ success: true, likes, dislikes });
  } catch (error) {
    console.error('추천 처리 에러:', error);
    res.status(500).json({ error: '추천 처리 실패' });
  }
});

// 하위 호환 싫어요 API
app.post('/api/posts/:id/dislike', async (req, res) => {
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

    const { data: post } = await supabase.from('posts').select('id, likes, dislikes').eq('id', postId).maybeSingle();
    if (!post) return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });

    let likes = Number(post.likes || 0);
    let dislikes = Number(post.dislikes || 0);

    const { data: existingReaction } = await supabase
      .from('post_reactions')
      .select('id, reaction_type')
      .eq('post_id', postId)
      .eq('user_identifier', identifier)
      .maybeSingle();

    if (existingReaction && existingReaction.reaction_type === 'dislike') {
      await supabase.from('post_reactions').delete().eq('id', existingReaction.id);
      dislikes = Math.max(0, dislikes - 1);
    } else if (existingReaction && existingReaction.reaction_type === 'like') {
      await supabase.from('post_reactions').update({ reaction_type: 'dislike' }).eq('id', existingReaction.id);
      dislikes = dislikes + 1;
      likes = Math.max(0, likes - 1);
    } else {
      await supabase.from('post_reactions').insert({
        post_id: postId,
        user_id: currentUserId || null,
        user_identifier: identifier,
        reaction_type: 'dislike',
      });
      dislikes = dislikes + 1;
    }

    await supabase.from('posts').update({ likes, dislikes }).eq('id', postId);
    res.json({ success: true, likes, dislikes });
  } catch (error) {
    console.error('싫어요 처리 에러:', error);
    res.status(500).json({ error: '싫어요 처리 실패' });
  }
});

// 새 게시글 등록
app.post('/api/posts', async (req, res) => {
  try {
    const { title, content, author, userId } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: '제목과 내용을 입력해주세요.' });
    }

    let validUserId = null;
    if (userId) {
      const { data: userExists } = await supabase.from('users').select('id').eq('id', userId).maybeSingle();
      if (userExists) {
        validUserId = userExists.id;
      }
    }
    if (!validUserId && author) {
      const { data: userByAuthor } = await supabase.from('users').select('id').eq('username', author.trim()).maybeSingle();
      if (userByAuthor) {
        validUserId = userByAuthor.id;
      }
    }

    const { data: createdPost, error: insertError } = await supabase
      .from('posts')
      .insert({
        title: title.trim(),
        content: content.trim(),
        author: author?.trim() || '익명',
        user_id: validUserId,
        views: 0,
        likes: 0,
        dislikes: 0,
        is_hidden: false,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('게시글 작성 에러:', insertError);
      return res.status(500).json({ error: '게시글 등록에 실패했습니다.' });
    }

    const formatted = {
      id: createdPost.id,
      title: createdPost.title,
      content: createdPost.content,
      author: createdPost.author,
      userId: createdPost.user_id,
      views: 0,
      likes: 0,
      dislikes: 0,
      isHidden: false,
      commentCount: 0,
      createdAt: formatDate(createdPost.created_at),
      updatedAt: formatDateTime(createdPost.updated_at),
    };

    res.status(201).json(formatted);
  } catch (error) {
    console.error('게시글 작성 에러:', error);
    res.status(500).json({ error: '게시글 등록에 실패했습니다.' });
  }
});

// 게시글 수정 (작성자 또는 관리자만 가능)
app.put('/api/posts/:id', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { title, content, author, requesterRole } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: '제목과 내용을 모두 입력해주세요.' });
    }

    const { data: existing, error: findError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();

    if (findError || !existing) {
      return res.status(404).json({ error: '수정할 게시글을 찾을 수 없습니다.' });
    }

    // 토큰 기반 권한 확인
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
        return res.status(403).json({ error: '게시글 수정 권한이 없습니다. (작성자 또는 관리자만 수정 가능)' });
      }
    }

    const { data: updated, error: updateError } = await supabase
      .from('posts')
      .update({
        title: title.trim(),
        content: content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', postId)
      .select('*')
      .single();

    if (updateError) {
      console.error('게시글 수정 에러:', updateError);
      return res.status(500).json({ error: '게시글 수정에 실패했습니다.' });
    }

    const formatted = {
      id: updated.id,
      title: updated.title,
      content: updated.content,
      author: updated.author,
      userId: updated.user_id,
      views: Number(updated.views || 0),
      likes: Number(updated.likes || 0),
      dislikes: Number(updated.dislikes || 0),
      isHidden: Boolean(updated.is_hidden),
      createdAt: formatDate(updated.created_at),
      updatedAt: formatDateTime(updated.updated_at),
    };

    res.json({ success: true, message: '게시글이 성공적으로 수정되었습니다.', post: formatted });
  } catch (error) {
    console.error('게시글 수정 에러:', error);
    res.status(500).json({ error: '게시글 수정에 실패했습니다.' });
  }
});

// 게시글 숨김 토글 (관리자 권한)
app.patch('/api/posts/:id/toggle-hide', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { data: existing, error: findError } = await supabase
      .from('posts')
      .select('id, is_hidden')
      .eq('id', postId)
      .maybeSingle();

    if (findError || !existing) {
      return res.status(404).json({ error: '대상 게시글을 찾을 수 없습니다.' });
    }

    const newHidden = !existing.is_hidden;
    const { error: updateError } = await supabase
      .from('posts')
      .update({ is_hidden: newHidden, updated_at: new Date().toISOString() })
      .eq('id', postId);

    if (updateError) {
      console.error('게시글 숨김 에러:', updateError);
      return res.status(500).json({ error: '게시글 숨김 처리에 실패했습니다.' });
    }

    res.json({
      success: true,
      isHidden: newHidden,
      message: newHidden ? '게시글이 숨김 처리되었습니다.' : '게시글 숨김이 해제되었습니다.',
    });
  } catch (error) {
    console.error('게시글 숨김 처리 에러:', error);
    res.status(500).json({ error: '게시글 숨김 처리에 실패했습니다.' });
  }
});

// 게시글 삭제 (작성자 또는 관리자만 가능)
app.delete('/api/posts/:id', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { author, userId, requesterRole } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('posts')
      .select('*')
      .eq('id', postId)
      .maybeSingle();

    if (findError || !existing) {
      return res.status(404).json({ error: '삭제할 게시글을 찾을 수 없습니다.' });
    }

    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    const isAdmin =
      requesterRole === 'admin' ||
      (tokenUser && tokenUser.role === 'admin') ||
      (tokenUser && (tokenUser.email === process.env.ADMIN_EMAIL || tokenUser.username === process.env.ADMIN_USERNAME));

    const isAuthor =
      (author && existing.author === author) ||
      (userId && existing.user_id && Number(userId) === existing.user_id) ||
      (tokenUser && tokenUser.username === existing.author) ||
      (tokenUser && existing.user_id && tokenUser.id === existing.user_id);

    if (!isAdmin && !isAuthor) {
      return res.status(403).json({ error: '게시글을 삭제할 권한이 없습니다. (작성자 또는 관리자만 가능)' });
    }

    // 종속 데이터 삭제 (반응, 댓글) 및 게시글 삭제
    await supabase.from('post_reactions').delete().eq('post_id', postId);
    await supabase.from('comments').delete().eq('post_id', postId);
    const { error: deleteError } = await supabase.from('posts').delete().eq('id', postId);

    if (deleteError) {
      console.error('게시글 삭제 실패:', deleteError);
      return res.status(500).json({ error: '게시글 삭제에 실패했습니다.' });
    }

    console.log(`[게시글 삭제 성공] Post ID: ${postId}`);
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
app.get('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    let tokenUser = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        tokenUser = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
      } catch (e) {}
    }

    const isAdmin = tokenUser?.role === 'admin';
    const { data: rawComments, error } = await supabase
      .from('comments')
      .select('*')
      .eq('post_id', postId)
      .order('id', { ascending: true });

    if (error) {
      console.error('댓글 목록 조회 에러:', error);
      return res.status(500).json({ error: '댓글 목록을 불러오지 못했습니다.' });
    }

    const processedComments = (rawComments || []).map((c) => {
      const isHidden = Boolean(c.is_hidden);
      const isOwner = tokenUser && (
        (c.user_id && tokenUser.id === c.user_id) ||
        tokenUser.username === c.author
      );

      // 숨김 처리된 댓글: 관리자나 작성자가 아니면 내용을 마스킹 처리하여 보호
      if (isHidden && !isAdmin && !isOwner) {
        return {
          id: c.id,
          postId: c.post_id,
          userId: c.user_id,
          author: c.author,
          content: '관리자에 의해 숨김 처리된 댓글입니다.',
          isHidden: true,
          isMasked: true,
          createdAt: formatDateTime(c.created_at),
          updatedAt: formatDateTime(c.updated_at),
        };
      }

      return {
        id: c.id,
        postId: c.post_id,
        userId: c.user_id,
        author: c.author,
        content: c.content,
        isHidden,
        isMasked: false,
        createdAt: formatDateTime(c.created_at),
        updatedAt: formatDateTime(c.updated_at),
      };
    });

    res.json(processedComments);
  } catch (error) {
    console.error('댓글 목록 조회 에러:', error);
    res.status(500).json({ error: '댓글 목록을 불러오지 못했습니다.' });
  }
});

// 댓글 등록 (다른 유저 누구나 작성 가능, user_id 연동)
app.post('/api/posts/:id/comments', async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { author, content, userId } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    }

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id')
      .eq('id', postId)
      .maybeSingle();

    if (postError || !post) {
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
      const { data: u } = await supabase.from('users').select('id').eq('id', finalUserId).maybeSingle();
      if (!u) finalUserId = null;
    }

    const { data: newComment, error: insertError } = await supabase
      .from('comments')
      .insert({
        post_id: postId,
        user_id: finalUserId,
        author: finalAuthor,
        content: content.trim(),
        is_hidden: false,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('댓글 등록 에러:', insertError);
      return res.status(500).json({ error: '댓글 등록에 실패했습니다.' });
    }

    const formattedComment = {
      id: newComment.id,
      postId: newComment.post_id,
      userId: newComment.user_id,
      author: newComment.author,
      content: newComment.content,
      isHidden: false,
      isMasked: false,
      createdAt: formatDateTime(newComment.created_at),
      updatedAt: formatDateTime(newComment.updated_at),
    };

    res.status(201).json(formattedComment);
  } catch (error) {
    console.error('댓글 작성 에러:', error);
    res.status(500).json({ error: '댓글 등록에 실패했습니다.' });
  }
});

// 댓글 수정 (작성한 유저만 수정 가능!)
app.put('/api/comments/:id', async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const { content, author, userId } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '수정할 댓글 내용을 입력해주세요.' });
    }

    const { data: existing, error: findError } = await supabase
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .maybeSingle();

    if (findError || !existing) {
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

    const { data: updated, error: updateError } = await supabase
      .from('comments')
      .update({
        content: content.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', commentId)
      .select('*')
      .single();

    if (updateError) {
      console.error('댓글 수정 에러:', updateError);
      return res.status(500).json({ error: '댓글 수정에 실패했습니다.' });
    }

    const formatted = {
      id: updated.id,
      postId: updated.post_id,
      userId: updated.user_id,
      author: updated.author,
      content: updated.content,
      isHidden: Boolean(updated.is_hidden),
      createdAt: formatDateTime(updated.created_at),
      updatedAt: formatDateTime(updated.updated_at),
    };

    res.json({ success: true, message: '댓글이 성공적으로 수정되었습니다.', comment: formatted });
  } catch (error) {
    console.error('댓글 수정 에러:', error);
    res.status(500).json({ error: '댓글 수정에 실패했습니다.' });
  }
});

// 댓글 삭제 (작성한 유저 또는 관리자만 삭제 가능)
app.delete('/api/comments/:id', async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const { author, userId, requesterRole } = req.body || {};

    const { data: existing, error: findError } = await supabase
      .from('comments')
      .select('*')
      .eq('id', commentId)
      .maybeSingle();

    if (findError || !existing) {
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

    const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId);
    if (deleteError) {
      console.error('댓글 삭제 에러:', deleteError);
      return res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
    }

    res.json({ success: true, message: '댓글이 성공적으로 삭제되었습니다.', postId: existing.post_id });
  } catch (error) {
    console.error('댓글 삭제 에러:', error);
    res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
  }
});

// 댓글 숨김 토글 API (관리자 전용)
app.patch('/api/comments/:id/toggle-hide', async (req, res) => {
  try {
    const commentId = Number(req.params.id);
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

    const { data: existing, error: findError } = await supabase
      .from('comments')
      .select('id, is_hidden')
      .eq('id', commentId)
      .maybeSingle();

    if (findError || !existing) {
      return res.status(404).json({ error: '대상 댓글을 찾을 수 없습니다.' });
    }

    const newHidden = !existing.is_hidden;
    const { error: updateError } = await supabase
      .from('comments')
      .update({ is_hidden: newHidden, updated_at: new Date().toISOString() })
      .eq('id', commentId);

    if (updateError) {
      console.error('댓글 숨김 토글 실패:', updateError);
      return res.status(500).json({ error: '댓글 숨김 처리에 실패했습니다.' });
    }

    res.json({
      success: true,
      isHidden: newHidden,
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

// 관리자 로그인 (Supabase 조회 & bcrypt 검증, JWT 세션 토큰 발급)
app.post('/api/admin/login', async (req, res) => {
  try {
    await syncAdminCredentialsFromEnv();

    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: '이메일과 비밀번호를 모두 입력해주세요.' });
    }

    const trimmedEmail = email.trim().toLowerCase();
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('email', trimmedEmail)
      .eq('role', 'admin')
      .maybeSingle();

    if (findError || !user) {
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
      await supabase.from('users').update({ password: hashed }).eq('id', user.id);
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
    const formattedAdmin = {
      ...adminData,
      joinedAt: formatDate(user.created_at),
    };

    res.json({
      success: true,
      message: '관리자 인증 성공 (JWT 세션 발급 완료)',
      admin: formattedAdmin,
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
app.put('/api/admin/account', authenticateAdmin, async (req, res) => {
  try {
    const { email, username, bio, currentPassword, newPassword } = req.body;
    const adminId = req.admin.id;

    const { data: admin, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('id', adminId)
      .eq('role', 'admin')
      .maybeSingle();

    if (findError || !admin) {
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
      const { data: existingUser } = await supabase
        .from('users')
        .select('id')
        .eq('email', updatedEmail)
        .neq('id', adminId)
        .maybeSingle();

      if (existingUser) {
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

    const { error: updateError } = await supabase
      .from('users')
      .update({
        email: updatedEmail,
        username: updatedUsername,
        bio: updatedBio,
        password: updatedPasswordHash,
      })
      .eq('id', adminId)
      .eq('role', 'admin');

    if (updateError) {
      console.error('관리자 계정 변경 에러:', updateError);
      return res.status(500).json({ error: '계정 정보 변경 중 오류가 발생했습니다.' });
    }

    // [admins 및 profiles 분리 테이블 동기화 (존재 시)]
    try {
      await supabase.from('admins').upsert(
        {
          email: updatedEmail,
          username: updatedUsername,
          password: updatedPasswordHash,
          role: 'admin',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );
    } catch (e) {}

    try {
      await supabase.from('profiles').upsert(
        {
          email: updatedEmail,
          username: updatedUsername,
          bio: updatedBio,
          role: 'admin',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      );
    } catch (e) {}

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

    const { data: updatedAdmin } = await supabase
      .from('users')
      .select('id, email, username, role, bio, created_at')
      .eq('id', adminId)
      .maybeSingle();

    const formattedAdmin = {
      id: updatedAdmin.id,
      email: updatedAdmin.email,
      username: updatedAdmin.username,
      role: updatedAdmin.role,
      bio: updatedAdmin.bio,
      joinedAt: formatDate(updatedAdmin.created_at),
    };

    res.json({
      success: true,
      message: '관리자 계정 정보가 성공적으로 변경되었습니다. (DB 및 .env 동기화 완료)',
      admin: formattedAdmin,
      token: newToken,
    });
  } catch (error) {
    console.error('관리자 계정 변경 에러:', error);
    res.status(500).json({ error: '계정 정보 변경 중 오류가 발생했습니다.' });
  }
});

// 관리자 대시보드 요약 통계
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const [
      { count: totalUsers },
      { count: totalPosts },
      { count: totalComments },
    ] = await Promise.all([
      supabase.from('users').select('*', { count: 'exact', head: true }),
      supabase.from('posts').select('*', { count: 'exact', head: true }),
      supabase.from('comments').select('*', { count: 'exact', head: true }),
    ]);

    // 전체 조회수 합계 계산
    const { data: viewsData } = await supabase.from('posts').select('views');
    const totalViews = (viewsData || []).reduce((sum, p) => sum + Number(p.views || 0), 0);

    // 최근 게시글 5건
    const { data: recentPostsRaw } = await supabase
      .from('posts')
      .select('id, title, author, views, likes, created_at')
      .order('id', { ascending: false })
      .limit(5);

    const recentPosts = (recentPostsRaw || []).map((p) => ({
      id: p.id,
      title: p.title,
      author: p.author,
      views: Number(p.views || 0),
      likes: Number(p.likes || 0),
      createdAt: formatDate(p.created_at),
    }));

    // 최근 회원 5명
    const { data: recentUsersRaw } = await supabase
      .from('users')
      .select('id, email, username, role, created_at')
      .order('id', { ascending: false })
      .limit(5);

    const recentUsers = (recentUsersRaw || []).map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      joinedAt: formatDate(u.created_at),
    }));

    res.json({
      totalUsers: totalUsers || 0,
      totalPosts: totalPosts || 0,
      totalComments: totalComments || 0,
      totalViews,
      recentPosts,
      recentUsers,
    });
  } catch (error) {
    console.error('통계 조회 에러:', error);
    res.status(500).json({ error: '통계 정보를 불러오지 못했습니다.' });
  }
});

// 관리자 회원 관리: 회원 목록 조회 (admins, users, profiles 3단 분리 테이블 통합 조회 및 관리)
app.get('/api/admin/users', async (req, res) => {
  try {
    await syncAdminCredentialsFromEnv();

    const envAdminEmail = (process.env.ADMIN_EMAIL || 'iicbruce@naver.com').toLowerCase().trim();
    const envAdminName = process.env.ADMIN_NAME || process.env.ADMIN_USERNAME || 'bodyguard';

    // 1. users, admins, profiles 테이블 병렬 안전 조회 (테이블 미생성 시에도 에러 없이 동작)
    const [usersRes, adminsRes, profilesRes] = await Promise.allSettled([
      supabase.from('users').select('*').order('id', { ascending: false }),
      supabase.from('admins').select('*').order('id', { ascending: false }),
      supabase.from('profiles').select('*').order('id', { ascending: false }),
    ]);

    const usersData = usersRes.status === 'fulfilled' && !usersRes.value.error ? usersRes.value.data || [] : [];
    const adminsData = adminsRes.status === 'fulfilled' && !adminsRes.value.error ? adminsRes.value.data || [] : [];
    const profilesData = profilesRes.status === 'fulfilled' && !profilesRes.value.error ? profilesRes.value.data || [] : [];

    // 이메일 기준으로 데이터 병합 맵 생성
    const userMap = new Map();

    // 1) users 테이블 등록
    for (const u of usersData) {
      const emailKey = (u.email || '').toLowerCase().trim();
      userMap.set(emailKey, {
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role || 'user',
        bio: u.bio || '',
        joinedAt: formatDate(u.created_at),
        hasUser: true,
        hasAdmin: false,
        hasProfile: false,
        sourceTable: 'users',
        statusType: 'user_only',
      });
    }

    // 2) admins 테이블 반영 (관리자 권한 부여)
    for (const a of adminsData) {
      const emailKey = (a.email || '').toLowerCase().trim();
      const existing = userMap.get(emailKey);
      if (existing) {
        existing.hasAdmin = true;
        existing.role = 'admin';
        existing.sourceTable = 'admins + users';
        existing.statusType = 'admin';
      } else {
        userMap.set(emailKey, {
          id: a.id,
          email: a.email,
          username: a.username,
          role: 'admin',
          bio: '시스템 총괄 최고관리자 계정입니다.',
          joinedAt: formatDate(a.created_at),
          hasUser: false,
          hasAdmin: true,
          hasProfile: false,
          sourceTable: 'admins',
          statusType: 'admin',
        });
      }
    }

    // 3) profiles 테이블 반영 (프로필 연결 및 프로필만 있는 단독 계정 수용)
    for (const p of profilesData) {
      const emailKey = (p.email || '').toLowerCase().trim();
      const existing = userMap.get(emailKey);
      if (existing) {
        existing.hasProfile = true;
        if (p.bio && !existing.bio) existing.bio = p.bio;
        if (p.username && !existing.username) existing.username = p.username;
        if (existing.role === 'admin' || p.role === 'admin') {
          existing.role = 'admin';
          existing.sourceTable = existing.hasAdmin ? 'admins + profiles' : 'users + profiles';
          existing.statusType = 'admin';
        } else {
          existing.sourceTable = 'users + profiles';
          existing.statusType = 'user';
        }
      } else {
        // 프로필만 존재하는 단독 데이터 (profiles table only)
        userMap.set(emailKey, {
          id: p.id,
          email: p.email,
          username: p.username || '프로필 회원',
          role: p.role || 'user',
          bio: p.bio || '',
          joinedAt: formatDate(p.created_at),
          hasUser: false,
          hasAdmin: p.role === 'admin',
          hasProfile: true,
          sourceTable: 'profiles',
          statusType: p.role === 'admin' ? 'admin' : 'profile_only',
        });
      }
    }

    // 4) .env 최고 관리자 계정 보장 (DB에 없더라도 100% 최상단 노출)
    const adminRecord = userMap.get(envAdminEmail);
    if (!adminRecord) {
      userMap.set(envAdminEmail, {
        id: 1,
        email: envAdminEmail,
        username: envAdminName,
        role: 'admin',
        bio: '시스템 총괄 최고관리자 계정입니다.',
        joinedAt: '2026-09-28',
        hasUser: true,
        hasAdmin: true,
        hasProfile: true,
        sourceTable: 'admins (Master)',
        statusType: 'admin',
      });
    } else {
      adminRecord.role = 'admin';
      adminRecord.hasAdmin = true;
      adminRecord.statusType = 'admin';
    }

    const mergedList = Array.from(userMap.values());

    // 👑 최고관리자 최상단 우선 정렬 -> 그 다음 최신 ID 역순 정렬
    mergedList.sort((a, b) => {
      const isAAdmin = a.role === 'admin' || (a.email && a.email.toLowerCase() === envAdminEmail);
      const isBAdmin = b.role === 'admin' || (b.email && b.email.toLowerCase() === envAdminEmail);
      if (isAAdmin && !isBAdmin) return -1;
      if (!isAAdmin && isBAdmin) return 1;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    });

    res.json(mergedList);
  } catch (error) {
    console.error('회원 목록 조회 에러:', error);
    res.status(500).json({ error: '회원 목록을 불러오지 못했습니다.' });
  }
});

// 관리자 회원 삭제 (users 및 profiles 분리 테이블 동시 정리)
app.delete('/api/admin/users/:id', authenticateAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const envAdminEmail = (process.env.ADMIN_EMAIL || 'iicbruce@naver.com').toLowerCase().trim();

    // 1. users 또는 profiles에서 대상 사용자 조회
    let targetUser = null;
    const { data: userInDb } = await supabase.from('users').select('*').eq('id', targetId).maybeSingle();
    targetUser = userInDb;

    if (!targetUser) {
      const { data: profileInDb } = await supabase.from('profiles').select('*').eq('id', targetId).maybeSingle();
      targetUser = profileInDb;
    }

    if (!targetUser) {
      return res.status(404).json({ error: '해당 사용자를 찾을 수 없습니다.' });
    }

    if (
      targetUser.role === 'admin' ||
      (targetUser.email && targetUser.email.toLowerCase() === envAdminEmail)
    ) {
      return res.status(400).json({ error: '최고 관리자 계정은 삭제할 수 없습니다.' });
    }

    // 2. profiles 테이블 정리 (존재 시)
    try {
      if (targetUser.email) {
        await supabase.from('profiles').delete().eq('email', targetUser.email);
      }
      await supabase.from('profiles').delete().eq('user_id', targetId);
    } catch (e) {}

    // 3. users 테이블 삭제
    try {
      await supabase.from('users').delete().eq('id', targetId);
    } catch (e) {}

    res.json({ message: '회원 계정 및 프로필 데이터가 성공적으로 삭제되었습니다.' });
  } catch (error) {
    console.error('회원 삭제 에러:', error);
    res.status(500).json({ error: '회원 삭제 중 오류가 발생했습니다.' });
  }
});

// 관리자 전체 댓글 조회 (숨김 여부 isHidden, 작성자 userId 포함)
app.get('/api/admin/comments', authenticateAdmin, async (req, res) => {
  try {
    // 1. 전체 댓글 조회
    const { data: comments, error: commentError } = await supabase
      .from('comments')
      .select('*')
      .order('id', { ascending: false });

    if (commentError) {
      console.error('관리자 댓글 목록 조회 에러:', commentError);
      return res.status(500).json({ error: '댓글 목록을 불러오지 못했습니다.' });
    }

    // 2. 게시글 타이틀 맵 구성
    const postIds = Array.from(new Set((comments || []).map((c) => c.post_id)));
    let postTitleMap = {};
    if (postIds.length > 0) {
      const { data: posts } = await supabase
        .from('posts')
        .select('id, title')
        .in('id', postIds);
      if (posts) {
        posts.forEach((p) => {
          postTitleMap[p.id] = p.title;
        });
      }
    }

    const formatted = (comments || []).map((c) => ({
      id: c.id,
      postId: c.post_id,
      userId: c.user_id,
      author: c.author,
      content: c.content,
      isHidden: Boolean(c.is_hidden),
      createdAt: formatDateTime(c.created_at),
      updatedAt: formatDateTime(c.updated_at),
      postTitle: postTitleMap[c.post_id] || '삭제된 게시글',
    }));

    res.json(formatted);
  } catch (error) {
    console.error('관리자 댓글 목록 조회 에러:', error);
    res.status(500).json({ error: '댓글 목록을 불러오지 못했습니다.' });
  }
});

// 관리자 댓글 숨김/숨김해제 토글
app.patch('/api/admin/comments/:id/toggle-hide', authenticateAdmin, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const { data: existing, error: findError } = await supabase
      .from('comments')
      .select('id, is_hidden')
      .eq('id', commentId)
      .maybeSingle();

    if (findError || !existing) {
      return res.status(404).json({ error: '대상 댓글을 찾을 수 없습니다.' });
    }

    const newHidden = !existing.is_hidden;
    const { error: updateError } = await supabase
      .from('comments')
      .update({ is_hidden: newHidden, updated_at: new Date().toISOString() })
      .eq('id', commentId);

    if (updateError) {
      console.error('관리자 댓글 숨김 토글 에러:', updateError);
      return res.status(500).json({ error: '댓글 숨김 처리에 실패했습니다.' });
    }

    res.json({
      success: true,
      isHidden: newHidden,
      message: newHidden ? '댓글이 숨김 처리되었습니다.' : '댓글 숨김이 해제되었습니다.',
    });
  } catch (error) {
    console.error('관리자 댓글 숨김 토글 에러:', error);
    res.status(500).json({ error: '댓글 숨김 처리에 실패했습니다.' });
  }
});

// 관리자 댓글 영구 삭제
app.delete('/api/admin/comments/:id', authenticateAdmin, async (req, res) => {
  try {
    const commentId = Number(req.params.id);
    const { data: existing, error: findError } = await supabase
      .from('comments')
      .select('id, post_id')
      .eq('id', commentId)
      .maybeSingle();

    if (findError || !existing) {
      return res.status(404).json({ error: '삭제할 댓글을 찾을 수 없습니다.' });
    }

    const { error: deleteError } = await supabase.from('comments').delete().eq('id', commentId);
    if (deleteError) {
      console.error('관리자 댓글 삭제 에러:', deleteError);
      return res.status(500).json({ error: '댓글 삭제에 실패했습니다.' });
    }

    res.json({ success: true, message: '댓글이 성공적으로 삭제되었습니다.', postId: existing.post_id });
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
  console.log(`Express + Supabase 백엔드 서버가 http://localhost:${PORT} 에서 실행 중입니다.`);
});
