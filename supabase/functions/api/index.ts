// =========================================================
// Supabase Edge Function - 0915 Community Board Backend API
// (Deno + Hono + Supabase Client)
// =========================================================

import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs";
import jwt from "npm:jsonwebtoken";

const app = new Hono();

// CORS 전역 미들웨어 설정
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info", "x-forwarded-for"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  })
);

// Supabase 클라이언트 생성 헬퍼
function getSupabaseClient() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey =
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABSE_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_ANON_KEY") ||
    "";

  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const JWT_SECRET =
  Deno.env.get("JWT_SECRET") ||
  "super_secret_jwt_key_2026_community_admin_secure!";
const SESSION_EXPIRY = Deno.env.get("SESSION_EXPIRY") || "24h";
const BCRYPT_SALT_ROUNDS = 10;

// 날짜 포맷팅 헬퍼
const formatDate = (isoString?: string | null) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const formatDateTime = (isoString?: string | null) => {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return String(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// JWT 토큰 사용자 검증 헬퍼
function getUserFromToken(authHeader?: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

// 관리자 권한 검증 헬퍼
function getAdminFromToken(authHeader?: string | null) {
  const user = getUserFromToken(authHeader);
  if (!user) return null;
  const adminEmail = (Deno.env.get("ADMIN_EMAIL") || "iicbruce@naver.com").toLowerCase();
  const adminUsername = Deno.env.get("ADMIN_USERNAME") || "bodyguard";

  const isAdmin =
    user.role === "admin" ||
    (user.email && user.email.toLowerCase() === adminEmail) ||
    (user.username && user.username === adminUsername);

  return isAdmin ? { ...user, role: "admin" } : null;
}

// -------------------------------------------------------------
// [기본 상태 확인 및 헬스체크]
// -------------------------------------------------------------
const healthHandler = (c: any) => {
  return c.json({
    status: "ok",
    database: "supabase_postgresql",
    runtime: "supabase_edge_function",
    timestamp: new Date().toISOString(),
  });
};

app.get("/", healthHandler);
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// -------------------------------------------------------------
// [1. 회원 인증 API (Supabase Auth & PostgreSQL 동기화)]
// -------------------------------------------------------------

// 회원가입
const registerHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const body = await c.req.json();
    const { email, username, password, bio, avatarUrl, avatar_url, name, nickname, phone } = body;

    if (!email || !username || !password) {
      return c.json({ error: "이메일, 닉네임, 비밀번호를 모두 입력해주세요." }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: "비밀번호는 최소 6자 이상이어야 합니다." }, 400);
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();
    const trimmedName = (name || username || "").trim();
    const trimmedNickname = (nickname || username || "").trim();
    const trimmedPhone = (phone || "").trim();
    const trimmedBio = (bio || "").trim() || "새로 가입한 회원입니다.";
    const finalAvatar = (avatarUrl || avatar_url || "").trim();

    // E.164 유효성 검사 (예: +821012345678)
    const isE164 = /^\+[1-9]\d{1,14}$/.test(trimmedPhone);

    // [1단계: Supabase Auth 유저 생성]
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password: password,
      email_confirm: true,
      ...(isE164 ? { phone: trimmedPhone } : {}),
      user_metadata: {
        username: trimmedUsername,
        name: trimmedName,
        nickname: trimmedNickname,
        phone: trimmedPhone,
        full_name: trimmedName,
        display_name: trimmedNickname,
        role: "user",
        bio: trimmedBio,
        avatar_url: finalAvatar,
      },
    });

    if (authError) {
      const errMsg = (authError.message || "").toLowerCase();
      if (errMsg.includes("already") || errMsg.includes("registered") || errMsg.includes("exists")) {
        const { data: existingDbUser } = await supabase
          .from("users")
          .select("id")
          .eq("email", trimmedEmail)
          .maybeSingle();

        if (existingDbUser) {
          return c.json({ error: "이미 등록된 이메일 계정입니다." }, 400);
        }

        // Auth에는 있으나 public.users DB에 누락된 경우 복구
        const hashedPassword = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
        let recoverRes = await supabase
          .from("users")
          .upsert(
            {
              email: trimmedEmail,
              username: trimmedUsername,
              name: trimmedName,
              nickname: trimmedNickname,
              phone: trimmedPhone,
              password: hashedPassword,
              role: "user",
              bio: trimmedBio,
              ...(finalAvatar ? { avatar_url: finalAvatar } : {}),
            },
            { onConflict: "email" }
          )
          .select("*")
          .single();

        if (recoverRes.error && (recoverRes.error.message?.includes("avatar_url") || recoverRes.error.code === "PGRST204")) {
          recoverRes = await supabase
            .from("users")
            .upsert(
              {
                email: trimmedEmail,
                username: trimmedUsername,
                name: trimmedName,
                nickname: trimmedNickname,
                phone: trimmedPhone,
                password: hashedPassword,
                role: "user",
                bio: trimmedBio,
              },
              { onConflict: "email" }
            )
            .select("*")
            .single();
        }

        if (!recoverRes.error && recoverRes.data) {
          const rec = recoverRes.data;
          const formatted = {
            id: rec.id,
            name: rec.name || trimmedName,
            nickname: rec.nickname || trimmedNickname,
            username: rec.username,
            phone: rec.phone || trimmedPhone,
            email: rec.email,
            role: rec.role,
            bio: rec.bio,
            avatarUrl: rec.avatar_url || finalAvatar || "",
            joinedAt: formatDate(rec.created_at),
          };
          const token = jwt.sign(
            { id: formatted.id, email: formatted.email, username: formatted.username, role: formatted.role },
            JWT_SECRET,
            { expiresIn: SESSION_EXPIRY }
          );
          return c.json({ success: true, user: formatted, token }, 201);
        }

        return c.json({ error: "이미 등록된 이메일 계정입니다." }, 400);
      }
      return c.json({ error: `Supabase Auth 회원가입 오류: ${authError.message}` }, 400);
    }

    // [2단계: Supabase DB (public.users) 저장]
    const hashedPassword = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
    const userPayload: any = {
      email: trimmedEmail,
      username: trimmedUsername,
      name: trimmedName,
      nickname: trimmedNickname,
      phone: trimmedPhone,
      password: hashedPassword,
      role: "user",
      bio: trimmedBio,
    };
    if (finalAvatar) {
      userPayload.avatar_url = finalAvatar;
    }

    let insertRes = await supabase
      .from("users")
      .upsert(userPayload, { onConflict: "email" })
      .select("*")
      .single();

    if (insertRes.error && (insertRes.error.message?.includes("avatar_url") || insertRes.error.code === "PGRST204")) {
      const { avatar_url: _discard, ...fallbackPayload } = userPayload;
      insertRes = await supabase
        .from("users")
        .upsert(fallbackPayload, { onConflict: "email" })
        .select("*")
        .single();
    }

    if (insertRes.error || !insertRes.data) {
      if (authUser?.user?.id) {
        await supabase.auth.admin.deleteUser(authUser.user.id);
      }
      return c.json({ error: "데이터베이스 회원 정보 저장 중 오류가 발생했습니다." }, 500);
    }

    const newUser = insertRes.data;

    // [3단계: public.profiles 동기화]
    try {
      await supabase.from("profiles").upsert(
        {
          user_id: newUser.id,
          email: trimmedEmail,
          username: trimmedUsername,
          name: trimmedName,
          nickname: trimmedNickname,
          phone: trimmedPhone,
          bio: trimmedBio,
          avatar_url: finalAvatar,
          role: "user",
        },
        { onConflict: "email" }
      );
    } catch {
      // profiles 테이블 부재 시 무시
    }

    const formattedUser = {
      id: newUser.id,
      name: newUser.name || trimmedName,
      nickname: newUser.nickname || trimmedNickname,
      username: newUser.username,
      phone: newUser.phone || trimmedPhone,
      email: newUser.email,
      role: newUser.role,
      bio: newUser.bio,
      avatarUrl: newUser.avatar_url || finalAvatar || "",
      joinedAt: formatDate(newUser.created_at),
    };

    const token = jwt.sign(
      { id: formattedUser.id, email: formattedUser.email, username: formattedUser.username, role: formattedUser.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    return c.json({ success: true, user: formattedUser, token }, 201);
  } catch (err: any) {
    return c.json({ error: `회원가입 처리 실패: ${err.message}` }, 500);
  }
};
app.post("/auth/register", registerHandler);
app.post("/api/auth/register", registerHandler);
app.post("/auth/signup", registerHandler);
app.post("/api/auth/signup", registerHandler);

// 관리자 정보 조회
const adminInfoHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const { data: admin } = await supabase
      .from("users")
      .select("email, username")
      .eq("role", "admin")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    const adminEmail = admin?.email || Deno.env.get("ADMIN_EMAIL") || "iicbruce@naver.com";
    const adminUsername = admin?.username || Deno.env.get("ADMIN_USERNAME") || "bodyguard";

    return c.json({
      success: true,
      email: adminEmail,
      username: adminUsername,
      name: adminUsername,
    });
  } catch {
    return c.json({ error: "관리자 정보 조회 실패" }, 500);
  }
};
app.get("/auth/admin-info", adminInfoHandler);
app.get("/api/auth/admin-info", adminInfoHandler);

