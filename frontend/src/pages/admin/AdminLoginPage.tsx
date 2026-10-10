import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { usePosts, API_BASE } from '../../context/PostContext';

export const AdminLoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adminEnvInfo, setAdminEnvInfo] = useState<{ email: string; username: string; name?: string } | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { adminLogin, user, switchToAdmin } = usePosts();
  const navigate = useNavigate();

  React.useEffect(() => {
    fetch(`${API_BASE}/auth/admin-info`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.email) {
          setAdminEnvInfo({ email: data.email, username: data.username, name: data.name });
          setEmail(data.email);
        }
      })
      .catch((err) => console.error('관리자 정보 조회 에러:', err));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email || !password) {
      setError('이메일과 비밀번호를 모두 입력해주세요.');
      return;
    }

    setIsLoading(true);
    const result = await adminLogin(email, password);
    setIsLoading(false);

    if (result.success) {
      navigate('/admin');
    } else {
      setError(result.message || '관리자 인증에 실패하였습니다. .env의 ADMIN_EMAIL과 ADMIN_PASSWORD를 확인해주세요.');
    }
  };

  return (
    <div className="admin-login-wrapper">
      <div className="admin-login-card">
        <div className="admin-login-header">
          <div className="admin-badge-icon">🛡️</div>
          <h2>관리자 시스템 로그인</h2>
          <p>커뮤니티 보드 관리자 콘솔 접근 권한이 필요합니다.</p>
        </div>

        {error && <div className="admin-alert-error">{error}</div>}

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '1rem', marginBottom: '1.25rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.6rem 0', fontSize: '0.9rem', color: '#1e40af' }}>
            {user && user.role !== 'admin' ? (
              <>현재 일반 회원 <strong>'{user.username}'</strong> ({user.email}) 계정으로 접속 중입니다.</>
            ) : (
              <>원클릭 최고관리자(bodyguard) 인증으로 즉시 콘솔에 입장할 수 있습니다.</>
            )}
          </p>
          <button
            type="button"
            onClick={async () => {
              const res = await switchToAdmin();
              if (res.success) {
                navigate('/admin');
              }
            }}
            className="btn btn-primary btn-block"
            style={{ padding: '0.75rem 1rem', fontSize: '1rem', fontWeight: 700, backgroundColor: '#2563eb' }}
          >
            ⚡ 최고관리자(bodyguard)로 1초 만에 원클릭 접속
          </button>
        </div>

        <div className="admin-env-notice">
          <strong>💡 .env 설정 관리자 계정 정보 (SQLite DB 자동 동기화)</strong>
          <div>관리자명 (ADMIN_NAME): <code>{adminEnvInfo?.name || adminEnvInfo?.username || 'bodyguard'}</code></div>
          <div>이메일 (ADMIN_EMAIL): <code>{adminEnvInfo?.email || email || 'iicbruce@naver.com'}</code></div>
          <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: '0.4rem', lineHeight: '1.4' }}>
            * <code>.env</code> 파일에 평문으로 입력하신 <strong>ADMIN_PASSWORD</strong>는 서버 내부에서 자동으로 <strong>bcrypt 해시 암호화</strong>되어 DB에 저장됩니다. 아래 폼에는 <code>.env</code>에 입력하신 비밀번호를 그대로 입력하시면 됩니다.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form">
          <div className="form-group">
            <label>관리자 이메일 (ADMIN_EMAIL)</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="예: admin@naver.com"
              required
            />
          </div>

          <div className="form-group">
            <label>관리자 비밀번호 (ADMIN_PASSWORD)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder=".env의 ADMIN_PASSWORD 입력"
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block admin-btn-submit"
            disabled={isLoading}
          >
            {isLoading ? '인증 처리 중...' : '관리자 포털 접속'}
          </button>
        </form>

        <div className="admin-login-footer">
          <Link to="/" className="back-link">
            &larr; 일반 커뮤니티 홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
};
