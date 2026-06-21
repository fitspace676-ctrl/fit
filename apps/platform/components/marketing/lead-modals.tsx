'use client';

import type { FormEvent, ReactNode } from 'react';
import { AnimatedModal } from '@/components/ui/animated-modal';
import { Btn } from './marketing-ui';

const inputCls =
  'w-full h-11 rounded-btn border border-overlay/15 bg-overlay/[0.04] px-3.5 text-sm text-fg placeholder:text-faint outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/30';
const areaCls =
  'w-full rounded-btn border border-overlay/15 bg-overlay/[0.04] px-3.5 py-2.5 text-sm text-fg placeholder:text-faint outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/30';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-strong">{label}</span>
    {children}
  </label>
);

export interface LeadModalProps {
  open: boolean;
  onClose: () => void;
}

/** Free-trial signup form. Content is placeholder — wire submit to a backend later. */
export const TrialModal = ({ open, onClose }: LeadModalProps) => {
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    onClose();
  };
  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title="Start your free trial"
      description="14 days, full access, no card required."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input
            className={inputCls}
            type="text"
            name="name"
            placeholder="David Iobashvili"
            required
          />
        </Field>
        <Field label="Work email">
          <input
            className={inputCls}
            type="email"
            name="email"
            placeholder="you@yourgym.com"
            required
          />
        </Field>
        <Field label="Gym / studio name">
          <input
            className={inputCls}
            type="text"
            name="business"
            placeholder="IronWorks Fitness"
            required
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Btn v="glass" size="md" onClick={onClose}>
            Cancel
          </Btn>
          <Btn v="primary" size="md" type="submit">
            Start free trial
          </Btn>
        </div>
      </form>
    </AnimatedModal>
  );
};

/** Book-a-demo request form. Content is placeholder — wire submit to a backend later. */
export const DemoModal = ({ open, onClose }: LeadModalProps) => {
  const submit = (e: FormEvent): void => {
    e.preventDefault();
    onClose();
  };
  return (
    <AnimatedModal
      open={open}
      onClose={onClose}
      title="Book a demo"
      description="Tell us a little about your business and we'll reach out to schedule a walkthrough."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Full name">
          <input
            className={inputCls}
            type="text"
            name="name"
            placeholder="David Iobashvili"
            required
          />
        </Field>
        <Field label="Work email">
          <input
            className={inputCls}
            type="email"
            name="email"
            placeholder="you@yourgym.com"
            required
          />
        </Field>
        <Field label="Phone">
          <input className={inputCls} type="tel" name="phone" placeholder="+995 555 12 34 56" />
        </Field>
        <Field label="What would you like to see?">
          <textarea
            className={areaCls}
            name="message"
            rows={3}
            placeholder="Bookings, payments, member app…"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Btn v="glass" size="md" onClick={onClose}>
            Cancel
          </Btn>
          <Btn v="primary" size="md" type="submit">
            Request demo
          </Btn>
        </div>
      </form>
    </AnimatedModal>
  );
};
