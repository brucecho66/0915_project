import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { usePosts } from '../context/PostContext';

export const RegisterPage: React.FC = () => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { register, loginWithKakao } = usePosts();
  const navigate = useNavigate();

  // 기본 아바타 프리셋
  const avatarPresets = [
    { label: '🧑‍💻 개발자', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=dev' },
    { label: '🚀 탐험가', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=explorer' },
    { label: '🐱 고양이', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=cat' },
    { label: '⭐ 스타', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=star' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setIsLoading(true);
    const result = await register(
      email,
      username.trim(),
      password,
      bio.trim(),
      avatarUrl.trim(),
      name.trim() || username.trim(),
      phone.trim()
    );
    setIsLoading(false);

    if (result.success) {
      alert('회원가입이 완료되었습니다! 환영합니다.');
      navigate('/posts');
    } else {
      setError(result.message || '회원가입에 실패했습니다.');
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: '480px' }}>
        <div className="auth-header">
          <h2>회원가입</h2>
          <p>새로운 계정을 만들어 커뮤니티 활동을 시작하세요.</p>
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
            <label htmlFor="reg-name">이름 (성명 / 실명) *</label>
            <input
              id="reg-name"
              type="text"
              placeholder="예: 홍길동"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-username">사용자 닉네임 (활동명) *</label>
            <input
              id="reg-username"
              type="text"
              placeholder="예: 쾌걸홍길동"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-phone">연락처 / 휴대폰 번호 (선택)</label>
            <input
              id="reg-phone"
              type="tel"
              placeholder="예: 010-1234-5678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-email">이메일 *</label>
            <input
              id="reg-email"
              type="email"
              placeholder="example@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-password">비밀번호 *</label>
            <input
              id="reg-password"
              type="password"
              placeholder="비밀번호를 입력하세요 (6자 이상)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="reg-confirm">비밀번호 확인 *</label>
            <input
              id="reg-confirm"
              type="password"
              placeholder="비밀번호를 다시 입력하세요"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {/* Supabase bio(자기소개) 필드 연동 */}
          <div className="form-group">
            <label htmlFor="reg-bio">자기소개 / 한 줄 소개 (선택)</label>
            <textarea
              id="reg-bio"
              placeholder="자신을 소개하는 한 줄을 입력해 보세요. (예: 웹 풀스택 개발자 지망생)"
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                fontSize: '0.925rem',
                fontFamily: 'inherit',
                resize: 'vertical',
              }}
            />
          </div>

          {/* Supabase avatar_url(프로필 사진) 필드 연동 */}
          <div className="form-group">
            <label htmlFor="reg-avatar">프로필 아바타 이미지 URL (선택)</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              {avatarPresets.map((preset) => (
                <button
                  key={preset.url}
                  type="button"
                  onClick={() => setAvatarUrl(preset.url)}
                  style={{
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.8rem',
                    borderRadius: '6px',
                    border: avatarUrl === preset.url ? '2px solid #2563eb' : '1px solid #cbd5e1',
                    backgroundColor: avatarUrl === preset.url ? '#eff6ff' : '#fff',
                    color: avatarUrl === preset.url ? '#1d4ed8' : '#334155',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              id="reg-avatar"
              type="url"
              placeholder="https://example.com/avatar.png 또는 위 아바타 선택"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={isLoading} style={{ marginTop: '0.5rem' }}>
            {isLoading ? '가입 처리 중...' : '회원가입 완료'}
          </button>

          {/* 카카오톡 원클릭 소셜 회원가입 */}
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              const res = await loginWithKakao();
              setIsLoading(false);
              if (!res.success) {
                setError(res.message || '카카오 회원가입에 실패했습니다.');
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
        </form>

        <div className="auth-footer">
          이미 계정이 있으신가요? <Link to="/login">로그인</Link>
        </div>
      </div>
    </div>
  );
};
