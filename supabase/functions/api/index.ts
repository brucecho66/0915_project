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

// CORS 설정
app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Content-Type", "Authorization", "apikey", "x-client-info"],
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

// JWT 인증 추출 헬퍼
function getUserFromToken(authHeader?: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  try {
    return jwt.verify(token, JWT_SECRET) as any;
  } catch {
    return null;
  }
}

// -------------------------------------------------------------
// [기본 상태 확인]
// -------------------------------------------------------------
const healthHandler = (c: any) => {
  return c.json({
    status: "ok",
    runtime: "supabase_edge_function",
    timestamp: new Date().toISOString(),
  });
};

app.get("/", healthHandler);
app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// -------------------------------------------------------------
// [1. 회원 인증 API]
// -------------------------------------------------------------

// 회원가입 (Supabase Auth 기반 회원가입 처리)
const registerHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const { email, username, password } = await c.req.json();
    if (!email || !username || !password) {
      return c.json({ error: "이메일, 닉네임, 비밀번호를 모두 입력해주세요." }, 400);
    }

    if (password.length < 6) {
      return c.json({ error: "비밀번호는 최소 6자 이상이어야 합니다." }, 400);
    }

    const trimmedEmail = email.trim().toLowerCase();
    const trimmedUsername = username.trim();

    // [1단계: Supabase Auth 권한 회원가입 처리]
    // Supabase 대시보드 [권한(Authentication) -> 유저목록(Users)]에 공식 계정 생성
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: trimmedEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        username: trimmedUsername,
        role: "user",
        bio: "새로 가입한 회원입니다.",
      },
    });

    if (authError) {
      const errMsg = (authError.message || "").toLowerCase();
      if (errMsg.includes("already") || errMsg.includes("registered") || errMsg.includes("exists")) {
        return c.json({ error: "이미 등록된 이메일 계정입니다." }, 400);
      }
      return c.json({ error: `Supabase 권한 회원가입 오류: ${authError.message}` }, 400);
    }

    // [2단계: Supabase 데이터베이스(public.users) 동기화]
    const hashedPassword = bcrypt.hashSync(password, 10);
    const { data: newUser, error: insertError } = await supabase
      .from("users")
      .upsert({
        email: trimmedEmail,
        username: trimmedUsername,
        password: hashedPassword,
        role: "user",
        bio: "새로 가입한 회원입니다.",
      }, { onConflict: "email" })
      .select("id, email, username, role, bio, created_at")
      .single();

    if (insertError) {
      // DB 저장 실패 시 생성된 Auth 유저 롤백
      if (authUser?.user?.id) {
        await supabase.auth.admin.deleteUser(authUser.user.id);
      }
      return c.json({ error: "데이터베이스 회원 정보 저장 중 오류가 발생했습니다." }, 500);
    }

    const formattedUser = {
      id: newUser.id,
      name: newUser.username,
      nickname: newUser.username,
      username: newUser.username,
      email: newUser.email,
      role: newUser.role,
      bio: newUser.bio,
      joinedAt: formatDate(newUser.created_at),
    };

    const token = jwt.sign(
      { id: formattedUser.id, email: formattedUser.email, username: formattedUser.username, role: formattedUser.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    return c.json({ success: true, user: formattedUser, token, refreshToken: token }, 201);
  } catch (err: any) {
    return c.json({ error: err.message || "서버 오류" }, 500);
  }
};

app.post("/auth/register", registerHandler);
app.post("/api/auth/register", registerHandler);
app.post("/auth/signup", registerHandler);
app.post("/api/auth/signup", registerHandler);

// 관리자 기본 정보 조회
const adminInfoHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const { data: admin } = await supabase
      .from("users")
      .select("id, email, username, role, bio, created_at")
      .eq("role", "admin")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    const defaultEmail = Deno.env.get("ADMIN_EMAIL") || "iicbruce@naver.com";
    const defaultName = Deno.env.get("ADMIN_NAME") || "bodyguard";

    return c.json({
      success: true,
      email: admin ? admin.email : defaultEmail,
      username: admin ? admin.username : defaultName,
      name: admin ? admin.username : defaultName,
    });
  } catch {
    return c.json({ error: "관리자 정보 조회 실패" }, 500);
  }
};

app.get("/auth/admin-info", adminInfoHandler);
app.get("/api/auth/admin-info", adminInfoHandler);

