import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env의 DB_PATH 또는 기본 파일 경로 사용
const dbPath = process.env.DB_PATH 
  ? path.resolve(__dirname, process.env.DB_PATH)
  : path.resolve(__dirname, 'database.sqlite');

const db = new Database(dbPath);

// WAL (Write-Ahead Logging) 모드 활성화로 동시성 및 성능 향상
db.pragma('journal_mode = WAL');

// .env 파일의 관리자 계정 정보를 읽어와 SQLite DB users 테이블에 동기화
export const syncAdminCredentialsFromEnv = () => {
  try {
    const envPath = path.resolve(__dirname, '.env');
    let envVars = {};
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      envVars = dotenv.parse(content);
    }

    const saltRounds = parseInt(envVars.BCRYPT_SALT_ROUNDS || process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    // .env 관리계정 지원: ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD
    const adminEmail = (envVars.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'iicbruce@naver.com').trim().toLowerCase();
    const adminPassword = (envVars.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin660520!').trim();
    const adminName = (envVars.ADMIN_NAME || envVars.ADMIN_USERNAME || process.env.ADMIN_NAME || process.env.ADMIN_USERNAME || 'bodyguard').trim();

    if (!adminEmail || !adminPassword) {
      console.warn('[DB 동기화 경고] .env에 ADMIN_EMAIL 또는 ADMIN_PASSWORD가 없습니다.');
      return null;
    }

    // 비밀번호 해시: 사용자가 입력한 평문 비밀번호를 내부에서 bcrypt로 암호화
    const hashedPassword = adminPassword.startsWith('$2')
      ? adminPassword
      : bcrypt.hashSync(adminPassword, saltRounds);

    // 1. 해당 email을 가진 유저가 DB에 있는지 먼저 확인
    let targetUser = db.prepare("SELECT * FROM users WHERE email = ?").get(adminEmail);
    if (!targetUser) {
      // 2. 해당 email을 가진 유저가 없다면 기존 role = 'admin' 유저 찾기 (이메일을 변경한 경우)
      targetUser = db.prepare("SELECT * FROM users WHERE role = 'admin'").get();
    }

    if (!targetUser) {
      db.prepare(`
        INSERT INTO users (email, username, password, role, bio)
        VALUES (?, ?, ?, 'admin', '시스템 총괄 최고관리자 계정입니다.')
      `).run(adminEmail, adminName, hashedPassword);
      console.log(`[DB 동기화] .env 관리자 계정이 새로 추가되었습니다: ${adminEmail} (이름: ${adminName})`);
    } else {
      const isBcrypt = targetUser.password.startsWith('$2');
      const isSamePassword = isBcrypt
        ? bcrypt.compareSync(adminPassword, targetUser.password)
        : targetUser.password === adminPassword;

      const isSameEmail = targetUser.email.toLowerCase() === adminEmail;
      const isSameName = targetUser.username === adminName;
      const isAdminRole = targetUser.role === 'admin';

      if (!isBcrypt || !isSamePassword || !isSameEmail || !isSameName || !isAdminRole) {
        db.prepare(`
          UPDATE users 
          SET email = ?, username = ?, password = ?, role = 'admin' 
          WHERE id = ?
        `).run(adminEmail, adminName, hashedPassword, targetUser.id);
        console.log(`[DB 동기화] .env 관리자 계정 정보가 DB에 갱신되었습니다: ${adminEmail} (이름: ${adminName}, 비밀번호 bcrypt 암호화 완료)`);
      }
    }

    return { adminEmail, adminName, adminUsername: adminName, adminPassword };
  } catch (err) {
    console.error('[DB 동기화 에러] .env 관리자 계정 동기화 실패:', err);
    return null;
  }
};

// 테이블 초기화
export const initDatabase = () => {
  // 1. 사용자(Users) 테이블 (role 컬럼 추가)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      bio TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // role 컬럼이 혹시 기존 테이블에 없을 경우를 대비한 마이그레이션
  try {
    db.exec(`ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user';`);
  } catch (e) {
    // 이미 존재하는 컬럼일 경우 무시
  }

  // 2. 게시글(Posts) 테이블 (숨김 여부 is_hidden, 싫어요 dislikes 추가)
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT NOT NULL,
      user_id INTEGER,
      views INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      dislikes INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // dislikes 컬럼 마이그레이션
  try {
    db.exec(`ALTER TABLE posts ADD COLUMN dislikes INTEGER DEFAULT 0;`);
  } catch (e) {
    // 이미 존재하는 컬럼 무시
  }

  // is_hidden 컬럼이 기존 테이블에 없을 경우를 대비한 마이그레이션
  try {
    db.exec(`ALTER TABLE posts ADD COLUMN is_hidden INTEGER DEFAULT 0;`);
  } catch (e) {
    // 이미 존재하는 컬럼 무시
  }

  // updated_at 컬럼 마이그레이션 (SQLite ALTER TABLE은 비상수 DEFAULT를 허용하지 않으므로 DATETIME으로 추가 후 초기화)
  try {
    db.exec(`ALTER TABLE posts ADD COLUMN updated_at DATETIME;`);
    db.exec(`UPDATE posts SET updated_at = created_at WHERE updated_at IS NULL;`);
  } catch (e) {
    // 이미 존재하는 컬럼 무시
  }

  // 3. 댓글(Comments) 테이블 (user_id, is_hidden, updated_at 추가)
  db.exec(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER,
      author TEXT NOT NULL,
      content TEXT NOT NULL,
      is_hidden INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );
  `);

  // comments 컬럼 마이그레이션
  try {
    db.exec(`ALTER TABLE comments ADD COLUMN user_id INTEGER;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE comments ADD COLUMN is_hidden INTEGER DEFAULT 0;`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE comments ADD COLUMN updated_at DATETIME;`);
  } catch (e) {}

  // 4. 게시글 반응(좋아요/싫어요) 테이블 (중복 방지 및 토글 관리)
  db.exec(`
    CREATE TABLE IF NOT EXISTS post_reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL,
      user_id INTEGER,
      user_identifier TEXT NOT NULL,
      reaction_type TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(post_id, user_identifier),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );
  `);

  // .env에 설정된 관리자 계정 생성 및 bcrypt 해시 암호화 동기화
  syncAdminCredentialsFromEnv();

  // 초기 일반 유저 시드 (비밀번호 1234 bcrypt 암호화)
  const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);
  const testUser = db.prepare('SELECT * FROM users WHERE email = ?').get('user@example.com');
  if (!testUser) {
    const userHashedPassword = bcrypt.hashSync('1234', saltRounds);
    db.prepare(`
      INSERT INTO users (email, username, password, role, bio)
      VALUES ('user@example.com', '홍길동', ?, 'user', '풀스택 웹 개발자 지망생')
    `).run(userHashedPassword);
  }

  // 초기 시드 데이터 삽입 (테이블이 비어있을 경우)
  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts').get();
  if (postCount.count === 0) {
    const insertPost = db.prepare(`
      INSERT INTO posts (title, content, author, views, likes)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertPost.run(
      'React 19 & Vite로 구축하는 모던 웹 애플리케이션',
      'React 19 버전의 새로운 기능들과 Vite 번들러의 빠른 빌드 속도를 경험해 보세요.',
      '개발자A',
      128,
      15
    );

    insertPost.run(
      'Node.js Express 백엔드와 프런트엔드 연동 가이드',
      'SQLite와 Express를 활용하여 깔끔하고 가벼운 백엔드 API 서버를 구축합니다.',
      '코딩마스터',
      95,
      8
    );

    console.log('초기 게시판 샘플 데이터가 데이터베이스에 추가되었습니다.');
  }

  console.log(`SQLite 데이터베이스가 연결되었습니다: ${dbPath}`);
};

export default db;
