import React, { useEffect, useRef, useState } from 'react';
import { loadPaymentWidget, type PaymentWidgetInstance } from '@tosspayments/payment-widget-sdk';
import { usePosts } from '../context/PostContext';

// 토스페이먼츠 테스트 클라이언트 키
const CLIENT_KEY = (import.meta as any).env?.VITE_TOSS_CLIENT_KEY || 'test_ck_D5GePWvyJnrK0W0k6q8gLzN97Eoq';

interface Plan {
  id: string;
  name: string;
  amount: number;
  description: string;
  badge: string;
}

const PLANS: Plan[] = [
  { id: 'coffee', name: '따뜻한 커피 한 잔 후원', amount: 3000, description: '커뮤니티 운영자를 위한 따뜻한 응원 커피', badge: '☕ 가벼운 응원' },
  { id: 'membership_basic', name: '온보드 베이직 멤버십 (1개월)', amount: 9900, description: '광고 제거, 닉네임 배지, 특별 프로필 테두리', badge: '⭐ 인기' },
  { id: 'membership_vip', name: '온보드 VIP 멤버십 (1개월)', amount: 29000, description: '베이직 혜택 + AI 글쓰기/이미지 무제한 이용권', badge: '👑 최고급' },
];

export const PaymentPage: React.FC = () => {
  const { user } = usePosts();
  const [selectedPlan, setSelectedPlan] = useState<Plan>(PLANS[1]);
  const [isLoadingWidget, setIsLoadingWidget] = useState(true);

  const paymentWidgetRef = useRef<PaymentWidgetInstance | null>(null);
  const paymentMethodsWidgetRef = useRef<any>(null);

  // 고객 고유 식별자 키 (회원 ID 기반 또는 익명 키)
  const customerKey = user?.id ? `USER_${user.id}` : 'ANON_CUSTOMER_' + Math.random().toString(36).substring(2, 10);

  useEffect(() => {
    let isMounted = true;

    async function initTossWidget() {
      try {
        const paymentWidget = await loadPaymentWidget(CLIENT_KEY, customerKey);
        if (!isMounted) return;

        paymentWidgetRef.current = paymentWidget;

        // 결제 UI 렌더링
        const paymentMethodsWidget = paymentWidget.renderPaymentMethods(
          '#payment-widget',
          { value: selectedPlan.amount },
          { variantKey: 'DEFAULT' }
        );
        paymentMethodsWidgetRef.current = paymentMethodsWidget;

        // 이용약관 UI 렌더링
        paymentWidget.renderAgreement('#agreement', { variantKey: 'AGREEMENT' });

        setIsLoadingWidget(false);
      } catch (err) {
        console.error('토스페이먼츠 위젯 초기화 오류:', err);
        setIsLoadingWidget(false);
      }
    }

    initTossWidget();

    return () => {
      isMounted = false;
    };
  }, [customerKey]);

  // 플랜 변경 시 금액 업데이트
  const handleSelectPlan = (plan: Plan) => {
    setSelectedPlan(plan);
    if (paymentMethodsWidgetRef.current) {
      paymentMethodsWidgetRef.current.updateAmount(plan.amount);
    }
  };

  // 결제 요청
  const handlePaymentRequest = async () => {
    const paymentWidget = paymentWidgetRef.current;
    if (!paymentWidget) {
      alert('결제 위젯이 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.');
      return;
    }

    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const successUrl = `${window.location.origin}/payment/success`;
    const failUrl = `${window.location.origin}/payment/fail`;

    try {
      await paymentWidget.requestPayment({
        orderId,
        orderName: selectedPlan.name,
        customerName: user?.username || '온보드고객',
        customerEmail: user?.email || 'customer@example.com',
        successUrl,
        failUrl,
      });
    } catch (err: any) {
      console.error('결제 요청 중단:', err);
    }
  };

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#1e293b' }}>💳 멤버십 구독 & 커뮤니티 후원</h1>
        <p style={{ color: '#64748b', marginTop: '0.5rem' }}>
          온보드 커뮤니티를 후원하고 특별한 멤버십 혜택을 받아보세요.
        </p>
      </div>

      {/* 1. 멤버십 상품 선택 카드 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        {PLANS.map((plan) => {
          const isSelected = selectedPlan.id === plan.id;
          return (
            <div
              key={plan.id}
              onClick={() => handleSelectPlan(plan)}
              style={{
                border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                borderRadius: '12px',
                padding: '1.5rem',
                backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                cursor: 'pointer',
                position: 'relative',
                transition: 'all 0.2s ease',
                boxShadow: isSelected ? '0 4px 12px rgba(37,99,235,0.15)' : 'none',
              }}
            >
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  color: isSelected ? '#1d4ed8' : '#64748b',
                  backgroundColor: isSelected ? '#dbeafe' : '#f1f5f9',
                  padding: '0.2rem 0.5rem',
                  borderRadius: '999px',
                  display: 'inline-block',
                  marginBottom: '0.5rem',
                }}
              >
                {plan.badge}
              </span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: '0.5rem 0' }}>{plan.name}</h3>
              <p style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb', margin: '0.5rem 0' }}>
                {plan.amount.toLocaleString()}원
              </p>
              <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.4 }}>{plan.description}</p>
            </div>
          );
        })}
      </div>

      {/* 2. 토스페이먼츠 결제위젯 영역 */}
      <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '1.5rem', border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
        {isLoadingWidget && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
            토스페이먼츠 보안 결제 모듈을 불러오는 중입니다...
          </div>
        )}
        <div id="payment-widget" />
        <div id="agreement" />

        <div style={{ marginTop: '1.5rem' }}>
          <button
            onClick={handlePaymentRequest}
            disabled={isLoadingWidget}
            style={{
              width: '100%',
              backgroundColor: '#3182f6',
              color: '#ffffff',
              border: 'none',
              padding: '1rem',
              fontSize: '1.1rem',
              fontWeight: 700,
              borderRadius: '10px',
              cursor: isLoadingWidget ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 14px rgba(49, 130, 246, 0.35)',
            }}
          >
            {selectedPlan.amount.toLocaleString()}원 안전 결제하기
          </button>
        </div>
      </div>
    </div>
  );
};