// 로그인 (Supabase Auth 및 DB 통합 인증)
const loginHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const { email, password } = await c.req.json();
    if (!email || !password) {
      return c.json({ error: "이메일과 비밀번호를 모두 입력해주세요." }, 400);
    }

    const trimmedEmail = email.trim().toLowerCase();

    // 1. Supabase Auth 권한 인증 시도
    const { data: authSignIn } = await supabase.auth.signInWithPassword({
      email: trimmedEmail,
      password: password,
    });

    // 2. DB 사용자 정보 조회
    let { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", trimmedEmail)
      .maybeSingle();

    if (authSignIn?.user) {
      // Supabase Auth 인증 성공
      if (!user) {
        // DB에 없으면 자동 동기화 생성
        const { data: createdUser } = await supabase
          .from("users")
          .insert({
            email: trimmedEmail,
            username: authSignIn.user.user_metadata?.username || trimmedEmail.split("@")[0],
            password: bcrypt.hashSync(password, 10),
            role: authSignIn.user.user_metadata?.role || "user",
            bio: authSignIn.user.user_metadata?.bio || "",
          })
          .select()
          .single();
        user = createdUser;
      }
    } else {
      // Supabase Auth에 없거나 비밀번호가 다른 경우, DB의 bcrypt 해시 검증
      if (!user) {
        return c.json({ error: "가입되지 않은 이메일 주소입니다." }, 401);
      }

      const isPasswordValid = user.password.startsWith("$2")
        ? bcrypt.compareSync(password, user.password)
        : user.password === password;

      if (!isPasswordValid) {
        return c.json({ error: "비밀번호가 일치하지 않습니다." }, 401);
      }

      // DB 검증 성공 시, Supabase Auth 권한 유저로 자동 승격 생성
      try {
        await supabase.auth.admin.createUser({
          email: trimmedEmail,
          password: password.length >= 6 ? password : password + "123456",
          email_confirm: true,
          user_metadata: {
            username: user.username,
            role: user.role,
            bio: user.bio,
          },
        });
      } catch (authCreateErr) {
        console.warn("Supabase Auth 동기화 오류:", authCreateErr);
      }
    }

    const userData = {
      id: user.id,
      name: user.username,
      nickname: user.username,
      username: user.username,
      email: user.email,
      role: user.role,
      bio: user.bio,
      joinedAt: formatDate(user.created_at),
    };

    const token = jwt.sign(
      { id: userData.id, email: userData.email, username: userData.username, role: userData.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    return c.json({
      success: true,
      message: "로그인 성공",
      user: userData,
      token,
      refreshToken: token,
    });
  } catch (err: any) {
    return c.json({ error: err.message || "로그인 처리 실패" }, 500);
  }
};

app.post("/auth/login", loginHandler);
app.post("/api/auth/login", loginHandler);

// 내 정보 조회
const meHandler = async (c: any) => {
  try {
    const user = getUserFromToken(c.req.header("Authorization"));
    if (!user) {
      return c.json({ error: "인증 토큰이 누락되었거나 유효하지 않습니다." }, 401);
    }

    const supabase = getSupabaseClient();
    const { data: userData } = await supabase
      .from("users")
      .select("id, email, username, role, bio, created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (!userData) {
      return c.json({ error: "회원 정보를 찾을 수 없습니다." }, 404);
    }

    const formatted = {
      id: userData.id,
      name: userData.username,
      nickname: userData.username,
      username: userData.username,
      email: userData.email,
      role: userData.role,
      bio: userData.bio,
      joinedAt: formatDate(userData.created_at),
    };

    const token = jwt.sign(
      { id: formatted.id, email: formatted.email, username: formatted.username, role: formatted.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    return c.json({
      success: true,
      user: formatted,
      token,
      refreshToken: token,
    });
  } catch {
    return c.json({ error: "회원 정보 조회 실패" }, 500);
  }
};

app.get("/auth/me", meHandler);
app.get("/api/auth/me", meHandler);
app.post("/auth/refresh", meHandler);
app.post("/api/auth/refresh", meHandler);
// 프로필 상세 및 활동 통계 조회 (온보드 /profile 전용 페이지 연동)
const profileDetailHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const tokenUser = getUserFromToken(c.req.header("Authorization"));

    let userRecord = null;
    if (tokenUser?.id) {
      const { data } = await supabase.from("users").select("*").eq("id", tokenUser.id).maybeSingle();
      userRecord = data;
    }
    if (!userRecord && tokenUser?.email) {
      const { data } = await supabase.from("users").select("*").eq("email", tokenUser.email).maybeSingle();
      userRecord = data;
    }
    if (!userRecord) {
      // 비로그인 상태로 /profile 접속 시 기본 사용자 정보 제공 (전용 페이지가 오류 없이 렌더링되도록 보장)
      const { data } = await supabase.from("users").select("*").order("id", { ascending: true }).limit(1).maybeSingle();
      userRecord = data;
    }

    if (!userRecord) {
      userRecord = {
        id: 0,
        email: "user@example.com",
        username: "온보드회원",
        role: "user",
        bio: "온보드 커뮤니티 회원입니다.",
        created_at: new Date().toISOString(),
      };
    }

    // 작성한 게시글 목록
    const { data: userPosts } = await supabase
      .from("posts")
      .select("*")
      .or(`user_id.eq.${userRecord.id},author.eq.${userRecord.username}`)
      .order("id", { ascending: false });

    const postIds = (userPosts || []).map((p: any) => p.id);
    const countMap: Record<number, number> = {};
    if (postIds.length > 0) {
      const { data: commentsCountData } = await supabase.from("comments").select("post_id").in("post_id", postIds);
      if (commentsCountData) {
        commentsCountData.forEach((row: any) => {
          countMap[row.post_id] = (countMap[row.post_id] || 0) + 1;
        });
      }
    }

    const postsList = (userPosts || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      excerpt: p.content ? (p.content.length > 100 ? p.content.slice(0, 100) + "..." : p.content) : "",
      category: p.category || "일상",
      author: p.author || userRecord.username || "사용자",
      avatar: (p.author || userRecord.username || "사")[0],
      userId: p.user_id,
      date: p.created_at || new Date().toISOString(),
      views: Number(p.views || 0),
      likes: Number(p.likes || 0),
      dislikes: Number(p.dislikes || 0),
      comments: Number(countMap[p.id] || 0),
      createdAt: formatDate(p.created_at),
      updatedAt: formatDateTime(p.updated_at),
    }));

    const totalLikes = postsList.reduce((sum: number, p: any) => sum + p.likes, 0);

    const { count: commentCount } = await supabase
      .from("comments")
      .select("*", { count: "exact", head: true })
      .or(`user_id.eq.${userRecord.id},author.eq.${userRecord.username}`);

    const formattedUser = {
      id: userRecord.id,
      name: userRecord.username || "온보드 회원",
      nickname: userRecord.username || "user",
      username: userRecord.username || "user",
      email: userRecord.email,
      role: userRecord.role || "user",
      bio: userRecord.bio || "온보드 커뮤니티 회원입니다.",
      joinedAt: formatDate(userRecord.created_at),
    };

    return c.json({
      user: formattedUser,
      stats: {
        posts: postsList.length,
        likes: totalLikes,
        comments: Number(commentCount || 0),
      },
      posts: postsList,
    });
  } catch (err: any) {
    return c.json({ error: "프로필 정보 조회 실패: " + err.message }, 500);
  }
};

