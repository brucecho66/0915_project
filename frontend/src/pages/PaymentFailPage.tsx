import React from 'react';
import { useSearchParams, Link } from 'react-router-dom';

export const PaymentFailPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const code = searchParams.get('code') || 'PAYMENT_FAILED';
  const message = searchParams.get('message') || '사용자에 의해 결제가 취소되었거나 오류가 발생했습니다.';

  return (
    <div style={{ maxWidth: '500px', margin: '4rem auto', padding: '2rem', textAlign: 'center', backgroundColor: '#ffffff', borderRadius: '16px', border: '1px solid #fee2e2', boxShadow: '0 4px 16px rgba(0,0,0,0.05)' }}>
      <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>😢</div>
      <h2 style={{ color: '#dc2626', fontSize: '1.6rem', fontWeight: 800 }}>결제가 취소/실패되었습니다</h2>
      <p style={{ color: '#64748b', margin: '1rem 0', fontSize: '0.95rem' }}>{message}</p>
      <div style={{ backgroundColor: '#fef2f2', padding: '0.75rem', borderRadius: '8px', marginBottom: '1.5rem', fontSize: '0.8rem', color: '#991b1b' }}>
        오류 코드: {code}
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
        <Link to="/payment" className="btn btn-primary" style={{ padding: '0.75rem 1.5rem' }}>
          다시 시도하기
        </Link>
        <Link to="/" className="btn btn-outline" style={{ padding: '0.75rem 1.5rem' }}>
          홈으로 가기
        </Link>
      </div>
    </div>
  );
};
