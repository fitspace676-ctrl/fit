'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { isLocale } from '@fit/i18n';
import { AnimatedModal } from '@/components/ui/animated-modal';
import { submitLead, type SubmitLeadInput } from '@/lib/leads';
import { routing } from '@/src/i18n/routing';
import { Btn } from './marketing-ui';

const inputCls =
  'w-full h-11 rounded-btn border border-overlay/15 bg-overlay/[0.04] px-3.5 text-sm text-fg placeholder:text-faint outline-none transition focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/30';

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-strong">{label}</span>
    {children}
  </label>
);

/** Dialling codes for the phone field. Georgia first and preselected; the rest
    are the countries visitors most often come from, so a foreign number is never
    sent with +995 in front of it by mistake. Only the flag and code are shown;
    the country name is the option's key. */
const DIAL_CODES = [
  { code: '+995', country: 'Georgia', flag: '🇬🇪' },
  { code: '+374', country: 'Armenia', flag: '🇦🇲' },
  { code: '+994', country: 'Azerbaijan', flag: '🇦🇿' },
  { code: '+90', country: 'Turkey', flag: '🇹🇷' },
  { code: '+380', country: 'Ukraine', flag: '🇺🇦' },
  { code: '+7', country: 'Kazakhstan', flag: '🇰🇿' },
  { code: '+972', country: 'Israel', flag: '🇮🇱' },
  { code: '+971', country: 'United Arab Emirates', flag: '🇦🇪' },
  { code: '+49', country: 'Germany', flag: '🇩🇪' },
  { code: '+44', country: 'United Kingdom', flag: '🇬🇧' },
  { code: '+33', country: 'France', flag: '🇫🇷' },
  { code: '+39', country: 'Italy', flag: '🇮🇹' },
  { code: '+34', country: 'Spain', flag: '🇪🇸' },
  { code: '+48', country: 'Poland', flag: '🇵🇱' },
  { code: '+1', country: 'United States / Canada', flag: '🇺🇸' },
];

/** The member-count brackets a gym can pick from; optional. */
const MEMBER_BRACKETS = ['1-100', '100-300', '300-500', '500+'];

/** Name and surname, side by side from `sm` up. Both required. */
const NameFields = () => {
  const t = useTranslations('common.leads');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('name')}>
        <input
          className={inputCls}
          type="text"
          name="firstName"
          autoComplete="given-name"
          placeholder={t('namePlaceholder')}
          required
        />
      </Field>
      <Field label={t('surname')}>
        <input
          className={inputCls}
          type="text"
          name="lastName"
          autoComplete="family-name"
          placeholder={t('surnamePlaceholder')}
          required
        />
      </Field>
    </div>
  );
};

const EmailField = () => {
  const t = useTranslations('common.leads');
  return (
    <Field label={t('email')}>
      <input
        className={inputCls}
        type="email"
        name="email"
        autoComplete="email"
        placeholder={t('emailPlaceholder')}
        required
      />
    </Field>
  );
};

/** Phone with a country-code picker in front, Georgia preselected. Required. */
const PhoneField = () => {
  const t = useTranslations('common.leads');
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-semibold text-strong">
        {t('phone')}
      </label>
      <div className="flex gap-2">
        <select
          className={inputCls.replace('w-full', 'w-[7.5rem] shrink-0 pr-2')}
          name="dialCode"
          aria-label={t('countryCode')}
          defaultValue="+995"
        >
          {DIAL_CODES.map((d) => (
            <option key={d.code + d.country} value={d.code}>
              {d.flag} {d.code}
            </option>
          ))}
        </select>
        <input
          id={id}
          className={inputCls.replace('w-full', 'min-w-0 flex-1')}
          type="tel"
          name="phone"
          autoComplete="tel-national"
          placeholder={t('phonePlaceholder')}
          required
        />
      </div>
    </div>
  );
};