// 로그인
const loginHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const { email, password } = await c.req.json();

    if (!email || !password) {
      return c.json({ error: "이메일과 비밀번호를 모두 입력해주세요." }, 400);
    }

    const trimmedEmail = email.trim().toLowerCase();
    
    // 1. 관리자 전용 테이블(admins) 우선 확인
    const { data: adminUser } = await supabase
      .from("admins")
      .select("*")
      .eq("email", trimmedEmail)
      .maybeSingle();

    let user: any = adminUser;
    let isAdminTable = !!adminUser;

    // 2. 일반 유저 테이블(users) 확인
    if (!user) {
      const { data: regularUser } = await supabase
        .from("users")
        .select("*")
        .eq("email", trimmedEmail)
        .maybeSingle();
      user = regularUser;
    }

    if (!user) {
      // Supabase Auth 폴백 로그인 및 복구
      try {
        const { data: authSignIn, error: authSignInError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password: password,
        });

        if (!authSignInError && authSignIn?.user) {
          const username = authSignIn.user.user_metadata?.username || trimmedEmail.split("@")[0];
          const role = authSignIn.user.user_metadata?.role || "user";
          const bio = authSignIn.user.user_metadata?.bio || "새로 가입한 회원입니다.";
          const avatarUrl = authSignIn.user.user_metadata?.avatar_url || "";
          const hashedPassword = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);

          const { data: syncedUser } = await supabase
            .from("users")
            .upsert(
              {
                email: trimmedEmail,
                username,
                password: hashedPassword,
                role,
                bio,
              },
              { onConflict: "email" }
            )
            .select("*")
            .single();

          if (syncedUser) {
            const userData = {
              id: syncedUser.id,
              name: syncedUser.username,
              nickname: syncedUser.username,
              email: syncedUser.email,
              username: syncedUser.username,
              role: syncedUser.role,
              bio: syncedUser.bio,
              avatarUrl: syncedUser.avatar_url || avatarUrl || "",
              joinedAt: formatDate(syncedUser.created_at),
            };
            const token = jwt.sign(
              { id: syncedUser.id, email: syncedUser.email, username: syncedUser.username, role: syncedUser.role },
              JWT_SECRET,
              { expiresIn: SESSION_EXPIRY }
            );
            return c.json({ success: true, user: userData, token });
          }
        }
      } catch {}

      return c.json({ error: "가입되지 않은 이메일 주소입니다." }, 401);
    }

    const isPasswordValid = user.password.startsWith("$2")
      ? bcrypt.compareSync(password, user.password)
      : user.password === password;

    if (!isPasswordValid) {
      return c.json({ error: "비밀번호가 일치하지 않습니다." }, 401);
    }

    // 평문 비밀번호 자동 bcrypt 업그레이드
    if (!user.password.startsWith("$2")) {
      const hashed = bcrypt.hashSync(password, BCRYPT_SALT_ROUNDS);
      if (isAdminTable) {
        await supabase.from("admins").update({ password: hashed }).eq("id", user.id);
      } else {
        await supabase.from("users").update({ password: hashed }).eq("id", user.id);
      }
    }

    // profiles 테이블에서 프로필 상세 조회
    const { data: profile } = await supabase
      .from("profiles")
      .select("bio, avatar_url")
      .eq("email", user.email)
      .maybeSingle();

    const userData = {
      id: user.id,
      name: user.name || profile?.name || user.username,
      nickname: user.nickname || profile?.nickname || user.username,
      username: user.username,
      phone: user.phone || profile?.phone || "",
      email: user.email,
      role: user.role,
      bio: profile?.bio || user.bio || "",
      avatarUrl: profile?.avatar_url || user.avatar_url || "",
      joinedAt: formatDate(user.created_at),
    };

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    return c.json({ success: true, user: userData, token });
  } catch (err: any) {
    return c.json({ error: `로그인 처리 오류: ${err.message}` }, 500);
  }
};
app.post("/auth/login", loginHandler);
app.post("/api/auth/login", loginHandler);

// 내 정보 조회
const meHandler = async (c: any) => {
  try {
    const userPayload = getUserFromToken(c.req.header("Authorization"));
    if (!userPayload) return c.json({ error: "인증 토큰이 누락되었거나 유효하지 않습니다." }, 401);

    const supabase = getSupabaseClient();
    let { data: user } = await supabase
      .from("admins")
      .select("*")
      .eq("id", userPayload.id)
      .maybeSingle();

    if (!user) {
      const { data: regUser } = await supabase
        .from("users")
        .select("*")
        .eq("id", userPayload.id)
        .maybeSingle();
      user = regUser;
    }

    if (!user) return c.json({ error: "회원 정보를 찾을 수 없습니다." }, 404);

    const { data: profile } = await supabase
      .from("profiles")
      .select("name, nickname, phone, bio, avatar_url")
      .eq("email", user.email)
      .maybeSingle();

    return c.json({
      success: true,
      user: {
        id: user.id,
        name: user.name || profile?.name || user.username,
        nickname: user.nickname || profile?.nickname || user.username,
        username: user.username,
        phone: user.phone || profile?.phone || "",
        email: user.email,
        role: user.role,
        bio: profile?.bio || user.bio || "",
        avatarUrl: profile?.avatar_url || user.avatar_url || "",
        joinedAt: formatDate(user.created_at),
      },
    });
  } catch {
    return c.json({ error: "회원 정보 조회 실패" }, 500);
  }
};
app.get("/auth/me", meHandler);
app.get("/api/auth/me", meHandler);
app.get("/profile", meHandler);
app.get("/api/profile", meHandler);

