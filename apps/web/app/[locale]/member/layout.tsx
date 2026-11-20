import { getActiveGymOnlinePayments } from '@/lib/active-gym';
import { OnlinePaymentsProvider } from '@/src/components/checkout/online-payments';

export default async function MemberPaymentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <OnlinePaymentsProvider value={await getActiveGymOnlinePayments()}>
      {children}
    </OnlinePaymentsProvider>
  );
}
