import { I } from '@/components/marketing/icons';
import type { AudiencePage } from './built-for';

/* ────────────────────────────────────────────────────────────────────────
   "Features" - one page per product module (single source of truth)
   Feeds the "Features" nav dropdown, the homepage capability cards and the
   /features/<slug> pages (the /built-for template). Feature pages carry no stats:
   there are no measured figures to quote, so the hero shows `highlights`
   (what the module does) where an audience page shows its stat strip.

   Every capability named here exists in the staff console (apps/admin), the
   member portal (apps/web), the mobile app (apps/mobile) or the AI agent
   (packages/agent). Keep it that way: describe the product, don't promise it.
   ──────────────────────────────────────────────────────────────────────── */

const PANELS = [
  'from-brand-600 via-brand-800 to-[#061634]',
  'from-iris-600 via-iris-800 to-[#061634]',
  'from-accent-600 via-brand-800 to-[#061634]',
  'from-brand-500 via-iris-800 to-[#061634]',
];

type FeatureInput = Omit<AudiencePage, 'value' | 'title' | 'navLabel' | 'eyebrow' | 'stats'>;

const page = (input: FeatureInput, index: number): AudiencePage => ({
  ...input,
  value: input.slug,
  title: input.name,
  navLabel: input.name,
  eyebrow: input.name,
  stats: [],
  panelClassName: input.panelClassName || PANELS[index % PANELS.length]!,
});