// 프로필 수정
const profileHandler = async (c: any) => {
  try {
    const userPayload = getUserFromToken(c.req.header("Authorization"));
    if (!userPayload) return c.json({ error: "인증 토큰이 필요합니다." }, 401);

    const { username, bio, avatarUrl, avatar_url } = await c.req.json();
    if (!username || !username.trim()) {
      return c.json({ error: "닉네임을 입력해주세요." }, 400);
    }

    const finalAvatar = avatarUrl !== undefined ? avatarUrl : (avatar_url !== undefined ? avatar_url : null);
    const updatePayload: any = {
      username: username.trim(),
      bio: bio !== undefined ? bio : "",
    };
    if (finalAvatar !== null) {
      updatePayload.avatar_url = finalAvatar;
    }

    const supabase = getSupabaseClient();
    const { data: adminUser } = await supabase
      .from("admins")
      .select("id")
      .eq("id", userPayload.id)
      .maybeSingle();

    const targetTable = adminUser ? "admins" : "users";
    let updateRes = await supabase
      .from(targetTable)
      .update(updatePayload)
      .eq("id", userPayload.id)
      .select("*")
      .single();

    if (updateRes.error && (updateRes.error.message?.includes("avatar_url") || updateRes.error.code === "PGRST204")) {
      const { avatar_url: _discard, ...fallbackUpdate } = updatePayload;
      updateRes = await supabase
        .from(targetTable)
        .update(fallbackUpdate)
        .eq("id", userPayload.id)
        .select("*")
        .single();
    }

    if (updateRes.error || !updateRes.data) {
      return c.json({ error: "프로필 수정 실패" }, 500);
    }

    const updated = updateRes.data;

    // profiles 분리 테이블 동기화
    try {
      await supabase.from("profiles").upsert(
        {
          email: updated.email,
          username: updated.username,
          bio: updated.bio || "",
          avatar_url: updated.avatar_url || "",
          role: updated.role || (adminUser ? "admin" : "user"),
          updated_at: new Date().toISOString(),
          ...(adminUser ? { admin_id: updated.id } : { user_id: updated.id }),
        },
        { onConflict: "email" }
      );
    } catch {}

    // Supabase Auth 메타데이터(display_name, name, bio) 동기화
    try {
      const { data: authList } = await supabase.auth.admin.listUsers();
      const authTarget = authList?.users?.find((u: any) => u.email?.toLowerCase() === updated.email?.toLowerCase());
      if (authTarget?.id) {
        await supabase.auth.admin.updateUserById(authTarget.id, {
          user_metadata: {
            ...authTarget.user_metadata,
            username: updated.username,
            name: updated.username,
            display_name: updated.username,
            full_name: updated.username,
            bio: updated.bio || "",
            avatar_url: updated.avatar_url || "",
          },
        });
      }
    } catch {}

    return c.json({
      success: true,
      user: {
        id: updated.id,
        name: updated.username,
        nickname: updated.username,
        email: updated.email,
        username: updated.username,
        role: updated.role,
        bio: updated.bio,
        avatarUrl: updated.avatar_url || "",
        joinedAt: formatDate(updated.created_at),
      },
    });
  } catch {
    return c.json({ error: "프로필 수정 중 오류가 발생했습니다." }, 500);
  }
};
app.put("/profile", profileHandler);
app.put("/api/profile", profileHandler);
app.patch("/profile", profileHandler);
app.patch("/api/profile", profileHandler);
app.put("/auth/profile", profileHandler);
app.put("/api/auth/profile", profileHandler);
app.patch("/auth/me", profileHandler);
app.patch("/api/auth/me", profileHandler);

// -------------------------------------------------------------
// [2. 게시글(Posts) API]
// -------------------------------------------------------------

// 게시글 목록 조회
const postsListHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const search = c.req.query("search") || "";
    const category = c.req.query("category") || "";
    const viewerId = c.req.query("viewerId") || "";

    const user = getUserFromToken(c.req.header("Authorization"));
    const isAdmin = user?.role === "admin";
    const currentUserId = user?.id || (viewerId ? Number(viewerId) : null);

    let query = supabase.from("posts").select("*").order("id", { ascending: false });

    if (category && category !== "전체") {
      query = query.eq("category", category);
    }

    if (search.trim()) {
      query = query.or(`title.ilike.%${search.trim()}%,content.ilike.%${search.trim()}%,author.ilike.%${search.trim()}%`);
    }

    const { data: posts, error } = await query;
    if (error) return c.json({ error: error.message }, 500);

    // 댓글 수 집계
    const { data: allComments } = await supabase.from("comments").select("id, post_id, is_hidden");
    const commentCountMap: Record<number, number> = {};
    if (allComments) {
      allComments.forEach((comm: any) => {
        if (!comm.is_hidden || isAdmin) {
          commentCountMap[comm.post_id] = (commentCountMap[comm.post_id] || 0) + 1;
        }
      });
    }

    // 숨김 글 필터링: 관리자이거나 작성자 본인이면 표시
    const visiblePosts = (posts || []).filter((p: any) => {
      if (!p.is_hidden) return true;
      if (isAdmin) return true;
      if (currentUserId && p.author_id === currentUserId) return true;
      return false;
    });

    const formatted = visiblePosts.map((p: any) => ({
      ...p,
      views: Number(p.views || 0),
      likes: Number(p.likes || 0),
      dislikes: Number(p.dislikes || 0),
      commentsCount: commentCountMap[p.id] || 0,
      createdAt: formatDate(p.created_at),
      date: formatDate(p.created_at),
    }));

    // 프론트엔드 호환: 배열 또는 { posts: [...] } 지원
    return c.json(formatted);
  } catch (err: any) {
    return c.json({ error: `게시글 목록 조회 실패: ${err.message}` }, 500);
  }
};
app.get("/posts", postsListHandler);
app.get("/api/posts", postsListHandler);

// 게시글 상세 조회
const postDetailHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const supabase = getSupabaseClient();

    const { data: post, error } = await supabase
      .from("posts")
      .select("*")
      .eq("id", postId)
      .maybeSingle();

    if (error || !post) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const user = getUserFromToken(c.req.header("Authorization"));
    const isAdmin = user?.role === "admin";
    const viewerId = c.req.query("viewerId");
    const currentUserId = user?.id || (viewerId ? Number(viewerId) : null);

    if (post.is_hidden && !isAdmin && post.author_id !== currentUserId) {
      return c.json({ error: "숨김 처리된 게시글입니다." }, 403);
    }

    const { count } = await supabase
      .from("comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", postId);

    return c.json({
      ...post,
      views: Number(post.views || 0),
      likes: Number(post.likes || 0),
      dislikes: Number(post.dislikes || 0),
      commentsCount: count || 0,
      createdAt: formatDate(post.created_at),
      date: formatDate(post.created_at),
    });
  } catch {
    return c.json({ error: "게시글 조회 실패" }, 500);
  }
};
app.get("/posts/:id", postDetailHandler);
app.get("/api/posts/:id", postDetailHandler);

// 조회수 증가 API
const postViewHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const viewerId = body?.viewerId;

    const supabase = getSupabaseClient();
    const { data: post } = await supabase.from("posts").select("id, views").eq("id", postId).maybeSingle();
    if (!post) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const clientIp =
      c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
      c.req.header("cf-connecting-ip") ||
      c.req.header("x-real-ip") ||
      "anon_ip";

    const updatedViews = Number(post.views || 0) + 1;
    await supabase.from("posts").update({ views: updatedViews }).eq("id", postId);

    return c.json({
      success: true,
      views: updatedViews,
      clientIp,
      viewer: viewerId ? `user_${viewerId}` : `ip_${clientIp}`,
    });
  } catch {
    return c.json({ error: "조회수 증가 실패" }, 500);
  }
};
app.post("/posts/:id/view", postViewHandler);
app.post("/api/posts/:id/view", postViewHandler);

