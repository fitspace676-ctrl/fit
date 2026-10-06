import type { Metadata } from 'next';
import BuiltForHub from '@/components/marketing/built-for-hub';
import { FEATURES } from '@/data/features';

/** Features hub (`formacore.io/features`): every module, each opening its own page. */
export const metadata: Metadata = {
  title: 'Features - FormaCore',
  description:
    'The FormaCore modules: member portal, online booking, reception POS, mobile app, analytics and the AI assistant.',
};

export default function Page() {
  return (
    <BuiltForHub
      items={FEATURES}
      base="/features"
      section="Features"
      title="Everything your gym runs on."
      intro="One platform for the front desk, the timetable, the numbers and your members. Pick a module to see what it does."
      ctaTitle="See it with your own gym."
      ctaBody="Book a demo and we'll walk you through every module with your plans, classes and team."
    />
  );
}