app.get("/profile", profileDetailHandler);
app.get("/api/profile", profileDetailHandler);

// 프로필 수정
const profileHandler = async (c: any) => {
  try {
    const user = getUserFromToken(c.req.header("Authorization"));
    const body = await c.req.json();
    const username = (body.username || body.name || body.nickname || "").trim();
    const bio = body.bio !== undefined ? body.bio : "";

    if (!username) {
      return c.json({ error: "닉네임을 입력해주세요." }, 400);
    }

    const supabase = getSupabaseClient();
    const targetId = user?.id || 9;
    const { data: updated, error } = await supabase
      .from("users")
      .update({ username, bio })
      .eq("id", targetId)
      .select("id, email, username, role, bio, created_at")
      .single();

    if (error) return c.json({ error: "프로필 수정 실패" }, 500);

    const formatted = {
      id: updated.id,
      name: updated.username,
      nickname: updated.username,
      username: updated.username,
      email: updated.email,
      role: updated.role,
      bio: updated.bio,
      joinedAt: formatDate(updated.created_at),
    };

    return c.json({
      success: true,
      user: formatted,
    });
  } catch {
    return c.json({ error: "프로필 수정 실패" }, 500);
  }
};

app.put("/auth/profile", profileHandler);
app.put("/api/auth/profile", profileHandler);
app.patch("/auth/me", profileHandler);
app.patch("/api/auth/me", profileHandler);
app.put("/api/auth/profile", profileHandler);

// -------------------------------------------------------------
// [2. 게시글(Posts) 및 댓글(Comments) API]
// -------------------------------------------------------------

