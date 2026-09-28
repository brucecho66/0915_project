import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase 환경 변수 로드
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABSE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABSE_ANON_KEY ||
  '';

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project-ref')) {
  console.warn(
    '\n=================================================================' +
    '\n[Supabase 설정 안내] .env 파일에 SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가' +
    '\n설정되지 않았거나 기본 템플릿 상태입니다.' +
    '\nSupabase 대시보드(Project Settings -> API)에서 URL과 Key를 복사하여' +
    '\nbackend/.env 파일에 입력해 주세요.' +
    '\n=================================================================\n'
  );
}

// Supabase 클라이언트 생성 (서버 환경이므로 auth persistence 비활성화 및 service_role 권한 활용)
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

// .env 파일의 관리자 계정 정보를 읽어와 Supabase users 테이블에 동기화
export const syncAdminCredentialsFromEnv = async () => {
  try {
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project-ref')) {
      return null;
    }

    const envPath = path.resolve(__dirname, '.env');
    let envVars = {};
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      envVars = dotenv.parse(content);
    }

    const saltRounds = parseInt(envVars.BCRYPT_SALT_ROUNDS || process.env.BCRYPT_SALT_ROUNDS || '10', 10);
    const adminEmail = (envVars.ADMIN_EMAIL || process.env.ADMIN_EMAIL || 'iicbruce@naver.com').trim().toLowerCase();
    const adminPassword = (envVars.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'admin660520!').trim();
    const adminName = (envVars.ADMIN_NAME || envVars.ADMIN_USERNAME || process.env.ADMIN_NAME || process.env.ADMIN_USERNAME || 'bodyguard').trim();

    if (!adminEmail || !adminPassword) {
      console.warn('[DB 동기화 경고] .env에 ADMIN_EMAIL 또는 ADMIN_PASSWORD가 없습니다.');
      return null;
    }

    // 비밀번호 bcrypt 해싱
    const hashedPassword = adminPassword.startsWith('$2')
      ? adminPassword
      : bcrypt.hashSync(adminPassword, saltRounds);

    // 1. 해당 email의 유저 조회
    const { data: userByEmail, error: findEmailError } = await supabase
      .from('users')
      .select('*')
      .eq('email', adminEmail)
      .maybeSingle();

    if (findEmailError && findEmailError.code !== 'PGRST116') {
      console.error('[DB 동기화 에러] Supabase 유저 조회 실패:', findEmailError.message);
      return null;
    }

    let targetUser = userByEmail;

    // 2. 이메일로 못 찾았다면 기존 role = 'admin' 유저 확인
    if (!targetUser) {
      const { data: adminUser } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'admin')
        .maybeSingle();
      targetUser = adminUser;
    }

    // 3. 없으면 새로 생성
    if (!targetUser) {
      const { error: insertError } = await supabase.from('users').insert({
        email: adminEmail,
        username: adminName,
        password: hashedPassword,
        role: 'admin',
        bio: '시스템 총괄 최고관리자 계정입니다.',
      });

      if (insertError) {
        console.error('[DB 동기화 에러] 관리자 계정 생성 실패:', insertError.message);
      } else {
        console.log(`[DB 동기화] Supabase 관리자 계정이 새로 등록되었습니다: ${adminEmail} (이름: ${adminName})`);
      }
    } else {
      // 4. 기존 계정 정보 변경 여부 대조
      const isBcrypt = targetUser.password && targetUser.password.startsWith('$2');
      const isSamePassword = isBcrypt
        ? bcrypt.compareSync(adminPassword, targetUser.password)
        : targetUser.password === adminPassword;
      const isSameEmail = targetUser.email.toLowerCase() === adminEmail;
      const isSameName = targetUser.username === adminName;
      const isAdminRole = targetUser.role === 'admin';

      if (!isBcrypt || !isSamePassword || !isSameEmail || !isSameName || !isAdminRole) {
        const { error: updateError } = await supabase
          .from('users')
          .update({
            email: adminEmail,
            username: adminName,
            password: hashedPassword,
            role: 'admin',
          })
          .eq('id', targetUser.id);

        if (updateError) {
          console.error('[DB 동기화 에러] 관리자 정보 갱신 실패:', updateError.message);
        } else {
          console.log(`[DB 동기화] Supabase 관리자 계정 정보가 최신으로 동기화되었습니다: ${adminEmail}`);
        }
      }
    }

    return { adminEmail, adminName, adminUsername: adminName, adminPassword };
  } catch (err) {
    console.error('[DB 동기화 에러] Supabase 관리자 계정 동기화 실패:', err);
    return null;
  }
};

// 데이터베이스 초기화 및 연결 상태 확인
export const initDatabase = async () => {
  try {
    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project-ref')) {
      console.log('[Supabase 알림] .env에 올바른 SUPABASE_URL 설정 후 테이블 동기화가 활성화됩니다.');
      return;
    }

    // users 테이블 쿼리로 Supabase 연결 상태 테스트
    const { data, error } = await supabase.from('users').select('id').limit(1);
    if (error) {
      console.warn('[Supabase 연결 확인] 테이블 조회 결과:', error.message);
      console.warn('💡 Tip: backend/schema.sql 파일의 내용을 Supabase SQL Editor에서 실행했는지 확인해주세요.');
    } else {
      console.log(`[Supabase 연결 성공] PostgreSQL 데이터베이스가 정상 연결되었습니다: ${supabaseUrl}`);
      // 관리자 계정 자동 동기화
      await syncAdminCredentialsFromEnv();
    }
  } catch (err) {
    console.error('[Supabase 초기화 오류]:', err);
  }
};

export default supabase;
