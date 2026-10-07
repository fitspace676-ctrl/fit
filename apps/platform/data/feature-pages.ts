/* ────────────────────────────────────────────────────────────────────────
   Feature page copy (the /features/<slug> long-form pages)
   One record per feature, written by FormaCore. The design template reads
   only this shape, so a new feature is a new record here.
   ──────────────────────────────────────────────────────────────────────── */

export type FeatureBlock = {
  title: string;
  headline: string;
  body: string;
  bullets: string[];
};

export type FeaturePageCopy = {
  slug: string;
  eyebrow: string;
  /** Hero photo in /public, shown under a brand-colour overlay. */
  heroImage: string;
  headline: string;
  subline: string;
  intro: { headline: string; body: string };
  blocks: FeatureBlock[];
  plans?: ('Studio' | 'Club' | 'Core')[];
  plan: { eyebrow: string; headline: string; body: string };
  footerCta: { headline: string; subline: string };
};

export const FEATURE_PAGES: FeaturePageCopy[] = [
  {
    slug: 'member-portal',
    plans: ['Club', 'Core'],
    eyebrow: 'Member Portal',
    heroImage: '/features/member-portal-hero.webp',
    headline: "Your gym, open 24/7. Even when you're not.",
    subline:
      'A branded online portal where members buy memberships, book classes, manage their account, and handle payments entirely on their own. Less admin for your staff. More autonomy for your members.',
    intro: {
      headline: 'Self-service that actually serves your business.',
      body: "Every time a member calls to book a class, ask about their membership, or make a payment, that's time your staff spends on admin instead of people. The member portal gives members a place to handle all of it themselves, in your brand, on their schedule, without picking up the phone. Available anywhere online, on any device, at any time.",
    },
    blocks: [
      {
        title: 'Membership Management',
        headline: 'Members manage their membership. You manage your business.',
        body: 'Members have full control over their own membership - buying, upgrading, renewing, freezing, or cancelling directly from the portal without involving your staff. Every action updates instantly in the admin panel so your team always has the current picture.',
        bullets: [
          'Buy a new membership, upgrade, renew, freeze, or cancel - all self-service',
          'Membership status, renewal date, and plan details visible at all times',
          'Every membership action reflected instantly in the admin panel - no manual updates needed',
        ],
      },
      {
        title: 'Booking & Shop',
        headline: 'Book a class. Buy a session. No phone call needed.',
        body: 'Members browse the live schedule, book group classes or personal training sessions, join waitlists, cancel bookings, and purchase products all from one place. When a class fills up, the waitlist takes over. When a spot opens, the member is notified automatically.',
        bullets: [
          'Book group classes and PT sessions from the live schedule, cancel directly when plans change',
          'Join a waitlist when a class is full, confirmed automatically the moment a spot opens',
          'Browse and purchase products and services from the portal - every transaction logged automatically',
        ],
      },
      {
        title: 'Payments & Account',
        headline: 'Full control. Zero friction.',
        body: 'Members manage everything about their account from one place - payment method, card details, invoice history, and personal information. When they can see and control everything themselves, they trust the club more, and trust keeps members around.',
        bullets: [
          'Full payment management - view history, download invoices, update card details',
          'Personal details and profile information editable directly, no staff involvement needed',
          'Automatic payment reminders so renewals happen without anyone chasing anyone',
        ],
      },
      {
        title: 'Branded Experience',
        headline: 'Members see your club. Not the software behind it.',
        body: "The member portal reflects your gym's identity - your logo, your colors, your photos. Members interacting with your club online should feel like they're interacting with your club, not a generic platform.",
        bullets: [
          'Upload your logo, set your brand colors, and add your own photos to the portal homepage',
          'Consistent branded experience from first visit through to membership renewal',
          'Custom branding options available for clubs with specific identity requirements',
        ],
      },
    ],
    plan: {
      eyebrow: 'Available from Club',
      headline: 'Member Portal is included in Club and Core.',
      body: 'Upgrade from Studio to Club to give your members a fully branded self-service portal - reducing admin for your staff, opening a 24/7 sales channel, and giving members the autonomy that keeps them engaged.',
    },
    footerCta: {
      headline: 'Ready to give your members the portal they deserve?',
      subline:
        'Book a free demo and see exactly what the member experience looks like - from sign-up to booking to renewal.',
    },
  },
  {
    slug: 'booking-scheduling',
    plans: ['Club', 'Core'],
    eyebrow: 'Online Booking & Scheduling',
    heroImage: '/features/booking-scheduling-hero.webp',
    headline: 'More classes booked. Your schedule, always right.',
    subline:
      'Build your timetable once and let it run. Members book group classes, personal training, and facilities on their own, your schedule stays accurate in real time, without anyone managing it manually.',
    intro: {
      headline: "Scheduling that doesn't need a manager.",
      body: 'Most fitness businesses manage their schedule through spreadsheets, WhatsApp, and manual phone calls. Every change creates confusion, every cancellation creates a gap, and every full class means someone misses out. Online booking solves all of it - members self-serve, your timetable stays live, and your staff focuses on the people in front of them.',
    },
    blocks: [
      {
        title: 'Class Timetable',
        headline: 'One timetable. Built once. Always current.',
        body: "Set up your weekly schedule in the admin panel - group classes, personal training, and facility bookings - and it appears instantly across the member portal and mobile app. Each location runs its own independent schedule. Every change reflects in real time so members always see the right information wherever they're looking.",
        bullets: [
          'Set up group classes, PT sessions, and facility bookings in one place',
          'Each location has its own independent schedule, managed separately from the admin panel',
          'Every update reflects instantly across the member portal and mobile app, no manual syncing needed',
        ],
      },
      {
        title: 'Self-Service Booking',
        headline: 'Members book. Without involving your staff.',
        body: 'Members browse the live timetable, pick their session, and confirm their spot from the portal or the app, at any time. Booking confirmation goes out automatically. Reminders fire before the session. If they need to cancel, they do it themselves up to the cancellation window you set, and the spot is released instantly.',
        bullets: [
          'Members book group classes, PT sessions, and facilities directly from the portal or app',
          'Booking confirmation and class reminders sent automatically, no manual effort needed',
          'Members cancel within your defined window - spot released instantly, cancellation notice sent',
        ],
      },
      {
        title: 'Capacity & Waitlist',
        headline: 'Full class. No lost members.',
        body: "Set the capacity for every class and booking closes automatically when it's reached. Members who still want in join the waitlist, first come, first served. When a spot opens, the next person on the list is notified and has the option to confirm. No manual management, no missed opportunities.",
        bullets: [
          'Capacity set per class, booking closes automatically when the limit is reached',
          'Waitlist opens automatically when a class is full, members join in order',
          'Waitlisted members notified when a spot opens, first in line gets first option to confirm',
        ],
      },
      {
        title: 'Personal Training & Facilities',
        headline: 'Every session type. One system.',
        body: 'Personal training and facility bookings are managed in the same system as group classes - no separate process, no double-booking risk. Trainer availability is set in the admin panel, members only see open slots, and every booking is confirmed automatically.',
        bullets: [
          'PT sessions and facility bookings managed alongside group classes, one system for everything',
          "Trainer and facility availability set by admin, members only see what's available",
          'Confirmation and reminders sent automatically to everyone involved',
        ],
      },
    ],
    plan: {
      eyebrow: 'Included in every plan',
      headline: 'Scheduling in every plan. Self-service booking from Club.',
      body: 'The Studio plan gives you full class and PT scheduling in the admin panel. Upgrade to Club to unlock self-service booking for members via the member portal and mobile app, reducing the manual work it takes to keep your schedule full.',
    },
    footerCta: {
      headline: 'Ready to fill your classes without the back-and-forth?',
      subline: 'Book a free demo and see how online booking and scheduling works from end to end.',
    },
  },
  {
    slug: 'reception-pos',
    plans: ['Studio', 'Club', 'Core'],
    eyebrow: 'Reception POS',
    heroImage: '/features/reception-pos-hero.webp',
    headline: 'Everything your front desk needs. One screen.',
    subline:
      'Check members in, process payments, sell products, register new members, and manage walk-ins, all from a single application at the front desk. Fast, simple, and connected to everything in your admin panel.',
    intro: {
      headline: 'The front desk, finally organised.',
      body: "Your reception is where first impressions happen and where the day's operational chaos usually lives. The Reception POS brings order to it - giving your front desk staff one screen to handle every interaction, from a member checking in to a walk-in buying a day pass, with every transaction logged automatically and visible across the entire platform.",
    },
    blocks: [
      {
        title: 'Member Check-in',
        headline: 'Every arrival logged. No clipboard needed.',
        body: 'Check members in manually by searching from the front desk, or let them scan their QR code directly. Either way, membership status and payment standing are visible instantly, so your staff always has the full picture before they say hello, and members with outstanding payments are flagged before they walk through the door.',
        bullets: [
          'Manual check-in by searching the member from the front desk, confirmed in one tap',
          'QR code scan via the member app, faster check-in with no staff interaction needed',
          'Membership status and overdue payments visible instantly, no guessing, no awkward moments',
        ],
      },
      {
        title: 'Sales & Walk-ins',
        headline: 'Turn a walk-in into a member. On the spot.',
        body: 'A new person walks through the door. Your receptionist creates their profile, sells them a membership, processes the payment, and activates their access - all from the POS, in just a few minutes. Cash, card, or online payment link, whichever works for the client.',
        bullets: [
          'Sell memberships, day passes, products, and services from one screen',
          'Create a new member profile and activate their membership on the spot',
          'Accept cash, card, or online payment link, every transaction logged automatically',
        ],
      },
      {
        title: 'Connected to Everything',
        headline: 'Every transaction. Everywhere it needs to be.',
        body: "Nothing processed at the front desk lives in isolation. Every sale, every check-in, every new membership is tied to the member's profile and visible in the admin panel, in your reports, and in the member's own transaction history in the portal and app. One transaction, complete visibility across the whole platform.",
        bullets: [
          "Every POS transaction tied to the member's profile automatically, no manual logging",
          'Transactions visible to staff in the admin panel and to members in their portal and app',
          'Sales feed directly into your revenue reports, front desk and online payments in one place',
        ],
      },
      {
        title: 'Product & Service Sales',
        headline: 'Sell anything. Every sale tracked.',
        body: "Protein shakes, supplements, merchandise, personal training sessions - sell any product or service from the front desk with every transaction tied back to your inventory and sales reports automatically. Stock levels update with every sale so you always know what's running low.",
        bullets: [
          'Sell any product or service alongside memberships and day passes from one screen',
          'Every sale logged against inventory, stock levels updated automatically',
          'Full product sales history visible in your admin reports alongside membership revenue',
        ],
      },
    ],
    plan: {
      eyebrow: 'Included in every plan',
      headline: 'Reception POS is included in every plan.',
      body: 'Every plan - Studio, Club, and Core - includes full access to the Reception POS. Member check-in, walk-in sales, new member registration, and product sales are available from day one.',
    },
    footerCta: {
      headline: 'Ready to give your front desk the tool it actually needs?',
      subline:
        'Book a free demo and see the Reception POS in action, from check-in to sale to report.',
    },
  },
  {
    slug: 'mobile-app',
    plans: ['Club', 'Core'],
    eyebrow: 'Mobile App',
    heroImage: '/features/mobile-app-hero.webp',
    headline: 'Your brand in their pocket. Every single day.',
    subline:
      "A fully white-labeled mobile app published under your gym's name on the App Store and Google Play. Members book classes, check in, manage their account, and shop - all in your brand, on their phone, wherever they are.",
    intro: {
      headline: 'Your gym, on their phone. Under your name.',
      body: "Most gym software gives members a generic app with the platform's branding on it. This is different - a fully white-labeled mobile application published under your gym's name. Members search for your club, download your app, and open your brand every time they use it. That daily presence is the retention tool most gyms don't have.",
    },
    blocks: [
      {
        title: 'Your Brand',
        headline: 'Your logo. Your colors. Your name on the app store.',
        body: "The app is published under your gym's name on the App Store and Google Play. Your logo, your brand colors, and your name across every screen. Class and session images customized to match your identity. Members never see the platform behind it - they see your club.",
        bullets: [
          "Published under your gym's name on the App Store and Google Play",
          'Your logo, colors, and brand identity applied throughout the app',
          'Class and session images customisable so every screen feels like your club',
        ],
      },
      {
        title: 'Booking and Check-in',
        headline: 'Book a class. Walk through the door. No queue.',
        body: 'Members open the app, see the live schedule, and book their spot in seconds. When they arrive, they generate a QR code and scan it at the door. Eligibility checked instantly, access granted. Members with outstanding payments are blocked automatically before they reach reception.',
        bullets: [
          'Live class schedule bookable directly from the app in seconds',
          'QR code generated from the app and scanned at the door for instant check-in',
          'Members with overdue payments blocked automatically, no staff conversation needed',
        ],
      },
      {
        title: 'Payments and Shop',
        headline: 'Pay, buy, and manage. All from one place.',
        body: 'Members handle payments, browse the shop, and manage their account without calling or visiting reception. Every transaction tied to their profile and visible in their history. Your front desk handles people, not admin.',
        bullets: [
          'Members pay for sessions, products, and services directly from the app',
          'Full shop available in the app, every purchase logged to their member profile automatically',
          'Payment history visible to both the member and your admin team in real time',
        ],
      },
      {
        title: 'Push Notifications',
        headline: 'Stay in their mind between visits.',
        body: 'The members who stay longest are the ones who feel connected to your club between sessions. Push notifications keep that connection alive - booking reminders, class updates, re-engagement messages, and club news, sent at the right moment without anyone on your team pressing send.',
        bullets: [
          'Booking confirmations and class reminders sent automatically via push notification',
          "Re-engagement notifications fire when a member's visit pattern drops",
          'Club updates and announcements pushed to all members or specific groups instantly',
        ],
      },
      {
        title: 'Multi-location',
        headline: 'Their home location. Every location when they need it.',
        body: 'Members are assigned to their main location and see its schedule by default. When they want to visit another site, they switch location in the app and see that schedule instantly. Simple, clean, and never confusing.',
        bullets: [
          'Members assigned to a home location, relevant schedule shown by default',
          'Switch to any other location in the app to view its schedule and available sessions',
          "Each location's availability and classes managed independently from the admin panel",
        ],
      },
    ],
    plan: {
      eyebrow: 'Available from Club',
      headline: 'The mobile app is included in Club and Core.',
      body: 'Upgrade from Studio to Club to give your members a fully branded mobile app. Your club in their pocket, your brand on their screen, every single day.',
    },
    footerCta: {
      headline: "Ready to put your brand in your members' pockets?",
      subline:
        'Book a free demo and see exactly what the member app experience looks like from download to check-in.',
    },
  },
  {
    slug: 'analytics-reporting',
    plans: ['Studio', 'Club', 'Core'],
    eyebrow: 'Analytics & Reporting',
    heroImage: '/features/analytics-reporting-hero.webp',
    headline: 'Your business in numbers. Right now.',
    subline:
      "Live data across every part of your operation, updated in real time. Know what's happening before it becomes a problem, and make every decision based on facts, not gut feeling.",
    intro: {
      headline: 'Stop running your business on gut feeling.',
      body: "Most fitness business owners find out about a retention problem when members have already left. They discover a revenue issue when the month closes. They learn which classes aren't working when attendance has already dropped. Analytics and reporting gives you that information in real time, so every decision is based on what's actually happening, not what you hope is happening.",
    },
    blocks: [
      {
        title: 'Live Dashboard',
        headline: 'The numbers that matter. The moment you log in.',
        body: 'Open the admin panel and see your business. Active members, revenue, class performance, and at-risk members, all updated in real time. No report to run, no export to wait for - just the current state of your business, always visible.',
        bullets: [
          'Active member count, revenue, and class fill rates visible from the dashboard in real time',
          'At-risk members surfaced automatically as attendance patterns change',
          'Every metric compared to the previous period so trends are visible at a glance',
        ],
      },
      {
        title: 'Reports',
        headline: 'Every part of your business. One report at a time.',
        body: 'Pre-built reports covering everything - revenue, members, classes, payments, staff, and inventory. Each one accessible in the admin panel, exportable to CSV and Excel, and schedulable so the reports you need arrive automatically without anyone having to pull them manually.',
        bullets: [
          'Pre-built reports covering revenue, members, classes, payments, staff, and inventory',
          'Export any report to CSV or Excel for further analysis or sharing',
          'Schedule chosen reports to run and deliver automatically so nothing gets missed',
        ],
      },
      {
        title: 'Access and Permissions',
        headline: 'The right data to the right people.',
        body: "Admins see everything. Staff see what their role allows. A trainer sees their class performance. A receptionist sees member check-ins and payments. A manager sees the reports relevant to their work. Everyone has the visibility they need, and nothing they don't.",
        bullets: [
          'Admin access gives full visibility across every metric and report',
          'Staff access controlled by role and permissions set in the admin panel',
          'Each team member sees only the data relevant to their responsibilities',
        ],
      },
      {
        title: 'AI-powered Reporting',
        headline: 'Prefer to just ask, instead of building a report?',
        body: 'On the Core plan, the AI Assistant sits on top of these same analytics - ask a plain-language question and get an answer, no report to build. See the AI Assistant page for the full picture.',
        bullets: [
          'Ask a question about your business data instead of building a report',
          'Available exclusively on the Core plan, as part of the AI Assistant',
        ],
      },
    ],
    plan: {
      eyebrow: 'Available in all plans',
      headline: 'Dashboard in every plan. Full reporting from Club. AI reporting in Core.',
      body: 'Every plan includes the live analytics dashboard. Upgrade to Club for the full pre-built report library with scheduling and export. Upgrade to Core to unlock AI-powered custom reporting through the AI Assistant.',
    },
    footerCta: {
      headline: 'Ready to run your business on real numbers?',
      subline: "Book a free demo and see exactly what you'll be able to see from day one.",
    },
  },
  {
    slug: 'ai-assistant',
    plans: ['Core'],
    eyebrow: 'AI Assistant',
    heroImage: '/features/ai-assistant-hero.webp',
    headline: 'Ask your business anything. Get an answer right away.',
    subline:
      "Ask questions about your business, get instant answers in plain language. Spot problems before they escalate, understand what's driving your numbers, and get specific suggestions on what to do next - without digging through reports.",
    intro: {
      headline: "The insight you'd pay a business analyst for. Built in.",
      body: "Most gym owners don't have time to dig through reports, cross-reference data, or spot patterns across hundreds of members. The AI Assistant does that work for you - answering questions about your business in plain language, flagging things worth your attention, and helping you understand what's actually happening and what to do about it. It doesn't take actions on your behalf. It gives you the clarity to take the right ones yourself.",
    },
    blocks: [
      {
        title: 'Ask Anything',
        headline: 'Ask your business a question. Get a real answer.',
        body: 'Instead of running a report, pulling a filter, and interpreting a table, just ask. The AI Assistant understands your business data, your member history, and your revenue history, and answers in plain language - in English or Georgian, whichever you prefer.',
        bullets: [
          'Ask any question about your members, revenue, classes, or performance in plain language',
          'Answers returned instantly based on your live business data and full history',
          'Available in English and Georgian so your whole team can use it comfortably',
        ],
      },
      {
        title: 'Business Insight',
        headline: "Know what's happening. And why.",
        body: "The AI Assistant doesn't just answer what you ask - it understands the context behind your numbers. Revenue dropped this week - is it a class cancellation, a payment issue, or a retention problem? Ask the question, get the explanation, not just the number.",
        bullets: [
          'Ask follow-up questions to go deeper into any answer without starting over',
          'Context-aware responses that connect member behaviour, class performance, and revenue together',
          'Full access to your business history and industry context to give answers that actually make sense',
        ],
      },
      {
        title: 'Suggestions',
        headline: 'Not just data. What to do with it.',
        body: 'When you ask for a recommendation, the AI Assistant suggests specific actions based on what your data shows - which members to re-engage, which class to adjust, which revenue opportunity to act on. The suggestions are yours to evaluate and execute. The AI gives you the direction, you make the call.',
        bullets: [
          'Ask for recommendations and get specific suggested actions based on your actual data',
          'Suggestions are advisory - you review them and decide what to act on',
          'Access to suggestions controlled by staff role and permissions in the admin panel',
        ],
      },
      {
        title: 'Access and Permissions',
        headline: 'The right people have the right conversations.',
        body: 'Access to the AI Assistant is controlled by role and permissions, the same way every other part of the admin panel works. The people who should be making data-driven decisions have access to the tool that helps them do it.',
        bullets: [
          'AI Assistant access assigned by role and permissions in the admin panel',
          'Each team member sees only what their access level allows',
          'Available in English and Georgian so the whole team can engage with it naturally',
        ],
      },
    ],
    plan: {
      eyebrow: 'Available in Core',
      headline: 'The AI Assistant is a Core plan feature.',
      body: 'The AI Assistant is included exclusively in the Core plan, giving serious operators the intelligence layer to run a data-driven business without the overhead of a dedicated analyst.',
    },
    footerCta: {
      headline: 'Ready to run a smarter business?',
      subline:
        'Book a free demo and see the AI Assistant in action. Ask it a question about your business from day one.',
    },
  },
];

export function getFeaturePage(slug: string): FeaturePageCopy | undefined {
  return FEATURE_PAGES.find((p) => p.slug === slug);
}