// 게시글 목록
const postsListHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const category = c.req.query("category");
    const search = c.req.query("search");
    const page = Math.max(1, Number(c.req.query("page") || 1));
    const limit = Math.max(1, Number(c.req.query("limit") || 10));

    let query = supabase.from("posts").select("*", { count: "exact" });
    if (category && category !== "전체") {
      query = query.eq("category", category);
    }
    if (search && search.trim()) {
      query = query.or(`title.ilike.%${search.trim()}%,content.ilike.%${search.trim()}%`);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    const { data: rawPosts, count, error: postsError } = await query
      .neq("is_hidden", true)
      .order("id", { ascending: false })
      .range(from, to);

    if (postsError) return c.json({ error: "게시글 목록 조회 실패" }, 500);

    const postIds = (rawPosts || []).map((p: any) => p.id);
    const countMap: Record<number, number> = {};
    if (postIds.length > 0) {
      const { data: commentsCountData } = await supabase.from("comments").select("post_id").in("post_id", postIds);
      if (commentsCountData) {
        commentsCountData.forEach((row: any) => {
          countMap[row.post_id] = (countMap[row.post_id] || 0) + 1;
        });
      }
    }

    const posts = (rawPosts || []).map((p: any) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      excerpt: p.content ? (p.content.length > 100 ? p.content.slice(0, 100) + "..." : p.content) : "",
      category: p.category || "일상",
      author: p.author || "익명",
      avatar: (p.author || "익")[0],
      userId: p.user_id,
      date: p.created_at || new Date().toISOString(),
      views: Number(p.views || 0),
      likes: Number(p.likes || 0),
      dislikes: Number(p.dislikes || 0),
      comments: Number(countMap[p.id] || 0),
      commentCount: Number(countMap[p.id] || 0),
      featured: Boolean(p.is_featured),
      isHidden: Boolean(p.is_hidden),
      createdAt: formatDate(p.created_at),
      updatedAt: formatDateTime(p.updated_at),
    }));

    const total = count ?? posts.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return c.json({
      posts,
      totalPages,
      total,
      page,
      currentPage: page,
    });
  } catch (err: any) {
    return c.json({ error: "게시글 목록을 불러오지 못했습니다: " + err.message }, 500);
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

    const { data: rawComments } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("id", { ascending: true });

    const user = getUserFromToken(c.req.header("Authorization"));
    const userIdQuery = c.req.query("userId");
    const clientIdentifier = c.req.query("identifier");
    const currentUserId = user?.id || (userIdQuery ? Number(userIdQuery) : null);
    const identifier = currentUserId ? `user_${currentUserId}` : (clientIdentifier || "guest_anon");

    const { data: reaction } = await supabase
      .from("post_reactions")
      .select("reaction_type")
      .eq("post_id", postId)
      .eq("user_identifier", identifier)
      .maybeSingle();

    const formattedComments = (rawComments || []).map((comm: any) => ({
      id: comm.id,
      postId: comm.post_id,
      userId: comm.user_id,
      author: comm.author || "익명",
      avatar: (comm.author || "익")[0],
      content: comm.content,
      isHidden: Boolean(comm.is_hidden),
      date: comm.created_at || new Date().toISOString(),
      created_at: comm.created_at || new Date().toISOString(),
      createdAt: formatDateTime(comm.created_at),
      updatedAt: formatDateTime(comm.updated_at),
    }));

    const formattedPost = {
      id: post.id,
      title: post.title,
      content: post.content,
      excerpt: post.content ? (post.content.length > 100 ? post.content.slice(0, 100) + "..." : post.content) : "",
      category: post.category || "일상",
      author: post.author,
      avatar: (post.author || "사")[0],
      userId: post.user_id,
      views: Number(post.views || 0),
      likes: Number(post.likes || 0),
      dislikes: Number(post.dislikes || 0),
      comments: formattedComments.length,
      commentCount: formattedComments.length,
      isHidden: Boolean(post.is_hidden),
      featured: Boolean(post.is_featured),
      date: post.created_at || new Date().toISOString(),
      createdAt: formatDate(post.created_at),
      updatedAt: formatDateTime(post.updated_at),
      reaction: reaction ? reaction.reaction_type : null,
      userReaction: reaction ? reaction.reaction_type : null,
    };

    return c.json({
      ...formattedPost,
      post: formattedPost,
      comments: formattedComments,
    });
  } catch {
    return c.json({ error: "게시글 상세 조회 실패" }, 500);
  }
};

app.get("/posts/:id", postDetailHandler);
app.get("/api/posts/:id", postDetailHandler);

// 조회수 증가 API
const postViewHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const supabase = getSupabaseClient();

    const { data: post } = await supabase.from("posts").select("id, views").eq("id", postId).maybeSingle();
    if (!post) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const updatedViews = Number(post.views || 0) + 1;
    await supabase.from("posts").update({ views: updatedViews }).eq("id", postId);

    return c.json({ success: true, views: updatedViews });
  } catch {
    return c.json({ error: "조회수 증가 실패" }, 500);
  }
};

app.post("/posts/:id/view", postViewHandler);
app.post("/api/posts/:id/view", postViewHandler);

// 좋아요/싫어요 반응 토글 API
const postReactHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const { type, userId, identifier: clientIdentifier } = await c.req.json();
    if (!type || (type !== "like" && type !== "dislike")) {
      return c.json({ error: "type은 'like' 또는 'dislike'여야 합니다." }, 400);
    }

    const supabase = getSupabaseClient();
    const { data: post } = await supabase.from("posts").select("id, likes, dislikes").eq("id", postId).maybeSingle();
    if (!post) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const user = getUserFromToken(c.req.header("Authorization"));
    const currentUserId = user?.id || (userId ? Number(userId) : null);
    const identifier = currentUserId ? `user_${currentUserId}` : (clientIdentifier || "guest_anon");

    const { data: existingReaction } = await supabase
      .from("post_reactions")
      .select("id, reaction_type")
      .eq("post_id", postId)
      .eq("user_identifier", identifier)
      .maybeSingle();

    let userReaction = null;
    let newLikes = Number(post.likes || 0);
    let newDislikes = Number(post.dislikes || 0);

    if (existingReaction) {
      if (existingReaction.reaction_type === type) {
        await supabase.from("post_reactions").delete().eq("id", existingReaction.id);
        if (type === "like") newLikes = Math.max(0, newLikes - 1);
        else newDislikes = Math.max(0, newDislikes - 1);
        userReaction = null;
      } else {
        await supabase.from("post_reactions").update({ reaction_type: type, created_at: new Date().toISOString() }).eq("id", existingReaction.id);
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

    return c.json({ success: true, likes: newLikes, dislikes: newDislikes, reaction: userReaction, userReaction });
  } catch (err: any) {
    return c.json({ error: err.message || "반응 처리 실패" }, 500);
  }
};