// 좋아요/싫어요 반응 토글 공통 로직
async function handleReaction(postId: number, type: "like" | "dislike", userId: any, clientIdentifier: any, authHeader?: string) {
  const supabase = getSupabaseClient();
  const { data: post } = await supabase.from("posts").select("id, likes, dislikes").eq("id", postId).maybeSingle();
  if (!post) throw new Error("게시글을 찾을 수 없습니다.");

  const user = getUserFromToken(authHeader);
  const currentUserId = user?.id || (userId ? Number(userId) : null);
  const identifier = currentUserId ? `user_${currentUserId}` : (clientIdentifier || "guest_anon");

  const { data: existingReaction } = await supabase
    .from("post_reactions")
    .select("id, reaction_type")
    .eq("post_id", postId)
    .eq("user_identifier", identifier)
    .maybeSingle();

  let newLikes = Number(post.likes || 0);
  let newDislikes = Number(post.dislikes || 0);
  let userReaction: string | null = null;

  if (existingReaction) {
    if (existingReaction.reaction_type === type) {
      await supabase.from("post_reactions").delete().eq("id", existingReaction.id);
      if (type === "like") newLikes = Math.max(0, newLikes - 1);
      else newDislikes = Math.max(0, newDislikes - 1);
      userReaction = null;
    } else {
      await supabase.from("post_reactions").update({ reaction_type: type }).eq("id", existingReaction.id);
      if (type === "like") {
        newLikes += 1;
        newDislikes = Math.max(0, newDislikes - 1);
      } else {
        newDislikes += 1;
        newLikes = Math.max(0, newLikes - 1);
      }
      userReaction = type;
    }
  } else {
    await supabase.from("post_reactions").insert({
      post_id: postId,
      user_id: currentUserId,
      user_identifier: identifier,
      reaction_type: type,
    });
    if (type === "like") newLikes += 1;
    else newDislikes += 1;
    userReaction = type;
  }

  await supabase.from("posts").update({ likes: newLikes, dislikes: newDislikes }).eq("id", postId);
  return { likes: newLikes, dislikes: newDislikes, reaction: userReaction, userReaction };
}

// 반응 토글 API (/react, /reaction)
const postReactHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const { type, userId, identifier } = await c.req.json();
    if (!type || (type !== "like" && type !== "dislike")) {
      return c.json({ error: "type은 'like' 또는 'dislike'여야 합니다." }, 400);
    }
    const result = await handleReaction(postId, type, userId, identifier, c.req.header("Authorization"));
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
};
app.post("/posts/:id/react", postReactHandler);
app.post("/api/posts/:id/react", postReactHandler);
app.post("/posts/:id/reaction", postReactHandler);
app.post("/api/posts/:id/reaction", postReactHandler);

// 개별 좋아요/싫어요 API (/like, /dislike)
const postLikeHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const result = await handleReaction(postId, "like", body.userId, body.identifier, c.req.header("Authorization"));
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
};
app.post("/posts/:id/like", postLikeHandler);
app.post("/api/posts/:id/like", postLikeHandler);

const postDislikeHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const body = await c.req.json().catch(() => ({}));
    const result = await handleReaction(postId, "dislike", body.userId, body.identifier, c.req.header("Authorization"));
    return c.json({ success: true, ...result });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
};
app.post("/posts/:id/dislike", postDislikeHandler);
app.post("/api/posts/:id/dislike", postDislikeHandler);

// 게시글 작성
const postCreateHandler = async (c: any) => {
  try {
    const user = getUserFromToken(c.req.header("Authorization"));
    const body = await c.req.json();
    const { title, content, category, author, authorEmail } = body;

    if (!title || !content) {
      return c.json({ error: "제목과 내용을 모두 입력해주세요." }, 400);
    }

    const postAuthor = user?.username || author || "익명";
    const postAuthorEmail = user?.email || authorEmail || "";
    const postAuthorId = user?.id || null;

    const supabase = getSupabaseClient();
    const { data: newPost, error } = await supabase
      .from("posts")
      .insert({
        title: title.trim(),
        content: content.trim(),
        category: category || "자유",
        author: postAuthor,
        author_email: postAuthorEmail,
        author_id: postAuthorId,
        views: 0,
        likes: 0,
        dislikes: 0,
        is_hidden: false,
      })
      .select("*")
      .single();

    if (error || !newPost) return c.json({ error: "게시글 작성 실패" }, 500);

    const formatted = {
      ...newPost,
      commentsCount: 0,
      createdAt: formatDate(newPost.created_at),
      date: formatDate(newPost.created_at),
    };
    return c.json({ success: true, post: formatted }, 201);
  } catch (err: any) {
    return c.json({ error: `게시글 작성 오류: ${err.message}` }, 500);
  }
};
app.post("/posts", postCreateHandler);
app.post("/api/posts", postCreateHandler);

// 게시글 수정
const postUpdateHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const user = getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const supabase = getSupabaseClient();
    const { data: post } = await supabase.from("posts").select("*").eq("id", postId).maybeSingle();
    if (!post) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const isAdmin = user.role === "admin";
    if (!isAdmin && post.author_id !== user.id && post.author !== user.username) {
      return c.json({ error: "본인이 작성한 게시글만 수정할 수 있습니다." }, 403);
    }

    const { title, content, category } = await c.req.json();
    const updateData: any = {};
    if (title) updateData.title = title.trim();
    if (content) updateData.content = content.trim();
    if (category) updateData.category = category;

    const { data: updated, error } = await supabase
      .from("posts")
      .update(updateData)
      .eq("id", postId)
      .select("*")
      .single();

    if (error || !updated) return c.json({ error: "게시글 수정 실패" }, 500);

    return c.json({
      success: true,
      post: {
        ...updated,
        createdAt: formatDate(updated.created_at),
        date: formatDate(updated.created_at),
      },
    });
  } catch {
    return c.json({ error: "게시글 수정 오류" }, 500);
  }
};
app.put("/posts/:id", postUpdateHandler);
app.put("/api/posts/:id", postUpdateHandler);
app.patch("/posts/:id", postUpdateHandler);
app.patch("/api/posts/:id", postUpdateHandler);

// 게시글 숨김 토글
const postToggleHideHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const user = getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const supabase = getSupabaseClient();
    const { data: post } = await supabase.from("posts").select("id, author_id, author, is_hidden").eq("id", postId).maybeSingle();
    if (!post) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const isAdmin = user.role === "admin";
    if (!isAdmin && post.author_id !== user.id && post.author !== user.username) {
      return c.json({ error: "권한이 없습니다." }, 403);
    }

    const newHiddenState = !post.is_hidden;
    await supabase.from("posts").update({ is_hidden: newHiddenState }).eq("id", postId);

    return c.json({ success: true, is_hidden: newHiddenState });
  } catch {
    return c.json({ error: "숨김 상태 변경 실패" }, 500);
  }
};
app.patch("/posts/:id/toggle-hide", postToggleHideHandler);
app.patch("/api/posts/:id/toggle-hide", postToggleHideHandler);
app.patch("/admin/posts/:id/visibility", postToggleHideHandler);
app.patch("/api/admin/posts/:id/visibility", postToggleHideHandler);

// 게시글 삭제
const postDeleteHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const user = getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const supabase = getSupabaseClient();
    const { data: post } = await supabase.from("posts").select("id, author_id, author").eq("id", postId).maybeSingle();
    if (!post) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const isAdmin = user.role === "admin";
    if (!isAdmin && post.author_id !== user.id && post.author !== user.username) {
      return c.json({ error: "본인이 작성한 글 또는 관리자만 삭제할 수 있습니다." }, 403);
    }

    await supabase.from("comments").delete().eq("post_id", postId);
    await supabase.from("post_reactions").delete().eq("post_id", postId);
    await supabase.from("posts").delete().eq("id", postId);

    return c.json({ success: true, message: "게시글이 삭제되었습니다." });
  } catch {
    return c.json({ error: "게시글 삭제 실패" }, 500);
  }
};
app.delete("/posts/:id", postDeleteHandler);
app.delete("/api/posts/:id", postDeleteHandler);

