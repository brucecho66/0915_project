import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePosts, API_BASE } from '../context/PostContext';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [adminInfo, setAdminInfo] = useState<{ email: string; username: string } | null>(null);
  const { login, loginWithKakao } = usePosts();
  const navigate = useNavigate();

  React.useEffect(() => {
    fetch(`${API_BASE}/auth/admin-info`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.email) {
          setAdminInfo({ email: data.email, username: data.username });
        }
      })
      .catch((err) => console.error('관리자 정보 조회 실패:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const result = await login(email, password);
    setIsLoading(false);

    if (result.success) {
      navigate('/posts');
    } else {
      setError(result.message || '로그인에 실패했습니다.');
    }
  };

  const handleQuickLogin = async () => {
    setError('');
    setIsLoading(true);
    const result = await login('user@example.com', 'user1234!');
    setIsLoading(false);
    if (result.success) {
      navigate('/posts');
    } else {
      setError(result.message || '테스트 계정 로그인 실패');
    }
  };

  const handleAdminQuickFill = () => {
    const adminEmail = adminInfo?.email || 'iicbruce@naver.com';
    setEmail(adminEmail);
    setError(`관리자 이메일(${adminEmail})이 입력되었습니다. .env의 ADMIN_PASSWORD를 입력하세요.`);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <h2>로그인</h2>
          <p>커뮤니티 보드에 오신 것을 환영합니다.</p>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem',
              backgroundColor: '#fef2f2',
              color: '#dc2626',
              borderRadius: '8px',
              border: '1px solid #fecaca',
              marginBottom: '1rem',
              fontSize: '0.9rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label htmlFor="email">이메일</label>
            <input
              id="email"
              type="email"
              placeholder="example@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">비밀번호</label>
            <input
              id="password"
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={isLoading}>
            {isLoading ? '로그인 처리 중...' : '로그인'}
          </button>

          {/* 카카오톡 소셜 로그인 버튼 */}
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              const res = await loginWithKakao();
              setIsLoading(false);
              if (!res.success) {
                setError(res.message || '카카오 로그인에 실패했습니다. Supabase 카카오 Provider 설정을 확인하세요.');
              }
            }}
            className="btn btn-block"
            style={{
              marginTop: '0.75rem',
              backgroundColor: '#FEE500',
              color: '#191919',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              border: 'none',
              borderRadius: '8px',
              padding: '0.75rem',
              cursor: 'pointer',
            }}
            disabled={isLoading}
          >
            <span style={{ fontSize: '1.2rem' }}>💬</span> 카카오톡으로 1초 만에 시작하기
          </button>

          <button
            type="button"
            onClick={handleQuickLogin}
            className="btn btn-outline btn-block"
            style={{ marginTop: '0.5rem' }}
            disabled={isLoading}
          >
            ⚡ 테스트 계정(user@example.com / user1234!) 바로 로그인
          </button>

          <button
            type="button"
            onClick={handleAdminQuickFill}
            className="btn btn-outline btn-block"
            style={{ marginTop: '0.5rem', borderColor: '#4f46e5', color: '#4f46e5' }}
            disabled={isLoading}
          >
            🛡️ 관리자 이메일({adminInfo?.email || 'iicbruce@naver.com'}) 자동 입력
          </button>
        </form>

        <div className="auth-footer">
          아직 회원이 아니신가요? <Link to="/register">회원가입</Link>
        </div>
      </div>
    </div>
  );
};