app.post("/posts/:id/react", postReactHandler);
app.post("/api/posts/:id/react", postReactHandler);
app.post("/posts/:id/reaction", postReactHandler);
app.post("/api/posts/:id/reaction", postReactHandler);

// 새 게시글 등록
const postCreateHandler = async (c: any) => {
  try {
    const { title, content, author, userId, category } = await c.req.json();
    if (!title || !content) return c.json({ error: "제목과 내용을 입력해주세요." }, 400);

    const supabase = getSupabaseClient();
    const tokenUser = getUserFromToken(c.req.header("Authorization"));
    const finalAuthor = (author || tokenUser?.username || "익명").trim();
    const finalUserId = userId ? Number(userId) : (tokenUser?.id ? Number(tokenUser.id) : null);
    const finalCategory = (category || "일상").trim();

    const { data: createdPost, error } = await supabase
      .from("posts")
      .insert({
        title: title.trim(),
        content: content.trim(),
        category: finalCategory,
        author: finalAuthor,
        user_id: finalUserId,
        views: 0,
        likes: 0,
        dislikes: 0,
        is_hidden: false,
      })
      .select("*")
      .single();

    if (error) return c.json({ error: "게시글 등록 실패: " + error.message }, 500);

    const formatted = {
      id: createdPost.id,
      title: createdPost.title,
      content: createdPost.content,
      excerpt: createdPost.content ? (createdPost.content.length > 100 ? createdPost.content.slice(0, 100) + "..." : createdPost.content) : "",
      category: createdPost.category || finalCategory,
      author: createdPost.author,
      avatar: (createdPost.author || "익")[0],
      userId: createdPost.user_id,
      views: 0,
      likes: 0,
      dislikes: 0,
      comments: 0,
      commentCount: 0,
      isHidden: false,
      date: createdPost.created_at || new Date().toISOString(),
      createdAt: formatDate(createdPost.created_at),
      updatedAt: formatDateTime(createdPost.updated_at),
    };

    return c.json({ ...formatted, post: formatted }, 201);
  } catch (err: any) {
    return c.json({ error: "게시글 등록 실패: " + err.message }, 500);
  }
};

app.post("/posts", postCreateHandler);
app.post("/api/posts", postCreateHandler);

// 댓글 목록 조회
const commentsListHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const supabase = getSupabaseClient();
    const tokenUser = getUserFromToken(c.req.header("Authorization"));
    const isAdmin = tokenUser?.role === "admin";

    const { data: rawComments, error } = await supabase
      .from("comments")
      .select("*")
      .eq("post_id", postId)
      .order("id", { ascending: true });

    if (error) return c.json({ error: "댓글 목록 조회 실패" }, 500);

    const processed = (rawComments || []).map((comm: any) => {
      const isHidden = Boolean(comm.is_hidden);
      const isOwner = tokenUser && (tokenUser.id === comm.user_id || tokenUser.username === comm.author);

      if (isHidden && !isAdmin && !isOwner) {
        return {
          id: comm.id,
          postId: comm.post_id,
          userId: comm.user_id,
          author: comm.author,
          avatar: (comm.author || "익")[0],
          content: "관리자에 의해 숨김 처리된 댓글입니다.",
          isHidden: true,
          isMasked: true,
          date: comm.created_at || new Date().toISOString(),
          created_at: comm.created_at || new Date().toISOString(),
          createdAt: formatDateTime(comm.created_at),
          updatedAt: formatDateTime(comm.updated_at),
        };
      }

      return {
        id: comm.id,
        postId: comm.post_id,
        userId: comm.user_id,
        author: comm.author || "익명",
        avatar: (comm.author || "익")[0],
        content: comm.content,
        isHidden,
        isMasked: false,
        date: comm.created_at || new Date().toISOString(),
        created_at: comm.created_at || new Date().toISOString(),
        createdAt: formatDateTime(comm.created_at),
        updatedAt: formatDateTime(comm.updated_at),
      };
    });

    return c.json(processed);
  } catch {
    return c.json({ error: "댓글 목록 조회 실패" }, 500);
  }
};

app.get("/posts/:id/comments", commentsListHandler);
app.get("/api/posts/:id/comments", commentsListHandler);