// -------------------------------------------------------------
// [3. 댓글(Comments) API]
// -------------------------------------------------------------

// 특정 게시글의 댓글 목록
const commentsListHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const user = getUserFromToken(c.req.header("Authorization"));
    const isAdmin = user?.role === "admin";

    const supabase = getSupabaseClient();
    const { data: comments, error } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("id", { ascending: true });

    if (error) return c.json({ error: error.message }, 500);

    const visibleComments = (comments || []).filter((comm: any) => {
      if (!comm.is_hidden) return true;
      if (isAdmin) return true;
      if (user?.id && comm.author_id === user.id) return true;
      return false;
    });

    const formatted = visibleComments.map((comm: any) => ({
      ...comm,
      postId: comm.post_id,
      userId: comm.author_id,
      authorId: comm.author_id,
      isHidden: !!comm.is_hidden,
      isMasked: comm.is_hidden && !isAdmin && (!user?.id || comm.author_id !== user.id),
      createdAt: formatDateTime(comm.created_at),
      date: formatDateTime(comm.created_at),
    }));

    return c.json(formatted);
  } catch {
    return c.json({ error: "댓글 조회 실패" }, 500);
  }
};
app.get("/posts/:id/comments", commentsListHandler);
app.get("/api/posts/:id/comments", commentsListHandler);

// 댓글 작성
const commentCreateHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const user = getUserFromToken(c.req.header("Authorization"));
    const body = await c.req.json();
    const { content, author, authorEmail, author_id, userId } = body;

    if (!content || !content.trim()) {
      return c.json({ error: "댓글 내용을 입력해주세요." }, 400);
    }

    const commentAuthor = user?.username || author || "익명";
    const commentAuthorEmail = user?.email || authorEmail || "";
    const commentAuthorId = user?.id || (userId ? Number(userId) : (author_id ? Number(author_id) : null));

    const supabase = getSupabaseClient();
    const { data: newComment, error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        content: content.trim(),
        author: commentAuthor,
        author_email: commentAuthorEmail,
        author_id: commentAuthorId,
        is_hidden: false,
      })
      .select("*")
      .single();

    if (error || !newComment) return c.json({ error: "댓글 등록 실패" }, 500);

    return c.json({
      success: true,
      comment: {
        ...newComment,
        postId: newComment.post_id,
        userId: newComment.author_id,
        authorId: newComment.author_id,
        isHidden: !!newComment.is_hidden,
        createdAt: formatDateTime(newComment.created_at),
        date: formatDateTime(newComment.created_at),
      },
    }, 201);
  } catch (err: any) {
    return c.json({ error: `댓글 작성 오류: ${err.message}` }, 500);
  }
};
app.post("/posts/:id/comments", commentCreateHandler);
app.post("/api/posts/:id/comments", commentCreateHandler);

// 댓글 수정 (작성자 본인만 수정 가능)
const commentUpdateHandler = async (c: any) => {
  try {
    const commentId = Number(c.req.param("id"));
    const user = getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const supabase = getSupabaseClient();
    const { data: comment } = await supabase.from("comments").select("*").eq("id", commentId).maybeSingle();
    if (!comment) return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);

    const isAuthor =
      (comment.author_id && comment.author_id === user.id) ||
      (comment.author_email && comment.author_email.toLowerCase() === (user.email || "").toLowerCase()) ||
      (comment.author && comment.author === user.username);

    if (!isAuthor && user.role !== "admin") {
      return c.json({ error: "댓글을 작성한 본인만 수정할 수 있습니다." }, 403);
    }

    const { content } = await c.req.json();
    if (!content || !content.trim()) return c.json({ error: "댓글 내용을 입력해주세요." }, 400);

    const { data: updated, error } = await supabase
      .from("comments")
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq("id", commentId)
      .select("*")
      .single();

    if (error || !updated) return c.json({ error: "댓글 수정 실패" }, 500);

    return c.json({
      success: true,
      comment: {
        ...updated,
        createdAt: formatDateTime(updated.created_at),
        date: formatDateTime(updated.created_at),
      },
    });
  } catch {
    return c.json({ error: "댓글 수정 오류" }, 500);
  }
};
app.put("/comments/:id", commentUpdateHandler);
app.put("/api/comments/:id", commentUpdateHandler);
app.patch("/comments/:id", commentUpdateHandler);
app.patch("/api/comments/:id", commentUpdateHandler);

// 댓글 삭제 (작성자 본인 또는 관리자)
const commentDeleteHandler = async (c: any) => {
  try {
    const commentId = Number(c.req.param("id"));
    const user = getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const supabase = getSupabaseClient();
    const { data: comment } = await supabase.from("comments").select("*").eq("id", commentId).maybeSingle();
    if (!comment) return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);

    const isAuthor =
      (comment.author_id && comment.author_id === user.id) ||
      (comment.author_email && comment.author_email.toLowerCase() === (user.email || "").toLowerCase()) ||
      (comment.author && comment.author === user.username);

    if (!isAuthor && user.role !== "admin") {
      return c.json({ error: "본인이 작성한 댓글 또는 관리자만 삭제할 수 있습니다." }, 403);
    }

    await supabase.from("comments").delete().eq("id", commentId);
    return c.json({ success: true, message: "댓글이 삭제되었습니다." });
  } catch {
    return c.json({ error: "댓글 삭제 실패" }, 500);
  }
};
app.delete("/comments/:id", commentDeleteHandler);
app.delete("/api/comments/:id", commentDeleteHandler);

// 댓글 숨김 토글
const commentToggleHideHandler = async (c: any) => {
  try {
    const commentId = Number(c.req.param("id"));
    const admin = getAdminFromToken(c.req.header("Authorization"));
    if (!admin) return c.json({ error: "관리자 전용 기능입니다." }, 403);

    const supabase = getSupabaseClient();
    const { data: comm } = await supabase.from("comments").select("id, is_hidden").eq("id", commentId).maybeSingle();
    if (!comm) return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);

    const newHiddenState = !comm.is_hidden;
    await supabase.from("comments").update({ is_hidden: newHiddenState }).eq("id", commentId);

    return c.json({ success: true, is_hidden: newHiddenState });
  } catch {
    return c.json({ error: "댓글 숨김 토글 실패" }, 500);
  }
};
app.patch("/comments/:id/toggle-hide", commentToggleHideHandler);
app.patch("/api/comments/:id/toggle-hide", commentToggleHideHandler);
app.patch("/admin/comments/:id/toggle-hide", commentToggleHideHandler);
app.patch("/api/admin/comments/:id/toggle-hide", commentToggleHideHandler);

// -------------------------------------------------------------
// [4. 관리자(Admin) 전용 API]
// -------------------------------------------------------------

