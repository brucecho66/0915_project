import React, { useState } from 'react';
import { API_BASE, usePosts } from '../context/PostContext';

export const AiAssistantModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<'chat' | 'image' | 'tts'>('chat');
  const { userToken } = usePosts();

  // 1. 챗봇 상태
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: '안녕하세요! 온보드 AI 도우미입니다. 커뮤니티 글 작성이나 궁금한 점을 언제든 물어보세요.' },
  ]);
  const [inputMsg, setInputMsg] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // 2. 이미지 생성기 상태
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState('');
  const [isImageLoading, setIsImageLoading] = useState(false);

  // 3. TTS 음성 낭독 상태
  const [ttsText, setTtsText] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [isTtsLoading, setIsTtsLoading] = useState(false);

  // 챗봇 메시지 전송
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMsg.trim() || isChatLoading) return;

    const userMessage = inputMsg.trim();
    setInputMsg('');
    const newHistory = [...messages, { role: 'user' as const, content: userMessage }];
    setMessages(newHistory);
    setIsChatLoading(true);

    try {
      const res = await fetch(`${API_BASE}/ai/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
        },
        body: JSON.stringify({ messages: newHistory.slice(-8) }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setMessages([...newHistory, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages([...newHistory, { role: 'assistant', content: `⚠️ ${data.error || 'OpenAI API 키가 필요합니다.'}` }]);
      }
    } catch {
      setMessages([...newHistory, { role: 'assistant', content: '⚠️ 통신 오류가 발생했습니다.' }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  // DALL-E 이미지 생성
  const handleGenerateImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imagePrompt.trim() || isImageLoading) return;

    setIsImageLoading(true);
    setGeneratedImageUrl('');

    try {
      const res = await fetch(`${API_BASE}/ai/image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
        },
        body: JSON.stringify({ prompt: imagePrompt.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setGeneratedImageUrl(data.imageUrl);
      } else {
        alert(data.error || '이미지 생성 실패');
      }
    } catch {
      alert('이미지 생성 요청 실패');
    } finally {
      setIsImageLoading(false);
    }
  };

  // OpenAI TTS 음성 변환
  const handleGenerateTts = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ttsText.trim() || isTtsLoading) return;

    setIsTtsLoading(true);
    setAudioUrl('');

    try {
      const res = await fetch(`${API_BASE}/ai/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
        },
        body: JSON.stringify({ text: ttsText.trim() }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || '음성 생성 실패');
      }
    } catch {
      alert('음성 변환 요청 실패');
    } finally {
      setIsTtsLoading(false);
    }
  };

  return (
    <>
      {/* 우측 하단 플로팅 버튼 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '28px',
          backgroundColor: '#4f46e5',
          color: '#ffffff',
          border: 'none',
          boxShadow: '0 6px 20px rgba(79, 70, 229, 0.4)',
          cursor: 'pointer',
          fontSize: '1.6rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          transition: 'transform 0.2s ease',
        }}
        title="AI 어시스턴트 열기"
      >
        {isOpen ? '✕' : '✨'}
      </button>

      {/* 모달 창 */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            bottom: '90px',
            right: '24px',
            width: '380px',
            maxWidth: 'calc(100vw - 32px)',
            height: '520px',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            boxShadow: '0 12px 36px rgba(0,0,0,0.18)',
            border: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            zIndex: 9998,
          }}
        >
          {/* 헤더 */}
          <div style={{ backgroundColor: '#4f46e5', color: '#fff', padding: '0.85rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '1.2rem' }}>✨</span>
              <strong style={{ fontSize: '1rem' }}>온보드 AI 어시스턴트</strong>
            </div>
            <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', fontSize: '1rem' }}>
              ✕
            </button>
          </div>

          {/* 탭 네비게이션 */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', backgroundColor: '#f8fafc' }}>
            <button
              onClick={() => setTab('chat')}
              style={{
                flex: 1,
                padding: '0.6rem',
                border: 'none',
                background: tab === 'chat' ? '#fff' : 'transparent',
                fontWeight: tab === 'chat' ? 700 : 500,
                color: tab === 'chat' ? '#4f46e5' : '#64748b',
                cursor: 'pointer',
                borderBottom: tab === 'chat' ? '2px solid #4f46e5' : 'none',
                fontSize: '0.85rem',
              }}
            >
              💬 AI 챗봇
            </button>
            <button
              onClick={() => setTab('image')}
              style={{
                flex: 1,
                padding: '0.6rem',
                border: 'none',
                background: tab === 'image' ? '#fff' : 'transparent',
                fontWeight: tab === 'image' ? 700 : 500,
                color: tab === 'image' ? '#4f46e5' : '#64748b',
                cursor: 'pointer',
                borderBottom: tab === 'image' ? '2px solid #4f46e5' : 'none',
                fontSize: '0.85rem',
              }}
            >
              🎨 이미지 생성
            </button>
            <button
              onClick={() => setTab('tts')}
              style={{
                flex: 1,
                padding: '0.6rem',
                border: 'none',
                background: tab === 'tts' ? '#fff' : 'transparent',
                fontWeight: tab === 'tts' ? 700 : 500,
                color: tab === 'tts' ? '#4f46e5' : '#64748b',
                cursor: 'pointer',
                borderBottom: tab === 'tts' ? '2px solid #4f46e5' : 'none',
                fontSize: '0.85rem',
              }}
            >
              🔊 음성 낭독
            </button>
          </div>

          {/* 1. 챗봇 탭 */}
          {tab === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div style={{ flex: 1, padding: '1rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      backgroundColor: m.role === 'user' ? '#4f46e5' : '#f1f5f9',
                      color: m.role === 'user' ? '#ffffff' : '#1e293b',
                      padding: '0.6rem 0.9rem',
                      borderRadius: m.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      maxWidth: '85%',
                      fontSize: '0.85rem',
                      lineHeight: 1.4,
                      wordBreak: 'break-word',
                    }}
                  >
                    {m.content}
                  </div>
                ))}
                {isChatLoading && (
                  <div style={{ alignSelf: 'flex-start', color: '#64748b', fontSize: '0.8rem', fontStyle: 'italic' }}>
                    AI가 답변을 생각하는 중입니다...
                  </div>
                )}
              </div>
              <form onSubmit={handleSendChat} style={{ display: 'flex', padding: '0.75rem', borderTop: '1px solid #e2e8f0', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="메시지를 입력하세요..."
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  style={{ flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem' }}
                />
                <button
                  type="submit"
                  disabled={isChatLoading}
                  style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  전송
                </button>
              </form>
            </div>
          )}

          {/* 2. 이미지 생성 탭 */}
          {tab === 'image' && (
            <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                원하는 이미지 내용을 설명하면 DALL-E 3가 고화질 이미지를 즉석 생성합니다.
              </p>
              <form onSubmit={handleGenerateImage} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <textarea
                  rows={3}
                  placeholder="예: 푸른 하늘을 나는 따뜻한 느낌의 종이비행기, 일러스트 스타일"
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
                <button
                  type="submit"
                  disabled={isImageLoading}
                  style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '0.65rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  {isImageLoading ? '이미지 그리는 중... (약 10초)' : '🎨 이미지 생성하기'}
                </button>
              </form>
              {generatedImageUrl && (
                <div style={{ marginTop: '1rem', textAlign: 'center' }}>
                  <img src={generatedImageUrl} alt="AI Generated" style={{ width: '100%', borderRadius: '10px', border: '1px solid #e2e8f0' }} />
                  <a
                    href={generatedImageUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-block', marginTop: '0.5rem', color: '#4f46e5', fontSize: '0.8rem', fontWeight: 600 }}
                  >
                    원본 크기로 보기 / 저장 ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* 3. TTS 음성 낭독 탭 */}
          {tab === 'tts' && (
            <div style={{ padding: '1rem', overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '0.75rem' }}>
                텍스트를 입력하면 OpenAI TTS를 통해 자연스러운 음성 오디오로 변환해 드립니다.
              </p>
              <form onSubmit={handleGenerateTts} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <textarea
                  rows={4}
                  placeholder="낭독할 텍스트 내용을 입력하세요..."
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                />
                <button
                  type="submit"
                  disabled={isTtsLoading}
                  style={{ backgroundColor: '#4f46e5', color: '#fff', border: 'none', padding: '0.65rem', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  {isTtsLoading ? '음성 생성 중...' : '🔊 음성으로 변환'}
                </button>
              </form>
              {audioUrl && (
                <div style={{ marginTop: '1.25rem', textAlign: 'center' }}>
                  <audio controls src={audioUrl} autoPlay style={{ width: '100%' }} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );
};
