import { I } from '@/components/marketing/icons';

/* ────────────────────────────────────────────────────────────────────────
   "Built For" - audience data (single source of truth)
   This one file feeds BOTH:
     • the landing page's "Built for how you actually run" tabs (which read only
       eyebrow / headline / subline / stats / panelClassName), and
     • the dedicated per-audience pages at /built-for/<slug> + the nav dropdown.

   Hero / footer CTA buttons are fixed in the page template (Book a free demo →
   demo modal, See pricing / See all plans → /pricing), so they aren't stored
   here. Keep every `slug` unique.
   ──────────────────────────────────────────────────────────────────────── */

export type Stat = { value: string; label: string };

/** One marketed capability block - eyebrow, headline, body and supporting bullets. */
export type Feature = {
  /** Icon path key from the shared `I` set. */
  icon: string;
  eyebrow: string;
  headline: string;
  body: string;
  bullets: string[];
};

export type AudiencePage = {
  /** URL slug → /built-for/<slug>. Also used as the AnimatedTabs key (`value`). */
  slug: string;
  /** AnimatedTab key - kept equal to `slug`. */
  value: string;
  /** Plain audience name, e.g. "Fitness Clubs". */
  name: string;
  /** AnimatedTab label - kept equal to `name`. */
  title: string;
  /** Label shown in the "Built For" nav dropdown, e.g. "For Fitness Clubs". */
  navLabel: string;
  /** Short uppercase eyebrow. */
  eyebrow: string;
  /** Icon path key from the shared `I` set. */
  icon: string;
  /** Optional raster icon (in /public) used instead of `icon` for the watermark. */
  iconImage?: string;
  /** Tailwind gradient stops for the hero panel background. */
  panelClassName: string;
  headline: string;
  subline: string;
  stats: Stat[];
  /** The marketed feature blocks, rendered as alternating rows. */
  features: Feature[];
  /** Optional "recommended plan" highlight band. */
  planRecommendation?: { eyebrow: string; headline: string; body: string };
  /** Closing CTA band copy. */
  footerCta: { headline: string; subline: string };
};