/** How many active members the gym has; optional. */
const MembersField = () => {
  const t = useTranslations('common.leads');
  return (
    <Field label={t('members')}>
      <select className={inputCls} name="members" defaultValue="">
        <option value="">{t('membersPlaceholder')}</option>
        {MEMBER_BRACKETS.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>
    </Field>
  );
};

/** The lead's contact fields, read from the shared inputs above. The API keeps
    one `name`, one `phone` and a free-text `message`, so the split fields are
    joined here rather than widening the schema. The `message` is read by the
    FormaCore team, not shown to the visitor, so its label stays English. */
function contact(form: HTMLFormElement) {
  const name = [field(form, 'firstName'), field(form, 'lastName')].filter(Boolean).join(' ');
  const number = field(form, 'phone');
  const members = field(form, 'members');
  return {
    name,
    email: field(form, 'email') ?? '',
    phone: number ? `${field(form, 'dialCode') ?? '+995'} ${number}` : undefined,
    message: members ? `Active members: ${members}` : undefined,
    website: field(form, 'website'),
  };
}

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
 * A spam trap: an input no sighted or assistive-tech user ever reaches, which an
 * automated form-filler happily completes. A filled `website` makes the route
 * handler drop the submission without telling the bot why. Hidden from everyone,
 * so its label is not translated.
 */
const Honeypot = () => (
  <div aria-hidden className="hidden">
    <label>
      Website
      <input type="text" name="website" tabIndex={-1} autoComplete="off" />
    </label>
  </div>
);

/**
 * Shared submit hook for the lead forms: posts the assembled lead to the site's
 * own `POST /api/leads` route (which forwards it to the backend), tracking
 * submitting / error / done state so the form can disable the button, surface a
 * validation error, and swap to a thank-you view.
 */
function useLeadSubmit(build: (form: HTMLFormElement) => SubmitLeadInput, onClose: () => void) {
  const t = useTranslations('common.leads');
  const currentLocale = useLocale();
  const locale = isLocale(currentLocale) ? currentLocale : routing.defaultLocale;
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (status === 'submitting') return;
    const form = e.currentTarget;
    setStatus('submitting');
    setError(null);
    void submitLead(build(form), {
      locale,
      failedMessage: (statusCode) => t('submitFailed', { status: statusCode }),
    })
      .then(() => setStatus('done'))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t('error'));
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
const ThankYou = ({ message, onClose }: { message: string; onClose: () => void }) => {
  const t = useTranslations('common.leads');
  return (
    <div className="space-y-4">
      <p className="text-sm text-strong">{message}</p>
      <div className="flex justify-end">
        <Btn v="primary" size="md" onClick={onClose}>
          {t('done')}
        </Btn>
      </div>
    </div>
  );
};

/** Book-a-demo request form: name, surname, email and phone required; member count optional. */
export const DemoModal = ({ open, onClose }: LeadModalProps) => {
  const t = useTranslations('common.leads');
  const { status, error, submit, close } = useLeadSubmit(
    (form) => ({ type: 'demo', ...contact(form) }),
    onClose,
  );

  return (
    <AnimatedModal
      open={open}
      onClose={close}
      title={t('demo.title')}
      description={t('demo.description')}
    >
      {status === 'done' ? (
        <ThankYou message={t('demo.thanks')} onClose={close} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <NameFields />
          <EmailField />
          <PhoneField />
          <MembersField />
          <Honeypot />
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn v="glass" size="md" onClick={close}>
              {t('cancel')}
            </Btn>
            <Btn v="primary" size="md" type="submit" disabled={status === 'submitting'}>
              {status === 'submitting' ? t('sending') : t('demo.submit')}
            </Btn>
          </div>
        </form>
      )}
    </AnimatedModal>
  );
};

/**
 * Request-a-call form, the marketing site's second call to action. The same
 * fields as the demo form, phone first: it is what the team rings back on, and
 * the email is where the follow-up lands if nobody picks up.
 */
export const CallModal = ({ open, onClose }: LeadModalProps) => {
  const t = useTranslations('common.leads');
  const { status, error, submit, close } = useLeadSubmit(
    (form) => ({ type: 'call', ...contact(form) }),
    onClose,
  );

  return (
    <AnimatedModal
      open={open}
      onClose={close}
      title={t('call.title')}
      description={t('call.description')}
    >
      {status === 'done' ? (
        <ThankYou message={t('call.thanks')} onClose={close} />
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <NameFields />
          <PhoneField />
          <EmailField />
          <MembersField />
          <Honeypot />
          <ErrorNote message={error} />
          <div className="flex justify-end gap-2 pt-2">
            <Btn v="glass" size="md" onClick={close}>
              {t('cancel')}
            </Btn>
            <Btn v="primary" size="md" type="submit" disabled={status === 'submitting'}>
              {status === 'submitting' ? t('sending') : t('call.submit')}
            </Btn>
          </div>
        </form>
      )}
    </AnimatedModal>
  );
};