// 댓글 등록
const commentCreateHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const { author, content, userId } = await c.req.json();
    if (!content || !content.trim()) return c.json({ error: "댓글 내용을 입력해주세요." }, 400);

    const supabase = getSupabaseClient();
    const tokenUser = getUserFromToken(c.req.header("Authorization"));
    const finalUserId = tokenUser?.id || (userId ? Number(userId) : null);
    const finalAuthor = (tokenUser?.username || author || "익명 방문자").trim();

    const { data: newComment, error } = await supabase
      .from("comments")
      .insert({
        post_id: postId,
        user_id: finalUserId,
        author: finalAuthor,
        content: content.trim(),
        is_hidden: false,
      })
      .select("*")
      .single();

    if (error) return c.json({ error: "댓글 등록 실패" }, 500);

    return c.json(
      {
        id: newComment.id,
        postId: newComment.post_id,
        userId: newComment.user_id,
        author: newComment.author,
        avatar: (newComment.author || "익")[0],
        content: newComment.content,
        isHidden: false,
        isMasked: false,
        date: newComment.created_at || new Date().toISOString(),
        created_at: newComment.created_at || new Date().toISOString(),
        createdAt: formatDateTime(newComment.created_at),
        updatedAt: formatDateTime(newComment.updated_at),
      },
      201
    );
  } catch {
    return c.json({ error: "댓글 등록 실패" }, 500);
  }
};

app.post("/posts/:id/comments", commentCreateHandler);
app.post("/api/posts/:id/comments", commentCreateHandler);

// 게시글 수정
const postUpdateHandler = async (c: any) => {
  try {
    const postId = Number(c.req.param("id"));
    const { title, content, author, requesterRole, category } = await c.req.json();
    if (!title || !content) return c.json({ error: "제목과 내용을 입력해주세요." }, 400);

    const supabase = getSupabaseClient();
    const { data: existing } = await supabase.from("posts").select("*").eq("id", postId).maybeSingle();
    if (!existing) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const tokenUser = getUserFromToken(c.req.header("Authorization"));
    const isAdmin = requesterRole === "admin" || tokenUser?.role === "admin";
    const isAuthor = (author && existing.author === author) || (tokenUser && (tokenUser.id === existing.user_id || tokenUser.username === existing.author));

    if (author || requesterRole || tokenUser) {
      if (!isAdmin && !isAuthor) {
        return c.json({ error: "게시글 수정 권한이 없습니다." }, 403);
      }
    }

    const updateFields: any = {
      title: title.trim(),
      content: content.trim(),
      updated_at: new Date().toISOString(),
    };
    if (category) {
      updateFields.category = category.trim();
    }

    const { data: updated, error } = await supabase
      .from("posts")
      .update(updateFields)
      .eq("id", postId)
      .select("*")
      .single();

    if (error) return c.json({ error: "게시글 수정 실패" }, 500);

    const formatted = {
      id: updated.id,
      title: updated.title,
      content: updated.content,
      category: updated.category || existing.category || "일상",
      author: updated.author,
      avatar: (updated.author || "사")[0],
      userId: updated.user_id,
      views: Number(updated.views || 0),
      likes: Number(updated.likes || 0),
      dislikes: Number(updated.dislikes || 0),
      isHidden: Boolean(updated.is_hidden),
      date: updated.created_at,
      createdAt: formatDate(updated.created_at),
      updatedAt: formatDateTime(updated.updated_at),
    };

    return c.json({
      success: true,
      message: "게시글이 성공적으로 수정되었습니다.",
      post: formatted,
    });
  } catch {
    return c.json({ error: "게시글 수정 실패" }, 500);
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
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase.from("posts").select("id, is_hidden").eq("id", postId).maybeSingle();
    if (!existing) return c.json({ error: "게시글을 찾을 수 없습니다." }, 404);

    const newHidden = !existing.is_hidden;
    await supabase.from("posts").update({ is_hidden: newHidden, updated_at: new Date().toISOString() }).eq("id", postId);

    return c.json({
      success: true,
      isHidden: newHidden,
      message: newHidden ? "게시글이 숨김 처리되었습니다." : "게시글 숨김이 해제되었습니다.",
    });
  } catch {
    return c.json({ error: "게시글 숨김 처리 실패" }, 500);
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
    const supabase = getSupabaseClient();
    await supabase.from("post_reactions").delete().eq("post_id", postId);
    await supabase.from("comments").delete().eq("post_id", postId);
    await supabase.from("posts").delete().eq("id", postId);

    return c.json({ success: true, message: "게시글이 성공적으로 삭제되었습니다." });
  } catch {
    return c.json({ error: "게시글 삭제 실패" }, 500);
  }
};
app.delete("/posts/:id", postDeleteHandler);
app.delete("/api/posts/:id", postDeleteHandler);

// 댓글 수정
const commentUpdateHandler = async (c: any) => {
  try {
    const commentId = Number(c.req.param("id"));
    const { content } = await c.req.json();
    if (!content || !content.trim()) return c.json({ error: "내용을 입력해주세요." }, 400);

    const supabase = getSupabaseClient();
    const { data: updated, error } = await supabase
      .from("comments")
      .update({ content: content.trim(), updated_at: new Date().toISOString() })
      .eq("id", commentId)
      .select("*")
      .single();

    if (error) return c.json({ error: "댓글 수정 실패" }, 500);

    return c.json({
      success: true,
      id: updated.id,
      content: updated.content,
      message: "댓글이 성공적으로 수정되었습니다.",
      comment: {
        id: updated.id,
        postId: updated.post_id,
        userId: updated.user_id,
        author: updated.author,
        avatar: (updated.author || "익")[0],
        content: updated.content,
        isHidden: Boolean(updated.is_hidden),
        date: updated.created_at,
        created_at: updated.created_at,
        createdAt: formatDateTime(updated.created_at),
        updatedAt: formatDateTime(updated.updated_at),
      },
    });
  } catch {
    return c.json({ error: "댓글 수정 실패" }, 500);
  }
};
app.put("/comments/:id", commentUpdateHandler);
app.put("/api/comments/:id", commentUpdateHandler);
app.patch("/comments/:id", commentUpdateHandler);
app.patch("/api/comments/:id", commentUpdateHandler);
app.patch("/posts/comments/:id", commentUpdateHandler);
app.patch("/api/posts/comments/:id", commentUpdateHandler);

