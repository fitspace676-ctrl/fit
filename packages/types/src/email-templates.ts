// @fit/types — the gym's transactional email templates.
//
// These are the letters the system sends on its own: a birthday greeting, a
// membership about to lapse, a payment that failed. Distinct from a marketing
// `MessageTemplate` (which a human composes into a campaign) and from an
// `AutomationRule` (which a gym builds itself) — a gym does not create these, it
// *adjusts* them, and one must exist for every event whether or not anyone has
// touched it.
//
// So the wording lives here, in code, and the database holds only a gym's
// overrides. A gym that has never opened the screen still has all of them, a
// gym that has edited three has three rows, and "reset to default" is a delete.
// Seeding every gym with twenty-one rows would have made the defaults
// un-updatable — a later improvement to the copy would never reach anyone.

import { z } from 'zod';

/**
 * Every system email, keyed by the event that sends it.
 *
 * The key is the contract: code raises an event by key, the gym's override (if
 * any) is looked up by the same key, and the screen lists them by it. Renaming
 * one is a migration, so they read as events rather than as subject lines.
 */
export const emailTemplateKeySchema = z.enum([
  // Membership lifecycle
  'welcome_new_member',
  'birthday_greeting',
  'membership_expiry_reminder_7d',
  'membership_expiry_reminder_1d',
  'membership_expired',
  'membership_auto_renewed',
  'member_freeze_activated',
  'member_freeze_ending_soon',
  'member_inactive_14d',
  'member_inactive_30d',
  // Money
  'payment_successful',
  'payment_failed',
  'overdue_payment_reminder',
  // Classes and bookings
  'class_reminder_24h',
  'class_cancelled',
  'waitlist_spot_available',
  'booking_new_trainer',
  'booking_cancelled_trainer',
  'trainer_changed',
  // Staff
  'staff_shift_reminder',
]);

/** Which system email this is — {@link emailTemplateKeySchema}. */
export type EmailTemplateKey = z.infer<typeof emailTemplateKeySchema>;

/**
 * The audience a template is written for. It decides which merge fields make
 * sense and, more importantly, who the send path addresses: a trainer being told
 * about a booking must not be sent the member's copy.
 */
export const emailAudienceSchema = z.enum(['member', 'trainer', 'staff']);

/** Who a template is addressed to — {@link emailAudienceSchema}. */
export type EmailAudience = z.infer<typeof emailAudienceSchema>;

/** The grouping the settings screen lists templates under. */
export const emailTemplateGroupSchema = z.enum(['membership', 'payments', 'classes', 'staff']);

/** A template's section on the settings screen — {@link emailTemplateGroupSchema}. */
export type EmailTemplateGroup = z.infer<typeof emailTemplateGroupSchema>;

/** One template's built-in wording and the facts about it the screen renders. */
export interface EmailTemplateDefault {
  key: EmailTemplateKey;
  /** Human name, as the settings list shows it. */
  name: string;
  /** One line on when this is sent — the thing staff most need to know. */
  description: string;
  group: EmailTemplateGroup;
  audience: EmailAudience;
  subject: string;
  body: string;
  /**
   * The merge tokens this template may use, beyond the shared ones every
   * template gets. Drives the insert palette on the editor.
   */
  tokens: readonly string[];
}

/** Tokens every template can use, whoever it is addressed to. */
export const COMMON_EMAIL_TOKENS = ['first_name', 'last_name', 'gym_name'] as const;

/**
 * The built-in wording for all twenty system emails.
 *
 * Deliberately plain. These are read on a phone, usually in a hurry, and the
 * gym's own voice arrives by editing them — a default that tries to be clever is
 * a default everyone has to rewrite.
 */