// 관리자 로그인
const adminLoginHandler = async (c: any) => {
  try {
    const { email, password } = await c.req.json();
    if (!email || !password) return c.json({ error: "이메일과 비밀번호를 입력해주세요." }, 400);

    const supabase = getSupabaseClient();
    const trimmedEmail = email.trim().toLowerCase();

    // 1. 관리자 전용 테이블(admins) 우선 확인
    let { data: user } = await supabase
      .from("admins")
      .select("*")
      .eq("email", trimmedEmail)
      .maybeSingle();

    // 2. 일반 users 테이블 폴백 확인
    if (!user) {
      const { data: regUser } = await supabase
        .from("users")
        .select("*")
        .eq("email", trimmedEmail)
        .maybeSingle();
      user = regUser;
    }

    if (!user) return c.json({ error: "관리자 계정을 찾을 수 없습니다." }, 401);

    const isAdmin = user.role === "admin" || trimmedEmail === (Deno.env.get("ADMIN_EMAIL") || "iicbruce@naver.com").toLowerCase();
    if (!isAdmin) return c.json({ error: "관리자 계정만 로그인할 수 있습니다." }, 403);

    const isPasswordValid = user.password.startsWith("$2")
      ? bcrypt.compareSync(password, user.password)
      : user.password === password;

    if (!isPasswordValid) return c.json({ error: "비밀번호가 일치하지 않습니다." }, 401);

    // profiles 테이블에서 프로필 상세 조회
    const { data: profile } = await supabase
      .from("profiles")
      .select("name, nickname, phone, bio, avatar_url")
      .eq("email", user.email)
      .maybeSingle();

    const formattedAdmin = {
      id: user.id,
      name: user.name || profile?.name || user.username,
      nickname: user.nickname || profile?.nickname || user.username,
      username: user.username,
      phone: user.phone || profile?.phone || "",
      email: user.email,
      role: "admin",
      bio: profile?.bio || user.bio || "",
      avatarUrl: profile?.avatar_url || user.avatar_url || "",
      joinedAt: formatDate(user.created_at),
    };

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: "admin" },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    return c.json({ success: true, admin: formattedAdmin, user: formattedAdmin, token });
  } catch (err: any) {
    return c.json({ error: `관리자 로그인 실패: ${err.message}` }, 500);
  }
};
app.post("/admin/login", adminLoginHandler);
app.post("/api/admin/login", adminLoginHandler);

// 관리자 보안 정보 조회
const adminSecurityInfoHandler = (c: any) => {
  const admin = getAdminFromToken(c.req.header("Authorization"));
  if (!admin) return c.json({ error: "관리자 전용 접근 권한이 필요합니다." }, 403);

  const maskedSecret = JWT_SECRET.slice(0, 4) + "****************" + JWT_SECRET.slice(-4);
  return c.json({
    hashAlgorithm: "bcrypt (10 salt rounds)",
    sessionType: "JWT (JSON Web Token)",
    sessionExpiry: SESSION_EXPIRY,
    jwtSecretStatus: "보호 중 (암호화 서명 활성화)",
    maskedSecret,
    currentAdminEmail: admin.email,
  });
};
app.get("/admin/security-info", adminSecurityInfoHandler);
app.get("/api/admin/security-info", adminSecurityInfoHandler);

// 관리자 계정 정보 및 비밀번호 변경
const adminAccountUpdateHandler = async (c: any) => {
  try {
    const admin = getAdminFromToken(c.req.header("Authorization"));
    if (!admin) return c.json({ error: "관리자 전용 권한이 필요합니다." }, 403);

    const { email, username, bio, currentPassword, newPassword } = await c.req.json();
    const supabase = getSupabaseClient();

    let { data: dbAdmin } = await supabase.from("admins").select("*").eq("id", admin.id).maybeSingle();
    let isAdminTable = true;
    if (!dbAdmin) {
      const { data: dbUser } = await supabase.from("users").select("*").eq("id", admin.id).maybeSingle();
      dbAdmin = dbUser;
      isAdminTable = false;
    }
    if (!dbAdmin) return c.json({ error: "관리자 계정을 찾을 수 없습니다." }, 404);

    if (newPassword || (email && email !== dbAdmin.email)) {
      if (!currentPassword) return c.json({ error: "현재 비밀번호를 입력해주세요." }, 400);

      const isCurrentCorrect = dbAdmin.password.startsWith("$2")
        ? bcrypt.compareSync(currentPassword, dbAdmin.password)
        : dbAdmin.password === currentPassword;

      if (!isCurrentCorrect) return c.json({ error: "현재 비밀번호가 일치하지 않습니다." }, 401);
    }

    const updatedEmail = email?.trim() || dbAdmin.email;
    const updatedUsername = username?.trim() || dbAdmin.username;
    const updatedBio = bio !== undefined ? bio : dbAdmin.bio;
    let updatedPasswordHash = dbAdmin.password;

    if (newPassword) {
      if (newPassword.length < 6) return c.json({ error: "새 비밀번호는 최소 6자 이상이어야 합니다." }, 400);
      updatedPasswordHash = bcrypt.hashSync(newPassword, BCRYPT_SALT_ROUNDS);
    }

    const targetTable = isAdminTable ? "admins" : "users";
    const { error: updateError } = await supabase
      .from(targetTable)
      .update({
        email: updatedEmail,
        username: updatedUsername,
        bio: updatedBio,
        password: updatedPasswordHash,
      })
      .eq("id", admin.id);

    if (updateError) return c.json({ error: "관리자 정보 갱신 실패" }, 500);

    // profiles 분리 테이블 동기화
    try {
      await supabase.from("profiles").upsert(
        {
          admin_id: admin.id,
          email: updatedEmail,
          username: updatedUsername,
          bio: updatedBio,
          role: "admin",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "email" }
      );
    } catch {}

    const newToken = jwt.sign(
      { id: admin.id, email: updatedEmail, username: updatedUsername, role: "admin" },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    return c.json({
      success: true,
      message: "관리자 계정 정보가 성공적으로 변경되었습니다.",
      admin: {
        id: admin.id,
        email: updatedEmail,
        username: updatedUsername,
        role: "admin",
        bio: updatedBio,
      },
      token: newToken,
    });
  } catch (err: any) {
    return c.json({ error: `관리자 계정 수정 실패: ${err.message}` }, 500);
  }
};
app.put("/admin/account", adminAccountUpdateHandler);
app.put("/api/admin/account", adminAccountUpdateHandler);

// 관리자 대시보드 통계
const adminStatsHandler = async (c: any) => {
  try {
    const admin = getAdminFromToken(c.req.header("Authorization"));
    if (!admin) return c.json({ error: "관리자 전용 권한이 필요합니다." }, 403);

    const supabase = getSupabaseClient();
    const [usersCount, adminsCount, postsCount, commentsCount, postsData] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase.from("admins").select("id", { count: "exact", head: true }),
      supabase.from("posts").select("id", { count: "exact", head: true }),
      supabase.from("comments").select("id", { count: "exact", head: true }),
      supabase.from("posts").select("views, likes"),
    ]);

    let totalViews = 0;
    let totalLikes = 0;
    if (postsData.data) {
      postsData.data.forEach((p: any) => {
        totalViews += Number(p.views || 0);
        totalLikes += Number(p.likes || 0);
      });
    }

    const { data: recentPosts } = await supabase
      .from("posts")
      .select("id, title, author, views, likes, created_at")
      .order("id", { ascending: false })
      .limit(5);

    const [{ data: recentUsers }, { data: recentAdmins }] = await Promise.all([
      supabase.from("users").select("id, email, username, role, created_at").order("id", { ascending: false }).limit(5),
      supabase.from("admins").select("id, email, username, role, created_at").order("id", { ascending: false }).limit(5),
    ]);
    const mergedRecent = [...(recentAdmins || []), ...(recentUsers || [])]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);

    return c.json({
      totalUsers: (usersCount.count || 0) + (adminsCount.count || 0),
      totalPosts: postsCount.count || 0,
      totalComments: commentsCount.count || 0,
      totalViews,
      totalLikes,
      recentPosts: (recentPosts || []).map((p: any) => ({ ...p, createdAt: formatDate(p.created_at) })),
      recentUsers: mergedRecent.map((u: any) => ({ ...u, joinedAt: formatDate(u.created_at) })),
    });
  } catch {
    return c.json({ error: "통계 조회 실패" }, 500);
  }
};
app.get("/admin/stats", adminStatsHandler);
app.get("/api/admin/stats", adminStatsHandler);
app.get("/admin/dashboard", adminStatsHandler);
app.get("/api/admin/dashboard", adminStatsHandler);

