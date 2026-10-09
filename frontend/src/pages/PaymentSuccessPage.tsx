import React, { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { API_BASE, usePosts } from '../context/PostContext';

export const PaymentSuccessPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const { userToken } = usePosts();
  const [isProcessing, setIsProcessing] = useState(true);
  const [paymentData, setPaymentData] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const paymentKey = searchParams.get('paymentKey');
  const orderId = searchParams.get('orderId');
  const amount = searchParams.get('amount');

  useEffect(() => {
    async function confirmPayment() {
      if (!paymentKey || !orderId || !amount) {
        setErrorMsg('결제 승인 정보가 올바르지 않습니다.');
        setIsProcessing(false);
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/payments/confirm`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(userToken ? { Authorization: `Bearer ${userToken}` } : {}),
          },
          body: JSON.stringify({ paymentKey, orderId, amount }),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          setPaymentData(data.payment);
        } else {
          setErrorMsg(data.error || '결제 승인에 실패했습니다.');
        }
      } catch (err: any) {
        setErrorMsg('서버와 통신 중 오류가 발생했습니다: ' + err.message);
      } finally {
        setIsProcessing(false);
      }
    }

    confirmPayment();
  }, [paymentKey, orderId, amount, userToken]);

  if (isProcessing) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 1rem' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'spin 1.5s linear infinite' }}>⏳</div>
        <h2>토스페이먼츠 결제 승인 처리 중</h2>
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>잠시만 기다려 주세요. 안전하게 결제를 완료하고 있습니다.</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div style={{ maxWidth: '500px', margin: '4rem auto', padding: '2rem', textAlign: 'center', backgroundColor: '#fff', borderRadius: '16px', border: '1px solid #fee2e2' }}>
        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⚠️</div>
        <h2 style={{ color: '#dc2626' }}>결제 승인 실패</h2>
        <p style={{ color: '#64748b', margin: '1rem 0' }}>{errorMsg}</p>
        <Link to="/payment" className="btn btn-primary">
          다시 결제하기
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '540px', margin: '4rem auto', padding: '2rem', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
      <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🎉</div>
      <h2 style={{ color: '#16a34a', fontSize: '1.8rem', fontWeight: 800 }}>결제가 완료되었습니다!</h2>
      <p style={{ color: '#64748b', marginTop: '0.5rem' }}>온보드 커뮤니티를 이용해 주셔서 진심으로 감사드립니다.</p>

      <div style={{ backgroundColor: '#f8fafc', borderRadius: '12px', padding: '1.25rem', margin: '2rem 0', textAlign: 'left', fontSize: '0.95rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#64748b' }}>주문명</span>
          <strong style={{ color: '#0f172a' }}>{paymentData?.orderName || '커뮤니티 멤버십'}</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#64748b' }}>결제 금액</span>
          <strong style={{ color: '#2563eb', fontSize: '1.1rem' }}>{Number(paymentData?.totalAmount || amount).toLocaleString()}원</strong>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ color: '#64748b' }}>결제 수단</span>
          <span style={{ color: '#0f172a' }}>{paymentData?.method || '간편결제'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ color: '#64748b' }}>주문 번호</span>
          <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{orderId}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <Link to="/posts" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
          게시판 둘러보기
        </Link>
        <Link to="/" className="btn btn-outline" style={{ padding: '0.75rem 1.5rem' }}>
          홈으로 가기
        </Link>
      </div>
    </div>
  );
};