const INPUTS: FeatureInput[] = [
  {
    slug: 'member-portal',
    name: 'Member Portal',
    icon: I.globe,
    panelClassName: '',
    summary: 'Branded self-service web portal for members.',
    headline: 'A members area that looks like your gym, not ours.',
    subline:
      'A branded web portal where members book classes, manage their plan, buy from your shop and check in. Your logo and colour, in Georgian and English, on any device.',
    highlights: ['Your logo & colour', 'Georgian & English', 'Light & dark', 'Any device'],
    features: [
      {
        icon: I.calendar,
        eyebrow: 'Booking',
        headline: 'Book a class in two clicks.',
        body: "Members see the week's timetable or a simple list, open a class to see the coach, time and spots left, and book it.",
        bullets: [
          'Week and list views of the schedule',
          'Spots left on every class',
          'Bookings and history under "My bookings"',
        ],
      },
      {
        icon: I.card,
        eyebrow: 'Self-service',
        headline: 'Plans, services and shop, without a phone call.',
        body: 'Members manage their membership, book services and trainers, and buy products online, so the front desk spends less time on the phone.',
        bullets: [
          'Membership page with the current plan and its status',
          'Services and trainer booking',
          'Shop with cart and checkout',
        ],
      },
      {
        icon: I.qr,
        eyebrow: 'Check-in',
        headline: 'Their check-in QR, always to hand.',
        body: 'Every member has a personal check-in QR in the portal, ready to show at the door.',
        bullets: [
          'Personal QR on the home screen',
          'Visits recorded against the member',
          'Works with the reception check-in',
        ],
      },
      {
        icon: I.spark,
        eyebrow: 'Your brand',
        headline: 'Set it up from the console.',
        body: 'Upload your logo, pick your colour and choose the sign-in photo and welcome card from the admin panel. Changes show up for members straight away.',
        bullets: [
          'Logo, colour and sign-in photo',
          'Join card text per language',
          'Members choose light or dark',
        ],
      },
    ],
    footerCta: {
      headline: 'Give your members a portal worth opening.',
      subline: "Book a demo and we'll show it with your logo and colours.",
    },
  },
  {
    slug: 'booking-scheduling',
    name: 'Online Booking & Scheduling',
    icon: I.calendar,
    panelClassName: '',
    summary: 'Class timetable, bookings and waitlists.',
    headline: 'A timetable that fills itself.',
    subline:
      'Plan classes once, let members book online, and keep a waitlist for the full ones. Your team sees who is coming before the doors open.',
    highlights: ['Class timetable', 'Online booking', 'Waitlists', 'PT calendar'],
    features: [
      {
        icon: I.calendar,
        eyebrow: 'Timetable',
        headline: 'Build the week once.',
        body: 'Create class types with their capacity, length and colour, then place them on the schedule as one-off or repeating sessions across your branches.',
        bullets: [
          'Week and month calendar, plus a list view',
          'Filter by trainer or location',
          'Each session shows its time, coach, branch and how full it is',
        ],
      },
      {
        icon: I.members,
        eyebrow: 'Bookings',
        headline: 'See who booked, and who is waiting.',
        body: 'Open any session to see the booked members, book someone in from the desk, and let a waitlist pick up the spots when people cancel.',
        bullets: [
          'Roster per session',
          'Book a member in from the console',
          'Waitlist for full classes',
        ],
      },
      {
        icon: I.flame,
        eyebrow: 'Personal training',
        headline: 'One-to-one sessions on their own calendar.',
        body: 'Trainers have a PT calendar for their sessions, and members can book a trainer from the portal.',
        bullets: [
          'PT calendar per trainer',
          'Trainer booking in the member portal',
          'Session packs and credits tracked per member',
        ],
      },
    ],
    footerCta: {
      headline: 'Put your timetable online.',
      subline: "Book a demo and we'll load your classes into it.",
    },
  },
  {
    slug: 'reception-pos',
    name: 'Reception POS',
    icon: I.pos,
    panelClassName: '',
    summary: 'Front desk application: check-in and sales.',
    headline: 'The front desk, in one screen.',
    subline:
      'Sell memberships, packs, services and products, find the member, take the payment and check people in, all from the reception till.',
    highlights: ['Memberships & products', 'Member lookup', 'Check-in', 'End-of-day report'],
    features: [
      {
        icon: I.pos,
        eyebrow: 'Point of sale',
        headline: 'Sell a plan in three clicks.',
        body: 'Pick what is being sold, find the member by name or phone, and charge. The sale lands on the member and in the reports straight away.',
        bullets: [
          'Memberships, products, services and member tabs on one till',
          'Keyboard shortcuts for search and member lookup',
          'Cart-level discounts',
        ],
      },
      {
        icon: I.qr,
        eyebrow: 'Check-in',
        headline: 'Know who is in the building.',
        body: 'Check members in at the desk or by their QR, and every visit is recorded against the member and the branch.',
        bullets: [
          'Reception check-in from the console',
          'QR check-in from the portal and app',
          "Visits feed each member's activity",
        ],
      },
      {
        icon: I.chart,
        eyebrow: 'Closing the day',
        headline: 'Close the till without a spreadsheet.',
        body: 'A sales log of everything rung up today, and an end-of-day report when the shift is over.',
        bullets: ['Sales log per day', 'End-of-day report', 'Stock moves with every product sale'],
      },
    ],
    footerCta: {
      headline: 'Make the front desk faster.',
      subline: "Book a demo and we'll run a sale with you.",
    },
  },
  {
    slug: 'mobile-app',
    name: 'Mobile App',
    icon: I.phone,
    panelClassName: '',
    summary: 'White-label member app.',
    headline: 'Your gym on their home screen.',
    subline:
      'A white-label iOS and Android app for your members: the timetable, their plan, the shop and their check-in QR, one tap away.',
    highlights: ['White-label', 'iOS & Android', 'QR check-in', 'Class booking'],
    features: [
      {
        icon: I.calendar,
        eyebrow: 'Classes',
        headline: 'Booking that lives in their pocket.',
        body: 'Members browse classes, see the coach and the spots left, and book from the app.',
        bullets: ['Class schedule and class details', 'Trainer profiles', 'Services booking'],
      },
      {
        icon: I.qr,
        eyebrow: 'Check-in',
        headline: 'The QR is the middle button.',
        body: 'Check-in sits in the centre of the tab bar, so getting through the door takes one tap.',
        bullets: [
          'QR button in the tab bar',
          'Membership status on the home screen',
          'Light and dark mode',
        ],
      },
      {
        icon: I.card,
        eyebrow: 'Shop & billing',
        headline: 'Buy and manage, without the front desk.',
        body: 'Members shop your products, see their plan and handle billing in the app.',
        bullets: [
          'Shop with product pages',
          'Membership and billing screens',
          'Profile and settings',
        ],
      },
    ],
    footerCta: {
      headline: 'Put your gym on their phone.',
      subline: "Book a demo and we'll walk you through the app.",
    },
  },
  {
    slug: 'analytics-reporting',
    name: 'Analytics & Reporting',
    icon: I.chart,
    panelClassName: '',
    summary: 'Dashboards, retention data and reports.',
    headline: 'Numbers you can act on, not just read.',
    subline:
      'A live dashboard for today and ready-made reports for everything else: sales, members, revenue, products, classes and staff, each exportable to CSV or Excel.',
    highlights: ['Live dashboard', 'Ready-made reports', 'CSV & Excel export', 'Per branch'],
    features: [
      {
        icon: I.chart,
        eyebrow: 'Dashboard',
        headline: 'Your gym, the moment you sign in.',
        body: "Revenue, check-ins, new members, today's classes and who is in the building, for today, this week, this month or a custom range.",
        bullets: [
          'Revenue trend over 7 days, 30 days or 12 weeks',
          'Expiring memberships and renewals due',
          'Occupancy per branch, live',
        ],
      },
      {
        icon: I.members,
        eyebrow: 'Retention',
        headline: 'Know who needs you next.',
        body: 'Retention and engagement reports list the members whose renewal is due, whose plan is about to expire, and who have stopped turning up.',
        bullets: [
          'Membership, check-in and retention reports',
          'Members grouped by why they need attention',
          'Filter by date range and branch',
        ],
      },
      {
        icon: I.card,
        eyebrow: 'Sales & revenue',
        headline: 'Every sale, traced.',
        body: 'Sales transactions, plan performance, daily reconciliation, refunds and stock, with who sold what, how it was paid and at which branch.',
        bullets: [
          'Sales, revenue and product reports',
          'Class attendance, PT sessions and trainer reports',
          'Export any report to CSV or Excel',
        ],
      },
    ],
    footerCta: {
      headline: 'See your numbers properly.',
      subline: "Book a demo and we'll show you the reports with your data.",
    },
  },
  {
    slug: 'ai-assistant',
    name: 'AI Assistant',
    icon: I.spark,
    panelClassName: '',
    summary:
      'Answers questions, flags who needs attention and drafts messages, in Georgian and English.',
    headline: 'Ask your gym a question. Get a straight answer.',
    subline:
      'An assistant built into the console that answers questions about your gym, flags the members who need attention and drafts the messages to send them, in Georgian and English.',
    highlights: [
      'Answers questions',
      'Flags who needs attention',
      'Drafts messages',
      'Georgian & English',
    ],
    features: [
      {
        icon: I.spark,
        eyebrow: 'Answers',
        headline: 'Questions in, clear answers out.',
        body: 'Ask about your members, classes or sales and the assistant looks it up in your gym and answers with a table or a short summary.',
        bullets: [
          'Lists come back as tables, single records as a short summary',
          'Works with the same data as the console, within your role',
          'Chats are saved, so you can pick up where you left off',
        ],
      },
      {
        icon: I.members,
        eyebrow: 'Attention',
        headline: 'Know who needs you next.',
        body: 'Ask who has stopped turning up, whose renewal is due or whose plan is about to expire, and get the list of members to reach out to.',
        bullets: [
          'Members who have gone quiet',
          'Renewals due and plans about to expire',
          'Narrow it down by plan or branch',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Messages',
        headline: 'A first draft, ready to send.',
        body: 'Ask for a win-back note, a renewal reminder or a class announcement and the assistant drafts it for you to review before it goes out.',
        bullets: [
          'Drafts in Georgian or English, matching how you write to it',
          'You review and send, nothing goes out on its own',
          'Attach a file, like a price list, to draft from it',
        ],
      },
    ],
    footerCta: {
      headline: 'Ask it something about your gym.',
      subline: 'Book a demo and see the assistant answer with your own data.',
    },
  },
];

export const FEATURES: AudiencePage[] = INPUTS.map(page);

export function getFeature(slug: string): AudiencePage | undefined {
  return FEATURES.find((f) => f.slug === slug);
}
