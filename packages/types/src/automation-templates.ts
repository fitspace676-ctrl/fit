import type {
  AutomationActionType,
  AutomationOffer,
  AutomationRecipient,
  AutomationTriggerCategory,
  AutomationTriggerConfig,
  AutomationTriggerType,
} from './automation';
import type { AutomationCondition } from './automation-conditions';
import type { AutomationTimingOffset } from './automation-timing';

// @fit/types/automation-templates — the built-in rule templates the builder
// offers as starting points (spec #1-19, #21-27). They are static: the API
// serves them next to the gym's own saved templates and the admin turns one
// into a pre-filled rule form. Spec #20 (payment method expiring) is left out
// because card expiry is not stored anywhere.
//
// Every template is a valid `createAutomationRuleSchema` body (with the `en`
// texts) and only uses merge tokens its trigger can fill; the spec checks both.

/** A text in each console language. */
export interface AutomationLocalizedText {
  en: string;
  ka: string;
}

/** One built-in automation template. */
export interface AutomationBuiltInTemplate {
  /** Stable snake_case id, safe to store or link to. */
  key: string;
  category: AutomationTriggerCategory;
  triggerType: AutomationTriggerType;
  triggerConfig: AutomationTriggerConfig;
  timingOffset: AutomationTimingOffset;
  conditions: readonly AutomationCondition[];
  actionType: AutomationActionType;
  recipient: AutomationRecipient;
  /** An offer the message carries (fills the `{{discount_percent}}`-style tokens). */
  offer?: AutomationOffer;
  name: AutomationLocalizedText;
  subject: AutomationLocalizedText;
  body: AutomationLocalizedText;
}

const NO_SHOW: readonly AutomationCondition[] = [
  { field: 'booking_attendance', operator: 'eq', value: 'NO_SHOW' },
];

