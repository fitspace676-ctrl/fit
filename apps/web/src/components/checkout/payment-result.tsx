'use client';

import { useEffect, useState } from 'react';
import { notFound } from 'next/navigation';
import { useRouter, Link } from '@/src/i18n/navigation';
import { orderSummarySchema, type OrderSummary, type PaymentAction } from '@fit/types';
import { Banner, Button, Card } from '@/src/components/ui/kit';
import { paymentErrorKey, useOnlinePayment } from './online-payments';

export function PaymentResult({ initialOrder }: { initialOrder: OrderSummary }) {
  const online = useOnlinePayment();
  const router = useRouter();
  const [order, setOrder] = useState(initialOrder);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(initialOrder.status === 'cancelled');
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cycle, setCycle] = useState(0);
  const status = order.payment?.status;
  const successPath = `/member/checkout/success?orderId=${encodeURIComponent(order.id)}`;

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setChecking(true);
    // A fixed deadline also stops a slow/stalled request; requests never overlap.
    const deadline = setTimeout(() => {
      active = false;
      controller.abort();
      clearTimeout(timer);
      setChecking(false);
    }, 30000);
    async function sync() {
      try {
        const response = await fetch(`/api/checkout/${encodeURIComponent(initialOrder.id)}/payment/sync`, {
          method: 'POST', signal: controller.signal,
        });
        if (!active) return;
        if (response.status === 404 || response.status === 403) { clearTimeout(deadline); setChecking(false); setMissing(true); return; }
        if (response.status === 401) {
          clearTimeout(deadline);
          window.location.assign(`/member/login?from=${encodeURIComponent(`/member/checkout/result?orderId=${encodeURIComponent(initialOrder.id)}`)}`);
          return;
        }
        const body = await response.json();
        if (!active) return;
        if (!response.ok) { clearTimeout(deadline); setChecking(false); setError(paymentErrorKey(body.code)); return; }
        const next = orderSummarySchema.parse(body.order);
        setOrder(next);
        if (next.status === 'cancelled') setCancelled(true);
        if (next.status !== 'cancelled' && (next.payment?.status === 'pending' || next.payment?.status === 'requires_action')) {
          timer = setTimeout(() => void sync(), 2000);
          return;
        }
      } catch {
        if (active) setError('error');
      }
      if (active) { clearTimeout(deadline); setChecking(false); }
    }
    void sync();
    return () => { active = false; controller.abort(); clearTimeout(timer); clearTimeout(deadline); };
  }, [initialOrder.id, cycle]);

  useEffect(() => {
    if (!checking && status === 'paid') router.replace(successPath);
  }, [checking, status, router, successPath]);

  async function act(action: 'retry' | 'cancel') {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/checkout/${encodeURIComponent(order.id)}/payment/${action}`, { method: 'POST' });
      const body = await response.json();
      if (!response.ok) { setError(paymentErrorKey(body.code)); return; }
      if (action === 'cancel') setCancelled(true);
      else if (!online.redirect(body.payment as PaymentAction)) setCycle((value) => value + 1);
    } catch { setError('error'); }
    finally { setBusy(false); }
  }

  if (missing) notFound();
  const title = cancelled ? 'cancelled' : online.redirecting ? 'redirecting' : checking ? 'checking'
    : status === 'paid' ? 'paid' : status === 'refunded' ? 'refunded' : 'incomplete';
  return <Card>
    <h1 role="status">{online.t(title)}</h1>
    <ul>{order.items.map((item, i) => <li key={i}>{item.label}</li>)}</ul>
    {error ? <Banner tone="error">{online.t(error)}</Banner> : null}
    {!checking && !cancelled && status !== 'paid' && status !== 'refunded' ? <>
      {order.payment?.retry ? <Button label={online.t('retry')} disabled={busy || online.redirecting} onClick={() => void act('retry')} /> : null}
      <Button variant="ghost" label={online.t('cancel')} disabled={busy || online.redirecting} onClick={() => void act('cancel')} />
    </> : null}
    <Link href="/member/home">{online.t('home')}</Link>
  </Card>;
}
