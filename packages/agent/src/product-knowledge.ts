// Operator vocabulary and routes, checked against the admin pages and @fit/types.
// Query destinations are tabs: 48 destinations cover 47 physical page.tsx files.
export interface ConsolePage {
  path: string;
  title: { en: string; ka: string };
  purpose: string;
  toolDomain?: string;
}

function page(
  path: string,
  en: string,
  ka: string,
  purpose: string,
  toolDomain?: string,
): ConsolePage {
  return { path, title: { en, ka }, purpose, ...(toolDomain ? { toolDomain } : {}) };
}

export const CONSOLE_PAGES: ConsolePage[] = [
  page('/', 'Dashboard', 'მართვის პანელი', 'Review gym performance.', 'insights'),
  page('/members', 'Members', 'წევრები', 'Find and filter members.', 'members'),
  page('/members/:id', 'Member', 'წევრი', 'Review membership, credits and activity.', 'members'),
  page('/members/:id/edit', 'Edit member', 'წევრის რედაქტირება', 'Edit member details.', 'members'),
  page('/members/new', 'New member', 'ახალი წევრი', 'Register a member.', 'members'),
  page('/classes', 'Class Types', 'ვარჯიშის ტიპები', 'Manage class types.', 'classes'),
  page('/classes/:id', 'Class', 'ვარჯიში', 'Inspect a recurring class template.', 'classes'),
  page(
    '/classes/:id/edit',
    'Edit class',
    'ვარჯიშის რედაქტირება',
    'Edit a recurring class template.',
    'classes',
  ),
  page('/classes/new', 'New class', 'ახალი ვარჯიში', 'Create a class template.', 'classes'),
  page(
    '/classes/schedule',
    'Schedule',
    'განრიგი',
    'Manage sessions, bookings and attendance.',
    'classes',
  ),
  page(
    '/classes/pt-calendar',
    'PT Calendar',
    'PT კალენდარი',
    'Book PT and service sessions.',
    'classes',
  ),
  page('/services', 'Services', 'სერვისები', 'Manage bookable services.', 'services'),
  page('/packages', 'Packages', 'პაკეტები', 'Manage package plans.', 'plans'),
  page('/packages/:id', 'Package plan', 'პაკეტი', 'Inspect a package plan.', 'plans'),
  page(
    '/packages/:id/edit',
    'Edit package plan',
    'პაკეტის რედაქტირება',
    'Edit a package plan.',
    'plans',
  ),
  page('/packages/new', 'New package plan', 'ახალი პაკეტი', 'Create a package plan.', 'plans'),
  page(
    '/payments',
    'Billing',
    'ანგარიშსწორება',
    "Define the subscription plans on sale; a member's own subscription, freeze and billing live on /members/:id.",
    'plans',
  ),
  page(
    '/payments/:id',
    'Subscription plan',
    'აბონემენტის გეგმა',
    'Inspect a subscription plan.',
    'plans',
  ),
  page(
    '/payments/:id/edit',
    'Edit subscription plan',
    'აბონემენტის გეგმის რედაქტირება',
    'Edit a subscription plan.',
    'plans',
  ),
  page('/payments/invoices', 'Invoices', 'ინვოისები', 'Create and email invoices.', 'sales'),
  page('/pos', 'Point of sale', 'გაყიდვის წერტილი (POS)', 'Sell items and take payment.', 'sales'),
  page('/pos/orders', 'Sales log', 'გაყიდვების ჟურნალი', 'Find sales and refunds.', 'sales'),
  page('/pos/orders/:id', 'Sale', 'გაყიდვა', 'Review items, settlement and refunds.', 'sales'),
  page(
    '/pos/reconciliation',
    'Cash reconciliation',
    'სალაროს შეჯერება',
    'Compare counted and expected cash.',
    'sales',
  ),
  page('/shop', 'Shop', 'მაღაზია', 'Manage products and categories.', 'products'),
  page('/shop/:id', 'Product', 'პროდუქტი', 'Inspect product and adjust stock.', 'products'),
  page(
    '/shop/:id/edit',
    'Edit product',
    'პროდუქტის რედაქტირება',
    'Edit product details and variants.',
    'products',
  ),
  page('/shop/inventory', 'Inventory', 'მარაგი', 'Review stock by branch.', 'products'),
  page(
    '/shop/low-stock',
    'Low stock',
    'დაბალი მარაგი',
    'Find items needing restocking.',
    'products',
  ),
  page(
    '/marketing',
    'Marketing',
    'მარკეტინგი',
    'Manage campaigns, promos and templates.',
    'marketing',
  ),
  page('/marketing?tab=audience', 'Audience', 'აუდიტორია', 'Define member segments.', 'marketing'),
  page('/marketing/banners', 'Banners', 'ბანერები', 'Manage app home promotions.', 'marketing'),
  page('/automation', 'Automation', 'ავტომატიზაცია', 'Manage rules and templates.', 'marketing'),
  page(
    '/staff',
    'Staff Management',
    'პერსონალის მართვა',
    'Invite staff and set roles or shifts.',
    'staff',
  ),
  page('/trainers', 'Trainers', 'მწვრთნელები', 'Find coaches and performance.', 'trainers'),
  page(
    '/trainers/:id',
    'Trainer',
    'მწვრთნელი',
    'Review schedule, clients and availability.',
    'trainers',
  ),
  page(
    '/trainers/:id/edit',
    'Edit trainer',
    'მწვრთნელის რედაქტირება',
    'Edit a trainer profile.',
    'trainers',
  ),
  page('/trainers/new', 'New trainer', 'ახალი მწვრთნელი', 'Create a trainer profile.', 'trainers'),
  page('/locations', 'Locations', 'ლოკაციები', 'Manage branches.', 'locations'),
  page('/locations/:id', 'Location', 'ფილიალი', 'Inspect branch hours and amenities.', 'locations'),
  page(
    '/locations/:id/edit',
    'Edit location',
    'ფილიალის რედაქტირება',
    'Edit branch details.',
    'locations',
  ),
  page('/locations/new', 'New location', 'ახალი ფილიალი', 'Create a branch.', 'locations'),
  page('/reports', 'Reports', 'რეპორტები', 'Select and filter reports.', 'insights'),
  page('/reports/:metric', 'Report', 'რეპორტი', 'Drill into a metric and export rows.', 'insights'),
  page(
    '/member-portal',
    'Member portal',
    'წევრის პორტალი',
    'Customize portal theme and join card.',
    'settings',
  ),
  page(
    '/app-settings',
    'App settings',
    'აპლიკაციის პარამეტრები',
    'Configure the member mobile app.',
  ),
  page('/settings', 'Settings', 'პარამეტრები', 'Set gym policies and branding.', 'settings'),
  page('/profile', 'Profile', 'პროფილი', 'View your account and gym.'),
];