// 댓글 삭제
const commentDeleteHandler = async (c: any) => {
  try {
    const commentId = Number(c.req.param("id"));
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase.from("comments").select("id, post_id").eq("id", commentId).maybeSingle();
    if (!existing) return c.json({ error: "삭제할 댓글을 찾을 수 없습니다." }, 404);

    await supabase.from("comments").delete().eq("id", commentId);
    return c.json({ success: true, message: "댓글이 성공적으로 삭제되었습니다.", postId: existing.post_id });
  } catch {
    return c.json({ error: "댓글 삭제 실패" }, 500);
  }
};
app.delete("/comments/:id", commentDeleteHandler);
app.delete("/api/comments/:id", commentDeleteHandler);
app.delete("/posts/comments/:id", commentDeleteHandler);
app.delete("/api/posts/comments/:id", commentDeleteHandler);

// 댓글 숨김 토글
const commentToggleHideHandler = async (c: any) => {
  try {
    const commentId = Number(c.req.param("id"));
    const supabase = getSupabaseClient();
    const { data: existing } = await supabase.from("comments").select("id, is_hidden").eq("id", commentId).maybeSingle();
    if (!existing) return c.json({ error: "댓글을 찾을 수 없습니다." }, 404);

    const newHidden = !existing.is_hidden;
    await supabase.from("comments").update({ is_hidden: newHidden, updated_at: new Date().toISOString() }).eq("id", commentId);

    return c.json({
      success: true,
      isHidden: newHidden,
      message: newHidden ? "댓글이 숨김 처리되었습니다." : "댓글 숨김이 해제되었습니다.",
    });
  } catch {
    return c.json({ error: "댓글 숨김 토글 실패" }, 500);
  }
};
app.patch("/comments/:id/toggle-hide", commentToggleHideHandler);
app.patch("/api/comments/:id/toggle-hide", commentToggleHideHandler);
app.patch("/admin/comments/:id/visibility", commentToggleHideHandler);
app.patch("/api/admin/comments/:id/visibility", commentToggleHideHandler);

// 관리자 로그인
const adminLoginHandler = async (c: any) => {
  try {
    const { email, password } = await c.req.json();
    const supabase = getSupabaseClient();
    const { data: user } = await supabase
      .from("users")
      .select("*")
      .eq("email", (email || "").trim().toLowerCase())
      .eq("role", "admin")
      .maybeSingle();

    if (!user) return c.json({ error: "존재하지 않는 관리자 계정입니다." }, 401);

    const isMatch = user.password.startsWith("$2") ? bcrypt.compareSync(password, user.password) : user.password === password;
    if (!isMatch) return c.json({ error: "비밀번호가 일치하지 않습니다." }, 401);

    const token = jwt.sign(
      { id: user.id, email: user.email, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );

    const { password: _, ...adminData } = user;
    return c.json({
      success: true,
      message: "관리자 인증 성공",
      admin: { ...adminData, joinedAt: formatDate(user.created_at) },
      token,
    });
  } catch {
    return c.json({ error: "관리자 로그인 실패" }, 500);
  }
};
app.post("/admin/login", adminLoginHandler);
app.post("/api/admin/login", adminLoginHandler);

// 관리자 통계
const adminStatsHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const [{ count: totalUsers }, { count: totalPosts }, { count: totalComments }] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("posts").select("*", { count: "exact", head: true }),
      supabase.from("comments").select("*", { count: "exact", head: true }),
    ]);

    const { data: viewsData } = await supabase.from("posts").select("views");
    const totalViews = (viewsData || []).reduce((sum: number, p: any) => sum + Number(p.views || 0), 0);

    const { data: recentPostsRaw } = await supabase.from("posts").select("id, title, author, views, likes, created_at").order("id", { ascending: false }).limit(5);
    const recentPosts = (recentPostsRaw || []).map((p: any) => ({ ...p, createdAt: formatDate(p.created_at) }));

    const { data: recentUsersRaw } = await supabase.from("users").select("id, email, username, role, created_at").order("id", { ascending: false }).limit(5);
    const recentUsers = (recentUsersRaw || []).map((u: any) => ({ ...u, joinedAt: formatDate(u.created_at) }));

    return c.json({
      totalUsers: totalUsers || 0,
      totalPosts: totalPosts || 0,
      totalComments: totalComments || 0,
      totalViews,
      recentPosts,
      recentUsers,
    });
  } catch {
    return c.json({ error: "통계 조회 실패" }, 500);
  }
};
app.get("/admin/stats", adminStatsHandler);
app.get("/api/admin/stats", adminStatsHandler);
app.get("/admin/dashboard", adminStatsHandler);
app.get("/api/admin/dashboard", adminStatsHandler);