// 관리자 회원 목록 조회 (admins + users 분리 테이블 통합 조회 및 프로필 매핑)
const adminUsersHandler = async (c: any) => {
  try {
    const admin = getAdminFromToken(c.req.header("Authorization"));
    if (!admin) return c.json({ error: "관리자 전용 권한이 필요합니다." }, 403);

    const supabase = getSupabaseClient();
    const [{ data: adminList }, { data: userList, error }] = await Promise.all([
      supabase.from("admins").select("*").order("id", { ascending: true }),
      supabase.from("users").select("*").order("id", { ascending: true }),
    ]);
    if (error) return c.json({ error: error.message }, 500);

    const [postsRes, commentsRes, profilesRes] = await Promise.all([
      supabase.from("posts").select("author_id, author"),
      supabase.from("comments").select("author_id, author"),
      supabase.from("profiles").select("*"),
    ]);

    const postCountMap: Record<string, number> = {};
    (postsRes.data || []).forEach((p: any) => {
      if (p.author_id) postCountMap[p.author_id] = (postCountMap[p.author_id] || 0) + 1;
    });

    const commentCountMap: Record<string, number> = {};
    (commentsRes.data || []).forEach((comm: any) => {
      if (comm.author_id) commentCountMap[comm.author_id] = (commentCountMap[comm.author_id] || 0) + 1;
    });

    const profileMap: Record<string, any> = {};
    (profilesRes.data || []).forEach((prof: any) => {
      if (prof.email) profileMap[prof.email.toLowerCase()] = prof;
    });

    const allMembers = [
      ...(adminList || []).map((a: any) => ({ ...a, role: "admin", is_admin_table: true })),
      ...(userList || []).map((u: any) => ({ ...u, role: "user", is_user_table: true })),
    ];

    const formatted = allMembers.map((u: any) => {
      const prof = profileMap[u.email?.toLowerCase()] || {};
      return {
        id: u.id,
        name: u.name || prof.name || u.username,
        nickname: u.nickname || prof.nickname || u.username,
        username: u.username,
        phone: u.phone || prof.phone || "",
        email: u.email,
        role: u.role,
        bio: prof.bio || u.bio || "",
        avatarUrl: prof.avatar_url || u.avatar_url || "",
        postsCount: postCountMap[u.id] || 0,
        commentsCount: commentCountMap[u.id] || 0,
        joinedAt: formatDate(u.created_at),
        sourceTable: u.is_admin_table ? "admins" : "users",
        hasAdmin: !!u.is_admin_table,
        hasUser: !!u.is_user_table,
        hasProfile: !!profileMap[u.email?.toLowerCase()],
      };
    });

    return c.json(formatted);
  } catch {
    return c.json({ error: "회원 목록 조회 실패" }, 500);
  }
};
app.get("/admin/users", adminUsersHandler);
app.get("/api/admin/users", adminUsersHandler);
app.get("/users", adminUsersHandler);
app.get("/api/users", adminUsersHandler);

// 관리자 회원 삭제
const adminDeleteUserHandler = async (c: any) => {
  try {
    const admin = getAdminFromToken(c.req.header("Authorization"));
    if (!admin) return c.json({ error: "관리자 전용 권한이 필요합니다." }, 403);

    const targetUserId = Number(c.req.param("id"));
    const supabase = getSupabaseClient();

    const { data: targetUser } = await supabase.from("users").select("id, email, role").eq("id", targetUserId).maybeSingle();
    if (!targetUser) return c.json({ error: "삭제할 사용자를 찾을 수 없습니다." }, 404);

    if (targetUser.role === "admin") {
      return c.json({ error: "최고 관리자 계정은 삭제할 수 없습니다." }, 400);
    }

    // 작성한 글, 댓글 삭제
    await supabase.from("comments").delete().eq("author_id", targetUserId);
    await supabase.from("posts").delete().eq("author_id", targetUserId);
    await supabase.from("profiles").delete().eq("email", targetUser.email);
    await supabase.from("users").delete().eq("id", targetUserId);

    // Supabase Auth 유저 삭제
    try {
      const { data: authList } = await supabase.auth.admin.listUsers();
      const authTarget = authList?.users?.find((u: any) => u.email?.toLowerCase() === targetUser.email.toLowerCase());
      if (authTarget?.id) {
        await supabase.auth.admin.deleteUser(authTarget.id);
      }
    } catch {}

    return c.json({ success: true, message: "회원이 삭제되었습니다." });
  } catch {
    return c.json({ error: "회원 삭제 처리 실패" }, 500);
  }
};
app.delete("/admin/users/:id", adminDeleteUserHandler);
app.delete("/api/admin/users/:id", adminDeleteUserHandler);

// 관리자 댓글 목록 조회
const adminCommentsHandler = async (c: any) => {
  try {
    const admin = getAdminFromToken(c.req.header("Authorization"));
    if (!admin) return c.json({ error: "관리자 전용 권한이 필요합니다." }, 403);

    const supabase = getSupabaseClient();
    const { data: comments, error } = await supabase.from("comments").select("*").order("id", { ascending: false });
    if (error) return c.json({ error: error.message }, 500);

    const { data: posts } = await supabase.from("posts").select("id, title");
    const titleMap: Record<number, string> = {};
    (posts || []).forEach((p: any) => {
      titleMap[p.id] = p.title;
    });

    const formatted = (comments || []).map((comm: any) => ({
      ...comm,
      createdAt: formatDateTime(comm.created_at),
      date: formatDateTime(comm.created_at),
      postTitle: titleMap[comm.post_id] || "삭제된 게시글",
    }));

    return c.json(formatted);
  } catch {
    return c.json({ error: "댓글 목록 조회 실패" }, 500);
  }
};
app.get("/admin/comments", adminCommentsHandler);
app.get("/api/admin/comments", adminCommentsHandler);
app.get("/comments", adminCommentsHandler);
app.get("/api/comments", adminCommentsHandler);

// 관리자 댓글 삭제
const adminDeleteCommentHandler = async (c: any) => {
  try {
    const admin = getAdminFromToken(c.req.header("Authorization"));
    if (!admin) return c.json({ error: "관리자 전용 권한이 필요합니다." }, 403);

    const commentId = Number(c.req.param("id"));
    const supabase = getSupabaseClient();
    await supabase.from("comments").delete().eq("id", commentId);

    return c.json({ success: true, message: "댓글이 삭제되었습니다." });
  } catch {
    return c.json({ error: "댓글 삭제 실패" }, 500);
  }
};
app.delete("/admin/comments/:id", adminDeleteCommentHandler);
app.delete("/api/admin/comments/:id", adminDeleteCommentHandler);

// 관리자 계정으로 즉시 전환 (개발/테스트용)
const switchToAdminHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    let { data: admin } = await supabase
      .from("admins")
      .select("*")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!admin) {
      const { data: userAdmin } = await supabase
        .from("users")
        .select("*")
        .eq("role", "admin")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      admin = userAdmin;
    }

    if (!admin) return c.json({ error: "관리자 계정을 찾을 수 없습니다." }, 404);

    const token = jwt.sign(
      { id: admin.id, email: admin.email, username: admin.username, role: "admin" },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );
    const { password: _, ...adminData } = admin;
    const formatted = {
      ...adminData,
      name: admin.name || admin.username,
      nickname: admin.nickname || admin.username,
      phone: admin.phone || "",
      joinedAt: formatDate(admin.created_at),
    };
    return c.json({
      success: true,
      message: "관리자 계정으로 전환되었습니다.",
      admin: formatted,
      user: formatted,
      token,
      refreshToken: token,
    });
  } catch {
    return c.json({ error: "관리자 전환 실패" }, 500);
  }
};
app.post("/auth/switch-to-admin", switchToAdminHandler);
app.post("/api/auth/switch-to-admin", switchToAdminHandler);

