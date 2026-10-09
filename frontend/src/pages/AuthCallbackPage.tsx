import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { usePosts } from '../context/PostContext';

export const AuthCallbackPage: React.FC = () => {
  const navigate = useNavigate();
  const { setUser, setUserToken } = usePosts() as any;
  const [statusMessage, setStatusMessage] = useState('소셜 로그인 처리 중입니다...');

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) {
          setStatusMessage('소셜 로그인 세션을 가져오는 데 실패했습니다.');
          setTimeout(() => navigate('/login'), 2000);
          return;
        }

        const authUser = data.session.user;
        const formattedUser = {
          id: authUser.id,
          name: authUser.user_metadata?.username || authUser.email?.split('@')[0] || '카카오회원',
          nickname: authUser.user_metadata?.username || authUser.email?.split('@')[0] || '카카오회원',
          username: authUser.user_metadata?.username || authUser.email?.split('@')[0] || '카카오회원',
          email: authUser.email || '',
          role: authUser.user_metadata?.role || 'user',
          bio: authUser.user_metadata?.bio || '카카오 소셜 로그인 회원입니다.',
          avatarUrl: authUser.user_metadata?.avatar_url || '',
          joinedAt: new Date().toISOString().split('T')[0],
        };

        if (setUser) setUser(formattedUser);
        if (setUserToken) setUserToken(data.session.access_token);

        localStorage.setItem('user_data', JSON.stringify(formattedUser));
        localStorage.setItem('user', JSON.stringify(formattedUser));
        localStorage.setItem('user_token', data.session.access_token);

        setStatusMessage('로그인이 완료되었습니다! 메인 페이지로 이동합니다.');
        setTimeout(() => navigate('/posts'), 800);
      } catch (err: any) {
        setStatusMessage('오류 발생: ' + err.message);
        setTimeout(() => navigate('/login'), 2000);
      }
    };

    handleAuthCallback();
  }, [navigate, setUser, setUserToken]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
      <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'spin 1.5s linear infinite' }}>💬</div>
      <h2>카카오 로그인 완료 중</h2>
      <p style={{ color: '#64748b', marginTop: '0.5rem' }}>{statusMessage}</p>
    </div>
  );
};