// 관리자 회원 목록
const adminUsersHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const { data: users, error } = await supabase.from("users").select("id, email, username, role, bio, created_at").order("id", { ascending: false });
    if (error) return c.json({ error: "회원 목록 조회 실패" }, 500);
    return c.json((users || []).map((u: any) => ({ ...u, joinedAt: formatDate(u.created_at) })));
  } catch {
    return c.json({ error: "회원 목록 조회 실패" }, 500);
  }
};
app.get("/admin/users", adminUsersHandler);
app.get("/api/admin/users", adminUsersHandler);

// 관리자 회원 삭제
const adminDeleteUserHandler = async (c: any) => {
  try {
    const targetId = Number(c.req.param("id"));
    const supabase = getSupabaseClient();
    const { data: user } = await supabase.from("users").select("role").eq("id", targetId).maybeSingle();
    if (!user) return c.json({ error: "회원을 찾을 수 없습니다." }, 404);
    if (user.role === "admin") return c.json({ error: "최고 관리자 계정은 삭제할 수 없습니다." }, 400);

    await supabase.from("users").delete().eq("id", targetId);

    // Supabase Auth 계정에서도 삭제 동기화
    if (user.email) {
      try {
        const { data: authUsers } = await supabase.auth.admin.listUsers();
        const found = authUsers?.users?.find((u: any) => u.email === user.email);
        if (found) await supabase.auth.admin.deleteUser(found.id);
      } catch (authDelErr) {
        console.warn("Supabase Auth 유저 삭제 경고:", authDelErr);
      }
    }

    return c.json({ message: "회원 계정이 삭제되었습니다." });
  } catch {
    return c.json({ error: "회원 삭제 실패" }, 500);
  }
};
app.delete("/admin/users/:id", adminDeleteUserHandler);
app.delete("/api/admin/users/:id", adminDeleteUserHandler);

// 관리자 댓글 목록
const adminCommentsHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const { data: comments, error } = await supabase.from("comments").select("*").order("id", { ascending: false });
    if (error) return c.json({ error: "댓글 목록 조회 실패" }, 500);

    const postIds = Array.from(new Set((comments || []).map((c: any) => c.post_id)));
    const titleMap: Record<number, string> = {};
    if (postIds.length > 0) {
      const { data: posts } = await supabase.from("posts").select("id, title").in("id", postIds);
      if (posts) posts.forEach((p: any) => { titleMap[p.id] = p.title; });
    }

    return c.json((comments || []).map((comm: any) => ({
      id: comm.id,
      postId: comm.post_id,
      userId: comm.user_id,
      author: comm.author,
      content: comm.content,
      isHidden: Boolean(comm.is_hidden),
      createdAt: formatDateTime(comm.created_at),
      updatedAt: formatDateTime(comm.updated_at),
      postTitle: titleMap[comm.post_id] || "삭제된 게시글",
    })));
  } catch {
    return c.json({ error: "댓글 목록 조회 실패" }, 500);
  }
};
app.get("/admin/comments", adminCommentsHandler);
app.get("/api/admin/comments", adminCommentsHandler);

// 관리자 계정으로 전환
const switchToAdminHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    const { data: admin } = await supabase.from("users").select("*").eq("role", "admin").order("id", { ascending: true }).limit(1).maybeSingle();
    if (!admin) return c.json({ error: "관리자 계정을 찾을 수 없습니다." }, 404);

    const token = jwt.sign(
      { id: admin.id, email: admin.email, username: admin.username, role: "admin" },
      JWT_SECRET,
      { expiresIn: SESSION_EXPIRY }
    );
    const { password: _, ...adminData } = admin;
    const formatted = { ...adminData, joinedAt: formatDate(admin.created_at) };
    return c.json({ success: true, message: "관리자 계정으로 전환되었습니다.", admin: formatted, user: formatted, token });
  } catch {
    return c.json({ error: "관리자 전환 실패" }, 500);
  }
};
app.post("/auth/switch-to-admin", switchToAdminHandler);
app.post("/api/auth/switch-to-admin", switchToAdminHandler);

// 일반 유저 계정으로 전환
const switchToUserHandler = async (c: any) => {
  try {
    const supabase = getSupabaseClient();
    let { data: user } = await supabase.from("users").select("*").eq("email", "user@example.com").maybeSingle();
    if (!user) {
      const { data: firstUser } = await supabase.from("users").select("*").eq("role", "user").order("id", { ascending: true }).limit(1).maybeSingle();
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
app.post("/api/auth/switch-to-user", switchToUserHandler);

// Deno.serve 진입점
export default app;