export interface GlossaryEntry {
  en: string;
  ka: string;
  meaning: string;
}

function term(en: string, ka: string, meaning: string): GlossaryEntry {
  return { en, ka, meaning };
}

// Meanings follow the contracts in packages/types/src (not the names of tools).
export const GLOSSARY: GlossaryEntry[] = [
  term('member', 'წევრი', 'Gym customer with a profile, status and member or guest kind.'),
  term('subscription', 'აბონემენტი', "A member's enrollment in a plan, with period and status."),
  term('package plan', 'პაკეტი', 'Catalogue offer: price, sessions, validity.'),
  term('credit pack', 'კრედიტების პაკეტი', 'Purchased session balance, possibly expiring.'),
  term('branch', 'ფილიალი', 'Gym location with its own address and hours.'),
  term('class type', 'ვარჯიშის ტიპი', 'Category with defaults for scheduled classes.'),
  term('class template', 'ვარჯიშის შაბლონი', 'Recurring class definition, not dated.'),
  term('schedule instance', 'კონკრეტული ვარჯიში', 'Dated occurrence with its own roster.'),
  term('booking', 'ჯავშანი', 'Member reservation for a dated session.'),
  term('waitlist', 'მოლოდინის სია', 'Queue for a seat in a full class.'),
  term('attendance', 'დასწრება', 'Class attendance recorded on a booking.'),
  term('check-in', 'შესვლის აღრიცხვა', 'Gym arrival, distinct from class attendance.'),
  term('PT session', 'პერსონალური ვარჯიში', 'Timed personal training with a trainer and member.'),
  term('service', 'სერვისი', 'Bookable offering with duration and price.'),
  term(
    'appointment',
    'სერვისის ჯავშანი',
    'Dated service session with member and optional trainer.',
  ),
  term('product', 'პროდუქტი', 'Retail catalogue item with price and optional variants.'),
  term('stock', 'მარაგი', 'Tracked quantity by product, variant and branch.'),
  term('POS sale', 'სალაროს გაყიდვა', 'Staff checkout recording items and payment.'),
  term('order', 'შეკვეთა', 'Purchase record with lines, totals and payment status.'),
  term('receipt', 'ქვითარი', 'Sale confirmation that can be emailed.'),
  term('refund', 'თანხის დაბრუნება', 'Full or partial return against a paid order.'),
  term(
    'reconciliation',
    'სალაროს შეჯერება',
    'Expected cash versus counted cash for a day and branch.',
  ),
  term('invoice', 'ინვოისი', 'Billed amount with number, member, due date and status.'),
  term('freeze', 'გაყინვა', 'Temporary subscription pause within policy limits.'),
  term('promo code', 'პრომო კოდი', 'Discount with scope, validity and redemption limits.'),
  term('campaign', 'კამპანია', 'Message to an audience, sent now or scheduled.'),
  term('segment/audience', 'სეგმენტი/აუდიტორია', 'Members selected by saved filtering rules.'),
  term('template', 'შაბლონი', 'Reusable message or automation rule; not a class occurrence.'),
  term('banner', 'ბანერი', 'Promotional image and action on the member app home screen.'),
  term(
    'automation rule',
    'ავტომატიზაციის წესი',
    'Trigger, conditions, timing and action run automatically.',
  ),
  term(
    'loyalty points',
    'ლოიალობის ქულები',
    'Member balance earned through configured program events.',
  ),
  term('reward', 'ჯილდო', 'Catalogue benefit with points cost and optional stock.'),
  term('redemption', 'ქულების განაღდება', 'Points exchanged for a reward with fulfillment status.'),
  term(
    'review',
    'შეფასება',
    'Rating and optional comment after an attended class, attached to its trainer.',
  ),
  term('staff role', 'პერსონალის როლი', 'Named collection of access permissions.'),
  term('permission', 'უფლება', 'Capability authorizing an operation, checked by the API.'),
  term('trainer', 'მწვრთნელი', 'Public coach profile with availability, clients and reviews.'),
  term('dashboard', 'მართვის პანელი', 'Aggregated gym metrics for a period and branch.'),
  term('report', 'რეპორტი', 'Selected metric analysis with date and branch filters.'),
  term('drilldown', 'დეტალური რეპორტი', 'Underlying records for a report metric.'),
  term('member portal', 'წევრის პორტალი', 'Member-facing website branding and join content.'),
  term(
    'app settings',
    'აპლიკაციის პარამეტრები',
    'Member mobile app configuration, separate from portal theme.',
  ),
];

