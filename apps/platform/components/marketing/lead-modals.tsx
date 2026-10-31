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

/** A required field's label carries a red asterisk; an optional one carries nothing. */
const Label = ({ text, required }: { text: string; required?: boolean }) => (
  <>
    {text}
    {required && (
      <span aria-hidden className="ml-0.5 text-red-500">
        *
      </span>
    )}
  </>
);

const Field = ({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-strong">
      <Label text={label} required={required} />
    </span>
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

/** Business types the visitor picks from, the Built For audiences plus "Other".
    The value is the English name, since the team reads it in the lead's message. */
const CATEGORIES = [
  { key: 'fitnessClubs', value: 'Fitness club' },
  { key: 'trainingStudios', value: 'Training studio' },
  { key: 'yogaStudios', value: 'Yoga studio' },
  { key: 'pilatesStudios', value: 'Pilates studio' },
  { key: 'crossfit', value: 'CrossFit' },
  { key: 'martialArts', value: 'Martial arts' },
  { key: 'swimmingSchools', value: 'Swimming school' },
  { key: 'danceSchools', value: 'Dance school' },
  { key: 'padel', value: 'Padel' },
  { key: 'tennisClubs', value: 'Tennis club' },
  { key: 'other', value: 'Other' },
] as const;

/** Name and surname, side by side from `sm` up. Both required. */
const NameFields = () => {
  const t = useTranslations('common.leads');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={t('name')} required>
        <input
          className={inputCls}
          type="text"
          name="firstName"
          autoComplete="given-name"
          placeholder={t('namePlaceholder')}
          required
        />
      </Field>
      <Field label={t('surname')} required>
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
    <Field label={t('email')} required>
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
        <Label text={t('phone')} required />
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

/** The business's name, sent as the lead's `business`. Required. */
const CompanyField = () => {
  const t = useTranslations('common.leads');
  return (
    <Field label={t('company')} required>
      <input
        className={inputCls}
        type="text"
        name="company"
        autoComplete="organization"
        placeholder={t('companyPlaceholder')}
        required
      />
    </Field>
  );
};

/** What kind of business it is. Required. */
const CategoryField = () => {
  const t = useTranslations('common.leads');
  return (
    <Field label={t('category')} required>
      <select className={inputCls} name="category" defaultValue="" required>
        <option value="" disabled>
          {t('categoryPlaceholder')}
        </option>
        {CATEGORIES.map((c) => (
          <option key={c.key} value={c.value}>
            {t(`categories.${c.key}`)}
          </option>
        ))}
      </select>
    </Field>
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
    one `name`, one `phone`, a `business` and a free-text `message`, so the split
    fields are joined and the category and member count go into the message
    rather than widening the schema. The `message` is read by the
    FormaCore team, not shown to the visitor, so its label stays English. */
function contact(form: HTMLFormElement) {
  const name = [field(form, 'firstName'), field(form, 'lastName')].filter(Boolean).join(' ');
  const number = field(form, 'phone');
  const category = field(form, 'category');
  const members = field(form, 'members');
  const notes = [
    category && `Category: ${category}`,
    members && `Active members: ${members}`,
  ].filter(Boolean);
  return {
    name,
    email: field(form, 'email') ?? '',
    business: field(form, 'company'),
    phone: number ? `${field(form, 'dialCode') ?? '+995'} ${number}` : undefined,
    message: notes.length > 0 ? notes.join('\n') : undefined,
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

/** Book-a-demo request form: everything required except the member count. */
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
          <CompanyField />
          <CategoryField />
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
          <CompanyField />
          <CategoryField />
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