// 일반 유저 계정으로 즉시 전환 (개발/테스트용)
const switchToUserHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    let { data: user } = await supabase.from("users").select("*").eq("email", "user@example.com").maybeSingle();
    if (!user) {
      const { data: firstUser } = await supabase
        .from("users")
        .select("*")
        .eq("role", "user")
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      user = firstUser;
    }
    if (!user) return c.json({ error: "일반 테스트 계정을 찾을 수 없습니다." }, 404);

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );
    const { password: _, ...userData } = user;
    const formatted = { ...userData, joinedAt: formatDate(user.created_at) };
    return c.json({ success: true, message: "일반 회원 계정으로 전환되었습니다.", user: formatted, token });
  } catch {
    return c.json({ error: "일반 계정 전환 실패" }, 500);
  }
};
app.post("/auth/switch-to-user", switchToUserHandler);
// -------------------------------------------------------------
// [7. 토스페이먼츠 (Toss Payments) 결제 API]
// -------------------------------------------------------------
const tossConfirmHandler = async (c: any) => {
  try {
    const { paymentKey, orderId, amount } = await c.req.json();
    if (!paymentKey || !orderId || !amount) {
      return c.json({ error: "paymentKey, orderId, amount 항목이 필요합니다." }, 400);
    }

    const user = getUserFromToken(c.req.header("Authorization"));
    const secretKey = Deno.env.get("TOSS_SECRET_KEY") || "test_sk_zXLkKEParamsJqwjn41rg3950rBa1";
    const basicAuth = btoa(`${secretKey}:`);

    const tossRes = await fetch("https://api.tosspayments.com/v1/payments/confirm", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${basicAuth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }),
    });

    const tossData = await tossRes.json();
    if (!tossRes.ok) {
      return c.json({ error: tossData.message || "토스페이먼츠 승인 실패", details: tossData }, tossRes.status);
    }

    const supabase = getSupabaseClient();
    await supabase.from("payments").upsert(
      {
        user_id: user?.id || null,
        order_id: orderId,
        order_name: tossData.orderName || "커뮤니티 멤버십/후원",
        amount: Number(amount),
        status: "DONE",
        payment_key: paymentKey,
        method: tossData.method || "간편결제",
        customer_email: user?.email || tossData.customerEmail || "",
        customer_name: user?.username || tossData.customerName || "",
        raw_response: tossData,
        approved_at: tossData.approvedAt || new Date().toISOString(),
      },
      { onConflict: "order_id" }
    );

    return c.json({ success: true, payment: tossData });
  } catch (err: any) {
    return c.json({ error: `결제 승인 처리 오류: ${err.message}` }, 500);
  }
};
app.post("/payments/confirm", tossConfirmHandler);
app.post("/api/payments/confirm", tossConfirmHandler);

const paymentsListHandler = async (c: any) => {
  try {
    const user = getUserFromToken(c.req.header("Authorization"));
    if (!user) return c.json({ error: "로그인이 필요합니다." }, 401);

    const supabase = getSupabaseClient();
    let query = supabase.from("payments").select("*").order("id", { ascending: false });
    if (user.role !== "admin") {
      query = query.eq("user_id", user.id);
    }
    const { data, error } = await query;
    if (error) return c.json({ error: error.message }, 500);

    return c.json({ success: true, payments: data || [] });
  } catch {
    return c.json({ error: "결제 내역 조회 실패" }, 500);
  }
};
app.get("/payments", paymentsListHandler);
app.get("/api/payments", paymentsListHandler);

// -------------------------------------------------------------
// [8. OpenAI API 연동 (챗봇, 이미지 생성, TTS)]
// -------------------------------------------------------------
const aiChatHandler = async (c: any) => {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return c.json({ error: "OPENAI_API_KEY가 Supabase Secrets에 등록되지 않았습니다." }, 400);
    }

    const { messages, prompt, action } = await c.req.json();
    let systemPrompt = "당신은 '온보드' 커뮤니티의 친절하고 지적인 AI 어시스턴트입니다. 한국어로 정중하고 읽기 쉽게 답변하세요.";
    if (action === "improve") {
      systemPrompt = "당신은 전문 글쓰기 에디터입니다. 사용자가 작성한 글을 더 매력적이고 자연스럽게 교정 및 개선해 주세요.";
    } else if (action === "summary") {
      systemPrompt = "당신은 텍스트 요약 전문가입니다. 사용자의 글을 3줄 핵심 요약으로 명확하게 정리해 주세요.";
    }

    const finalMessages = messages || [{ role: "user", content: prompt || "안녕하세요!" }];
    const chatRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: systemPrompt }, ...finalMessages],
        temperature: 0.7,
      }),
    });

    const chatData = await chatRes.json();
    if (!chatRes.ok) {
      return c.json({ error: chatData.error?.message || "OpenAI API 호출 실패" }, chatRes.status);
    }

    const reply = chatData.choices?.[0]?.message?.content || "";
    return c.json({ success: true, reply, raw: chatData });
  } catch (err: any) {
    return c.json({ error: `AI 챗봇 처리 오류: ${err.message}` }, 500);
  }
};
app.post("/ai/chat", aiChatHandler);
app.post("/api/ai/chat", aiChatHandler);

const aiImageHandler = async (c: any) => {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, 400);

    const { prompt } = await c.req.json();
    if (!prompt) return c.json({ error: "이미지 생성 프롬프트를 입력하세요." }, 400);

    const imgRes = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt: prompt.trim(),
        n: 1,
        size: "1024x1024",
      }),
    });

    const imgData = await imgRes.json();
    if (!imgRes.ok) {
      return c.json({ error: imgData.error?.message || "이미지 생성 실패" }, imgRes.status);
    }

    const imageUrl = imgData.data?.[0]?.url || "";
    return c.json({ success: true, imageUrl, revisedPrompt: imgData.data?.[0]?.revised_prompt });
  } catch (err: any) {
    return c.json({ error: `이미지 생성 처리 오류: ${err.message}` }, 500);
  }
};
app.post("/ai/image", aiImageHandler);
app.post("/api/ai/image", aiImageHandler);

const aiTtsHandler = async (c: any) => {
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return c.json({ error: "OPENAI_API_KEY가 설정되지 않았습니다." }, 400);

    const { text, voice = "alloy" } = await c.req.json();
    if (!text) return c.json({ error: "변환할 텍스트가 필요합니다." }, 400);

    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text.slice(0, 4000),
        voice,
      }),
    });

    if (!ttsRes.ok) {
      const errJson = await ttsRes.json().catch(() => ({}));
      return c.json({ error: errJson.error?.message || "TTS 변환 실패" }, ttsRes.status);
    }

    const audioArrayBuffer = await ttsRes.arrayBuffer();
    return new Response(audioArrayBuffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (err: any) {
    return c.json({ error: `TTS 변환 오류: ${err.message}` }, 500);
  }
};
app.post("/ai/tts", aiTtsHandler);
app.post("/api/ai/tts", aiTtsHandler);

// Deno.serve 엔트리포인트 실행
Deno.serve(app.fetch);
export default app;