export interface ProductWorkflow {
  task: string;
  steps: string[];
}

// Tools are named only where the UI has no matching action or as a precise alternative.
export const WORKFLOWS: ProductWorkflow[] = [
  { task: 'Add a member', steps: ['/members/new: enter contact details and save.'] },
  {
    task: 'Enroll a subscription',
    steps: [
      '/members: find member; /payments: choose plan.',
      'enroll_subscription with member and plan.',
    ],
  },
  {
    task: 'Freeze a subscription',
    steps: [
      'Only on /members/:id: Membership > current plan > Freeze; choose days.',
      'freeze_subscription does the same.',
    ],
  },
  {
    task: 'Schedule a class',
    steps: ['/classes/schedule: add session; select type, trainer, time and branch.'],
  },
  {
    task: 'Cancel a class, book or promote waitlist',
    steps: ['/classes/schedule: open occurrence; cancel, add to roster or promote.'],
  },
  { task: 'Book PT', steps: ['/classes/pt-calendar: select trainer, member and time; book.'] },
  { task: 'Make a POS sale', steps: ['/pos: select customer and items; take payment.'] },
  {
    task: 'Refund a sale',
    steps: ['/pos/orders: find sale.', 'get_order then refund_order with amount and reason.'],
  },
  {
    task: 'Close the day',
    steps: [
      '/pos/reconciliation: choose branch/date; enter counted cash and compare (no saved close).',
    ],
  },
  { task: 'Send an invoice', steps: ['/payments/invoices: find invoice; email it.'] },
  {
    task: 'Adjust stock',
    steps: [
      '/shop/inventory: find product.',
      '/shop/:id: select branch/variant; adjust stock with reason.',
    ],
  },
  {
    task: 'Create a promo code',
    steps: ['/marketing: Promo codes tab; set discount, scope and limits.'],
  },
  {
    task: 'Send a campaign',
    steps: ['/marketing: create campaign; choose audience and content; send or schedule.'],
  },
  {
    task: 'Define an audience',
    steps: ['/marketing?tab=audience: create segment; set filters and preview.'],
  },
  {
    task: 'Create an automation rule',
    steps: ['/automation: new rule; choose trigger, conditions, timing and action.'],
  },
  {
    task: 'Adjust loyalty points',
    steps: [
      '/members: find member.',
      'get_member_loyalty then adjust_member_points with delta and reason.',
    ],
  },
  {
    task: 'Invite staff or set a role',
    steps: ['/staff: Invitations to invite; Roles to set permissions.'],
  },
];