export const BUILT_FOR: AudiencePage[] = [
  {
    slug: 'fitness-clubs',
    value: 'fitness-clubs',
    name: 'Fitness Clubs',
    title: 'Fitness Clubs',
    navLabel: 'For Fitness Clubs',
    eyebrow: 'Fitness Clubs',
    icon: I.members,
    panelClassName: 'from-violet-700 to-indigo-950',
    headline: "Most members quit within 90 days. Here's how you keep them.",
    subline:
      "Retention is the real business of running a fitness club. Get the visibility, tools, and automation to spot who's at risk, re-engage them before they leave, and build a club that members actually stay in.",
    stats: [
      { value: '90 days', label: 'when most members decide to quit or stay' },
      { value: '5×', label: 'cheaper to retain a member than acquire a new one' },
      { value: '67%', label: 'of gym revenue comes from existing members' },
      { value: '0', label: 'spreadsheets needed to track any of it' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: "Know who's about to leave - before they do.",
        body: "Every member has a pattern. When they stop showing up, their membership is the next thing they cancel. Track attendance, engagement, and payment history in real time so you always know who's drifting - and still have time to act.",
        bullets: [
          'At-risk members flagged automatically when attendance drops or visits go cold',
          'Full profile per member showing visit frequency, membership history, and payment status',
          'See your entire member base by engagement level, not just alphabetical order',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'The staff member that never stops following up.',
        body: 'Most gyms lose members silently - no follow-up, no check-in, no reason to come back. The right message goes out at the right moment, every time, without anyone on your team having to remember to do it.',
        bullets: [
          "Reach out automatically when a member hasn't visited in 7, 14, or 30 days",
          'Renewal reminders go out before memberships expire - not after members have already left',
          'Birthday messages, class reminders, win-back campaigns - all running in the background via SMS, email, and push notification',
        ],
      },
      {
        icon: I.chart,
        eyebrow: 'Analytics & Reporting',
        headline: 'Your retention rate. Right now. Not at the end of the month.',
        body: "Most gym owners find out they have a retention problem when it's already too late. Get the numbers that matter - churn rate, average member lifespan, visit frequency, class fill rates - so every decision is based on data, not instinct.",
        bullets: [
          'Live retention and churn tracking so problems surface early, not after members are gone',
          'Class performance data - see which sessions fill up and which ones push members away',
          'Month-on-month revenue and membership trends in one dashboard',
        ],
      },
      {
        icon: I.phone,
        eyebrow: 'Member Portal & Mobile App',
        headline: 'Your brand in their pocket. Every single day.',
        body: 'Members who can see their schedule, book their next class, and manage their membership from their phone are far more likely to stay. Give your club a fully branded member portal and white-label mobile app - so your gym is always one tap away.',
        bullets: [
          'Members book classes, manage their membership, and pay - without calling or messaging your staff',
          "Your logo, your colors, your name on the app - nobody else's",
          'Push notifications keep your members engaged and coming back between visits',
        ],
      },
      {
        icon: I.qr,
        eyebrow: 'Check-in',
        headline: 'Every visit tracked. Every absence noticed.',
        body: "Check-in isn't just access control - it's your most important retention data. Every scan tells you who's active, who's slowing down, and who hasn't been in for three weeks. Turn the front door into a live attendance feed.",
        bullets: [
          'QR code check-in via the mobile app, or receptionist check-in from the admin panel',
          "Live arrivals stream so your team always knows who's in the building",
          "Absence patterns flagged automatically - re-engagement workflows fire before it's too late",
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'The clubs that keep members longest are on Growth.',
      body: 'The Growth plan adds the member portal and mobile app to everything in Starter - giving your members a reason to stay connected to your club between visits. That daily touchpoint is what separates the clubs with 85% retention from the ones at 60%.',
    },
    footerCta: {
      headline: 'Ready to stop losing members you worked hard to get?',
      subline:
        "Book a free demo - we'll show you exactly how to retain more members, month after month.",
    },
  },
  {
    slug: 'training-studios',
    value: 'training-studios',
    name: 'Training Studios',
    title: 'Training Studios',
    navLabel: 'For Training Studios',
    eyebrow: 'Training Studios',
    icon: I.flame,
    panelClassName: 'from-fuchsia-700 to-purple-950',
    headline: 'Small studio. Every member matters.',
    subline:
      "Training studios run on personal relationships. When a member starts drifting, you need to know before they've already decided to leave. Stay close to every member - even as your studio grows.",
    stats: [
      { value: '84', label: 'members - every one tracked individually' },
      { value: '14', label: 'days before a drift becomes a cancellation' },
      { value: '3×', label: 'more likely to stay when personally re-engaged' },
      { value: '0', label: 'members should slip through unnoticed' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: 'No member invisible.',
        body: 'In a small studio, every member expects to feel known. Give your staff a full picture of each person - visits, payments, notes, history - so nobody ever feels like just a number.',
        bullets: [
          'Full member profiles with visit frequency, session history, and personal notes',
          'At-risk flagging when attendance drops - staff notified before the member decides to leave',
          'See your entire member base sorted by engagement, not just name',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'The personal follow-up. At scale.',
        body: "You can't personally check in on every member every week. The right message goes out at the right moment so every member feels seen - even when you're busy running sessions.",
        bullets: [
          "Automatic outreach when a member hasn't visited in 7, 14, or 30 days",
          "Renewal reminders before memberships lapse - sent in your studio's voice, not a generic template",
          "Re-engagement campaigns for members who've gone quiet - via SMS, email, and push notification",
        ],
      },
      {
        icon: I.chart,
        eyebrow: 'Analytics',
        headline: 'Know your retention rate before it becomes a problem.',
        body: "Small studios often don't realise they have a churn problem until revenue drops. Get retention data in real time so you can act on it - not react to it.",
        bullets: [
          'Live retention and churn rate visible from the dashboard - updated daily',
          "Member engagement scores so you always know who's thriving and who's at risk",
          'Month-on-month membership trends to spot patterns before they become problems',
        ],
      },
      {
        icon: I.phone,
        eyebrow: 'Member Portal & Mobile App',
        headline: 'Easy to book. Hard to quit.',
        body: 'Members who can book their next session in two taps are far more likely to keep coming. Give your studio a branded member portal and mobile app - so the barrier to showing up is as low as possible.',
        bullets: [
          'Members book and cancel sessions directly from their phone - no WhatsApp needed',
          'Your branding on the app - your studio name, your colors, your identity',
          'Push notifications remind members about upcoming sessions and keep your studio top of mind',
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'Most training studios start with Growth.',
      body: 'The Growth plan adds the member portal and mobile app to everything in Starter - reducing friction for members and giving you the retention tools that small studios need most.',
    },
    footerCta: {
      headline: "Ready to keep every member you've worked hard to attract?",
      subline: 'Book a free demo and see how to retain more members, month after month.',
    },
  },
  {
    slug: 'yoga-studios',
    value: 'yoga-studios',
    name: 'Yoga Studios',
    title: 'Yoga Studios',
    navLabel: 'For Yoga Studios',
    eyebrow: 'Yoga Studios',
    icon: I.stretching,
    panelClassName: 'from-purple-700 to-violet-950',
    headline: 'The habit is fragile. We make sure nothing breaks it.',
    subline:
      "Your members come for the practice. They stay because of the routine. Protect that routine - removing every friction point that could interrupt a member's habit before it becomes permanent.",
    stats: [
      { value: '21', label: "days to form a yoga habit - don't let it break" },
      { value: '3×', label: 'more likely to renew when habit is uninterrupted' },
      { value: '2', label: 'taps to rebook a class from the member app' },
      { value: '0', label: 'missed renewal reminders with automation on' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: "See whose habit is breaking - before it's broken.",
        body: "A yoga member who misses two classes in a row is at risk. Three in a row and the habit is gone. Track every member's attendance pattern so you can spot the early signs and act before it's too late.",
        bullets: [
          'Attendance patterns tracked per member - flagged automatically when sessions are missed',
          'Full member profile showing class history, membership plan, and engagement trend',
          'At-risk members surfaced daily so your team knows exactly who needs a nudge',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'The follow-up that keeps the habit alive.',
        body: "When a member misses their usual class, a well-timed message can bring them back. It goes out automatically - in your studio's tone, at exactly the right moment - before the gap becomes a goodbye.",
        bullets: [
          'Automatic re-engagement when a member misses their usual class slot',
          'Renewal reminders sent before memberships lapse - so the habit never gets interrupted by an admin gap',
          'Birthday messages and milestone celebrations that make members feel the studio knows them',
        ],
      },
      {
        icon: I.calendar,
        eyebrow: 'Class Scheduling',
        headline: 'Their usual spot. Always available.',
        body: 'Yoga members build habits around specific classes and times. When their usual slot fills up without warning, the habit breaks. Keep your timetable accurate in real time - across the app, portal, and admin panel simultaneously.',
        bullets: [
          'Members book their regular slot from the app in seconds - no calling, no waiting',
          'Waitlist fills automatically when a spot opens - member notified instantly',
          'Schedule changes reflected in real time across every surface so members are never caught off guard',
        ],
      },
      {
        icon: I.phone,
        eyebrow: 'Member Portal & Mobile App',
        headline: 'Your studio in their pocket. Every morning.',
        body: 'Members who see your studio on their phone every day are far more likely to keep showing up. A branded member app keeps your yoga studio top of mind - before, during, and between sessions.',
        bullets: [
          'Members book classes, manage their membership, and pay - without calling or messaging',
          "Your name and branding on the app - nobody else's",
          "Push notifications remind members about their next class and re-engage when they've been absent",
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'Yoga studios that retain best are on Growth.',
      body: 'The member portal and mobile app in the Growth plan are what make the habit stick. Easy rebooking, push reminders, and self-service membership management - all the friction points that break habits, removed.',
    },
    footerCta: {
      headline: 'Ready to protect the habits your members are building?',
      subline:
        'Book a free demo and see how to keep yoga studio members coming back, class after class.',
    },
  },
  {
    slug: 'pilates-studios',
    value: 'pilates-studios',
    name: 'Pilates Studios',
    title: 'Pilates Studios',
    navLabel: 'For Pilates Studios',
    eyebrow: 'Pilates Studios',
    icon: I.stretching2,
    panelClassName: 'from-indigo-700 to-violet-950',
    headline: "They came for results. Show them they're getting them.",
    subline:
      "Pilates members are goal-driven. They signed up to feel stronger, move better, recover faster. When they can't see their progress - or feel like the studio has stopped paying attention - they leave. Make progress visible and keep every member engaged.",
    stats: [
      {
        value: '47',
        label: 'sessions - the milestone that separates committed members from churned ones',
      },
      { value: '16', label: 'days without a visit before a Pilates member mentally quits' },
      { value: '3×', label: 'more likely to stay when they can see their own progress' },
      { value: '0', label: 'sessions should go untracked' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: 'Progress tracked. Every session. Every member.',
        body: 'Pilates retention lives in the detail. How many sessions has this member done? Are they coming as often as they used to? Give your staff the full picture - so they can celebrate milestones and catch the members who are quietly fading.',
        bullets: [
          'Full session history per member - total count, frequency, and trend over time',
          'At-risk flagging when visit frequency drops below their usual pattern',
          'Staff notes on each member so every instructor knows the context before a session',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'Milestone moments that make members feel seen.',
        body: 'A message that says "you\'ve just completed your 50th session" lands differently than a generic renewal reminder. Acknowledge progress automatically - so every member feels the studio is paying attention.',
        bullets: [
          'Milestone automations - triggered at session counts that matter to your members',
          'Re-engagement messages when visit frequency drops - sent before the gap becomes a break',
          'Renewal reminders timed perfectly so memberships never lapse mid-programme',
        ],
      },
      {
        icon: I.qr,
        eyebrow: 'Check-in & Attendance',
        headline: 'Every session logged. Every absence noticed.',
        body: "Check-in isn't just access - it's your attendance data. Every scan builds the picture of each member's engagement, so you always know who's progressing and who's slowing down before they stop entirely.",
        bullets: [
          'QR code or receptionist check-in - every session recorded automatically',
          "Absence patterns surfaced in real time - flagged when a member's rhythm breaks",
          'Attendance data feeding directly into member profiles and retention reports',
        ],
      },
      {
        icon: I.phone,
        eyebrow: 'Member Portal & Mobile App',
        headline: 'Booking their next session should take seconds.',
        body: 'Pilates members who can book their next reformer slot from their phone are far more likely to keep coming. Remove the friction, protect the commitment.',
        bullets: [
          'Members book sessions, view their history, and manage their membership from the app',
          "Your studio's branding on every screen - nobody else's",
          'Automated reminders before sessions so members never forget a booking',
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'Pilates studios that retain best are on Growth.',
      body: "The Growth plan's member portal and app give your members visibility into their own progress - and make rebooking effortless. That combination keeps goal-driven members engaged long after the first few sessions.",
    },
    footerCta: {
      headline: "Ready to show your members the progress they're making?",
      subline:
        'Book a free demo and see how to keep Pilates members committed, session after session.',
    },
  },
  {
    slug: 'crossfit',
    value: 'crossfit',
    name: 'CrossFit',
    title: 'CrossFit',
    navLabel: 'For CrossFit',
    eyebrow: 'CrossFit',
    icon: I.barbell,
    panelClassName: 'from-blue-700 to-indigo-950',
    headline: 'The workout brings them in. The community keeps them.',
    subline:
      'CrossFit retention is community retention. When athletes miss a few WODs and feel disconnected from the box, they drift. Stay close to every athlete - so nobody quietly disappears from the whiteboard.',
    stats: [
      { value: '4', label: 'missed WODs before an athlete feels disconnected from the community' },
      { value: '5×', label: 'cheaper to re-engage a drifting athlete than recruit a new one' },
      { value: '94%', label: 'class fill rate when scheduling and booking run smoothly' },
      { value: '0', label: 'athletes should go missing without your team knowing' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: 'Nobody disappears from the whiteboard unnoticed.',
        body: "In a CrossFit box, you know your regulars. But as your membership grows, it gets harder to notice who's been missing. Track every athlete's attendance pattern and flag the ones who are drifting - before they've mentally left.",
        bullets: [
          'Attendance tracked per athlete - flagged automatically when WODs are missed consecutively',
          'Full member profile with visit history, membership plan, and payment status',
          'At-risk athletes surfaced daily so your coaches can follow up personally',
        ],
      },
      {
        icon: I.calendar,
        eyebrow: 'Class Scheduling & Booking',
        headline: 'Full classes. Every time slot.',
        body: 'CrossFit boxes live on class fill rates. Keep your WOD schedule running at capacity - with self-service booking, automatic waitlists, and real-time updates across the member app.',
        bullets: [
          'Athletes book WODs from the app in seconds - no WhatsApp group booking needed',
          'Automatic waitlist management when slots fill up - athletes notified instantly',
          'Class fill rates visible in your analytics so you know which slots to add or drop',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'Re-engage before the community connection breaks.',
        body: 'An athlete who misses four WODs in a row needs a reason to come back. The right message goes out at the right moment - before the gap becomes permanent and the community bond is gone.',
        bullets: [
          'Automatic re-engagement when an athlete misses their usual class pattern',
          'Renewal reminders before memberships expire - so no athlete loses access mid-cycle',
          "Win-back campaigns for athletes who've gone completely quiet - via SMS, email, and push",
        ],
      },
      {
        icon: I.qr,
        eyebrow: 'Check-in',
        headline: 'Every arrival tracked. Every absence flagged.',
        body: "QR check-in at the door gives you the attendance data that drives your retention strategy. Every scan updates the athlete's profile, feeds into your analytics, and triggers re-engagement when patterns break.",
        bullets: [
          'QR code check-in via the member app - athletes are through the door before the warm-up starts',
          'Receptionist check-in from the admin panel for walk-ins and open gym sessions',
          'Consecutive absences flagged automatically - re-engagement workflow triggered without manual effort',
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'CrossFit boxes that retain best are on Growth.',
      body: 'The Growth plan gives your athletes a branded app to book WODs, track their membership, and stay connected to your box between sessions. That daily touchpoint is what keeps the community alive.',
    },
    footerCta: {
      headline: 'Ready to keep every athlete on the whiteboard?',
      subline:
        'Book a free demo and see how to keep CrossFit athletes coming back, month after month.',
    },
  },
  {
    slug: 'martial-arts',
    value: 'martial-arts',
    name: 'Martial Arts',
    title: 'Martial Arts',
    navLabel: 'For Martial Arts',
    eyebrow: 'Martial Arts',
    icon: I.karate,
    panelClassName: 'from-pink-700 to-fuchsia-950',
    headline: 'Every student is on a journey. Make sure nothing stops them mid-way.',
    subline:
      "Martial arts retention is built on progression. Students stay because they're working toward something - their next belt, their next grading, their next level. Keep that journey on track and make sure no student quietly drops out between milestones.",
    stats: [
      { value: '21', label: 'days - the dropout window between gradings' },
      { value: '3×', label: 'higher retention when progression is actively tracked' },
      { value: '8', label: 'days average notice before grading - reminder automation fires' },
      { value: '0', label: 'students should lapse mid-programme' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: "Track every student's journey - belt by belt.",
        body: "Martial arts academies need more than a member list. You need to know where each student is in their progression, when they last trained, and whether they're on track for their next grading. Get all of that in one profile.",
        bullets: [
          'Member profiles with custom notes for belt level, discipline, and progression stage',
          'Attendance tracked per student - flagged when training frequency drops below their usual pattern',
          'At-risk students surfaced so instructors can follow up before they drop out between gradings',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'Grading reminders. Renewal timing. Never missed.',
        body: 'The riskiest moments in martial arts retention are between gradings and at membership renewal. Automate both - so students are always prepared and memberships never lapse at the worst possible time.',
        bullets: [
          'Grading reminders sent automatically to students and parents in the lead-up to assessment',
          'Membership renewals timed around the grading cycle - so no student loses access before their belt test',
          "Re-engagement automation for students who've gone quiet - bringing them back before they fully disconnect",
        ],
      },
      {
        icon: I.calendar,
        eyebrow: 'Class Scheduling',
        headline: 'Classes by discipline. Level. Age group.',
        body: 'Martial arts academies run complex schedules - multiple disciplines, skill levels, age groups, and instructors. Keep it all organised without the administrative overhead.',
        bullets: [
          'Set up classes by discipline, level, and age group - no scheduling conflicts',
          'Students and parents book classes from the member app or portal without calling',
          'Automatic confirmation and reminders so students are always prepared and present',
        ],
      },
      {
        icon: I.card,
        eyebrow: 'Billing & Payments',
        headline: 'Get paid. Without the chase.',
        body: 'Membership fees, grading fees, equipment - handle one-time and recurring payments online and at the desk, with automated follow-up when payments are overdue.',
        bullets: [
          'Recurring membership billing processed automatically - online or at the front desk',
          'Overdue payments flagged instantly with automated follow-up messages sent without manual effort',
          'Full payment history per student so you always know exactly where every account stands',
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'Most martial arts academies start with Starter.',
      body: "The Starter plan gives you everything you need to manage students, track progression, schedule classes, and run billing - all in one place. Upgrade to Growth when you're ready to give students and parents a self-service portal and mobile app.",
    },
    footerCta: {
      headline: 'Ready to keep every student on the path to their next belt?',
      subline: 'Book a free demo and see how to retain more students, grading after grading.',
    },
  },
  {
    slug: 'swimming-schools',
    value: 'swimming-schools',
    name: 'Swimming Schools',
    title: 'Swimming Schools',
    navLabel: 'For Swimming Schools',
    eyebrow: 'Swimming Schools',
    icon: I.swimming,
    panelClassName: 'from-sky-700 to-blue-950',
    headline: 'Parents pay. Kids swim. Progress keeps both coming back.',
    subline:
      'In a swimming school, the parent is the buyer and the child is the student. Retention depends on one thing - parents believing their child is progressing. Give your team the tools to communicate that progress clearly and keep every family enrolled term after term.',
    stats: [
      { value: '10', label: 'days before term end - the re-enrolment window' },
      { value: '3×', label: 'more likely to re-enrol when parents receive progress updates' },
      { value: '86%', label: 'retention rate when term renewal automation is active' },
      { value: '0', label: 'parents should be surprised by a lapsed membership' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: 'Every child tracked. Every parent informed.',
        body: 'Swimming school retention starts with parent confidence. Keep a full record of each student - level, attendance, session history, and parent contact - so your team can communicate progress clearly and catch at-risk students early.',
        bullets: [
          'Student profiles with level, attendance history, and parent contact details in one place',
          'Attendance tracked per session - parents notified automatically when sessions are missed',
          'At-risk students flagged when attendance drops so staff can follow up before the family decides to leave',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'Term re-enrolment. Without the phone calls.',
        body: 'The biggest dropout moment in a swimming school is between terms. Automate the entire re-enrolment process - reminders go out, parents confirm online, and your next term fills up without your staff making a single call.',
        bullets: [
          'Automated term renewal reminders sent to parents 2 weeks before the term ends',
          "Progress update messages at end of term - what level the child reached, what's next",
          "Win-back campaigns for families who didn't re-enrol - giving them a reason to return",
        ],
      },
      {
        icon: I.calendar,
        eyebrow: 'Class Scheduling',
        headline: 'The right level. The right time. Every term.',
        body: 'Swimming schools run multiple levels, age groups, and time slots simultaneously. Keep your schedule organised and give parents the visibility to book the right class for their child without the back-and-forth.',
        bullets: [
          'Classes organised by level and age group - no confusion about which class a student belongs to',
          "Parents book sessions and manage their child's schedule from the member portal",
          'Automatic reminders before sessions so no parent forgets a lesson',
        ],
      },
      {
        icon: I.card,
        eyebrow: 'Billing & Payments',
        headline: 'Term fees collected. Without the awkward follow-up.',
        body: 'Term-based billing, recurring payments, and one-off fees - handle all payment types online and at the desk, with automated reminders when fees are due.',
        bullets: [
          'Term fees billed automatically at the start of each new cycle',
          'Online payment via the member portal - parents pay at their convenience',
          'Overdue payment reminders sent automatically - no staff involvement needed',
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'Most swimming schools start with Growth.',
      body: "The Growth plan gives parents a branded portal and mobile app to manage their child's schedule, track attendance, and pay fees - reducing admin for your staff and keeping families engaged between terms.",
    },
    footerCta: {
      headline: 'Ready to keep every family enrolled term after term?',
      subline: 'Book a free demo and see how to retain more students, every term.',
    },
  },
  {
    slug: 'dance-schools',
    value: 'dance-schools',
    name: 'Dance Schools',
    title: 'Dance Schools',
    navLabel: 'For Dance Schools',
    eyebrow: 'Dance Schools',
    icon: I.vinyl,
    panelClassName: 'from-fuchsia-700 to-pink-950',
    headline: "Between terms is where you lose them. We make sure you don't.",
    subline:
      'Dance school retention breaks down between terms. When nobody follows up, students drift - and re-enrolment never happens. Automate the entire re-enrolment process so your next term fills up before the current one ends.',
    stats: [
      { value: '12', label: 'days before term end - the critical re-enrolment window' },
      { value: '3×', label: 'higher re-enrolment when automated reminders are sent' },
      { value: '91%', label: 'term renewal rate with re-enrolment automation active' },
      { value: '0', label: 'students should slip through the term gap uncontacted' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: 'Every student tracked. Every term accounted for.',
        body: "Dance schools need to know who's enrolled, who's attending, and who's at risk of not coming back next term. Get that visibility - across every style, age group, and level - without the spreadsheet.",
        bullets: [
          'Student profiles with style, level, attendance history, and parent contact in one place',
          'At-risk students flagged when attendance drops during the term',
          "Re-enrolment status visible per student - know exactly who has and hasn't confirmed next term",
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'Re-enrolment runs itself.',
        body: 'Two weeks before term ends, re-enrolment reminders go out to every family automatically. Parents confirm online, payment is processed, and your next term is filled - without your staff making a single phone call.',
        bullets: [
          'Automated re-enrolment reminders sent 2 weeks before each term ends',
          "End-of-term progress updates sent to parents - what their child achieved, what's next",
          "Win-back campaigns for students who didn't re-enrol - giving them a reason to return",
        ],
      },
      {
        icon: I.calendar,
        eyebrow: 'Class Scheduling',
        headline: 'Every style. Every level. One schedule.',
        body: 'Dance schools run ballet, contemporary, hip-hop, and more - across age groups and skill levels simultaneously. Keep your timetable organised and conflict-free.',
        bullets: [
          'Classes organised by style, level, and age group - bookings managed automatically',
          'Students and parents book, cancel, and manage their schedule from the portal or app',
          'Recital and performance dates added to the schedule - reminders sent automatically',
        ],
      },
      {
        icon: I.phone,
        eyebrow: 'Member Portal & Mobile App',
        headline: 'Your school in their pocket. Every day of the term.',
        body: "A branded member portal and mobile app keeps your dance school visible to students and parents between classes - so when re-enrolment opens, they're already engaged.",
        bullets: [
          "Parents manage their child's bookings, view the schedule, and pay fees from the portal",
          "Your school's branding on the app - your name, your colors, your identity",
          'Push notifications for class reminders, recital dates, and re-enrolment windows',
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'Dance schools that re-enrol best are on Growth.',
      body: "The Growth plan's member portal and app give parents the self-service tools to re-enrol and pay online - making the term gap a non-event instead of a dropout window.",
    },
    footerCta: {
      headline: 'Ready to fill next term before this one ends?',
      subline: 'Book a free demo and see how to retain more students, term after term.',
    },
  },
  {
    slug: 'padel',
    value: 'padel',
    name: 'Padel',
    title: 'Padel',
    navLabel: 'For Padel',
    eyebrow: 'Padel',
    icon: I.padel,
    iconImage: '/padel-icon.png',
    panelClassName: 'from-indigo-700 to-blue-950',
    headline: 'One player drops out. The whole group follows.',
    subline:
      'Padel is a social sport. Members play in pairs and groups - and when one person stops booking, the dynamic breaks. Keep every player active, every court booked, and every group intact.',
    stats: [
      { value: '14', label: 'days without a booking before a padel player mentally quits' },
      { value: '87%', label: 'court utilisation when booking is frictionless' },
      { value: '4', label: 'players per court - one dropout affects the whole group' },
      { value: '0', label: 'inactive members should go unnoticed' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: 'Spot the quiet player before the group falls apart.',
        body: "In padel, one inactive member can disrupt a whole playing group. Track booking patterns per member and flag who's gone quiet - so you can re-engage them before the social dynamic breaks.",
        bullets: [
          'Booking patterns tracked per player - flagged when activity drops below their usual frequency',
          'Full member profile with booking history, membership plan, and payment status',
          'At-risk players surfaced daily so your team can follow up before the group unravels',
        ],
      },
      {
        icon: I.calendar,
        eyebrow: 'Court Booking & Scheduling',
        headline: 'Every court booked. Every slot filled.',
        body: 'Padel clubs live on court utilisation. Make booking frictionless - members reserve courts from the app in seconds, and your team sees occupancy in real time.',
        bullets: [
          'Members book courts, invite partners, and manage reservations from the mobile app',
          'Real-time court availability visible to members - no calling to check if a slot is free',
          'Court utilisation data in your analytics so you know which times to open or close',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'Re-engage before the booking gap becomes permanent.',
        body: "A padel player who hasn't booked in two weeks needs a nudge. It goes out automatically - before the gap turns into a cancellation and the group dynamic is gone.",
        bullets: [
          "Automatic re-engagement when a player's booking frequency drops",
          'Renewal reminders before memberships expire - so no player loses court access mid-season',
          'Win-back campaigns for completely inactive members - via SMS, email, and push',
        ],
      },
      {
        icon: I.pos,
        eyebrow: 'POS & Shop',
        headline: 'Sell anything. Track everything.',
        body: 'Racket rentals, ball sales, guest passes, refreshments - every transaction handled at the front desk, with every sale tied back to your reports.',
        bullets: [
          'Sell memberships, court time, rentals, and retail from one screen at the front desk',
          'Guest pass management so members can bring partners without disrupting the booking flow',
          'Full sales history tied to member profiles and daily revenue reports',
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'Most padel clubs start with Growth.',
      body: "The Growth plan's member app makes court booking frictionless - reducing the main reason padel players go inactive. When booking is easy, players book more, groups stay intact, and retention follows.",
    },
    footerCta: {
      headline: 'Ready to keep every player on the court?',
      subline: 'Book a free demo and see how to retain more members, month after month.',
    },
  },
  {
    slug: 'tennis-clubs',
    value: 'tennis-clubs',
    name: 'Tennis Clubs',
    title: 'Tennis Clubs',
    navLabel: 'For Tennis Clubs',
    eyebrow: 'Tennis Clubs',
    icon: I.card,
    iconImage: '/tennis-icon.png',
    panelClassName: 'from-violet-700 to-purple-950',
    headline: 'A club membership should feel like belonging. Not just a direct debit.',
    subline:
      'Tennis club members stay when they feel connected - to the club, the community, and the value of their membership. Keep that connection alive with consistent communication, easy self-service, and a membership experience that feels worth renewing.',
    stats: [
      { value: '22', label: 'days without activity before a tennis member mentally exits' },
      {
        value: '3×',
        label: 'higher renewal rate when members receive regular club communications',
      },
      { value: '84%', label: 'retention rate when membership value is made visible' },
      { value: '0', label: 'renewals should lapse without a reminder' },
    ],
    features: [
      {
        icon: I.members,
        eyebrow: 'Member Management',
        headline: "Know who's active. Know who's drifting.",
        body: "Tennis club retention drops when members feel invisible. Get a full view of every member's activity - court bookings, coaching sessions, attendance - so you can identify the ones who are quietly disengaging before they don't renew.",
        bullets: [
          'Full member profiles with booking history, membership tier, and engagement trend',
          'Inactive members flagged automatically when activity drops below their usual pattern',
          'Membership tiers - junior, adult, family, seasonal - all managed in one place',
        ],
      },
      {
        icon: I.bell,
        eyebrow: 'Automation',
        headline: 'Renewal reminders. Event updates. Club communications. Automated.',
        body: 'Tennis club members stay when they feel informed and valued. Automate every touchpoint - from renewal reminders to event notifications - so your club communicates consistently without the manual effort.',
        bullets: [
          'Renewal reminders sent automatically before memberships lapse - no member is caught off guard',
          'Event and tournament notifications sent to all relevant members without manual effort',
          'Re-engagement campaigns for inactive members - bringing them back to the court',
        ],
      },
      {
        icon: I.calendar,
        eyebrow: 'Court Booking & Scheduling',
        headline: 'Book a court. In seconds. From anywhere.',
        body: "Frictionless court booking keeps members active. When it's easy to reserve a slot, members play more often - and members who play more often renew. Make booking as simple as two taps on a phone.",
        bullets: [
          'Members book courts, coaching sessions, and events from the app or member portal',
          'Real-time court availability so members never need to call to check',
          'Coaching session scheduling integrated with court booking - no double-booking, no conflict',
        ],
      },
      {
        icon: I.phone,
        eyebrow: 'Member Portal & Mobile App',
        headline: 'Membership value. Made visible.',
        body: "A tennis club membership should feel like more than a monthly charge. The member portal and app show members exactly what they're getting - bookings, events, membership status, and value - making renewal feel like a natural choice, not a decision.",
        bullets: [
          'Members see their booking history, upcoming events, and membership status in one place',
          'Membership tiers and benefits clearly visible - so members understand what they have',
          "Your club's branding throughout - your name, your identity, your community",
        ],
      },
    ],
    planRecommendation: {
      eyebrow: 'Recommended plan',
      headline: 'Most tennis clubs start with Growth.',
      body: 'The Growth plan gives your members a branded portal and mobile app - making membership feel tangible, court booking effortless, and renewal a natural decision rather than a friction point.',
    },
    footerCta: {
      headline: 'Ready to make your members proud to belong?',
      subline: 'Book a free demo and see how to retain more members, season after season.',
    },
  },
];

/** Lookup by slug - used by the dynamic route. */
export const getAudience = (slug: string): AudiencePage | undefined =>
  BUILT_FOR.find((a) => a.slug === slug);