export const EMAIL_TEMPLATE_DEFAULTS: readonly EmailTemplateDefault[] = [
  {
    key: 'welcome_new_member',
    name: 'Welcome new member',
    description: 'Sent once, when a membership is created.',
    group: 'membership',
    audience: 'member',
    subject: 'Welcome to {{gym_name}}, {{first_name}}!',
    body: [
      'Hi {{first_name}},',
      '',
      'Welcome to {{gym_name}} — we are glad to have you.',
      '',
      'Your membership is active and you can start booking classes right away. If you have any questions, just reply to this email or ask at the front desk.',
      '',
      'See you soon,',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['plan_name'],
  },
  {
    key: 'birthday_greeting',
    name: 'Birthday greeting',
    description: 'Sent on a member’s birthday.',
    group: 'membership',
    audience: 'member',
    subject: 'Happy birthday, {{first_name}}!',
    body: [
      'Hi {{first_name}},',
      '',
      'Happy birthday from everyone at {{gym_name}}. Have a great one — and we hope to see you in soon.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: [],
  },
  {
    key: 'membership_expiry_reminder_7d',
    name: 'Membership expiry reminder (7 days)',
    description: 'Sent a week before a membership lapses.',
    group: 'membership',
    audience: 'member',
    subject: 'Your {{gym_name}} membership ends in 7 days',
    body: [
      'Hi {{first_name}},',
      '',
      'Your {{plan_name}} membership ends on {{expiry_date}}. Renew before then and nothing changes — your bookings and credits carry straight over.',
      '',
      'You can renew at the front desk or from your account.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['plan_name', 'expiry_date'],
  },
  {
    key: 'membership_expiry_reminder_1d',
    name: 'Membership expiry reminder (1 day)',
    description: 'Sent the day before a membership lapses.',
    group: 'membership',
    audience: 'member',
    subject: 'Your {{gym_name}} membership ends tomorrow',
    body: [
      'Hi {{first_name}},',
      '',
      'A quick reminder that your {{plan_name}} membership ends tomorrow, {{expiry_date}}.',
      '',
      'Renew before then to keep your access and any remaining credits.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['plan_name', 'expiry_date'],
  },
  {
    key: 'membership_expired',
    name: 'Membership expired',
    description: 'Sent when a membership has lapsed.',
    group: 'membership',
    audience: 'member',
    subject: 'Your {{gym_name}} membership has ended',
    body: [
      'Hi {{first_name}},',
      '',
      'Your {{plan_name}} membership ended on {{expiry_date}}, so your access is paused for now.',
      '',
      'Coming back is easy — renew at the front desk or from your account and you can pick up where you left off.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['plan_name', 'expiry_date'],
  },
  {
    key: 'membership_auto_renewed',
    name: 'Membership auto-renewed',
    description: 'Sent when a recurring membership renews itself.',
    group: 'membership',
    audience: 'member',
    subject: 'Your {{gym_name}} membership has renewed',
    body: [
      'Hi {{first_name}},',
      '',
      'Your {{plan_name}} membership renewed today and {{amount}} was charged. Your next renewal is {{next_billing_date}}.',
      '',
      'Nothing to do — this is just so you have it on record.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['plan_name', 'amount', 'next_billing_date'],
  },
  {
    key: 'member_freeze_activated',
    name: 'Member freeze activated',
    description: 'Sent when a membership is put on hold.',
    group: 'membership',
    audience: 'member',
    subject: 'Your {{gym_name}} membership is on hold',
    body: [
      'Hi {{first_name}},',
      '',
      'Your membership is now frozen and will resume automatically on {{resume_date}}. The days you are on hold are added back to your membership, so you lose nothing.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['resume_date'],
  },
  {
    key: 'member_freeze_ending_soon',
    name: 'Freeze ending soon (3 days)',
    description: 'Sent three days before a frozen membership resumes.',
    group: 'membership',
    audience: 'member',
    subject: 'Your {{gym_name}} membership resumes in 3 days',
    body: [
      'Hi {{first_name}},',
      '',
      'Your membership comes off hold on {{resume_date}} — three days from now. Billing and access pick up again from that date.',
      '',
      'See you soon,',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['resume_date'],
  },
  {
    key: 'member_inactive_14d',
    name: 'Member inactive 14 days',
    description: 'Sent when a member has not visited for two weeks.',
    group: 'membership',
    audience: 'member',
    subject: 'We have missed you at {{gym_name}}',
    body: [
      'Hi {{first_name}},',
      '',
      'We have not seen you in a couple of weeks. Life gets busy — but your membership is active and waiting whenever you are ready.',
      '',
      'Need a hand getting back into it? Reply and we will sort something out.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['last_visit_date'],
  },
  {
    key: 'member_inactive_30d',
    name: 'Member inactive 30 days',
    description: 'Sent when a member has not visited for a month.',
    group: 'membership',
    audience: 'member',
    subject: 'Still with us, {{first_name}}?',
    body: [
      'Hi {{first_name}},',
      '',
      'It has been a month since your last visit on {{last_visit_date}}, and we would hate for your membership to go unused.',
      '',
      'If something is not working for you, tell us — a different class time or a fresh plan is usually all it takes.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['last_visit_date'],
  },
  {
    key: 'payment_successful',
    name: 'Payment successful',
    description: 'Sent when a payment is captured.',
    group: 'payments',
    audience: 'member',
    subject: 'Payment received — {{amount}}',
    body: [
      'Hi {{first_name}},',
      '',
      'We have received your payment of {{amount}}. Thank you.',
      '',
      'This email is your receipt.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['amount', 'invoice_number'],
  },
  {
    key: 'payment_failed',
    name: 'Payment failed',
    description: 'Sent when a charge is declined.',
    group: 'payments',
    audience: 'member',
    subject: 'We could not take your payment',
    body: [
      'Hi {{first_name}},',
      '',
      'Your payment of {{amount}} did not go through. This is usually a card that has expired or a bank declining an unfamiliar charge.',
      '',
      'Update your details or pay at the front desk and we will take care of the rest — your access is unaffected for now.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['amount', 'invoice_number'],
  },
  {
    key: 'overdue_payment_reminder',
    name: 'Overdue payment reminder',
    description: 'Sent when an invoice is past its due date.',
    group: 'payments',
    audience: 'member',
    subject: 'A payment is overdue',
    body: [
      'Hi {{first_name}},',
      '',
      'Invoice {{invoice_number}} for {{amount}} was due on {{due_date}} and is still outstanding.',
      '',
      'If you have already paid, ignore this. Otherwise you can settle it at the front desk or from your account.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['amount', 'invoice_number', 'due_date'],
  },
  {
    key: 'class_reminder_24h',
    name: 'Class reminder (24 hours)',
    description: 'Sent the day before a booked class.',
    group: 'classes',
    audience: 'member',
    subject: 'Tomorrow: {{class_name}} at {{class_time}}',
    body: [
      'Hi {{first_name}},',
      '',
      'A reminder that you are booked into {{class_name}} tomorrow at {{class_time}} with {{trainer_name}}.',
      '',
      'Cannot make it? Cancel from your account so someone on the waitlist can take your place.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['class_name', 'class_time', 'trainer_name'],
  },
  {
    key: 'class_cancelled',
    name: 'Class cancelled',
    description: 'Sent to everyone booked when a class is called off.',
    group: 'classes',
    audience: 'member',
    subject: '{{class_name}} on {{class_time}} is cancelled',
    body: [
      'Hi {{first_name}},',
      '',
      'Unfortunately {{class_name}} at {{class_time}} has been cancelled. Sorry for the short notice.',
      '',
      'Any credit used for it has been returned, and you are welcome to book another session.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['class_name', 'class_time', 'trainer_name'],
  },
  {
    key: 'waitlist_spot_available',
    name: 'Waitlist spot available',
    description: 'Sent when a place opens up on a class you are waiting for.',
    group: 'classes',
    audience: 'member',
    subject: 'A place has opened in {{class_name}}',
    body: [
      'Hi {{first_name}},',
      '',
      'A place has opened in {{class_name}} at {{class_time}}. You were on the waitlist, so it is yours if you want it.',
      '',
      'Book from your account — places go quickly.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['class_name', 'class_time', 'trainer_name'],
  },
  {
    key: 'booking_new_trainer',
    name: 'New booking — notify trainer',
    description: 'Sent to the trainer when someone books their session.',
    group: 'classes',
    audience: 'trainer',
    subject: 'New booking: {{member_name}} for {{class_name}}',
    body: [
      'Hi {{first_name}},',
      '',
      '{{member_name}} has booked {{class_name}} on {{class_time}}.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['member_name', 'class_name', 'class_time'],
  },
  {
    key: 'booking_cancelled_trainer',
    name: 'Booking cancelled — notify trainer',
    description: 'Sent to the trainer when someone cancels on them.',
    group: 'classes',
    audience: 'trainer',
    subject: 'Cancelled: {{member_name}} for {{class_name}}',
    body: [
      'Hi {{first_name}},',
      '',
      '{{member_name}} has cancelled their place in {{class_name}} on {{class_time}}.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['member_name', 'class_name', 'class_time'],
  },
  {
    key: 'trainer_changed',
    name: 'Trainer changed',
    description: 'Sent to booked members when a session changes trainer.',
    group: 'classes',
    audience: 'member',
    subject: 'A change to your {{class_name}} session',
    body: [
      'Hi {{first_name}},',
      '',
      '{{class_name}} on {{class_time}} will now be taken by {{trainer_name}}. Everything else stays the same.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['class_name', 'class_time', 'trainer_name'],
  },
  {
    key: 'staff_shift_reminder',
    name: 'Staff shift reminder',
    description: 'Sent to a staff member before their shift.',
    group: 'staff',
    audience: 'staff',
    subject: 'Your shift tomorrow at {{shift_time}}',
    body: [
      'Hi {{first_name}},',
      '',
      'A reminder that you are on at {{location_name}} tomorrow, {{shift_time}}.',
      '',
      '{{gym_name}}',
    ].join('\n'),
    tokens: ['shift_time', 'location_name'],
  },
];

/** The built-in wording for one key. Every key has one, so this never returns undefined. */
export function emailTemplateDefault(key: EmailTemplateKey): EmailTemplateDefault {
  const found = EMAIL_TEMPLATE_DEFAULTS.find((template) => template.key === key);
  if (!found) {
    // Unreachable while the list covers the enum — asserted so a future key added
    // to one and not the other fails loudly rather than sending an empty email.
    throw new Error(`No default wording for email template "${key}"`);
  }
  return found;
}

/** Body for `PUT /settings/email-templates/:key` — a gym's override of the wording. */
export const updateEmailTemplateSchema = z.object({
  subject: z.string().trim().min(1, 'A subject is required').max(200),
  body: z.string().trim().min(1, 'A body is required').max(10_000),
  /** Clear to stop this email being sent at all, without losing the wording. */
  enabled: z.boolean().default(true),
});

/** Validated override body — {@link updateEmailTemplateSchema}. */
export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>;

/**
 * One template as the settings screen renders it: the built-in facts, the wording
 * currently in force, and whether that wording is the gym's own.
 */
export interface EmailTemplateRow {
  key: EmailTemplateKey;
  name: string;
  description: string;
  group: EmailTemplateGroup;
  audience: EmailAudience;
  /** The subject in force — the gym's, or the built-in one. */
  subject: string;
  /** The body in force. */
  body: string;
  enabled: boolean;
  /** True when the gym has edited this one; false when it is still the default. */
  customised: boolean;
  /** Every merge token this template may use, common ones included. */
  tokens: string[];
  /** ISO instant of the gym's last edit, or `null` when untouched. */
  updatedAt: string | null;
}

/** Successful `GET /settings/email-templates` response — all of them, in screen order. */
export interface ListEmailTemplatesResponse {
  data: EmailTemplateRow[];
}