// Only easily confused terms enter every request; the full glossary stays available to consumers.
const PROMPT_TERMS = new Set([
  'subscription',
  'package plan',
  'credit pack',
  'class type',
  'class template',
  'schedule instance',
  'attendance',
  'check-in',
  'segment/audience',
  'template',
]);

// Purposes the titles do not already say; the rest stay available to consumers.
const PROMPT_PURPOSES = new Set([
  '/classes/new',
  '/classes/schedule',
  '/classes/pt-calendar',
  '/payments',
  '/marketing',
  '/staff',
  '/member-portal',
  '/app-settings',
  '/settings',
]);

export function buildProductKnowledge(): string {
  const map = CONSOLE_PAGES.filter((p) => !p.path.includes(':')).map((p) => {
    const children = CONSOLE_PAGES.filter((child) => {
      if (!child.path.includes(':')) return false;
      return child.path.slice(0, child.path.indexOf('/:')) === p.path;
    });
    const purpose = PROMPT_PURPOSES.has(p.path) ? `; ${p.purpose}` : '';
    return `${p.path}: ${p.title.en} (${p.title.ka})${purpose}${children.length ? `. ${children.map((c) => `${c.path} ${c.title.en}`).join(', ')}.` : ''}`;
  });
  return [
    'Console map:',
    ...map,
    'Glossary:',
    ...GLOSSARY.filter((t) => PROMPT_TERMS.has(t.en)).map((t) => `${t.en} (${t.ka}): ${t.meaning}`),
    'How-to:',
    ...WORKFLOWS.map((w) => `${w.task}: ${w.steps.join(' ')}`),
  ].join('\n');
}
