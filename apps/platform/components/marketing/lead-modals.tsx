'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import type { CreatePlatformLeadInput } from '@fit/types';
import { AnimatedModal } from '@/components/ui/animated-modal';
import { submitLead } from '@/lib/leads';
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

/** Read a trimmed string field from the submitted form, or undefined when blank. */
function field(form: HTMLFormElement, name: string): string | undefined {
  const value = new FormData(form).get(name);
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Shared submit hook for the two lead forms: posts the assembled lead to the API
 * (`POST /platform/leads`), tracking submitting / error / done state so the form
 * can disable the button, surface a validation error, and swap to a thank-you view.
 */
function useLeadSubmit(
  build: (form: HTMLFormElement) => CreatePlatformLeadInput,
  onClose: () => void,
) {
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (status === 'submitting') return;
    const form = e.currentTarget;
    setStatus('submitting');
    setError(null);
    void submitLead(build(form))
      .then(() => setStatus('done'))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
        setStatus('idle');
      });
  };

  /** Reset back to a fresh form when the modal is dismissed. */
  const close = (): void => {
    setStatus('idle');
    setError(null);
    onClose();
  };

  return { status, error, submit, close };
}

/** A submission error line, shown above the actions. */
const ErrorNote = ({ message }: { message: string | null }) =>
  message ? (
    <p className="text-sm text-red-500" role="alert">
      {message}
    </p>
  ) : null;

/** The shared thank-you view shown after a lead is captured. */
const ThankYou = ({ message, onClose }: { message: string; onClose: () => void }) => (
  <div className="space-y-4">
    <p className="text-sm text-strong">{message}</p>
    <div className="flex justify-end">
      <Btn v="primary" size="md" onClick={onClose}>
        Done
      </Btn>
    </div>
  </div>
);

/** Free-trial signup form — captures name, work email, and gym/studio name. */
export const TrialModal = ({ open, onClose }: LeadModalProps) => {
  const { status, error, submit, close } = useLeadSubmit(
    (form) => ({
      type: 'trial',
      name: field(form, 'name') ?? '',
      email: field(form, 'email') ?? '',
      business: field(form, 'business'),
    }),
    onClose,
  );

  return (
    <AnimatedModal
      open={open}
      onClose={close}
      title="Start your free trial"
      description="14 days, full access, no card required."
    >
      {status === 'done' ? (
        <ThankYou
          message="You're in — check your inbox, we'll be in touch shortly to get your gym set up."
          onClose={close}
        />
      ) : (
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
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn v="glass" size="md" onClick={close}>
              Cancel
            </Btn>
            <Btn v="primary" size="md" type="submit">
              {status === 'submitting' ? 'Starting…' : 'Start free trial'}
            </Btn>
          </div>
        </form>
      )}
    </AnimatedModal>
  );
};

/** Book-a-demo request form — captures name, email, optional phone and message. */
export const DemoModal = ({ open, onClose }: LeadModalProps) => {
  const { status, error, submit, close } = useLeadSubmit(
    (form) => ({
      type: 'demo',
      name: field(form, 'name') ?? '',
      email: field(form, 'email') ?? '',
      phone: field(form, 'phone'),
      message: field(form, 'message'),
    }),
    onClose,
  );

  return (
    <AnimatedModal
      open={open}
      onClose={close}
      title="Book a demo"
      description="Tell us a little about your business and we'll reach out to schedule a walkthrough."
    >
      {status === 'done' ? (
        <ThankYou
          message="Thanks — we've got your request and will reach out shortly to schedule your walkthrough."
          onClose={close}
        />
      ) : (
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
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn v="glass" size="md" onClick={close}>
              Cancel
            </Btn>
            <Btn v="primary" size="md" type="submit">
              {status === 'submitting' ? 'Sending…' : 'Request demo'}
            </Btn>
          </div>
        </form>
      )}
    </AnimatedModal>
  );
};