export const AUTOMATION_BUILT_IN_TEMPLATES: readonly AutomationBuiltInTemplate[] = [
  // -- Members --
  {
    key: 'welcome_email',
    category: 'Members',
    triggerType: 'member_joined',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Welcome email', ka: 'მისალმების წერილი' },
    subject: {
      en: 'Welcome to {{business_name}}, {{first_name}}!',
      ka: 'კეთილი იყოს შენი მობრძანება {{business_name}}-ში, {{first_name}}!',
    },
    body: {
      en: 'Hi {{first_name}},\n\nWelcome to {{business_name}}. We are glad you joined us. Your plan: {{membership_plan}}.\n\nSee you soon at {{branch_name}}!',
      ka: 'გამარჯობა, {{first_name}}!\n\nმოხარულები ვართ, რომ {{business_name}}-ს შემოუერთდი. შენი გეგმა: {{membership_plan}}.\n\nმალე გნახავთ {{branch_name}}-ში!',
    },
  },
  {
    key: 'membership_expiring',
    category: 'Members',
    triggerType: 'membership_expiring',
    triggerConfig: { days: 7 },
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Membership expiring', ka: 'აბონემენტის ვადა იწურება' },
    subject: {
      en: 'Your membership ends in {{days_remaining}} days',
      ka: 'შენი აბონემენტი {{days_remaining}} დღეში იწურება',
    },
    body: {
      en: 'Hi {{first_name}},\n\nYour {{membership_plan}} membership ends on {{expiry_date}}. Renew now to keep training without a break.',
      ka: 'გამარჯობა, {{first_name}}!\n\nშენი აბონემენტი {{membership_plan}} იწურება {{expiry_date}}-ს. განაახლე ახლავე, რომ ვარჯიში არ შეწყდეს.',
    },
  },
  {
    key: 'membership_expired',
    category: 'Members',
    triggerType: 'membership_expired',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Membership expired', ka: 'აბონემენტის ვადა ამოიწურა' },
    subject: {
      en: 'Your membership has expired',
      ka: 'შენი აბონემენტის ვადა ამოიწურა',
    },
    body: {
      en: 'Hi {{first_name}},\n\nYour {{membership_plan}} membership expired on {{expiry_date}}. We would love to see you back. Renew any time.',
      ka: 'გამარჯობა, {{first_name}}!\n\nშენი აბონემენტი {{membership_plan}} ამოიწურა {{expiry_date}}-ს. გველოდებით! განახლება ნებისმიერ დროს შეგიძლია.',
    },
  },
  {
    key: 'membership_renewed',
    category: 'Members',
    triggerType: 'membership_renewed',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Membership renewed', ka: 'აბონემენტი განახლდა' },
    subject: {
      en: 'Your membership is renewed',
      ka: 'შენი აბონემენტი განახლდა',
    },
    body: {
      en: 'Hi {{first_name}},\n\nThanks for staying with us! Your {{membership_plan}} membership is renewed until {{expiry_date}}.',
      ka: 'გამარჯობა, {{first_name}}!\n\nმადლობა, რომ ჩვენთან რჩები! შენი აბონემენტი {{membership_plan}} განახლდა {{expiry_date}}-მდე.',
    },
  },
  {
    key: 'membership_frozen',
    category: 'Members',
    triggerType: 'membership_frozen',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Membership frozen', ka: 'აბონემენტი გაყინულია' },
    subject: {
      en: 'Your membership is frozen',
      ka: 'შენი აბონემენტი გაყინულია',
    },
    body: {
      en: 'Hi {{first_name}},\n\nYour membership is frozen from {{freeze_start_date}} until {{freeze_end_date}}. We will see you when you are back.',
      ka: 'გამარჯობა, {{first_name}}!\n\nშენი აბონემენტი გაყინულია {{freeze_start_date}}-დან {{freeze_end_date}}-მდე. გნახავთ, როცა დაბრუნდები.',
    },
  },
  {
    key: 'birthday',
    category: 'Members',
    triggerType: 'birthday',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Birthday wishes', ka: 'დაბადების დღის მილოცვა' },
    subject: {
      en: 'Happy birthday, {{first_name}}!',
      ka: 'გილოცავ დაბადების დღეს, {{first_name}}!',
    },
    body: {
      en: 'Hi {{first_name}},\n\nThe whole {{business_name}} team wishes you a happy birthday and a great year ahead!',
      ka: 'გამარჯობა, {{first_name}}!\n\n{{business_name}}-ის გუნდი გილოცავს დაბადების დღეს. გისურვებთ კარგ წელს!',
    },
  },
  {
    key: 'inactive_alert',
    category: 'Members',
    triggerType: 'no_checkin',
    triggerConfig: { days: 14 },
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Inactive member alert', ka: 'არააქტიური წევრი' },
    subject: {
      en: 'We miss you, {{first_name}}',
      ka: 'მოგვენატრე, {{first_name}}',
    },
    body: {
      en: 'Hi {{first_name}},\n\nIt has been {{days_inactive}} days since your last visit on {{last_checkin_date}}. Come back and pick up where you left off!',
      ka: 'გამარჯობა, {{first_name}}!\n\nბოლოს {{last_checkin_date}}-ს გვესტუმრე, {{days_inactive}} დღის წინ. დაბრუნდი და გააგრძელე ვარჯიში!',
    },
  },
  {
    key: 'win_back',
    category: 'Members',
    triggerType: 'no_checkin',
    triggerConfig: { days: 30 },
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    offer: { discountPercent: 20, offerCode: 'COMEBACK20' },
    name: { en: 'Win-back offer', ka: 'დაბრუნების შეთავაზება' },
    subject: {
      en: '{{discount_percent}}% off to welcome you back',
      ka: '{{discount_percent}}% ფასდაკლება დასაბრუნებლად',
    },
    body: {
      en: 'Hi {{first_name}},\n\nWe have not seen you for {{days_inactive}} days. Come back with {{discount_percent}}% off: use code {{offer_code}}.',
      ka: 'გამარჯობა, {{first_name}}!\n\n{{days_inactive}} დღეა არ გვინახიხარ. დაბრუნდი {{discount_percent}}% ფასდაკლებით. გამოიყენე კოდი {{offer_code}}.',
    },
  },
  // -- Classes --
  {
    key: 'class_booked_confirmation',
    category: 'Classes',
    triggerType: 'class_booked',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Class booking confirmation', ka: 'კლასის ჯავშნის დადასტურება' },
    subject: {
      en: 'You are booked: {{class_name}}',
      ka: 'ჯავშანი დადასტურდა: {{class_name}}',
    },
    body: {
      en: 'Hi {{first_name}},\n\nYou are booked for {{class_name}} on {{class_date}} at {{class_time}} with {{trainer_name}}. Location: {{location}}.',
      ka: 'გამარჯობა, {{first_name}}!\n\nშენ ჩაეწერე კლასზე {{class_name}}. თარიღი: {{class_date}}, დრო: {{class_time}}. მწვრთნელი: {{trainer_name}}. ადგილი: {{location}}.',
    },
  },
  {
    key: 'class_reminder',
    category: 'Classes',
    triggerType: 'class_booked',
    triggerConfig: {},
    timingOffset: '-24h',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Class reminder', ka: 'კლასის შეხსენება' },
    subject: {
      en: 'Reminder: {{class_name}} tomorrow at {{class_time}}',
      ka: 'შეხსენება: {{class_name}} ხვალ, {{class_time}}-ზე',
    },
    body: {
      en: 'Hi {{first_name}},\n\nSee you at {{class_name}} on {{class_date}} at {{class_time}}. Location: {{location}}.',
      ka: 'გამარჯობა, {{first_name}}!\n\nგელოდებით კლასზე {{class_name}}. თარიღი: {{class_date}}, დრო: {{class_time}}. ადგილი: {{location}}.',
    },
  },
  {
    key: 'no_show_follow_up',
    category: 'Classes',
    triggerType: 'attendance_marked',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: NO_SHOW,
    actionType: 'email',
    recipient: 'member',
    name: { en: 'No-show follow-up', ka: 'გამოუცხადებლობის შემდეგ' },
    subject: {
      en: 'We missed you at {{missed_class_name}}',
      ka: 'კლასზე {{missed_class_name}} არ იყავი',
    },
    body: {
      en: 'Hi {{first_name}},\n\nWe missed you at {{missed_class_name}} on {{missed_class_date}}. Book your next class whenever you are ready.',
      ka: 'გამარჯობა, {{first_name}}!\n\n{{missed_class_date}}-ს კლასზე {{missed_class_name}} ვერ გნახეთ. შემდეგ კლასზე ჩაეწერე, როცა მოგიხერხდება.',
    },
  },
  {
    key: 'feedback_request',
    category: 'Classes',
    triggerType: 'first_class_attended',
    triggerConfig: {},
    timingOffset: '3d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'First class feedback', ka: 'პირველი კლასის შეფასება' },
    subject: {
      en: 'How was your first class, {{first_name}}?',
      ka: 'როგორი იყო პირველი კლასი, {{first_name}}?',
    },
    body: {
      en: 'Hi {{first_name}},\n\nThanks for joining {{class_name}} with {{trainer_name}}. We would love to hear how it went. Just reply to this email.',
      ka: 'გამარჯობა, {{first_name}}!\n\nმადლობა, რომ კლასზე {{class_name}} მოხვედი. მწვრთნელი: {{trainer_name}}. გვითხარი, როგორ ჩაიარა. უბრალოდ უპასუხე ამ წერილს.',
    },
  },
  {
    key: 'class_full_member',
    category: 'Classes',
    triggerType: 'class_full',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Class full', ka: 'კლასი სავსეა' },
    subject: {
      en: '{{class_name}} is now full',
      ka: 'კლასი {{class_name}} უკვე სავსეა',
    },
    body: {
      en: 'Hi {{first_name}},\n\n{{class_name}} on {{class_date}} at {{class_time}} is now full ({{spots_filled}}/{{spots_total}}). Your spot is saved.',
      ka: 'გამარჯობა, {{first_name}}!\n\nკლასი {{class_name}} ({{class_date}}, {{class_time}}) სავსეა: {{spots_filled}}/{{spots_total}}. შენი ადგილი დაცულია.',
    },
  },
  {
    key: 'pt_session_confirmation',
    category: 'Classes',
    triggerType: 'pt_session_booked',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'PT session confirmation', ka: 'პერსონალური ვარჯიშის დადასტურება' },
    subject: {
      en: 'Your {{session_type}} session is booked',
      ka: 'შენი ვარჯიში {{session_type}} დაჯავშნილია',
    },
    body: {
      en: 'Hi {{first_name}},\n\nYour {{session_type}} session with {{trainer_name}} is booked for {{session_date}} at {{session_time}}. Location: {{location}}.',
      ka: 'გამარჯობა, {{first_name}}!\n\nშენი ვარჯიში {{session_type}} დაჯავშნილია. თარიღი: {{session_date}}, დრო: {{session_time}}. მწვრთნელი: {{trainer_name}}. ადგილი: {{location}}.',
    },
  },
  {
    key: 'pt_session_reminder',
    category: 'Classes',
    triggerType: 'pt_session_booked',
    triggerConfig: {},
    timingOffset: '-24h',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'PT session reminder', ka: 'პერსონალური ვარჯიშის შეხსენება' },
    subject: {
      en: 'Reminder: {{session_type}} tomorrow at {{session_time}}',
      ka: 'შეხსენება: {{session_type}} ხვალ, {{session_time}}-ზე',
    },
    body: {
      en: 'Hi {{first_name}},\n\n{{trainer_name}} is expecting you on {{session_date}} at {{session_time}}. Location: {{location}}.',
      ka: 'გამარჯობა, {{first_name}}!\n\n{{trainer_name}} გელოდება {{session_date}}-ს, {{session_time}}-ზე. ადგილი: {{location}}.',
    },
  },
  // -- Payments --
  {
    key: 'payment_received',
    category: 'Payments',
    triggerType: 'payment_received',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Payment received', ka: 'გადახდა მიღებულია' },
    subject: {
      en: 'Payment received: {{amount}}',
      ka: 'გადახდა მიღებულია: {{amount}}',
    },
    body: {
      en: 'Hi {{first_name}},\n\nWe received your payment of {{amount}} on {{payment_date}}. Invoice: {{invoice_number}}. Thank you!',
      ka: 'გამარჯობა, {{first_name}}!\n\n{{payment_date}}-ს მივიღეთ შენი გადახდა: {{amount}}. ინვოისი: {{invoice_number}}. მადლობა!',
    },
  },
  {
    key: 'payment_failed',
    category: 'Payments',
    triggerType: 'payment_failed',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Payment failed', ka: 'გადახდა ვერ შესრულდა' },
    subject: {
      en: 'Your payment did not go through',
      ka: 'შენი გადახდა ვერ შესრულდა',
    },
    body: {
      en: 'Hi {{first_name}},\n\nWe could not take your payment of {{amount}} for invoice {{invoice_number}}. Please update your payment or contact us.',
      ka: 'გამარჯობა, {{first_name}}!\n\nგადახდა {{amount}} ინვოისზე {{invoice_number}} ვერ შესრულდა. გთხოვ, სცადე თავიდან ან დაგვიკავშირდი.',
    },
  },
  {
    key: 'invoice_overdue',
    category: 'Payments',
    triggerType: 'invoice_overdue',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Invoice overdue', ka: 'ინვოისი ვადაგადაცილებულია' },
    subject: {
      en: 'Invoice {{invoice_number}} is overdue',
      ka: 'ინვოისი {{invoice_number}} ვადაგადაცილებულია',
    },
    body: {
      en: 'Hi {{first_name}},\n\nInvoice {{invoice_number}} for {{amount}} was due on {{due_date}}. Please pay it as soon as you can.',
      ka: 'გამარჯობა, {{first_name}}!\n\nინვოისის {{invoice_number}} ვადა იყო {{due_date}}. თანხა: {{amount}}. გთხოვ, გადაიხადე რაც შეიძლება მალე.',
    },
  },
  {
    key: 'refund_issued',
    category: 'Payments',
    triggerType: 'refund_issued',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Refund issued', ka: 'თანხა დაბრუნდა' },
    subject: {
      en: 'Your refund of {{refund_amount}} is on its way',
      ka: 'შენი თანხა {{refund_amount}} დაბრუნდა',
    },
    body: {
      en: 'Hi {{first_name}},\n\nWe refunded {{refund_amount}} on {{refund_date}}. It may take a few days to show in your account.',
      ka: 'გამარჯობა, {{first_name}}!\n\n{{refund_date}}-ს დაგიბრუნეთ {{refund_amount}}. ანგარიშზე ასახვას რამდენიმე დღე შეიძლება დასჭირდეს.',
    },
  },
  // -- POS --
  {
    key: 'purchase_receipt',
    category: 'POS',
    triggerType: 'purchase_completed',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Purchase receipt', ka: 'შესყიდვის ქვითარი' },
    subject: {
      en: 'Your receipt for order {{order_number}}',
      ka: 'ქვითარი შეკვეთისთვის {{order_number}}',
    },
    body: {
      en: 'Hi {{first_name}},\n\nThanks for your purchase on {{purchase_date}}.\nItems: {{product_name}}\nTotal: {{order_total}}',
      ka: 'გამარჯობა, {{first_name}}!\n\nმადლობა შესყიდვისთვის. თარიღი: {{purchase_date}}.\nპროდუქტი: {{product_name}}\nჯამი: {{order_total}}',
    },
  },
  // -- For the trainer --
  {
    key: 'trainer_new_booking',
    category: 'Classes',
    triggerType: 'class_booked',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'trainer',
    name: { en: 'Trainer: new booking', ka: 'მწვრთნელს: ახალი ჯავშანი' },
    subject: {
      en: 'New booking for {{class_name}}',
      ka: 'ახალი ჯავშანი კლასზე {{class_name}}',
    },
    body: {
      en: 'Hi {{recipient_name}},\n\n{{related_member_name}} booked {{class_name}} on {{class_date}} at {{class_time}}. Spots filled: {{spots_filled}}/{{spots_total}}.',
      ka: 'გამარჯობა, {{recipient_name}}!\n\n{{related_member_name}} ჩაეწერა კლასზე {{class_name}} ({{class_date}}, {{class_time}}). დაკავებულია: {{spots_filled}}/{{spots_total}}.',
    },
  },
  {
    key: 'trainer_class_full',
    category: 'Classes',
    triggerType: 'class_full',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'trainer',
    name: { en: 'Trainer: class full', ka: 'მწვრთნელს: კლასი სავსეა' },
    subject: {
      en: '{{class_name}} is full',
      ka: 'კლასი {{class_name}} სავსეა',
    },
    body: {
      en: 'Hi {{recipient_name}},\n\nYour class {{class_name}} on {{class_date}} at {{class_time}} is full: {{spots_filled}}/{{spots_total}} spots taken.',
      ka: 'გამარჯობა, {{recipient_name}}!\n\nშენი კლასი {{class_name}} ({{class_date}}, {{class_time}}) სავსეა. დაკავებულია: {{spots_filled}}/{{spots_total}}.',
    },
  },
  {
    key: 'trainer_class_cancelled',
    category: 'Classes',
    triggerType: 'class_cancelled_member',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'trainer',
    name: { en: 'Trainer: booking cancelled', ka: 'მწვრთნელს: ჯავშანი გაუქმდა' },
    subject: {
      en: '{{related_member_name}} cancelled {{class_name}}',
      ka: '{{related_member_name}}-მა გააუქმა ჯავშანი',
    },
    body: {
      en: 'Hi {{recipient_name}},\n\n{{related_member_name}} cancelled their spot in {{class_name}} on {{class_date}} at {{class_time}}. Spots filled: {{spots_filled}}/{{spots_total}}.',
      ka: 'გამარჯობა, {{recipient_name}}!\n\n{{related_member_name}}-მა გააუქმა ჯავშანი კლასზე {{class_name}} ({{class_date}}, {{class_time}}). დაკავებულია: {{spots_filled}}/{{spots_total}}.',
    },
  },
  {
    key: 'trainer_pt_booked',
    category: 'Classes',
    triggerType: 'pt_session_booked',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'trainer',
    name: { en: 'Trainer: PT session booked', ka: 'მწვრთნელს: ვარჯიში დაჯავშნილია' },
    subject: {
      en: 'New {{session_type}} session with {{related_member_name}}',
      ka: 'ახალი ვარჯიში: {{related_member_name}}',
    },
    body: {
      en: 'Hi {{recipient_name}},\n\n{{related_member_name}} booked a {{session_type}} session with you on {{session_date}} at {{session_time}}.',
      ka: 'გამარჯობა, {{recipient_name}}!\n\n{{related_member_name}}-მა დაჯავშნა ვარჯიში {{session_type}}. თარიღი: {{session_date}}, დრო: {{session_time}}.',
    },
  },
  {
    key: 'trainer_no_show',
    category: 'Classes',
    triggerType: 'attendance_marked',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: NO_SHOW,
    actionType: 'email',
    recipient: 'trainer',
    name: { en: 'Trainer: no-show', ka: 'მწვრთნელს: არ გამოცხადდა' },
    subject: {
      en: '{{related_member_name}} missed {{missed_class_name}}',
      ka: '{{related_member_name}} არ გამოცხადდა',
    },
    body: {
      en: 'Hi {{recipient_name}},\n\n{{related_member_name}} did not show up to {{missed_class_name}} on {{missed_class_date}}. You may want to check in with them.',
      ka: 'გამარჯობა, {{recipient_name}}!\n\n{{related_member_name}} არ მოვიდა კლასზე {{missed_class_name}} ({{missed_class_date}}). შეგიძლია დაუკავშირდე.',
    },
  },
  // -- Staff --
  {
    key: 'task_assigned',
    category: 'Staff',
    triggerType: 'task_assigned',
    triggerConfig: {},
    timingOffset: '0d',
    conditions: [],
    actionType: 'email',
    recipient: 'member',
    name: { en: 'Task assigned', ka: 'დავალება მოგენიჭა' },
    subject: {
      en: 'You have a new task',
      ka: 'ახალი დავალება გაქვს',
    },
    body: {
      en: 'Hi {{first_name}},\n\nA new task was assigned to you at {{business_name}}. Open the staff console to see the details.',
      ka: 'გამარჯობა, {{first_name}}!\n\n{{business_name}}-ში ახალი დავალება მოგენიჭა. დეტალები ნახე პერსონალის პანელში.',
    },
  },
];
