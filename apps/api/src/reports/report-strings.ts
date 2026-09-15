import {
  REPORT_DEFINITIONS,
  REPORT_KEYS,
  REPORT_METRIC_DEFINITIONS,
  REPORT_METRICS,
  REPORT_SEGMENT_LABEL,
  type ReportColumn,
  type ReportDefinition,
  type ReportDrilldown,
  type ReportKey,
  type ReportMetric,
  type ReportResult,
  type ReportSection,
  type ReportSegment,
} from '@fit/types';
import type { EmailLocale } from '../mail/email-locale';

/**
 * Every fixed string a report carries, in both launch languages.
 *
 * The catalogue in `@fit/types` is written in English and stays the single
 * source for `en`: this module reads it rather than copying it, so a new report
 * or column cannot drift between the two. Georgian is the one hand-written
 * block, keyed by the same STABLE IDS the wire already carries — report keys,
 * column keys, KPI ids, section ids — never by English text, so a reworded
 * English label does not silently un-translate its Georgian.
 *
 * Two kinds of string live here, translated at two different moments:
 *
 *   • LABELS (a report's name, a column heading, a KPI or section title) are
 *     emitted in English by the services and translated on the way out by
 *     {@link localizeReportResult} / {@link localizeDrilldown}, by id.
 *   • VALUES the services themselves put in cells and bars ("Cash", "No plan",
 *     "Unattributed") are read from `values` at the moment they are written,
 *     because once inside a row they are indistinguishable from a gym's own
 *     plan or member names, which must never be touched.
 *
 * House rules for the Georgian copy: plain hyphens, never a long dash.
 */
export type ReportLocale = EmailLocale;

export interface ReportStrings {
  segments: Record<ReportSegment, string>;
  catalogue: Record<
    ReportKey,
    { name: string; description: string; columns: Record<string, string> }
  >;
  metrics: Record<ReportMetric, { name: string; description: string }>;
  /** Drill-down KPI labels, by KPI id. */
  kpis: Record<string, string>;
  /** Drill-down section titles (and table column labels), by section id. */
  sections: Record<string, { title: string; columns?: Record<string, string> }>;
  /** Split-section slice labels, by their English label (fixed vocabulary, not data). */
  slices: Record<string, string>;
  /** Values the services write into cells and bars themselves. */
  values: {
    cash: string;
    card: string;
    bankTransfer: string;
    memberAccount: string;
    /** Every payment method the till does not name outright (member account today). */
    other: string;
    unattributed: string;
    unassigned: string;
    noPlan: string;
    noLocation: string;
    unknownMember: string;
    classFallback: string;
    noShow: string;
    cancelled: string;
    anniversary: string;
    birthday: string;
    rewardTypes: Record<string, string>;
    /** A sale with no member and no name on it. */
    guest: string;
    channelPos: string;
    channelOnline: string;
    /** Order lifecycle states, plus the one a partial refund leaves an order in. */
    statuses: Record<string, string>;
    /** What a sold line is, when it is not a shelved product with a category of its own. */
    categoryPlan: string;
    categoryMembership: string;
    categorySessionPack: string;
    categoryOneTimePlan: string;
    categoryPersonalTraining: string;
    categoryService: string;
    categoryUncategorised: string;
    /** The membership status the front desk uses, by {@link MembershipStatusKey}. */
    membershipStatuses: Record<string, string>;
    /** Retention & engagement groups; `noVisit` carries a `{days}` placeholder. */
    retentionGroups: Record<string, string>;
    /** How a member checked in, by `CheckInMethod`. */
    checkInMethods: Record<string, string>;
    /** Card taken at the till, as the revenue-by-method report groups it. */
    cardPos: string;
    /** Invoice states in the desk's words. */
    invoiceStatuses: Record<string, string>;
    /** What an invoice was for, by `InvoiceType`, when nothing more specific is known. */
    invoiceTypes: Record<string, string>;
    /** Billing intervals, by `SubscriptionInterval`. */
    intervals: Record<string, string>;
    /** Stock position states - see the stock & inventory report. */
    stockStatuses: Record<string, string>;
    /** What a stock movement was, in the desk's words - see the movement history. */
    movementTypes: Record<string, string>;
    /** A class booking's outcome, by `BookingStatus`. */
    bookingStatuses: Record<string, string>;
    /** A PT session's state, across both the service-session and calendar enums. */
    sessionStatuses: Record<string, string>;
    /** A credit pack: active, used up, expired. */
    creditPackStatuses: Record<string, string>;
    /** What a trainer-activity line is: a group class booking or a PT session. */
    activityTypes: { class: string; pt: string };
    yes: string;
    no: string;
    /** Staff roles, by `Role`. */
    roles: Record<string, string>;
    /** Audit actions in words, by action key; English falls back to `AUDIT_ACTION_LABELS`. */
    auditActions: Record<string, string>;
    /** Monday first, three letters each: the peak-hours heatmap rows. */
    weekdays: readonly string[];
  };
  /** The KPI summary tab of a drill-down file export. */
  tabular: { summary: string; metric: string; value: string; unit: string };
}

/** The English catalogue, read straight from the definitions. */
function englishCatalogue(): ReportStrings['catalogue'] {
  return Object.fromEntries(
    REPORT_KEYS.map((key) => {
      const definition = REPORT_DEFINITIONS[key];
      return [
        key,
        {
          name: definition.name,
          description: definition.description,
          columns: Object.fromEntries(definition.columns.map((c) => [c.key, c.label])),
        },
      ];
    }),
  ) as ReportStrings['catalogue'];
}

const EN: ReportStrings = {
  segments: REPORT_SEGMENT_LABEL,
  catalogue: englishCatalogue(),
  metrics: Object.fromEntries(
    REPORT_METRICS.map((metric) => [
      metric,
      {
        name: REPORT_METRIC_DEFINITIONS[metric].name,
        description: REPORT_METRIC_DEFINITIONS[metric].description,
      },
    ]),
  ) as ReportStrings['metrics'],
  // English labels are already on the wire; an empty map means "leave as is".
  kpis: {},
  sections: {},
  slices: {},
  values: {
    cash: 'Cash',
    card: 'Card',
    bankTransfer: 'Bank transfer',
    memberAccount: 'Member account',
    other: 'Other',
    unattributed: 'Unattributed',
    unassigned: 'Unassigned',
    noPlan: 'No plan',
    noLocation: 'No location',
    unknownMember: 'Unknown',
    classFallback: 'Class',
    noShow: 'No-show',
    cancelled: 'Cancelled',
    anniversary: 'Anniversary',
    birthday: 'Birthday',
    rewardTypes: {
      pt_session: 'PT session',
      day_pass: 'Day pass',
      guest_pass: 'Guest pass',
      merchandise: 'Merchandise',
      drink: 'Drink',
      discount: 'Discount',
      other: 'Other',
    },
    guest: 'Walk-in',
    channelPos: 'Point of sale',
    channelOnline: 'Online',
    statuses: {
      PENDING: 'Pending',
      PAID: 'Paid',
      CANCELLED: 'Cancelled',
      REFUNDED: 'Refunded',
      PARTIALLY_REFUNDED: 'Partially refunded',
    },
    categoryPlan: 'Membership plan',
    categoryMembership: 'Membership',
    categorySessionPack: 'Session pack',
    categoryOneTimePlan: 'One-time plan',
    categoryPersonalTraining: 'Personal session',
    categoryService: 'Service',
    categoryUncategorised: 'Uncategorised',
    membershipStatuses: {
      active: 'Active',
      new: 'New',
      expiring: 'Expiring',
      renewalDue: 'Renewal due',
      expired: 'Expired',
      cancelled: 'Cancelled',
      frozen: 'Frozen',
      none: 'No membership',
    },
    retentionGroups: {
      renewalDue: 'Renewal due',
      expiringSoon: 'Expiring soon',
      recentlyExpired: 'Recently expired, not renewed',
      recentlyCancelled: 'Recently cancelled',
      reactivated: 'Reactivated',
      noVisit: 'No visit for {days} days',
    },
    checkInMethods: { QR: 'QR code', MANUAL: 'Manual' },
    cardPos: 'Card / POS',
    invoiceStatuses: {
      paid: 'Paid',
      unpaid: 'Unpaid',
      overdue: 'Overdue',
      upcoming: 'Upcoming',
      refunded: 'Refunded',
    },
    invoiceTypes: {
      MEMBERSHIP: 'Membership',
      PERSONAL_TRAINING: 'Personal session',
      CLASS: 'Class',
      PRODUCT: 'Product',
      SERVICE: 'Service',
      OTHER: 'Other',
    },
    intervals: { MONTH: 'Monthly', YEAR: 'Yearly' },
    stockStatuses: {
      inStock: 'In stock',
      lowStock: 'Low stock',
      outOfStock: 'Out of stock',
      notTracked: 'Not tracked',
    },
    movementTypes: {
      initial: 'Initial stock',
      received: 'Stock received',
      posSale: 'POS sale',
      onlineSale: 'Online sale',
      customerReturn: 'Customer return',
      adjustment: 'Manual adjustment',
      recount: 'Stocktake correction',
      writeOff: 'Write-off',
    },
    bookingStatuses: {
      BOOKED: 'Booked',
      WAITLIST: 'Waitlisted',
      ATTENDED: 'Attended',
      NO_SHOW: 'No-show',
      CANCELED: 'Cancelled',
    },
    sessionStatuses: {
      SCHEDULED: 'Scheduled',
      OPEN: 'Open',
      BOOKED: 'Booked',
      COMPLETED: 'Completed',
      CANCELED: 'Cancelled',
      CANCELLED: 'Cancelled',
    },
    creditPackStatuses: { active: 'Active', usedUp: 'Used up', expired: 'Expired' },
    activityTypes: { class: 'Class', pt: 'PT session' },
    yes: 'Yes',
    no: 'No',
    roles: {
      SUPER_ADMIN: 'Platform operator',
      OWNER: 'Owner',
      MANAGER: 'Manager',
      RECEPTIONIST: 'Receptionist',
      TRAINER: 'Trainer',
      MEMBER: 'Member',
    },
    auditActions: {},
    weekdays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  },
  tabular: { summary: 'Summary', metric: 'Metric', value: 'Value', unit: 'Unit' },
};

/* -------------------------------------------------------------------------- */
/*  Georgian                                                                    */
/* -------------------------------------------------------------------------- */

// Column labels shared by many reports, so a word is translated once.
const KA_COMMON = {
  period: 'პერიოდი',
  orders: 'შეკვეთები',
  gross: 'მთლიანი',
  refunded: 'დაბრუნებული',
  net: 'წმინდა',
  date: 'თარიღი',
  time: 'დრო',
  member: 'წევრი',
  plan: 'გეგმა',
  phone: 'ტელეფონი',
  email: 'ელფოსტა',
  trainer: 'მწვრთნელი',
  class: 'კლასი',
  sessions: 'სესიები',
  method: 'მეთოდი',
  amount: 'თანხა',
  status: 'სტატუსი',
  location: 'ფილიალი',
  lastVisit: 'ბოლო ვიზიტი',
};

const KA: ReportStrings = {
  segments: {
    sales: 'გაყიდვები',
    members: 'წევრები',
    revenue: 'შემოსავალი',
    products: 'პროდუქტები',
    classes: 'კლასები და ვარჯიშები',
    staff: 'მწვრთნელები და პერსონალი',
  },
  catalogue: {
    'sales-summary': {
      name: 'გაყიდვების შეჯამება',
      description: 'მთლიანი შემოსავალი, დაბრუნებები და წმინდა გაყიდვები პერიოდების მიხედვით.',
      columns: { ...KA_COMMON },
    },
    'sales-by-payment-method': {
      name: 'გაყიდვები გადახდის მეთოდით',
      description: 'როგორ დაიფარა გაყიდვები - ნაღდი, ბარათი თუ წევრის ანგარიში.',
      columns: { ...KA_COMMON },
    },
    'plan-performance': {
      name: 'გეგმებისა და სერვისების შედეგები',
      description:
        'რა გაიყიდა - წევრობები, სესიების პაკეტები, პერსონალური სესიები, სხვა სერვისები და პროდუქტები - რამდენი, რა თანხად, თითოეულის წილი პერიოდის გაყიდვებში და რომელ ფილიალში.',
      columns: {
        item: 'გეგმა / სერვისი',
        category: 'კატეგორია',
        sold: 'გაყიდული',
        revenue: 'გაყიდვების ღირებულება',
        share: 'წილი გაყიდვებში',
        location: KA_COMMON.location,
      },
    },
    'sales-by-staff': {
      name: 'გაყიდვები თანამშრომლების მიხედვით',
      description: 'ვინ რა გაყიდა სალაროსთან - საკომისიოსა და წახალისებისთვის.',
      columns: {
        staff: 'თანამშრომელი',
        role: 'როლი',
        orders: 'გაყიდვები',
        gross: 'მთლიანი',
        net: 'წმინდა',
      },
    },
    'discounts-and-promotions': {
      name: 'ფასდაკლებები და აქციები',
      description: 'ყველა გამოყენებული პრომო კოდი ამ პერიოდში და რა დათმო თითოეულმა.',
      columns: {
        code: 'კოდი',
        discountType: 'ტიპი',
        redemptions: 'გამოყენება',
        discountGiven: 'დათმობილი',
      },
    },
    'refunds-detail': {
      name: 'დაბრუნებები',
      description:
        'ყველა დაბრუნება ამ პერიოდში - როდის, ვისი, რომელი გაყიდვისა და პროდუქტების, რა თანხა, რატომ, ვინ დაამუშავა და სად.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        customer: 'მყიდველი',
        order: 'თავდაპირველი გაყიდვა',
        items: 'თავდაპირველი პროდუქტები',
        amount: 'დაბრუნებული თანხა',
        reason: 'მიზეზი',
        processedBy: 'თანამშრომელი',
        location: KA_COMMON.location,
      },
    },
    'pos-transaction-log': {
      name: 'სალაროს ტრანზაქციების ჟურნალი',
      description: 'ჩეკის დონის სალაროს დეტალები შედარებისა და დავებისთვის.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        order: 'შეკვეთა',
        items: 'პროდუქტები',
        method: KA_COMMON.method,
        total: 'ჯამი',
        staff: 'გამყიდველი',
      },
    },
    'sales-transactions': {
      name: 'გაყიდვების ტრანზაქციები',
      description:
        'ყველა გაყიდვა ამ პერიოდში, ერთი მწკრივი თითო ტრანზაქციაზე - ვინ რა იყიდა, რამდენად, როგორ გადაიხადა, რომელი არხით, სად და ვისგან.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        reference: 'ნომერი',
        customer: 'მყიდველი',
        items: 'პროდუქტები',
        category: 'კატეგორია',
        amount: KA_COMMON.amount,
        method: 'გადახდის მეთოდი',
        channel: 'არხი',
        location: KA_COMMON.location,
        staff: 'თანამშრომელი',
        status: KA_COMMON.status,
      },
    },
    'daily-reconciliation': {
      name: 'დღიური შედარება',
      description:
        'ყოველი დღის შემოსავალი და როგორ შეგროვდა - ნაღდი, ბარათი სალაროსთან, ონლაინ, საბანკო გადარიცხვა, სხვა მეთოდი - გაცემული დაბრუნებების, გაყიდვების რაოდენობისა და ჯამის უკან მდგომი ჩეკების გვერდით.',
      columns: {
        date: KA_COMMON.date,
        total: 'სულ გაყიდვები',
        cash: 'ნაღდი',
        card: 'ბარათი / სალარო',
        online: 'ონლაინ',
        bankTransfer: 'საბანკო გადარიცხვა',
        other: 'სხვა გადახდის მეთოდები',
        refunds: 'დაბრუნებები',
        transactions: 'ტრანზაქციები',
        references: 'ტრანზაქციების ნომრები',
      },
    },
    'membership-movement': {
      name: 'წევრობის მოძრაობა',
      description:
        'რეგისტრაციები, გაუქმებები და წმინდა ცვლილება პერიოდების მიხედვით, მზარდი ჯამით.',
      columns: {
        period: KA_COMMON.period,
        newMembers: 'ახალი',
        cancellations: 'გაუქმებული',
        netChange: 'წმინდა ცვლილება',
        totalMembers: 'სულ წევრი',
      },
    },
    'retention-and-churn': {
      name: 'შენარჩუნება და გადინება',
      description:
        'გადინება 30, 60 და 90-დღიან მოძრავ ფანჯრებში, რომლებიც თითოეულ პერიოდზე მთავრდება. შენარჩუნება 30-დღიანი მაჩვენებლის შებრუნებაა.',
      columns: {
        period: KA_COMMON.period,
        churned: 'გაუქმებული',
        retentionRate30: 'შენარჩუნება (30 დღე)',
        churnRate30: 'გადინება (30 დღე)',
        churnRate60: 'გადინება (60 დღე)',
        churnRate90: 'გადინება (90 დღე)',
      },
    },
    'members-at-risk': {
      name: 'შენარჩუნება და ჩართულობა',
      description:
        'წევრები, რომლებსაც შენარჩუნება ან განახლება სჭირდება, მიზეზის მიხედვით: მოსალოდნელი განახლება, ვადის ამოწურვის წინ მყოფი წევრობა, ახლახან ამოწურული ან გაუქმებული, დაბრუნებული წევრი და ისინი, ვინც სიარული შეწყვიტა.',
      columns: {
        group: 'ყურადღება',
        member: KA_COMMON.member,
        phone: KA_COMMON.phone,
        email: KA_COMMON.email,
        plan: KA_COMMON.plan,
        status: 'წევრობის სტატუსი',
        lastVisit: KA_COMMON.lastVisit,
        daysSince: 'დღე ბოლო ვიზიტიდან',
        expiresOn: 'იწურება',
        renewal: 'განახლება',
        value: 'წევრობის ღირებულება',
      },
    },
    'expiring-memberships': {
      name: 'ვადის ამოწურვის წინ მყოფი წევრობები',
      description:
        'წევრობები, რომლებიც არჩეულ პერიოდში იწურება, გეგმითა და საკონტაქტო ინფორმაციით.',
      columns: {
        member: KA_COMMON.member,
        plan: KA_COMMON.plan,
        expiresOn: 'იწურება',
        daysLeft: 'დარჩა დღე',
        phone: KA_COMMON.phone,
        email: KA_COMMON.email,
      },
    },
    'member-roster': {
      name: 'წევრობის ანგარიში',
      description:
        'სრული წევრთა ბაზა მიმდინარე წევრობის ინფორმაციით: სტატუსი (აქტიური, ახალი, იწურება, განახლება მოსალოდნელია, ვადაგასული, გაუქმებული, გაყინული), გეგმა, თარიღები, ვიზიტები პერიოდში, ღირებულება და შემდეგი განახლება.',
      columns: {
        member: KA_COMMON.member,
        phone: KA_COMMON.phone,
        email: KA_COMMON.email,
        status: 'წევრობის სტატუსი',
        plan: KA_COMMON.plan,
        joined: 'გაწევრიანდა',
        startDate: 'წევრობის დაწყება',
        expiresOn: 'იწურება',
        lastVisit: KA_COMMON.lastVisit,
        visits: 'ვიზიტი პერიოდში',
        value: 'წევრობის ღირებულება',
        nextRenewal: 'შემდეგი განახლება',
      },
    },
    'member-check-in-log': {
      name: 'შემოსვლების ანგარიში',
      description: 'ყველა ვიზიტი ამ პერიოდში - ვინ, როდის, რომელი მეთოდით და რომელ ფილიალში.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        member: KA_COMMON.member,
        method: KA_COMMON.method,
        location: KA_COMMON.location,
      },
    },
    'upcoming-occasions': {
      name: 'დაბადების დღეები და იუბილეები',
      description:
        'მოახლოებული დაბადების დღეები და გაწევრიანების იუბილეები - მისალოცად ან საჩუქრისთვის.',
      columns: {
        member: KA_COMMON.member,
        occasion: 'შემთხვევა',
        date: KA_COMMON.date,
        years: 'წელი',
        phone: KA_COMMON.phone,
      },
    },
    'revenue-summary': {
      name: 'შემოსავლის შეჯამება',
      description:
        'წმინდა შემოსავალი პერიოდების მიხედვით განმეორებადი ბაზის გვერდით: MRR და საშუალო შემოსავალი წევრზე, ორივე პერიოდის ბოლოს.',
      columns: {
        period: KA_COMMON.period,
        revenue: 'შემოსავალი',
        mrr: 'MRR',
        activeMembers: 'გამომწერი',
        arpm: 'საშ. წევრზე',
      },
    },
    'revenue-by-channel': {
      name: 'შემოსავალი არხების მიხედვით',
      description:
        'მიღებული თანხები გაყიდვის არხის მიხედვით (სალარო თუ ონლაინ), დაბრუნებების გამოკლებით.',
      columns: { channel: 'არხი', ...KA_COMMON },
    },
    'revenue-by-location': {
      name: 'შემოსავალი ფილიალების მიხედვით',
      description: 'მიღებული თანხები ფილიალის მიხედვით, დაბრუნებების გამოკლებით.',
      columns: { ...KA_COMMON },
    },
    'revenue-by-payment-method': {
      name: 'შემოსავალი გადახდის მეთოდით',
      description:
        'როგორ შეგროვდა შემოსავალი - ნაღდი, ბარათი სალაროსთან, ონლაინ, საბანკო გადარიცხვა, სხვა მეთოდი - ფილიალების მიხედვით, დაბრუნებების გამოკლებით, თითოეული მეთოდის წილით.',
      columns: {
        method: 'გადახდის მეთოდი',
        payments: 'გადახდები',
        revenue: 'შემოსავალი',
        share: 'წილი შემოსავალში',
        location: KA_COMMON.location,
      },
    },
    'outstanding-invoices': {
      name: 'ინვოისები და გადახდები',
      description:
        'ყველა ინვოისი, რომელიც ამ პერიოდში გამოიწერა, და ყველა, რაც ჯერ კიდევ გადასახდელია: რისთვის, როდის გამოიწერა და როდისაა ვადა, რა გადაიხადეს და რა დარჩა, სტატუსი (გადახდილი, გადაუხდელი, ვადაგადაცილებული, მოსალოდნელი, დაბრუნებული), როგორ და როდის გადაიხადეს, და სად.',
      columns: {
        invoice: 'ინვოისი',
        member: KA_COMMON.member,
        item: 'გეგმა / შენაძენი',
        issuedAt: 'ინვოისის თარიღი',
        dueDate: 'ვადა',
        amount: KA_COMMON.amount,
        paid: 'გადახდილი',
        outstanding: 'დარჩენილი',
        status: KA_COMMON.status,
        method: 'გადახდის მეთოდი',
        paidAt: 'გადახდის თარიღი',
        location: KA_COMMON.location,
      },
    },
    'projected-revenue': {
      name: 'განმეორებადი და პროგნოზირებული შემოსავალი',
      description:
        'ყველა აქტიური გამოწერა: რა თანხით მეორდება, ღირებულება თვეში (თვის სვეტის ჯამი = მიმდინარე განმეორებადი შემოსავალი), შემდეგი ჩამოჭრის თარიღი და რა უნდა ჩამოიჭრას მომავალ პერიოდში (მოსალოდნელის სვეტის ჯამი = მოსალოდნელი შემოსავალი). დაგეგმილია, არა გარანტირებული: განახლება შეიძლება ჩავარდეს ან მანამდე გაუქმდეს.',
      columns: {
        member: KA_COMMON.member,
        plan: KA_COMMON.plan,
        recurring: 'განმეორებადი თანხა',
        interval: 'ბილინგი',
        monthly: 'თვეში',
        nextCharge: 'შემდეგი ჩამოჭრა',
        expected: 'მოსალოდნელი პერიოდში',
        status: KA_COMMON.status,
      },
    },
    'refunds-accounting': {
      name: 'დაბრუნებები (ბუღალტერია)',
      description:
        'დაბრუნებები პერიოდების მიხედვით იმ თანხების გვერდით, რომლებსაც აბრუნებს - საბუღალტრო ხედი. Chargeback-ები არ შედის: დავების მონაცემები სისტემაში ჯერ არ მოდის.',
      columns: {
        period: KA_COMMON.period,
        refunds: 'დაბრუნებები',
        refunded: KA_COMMON.refunded,
        gross: 'მიღებული',
        shareOfGross: 'წილი მთლიანში',
      },
    },
    'product-sales': {
      name: 'პროდუქტების გაყიდვები',
      description:
        'როგორ გაიყიდა ფიზიკური პროდუქტები სალაროსთან და ონლაინ: პროდუქტის, ვარიანტისა და ფილიალის მიხედვით - რაოდენობა, გაყიდვების ღირებულება, თვითღირებულება, მარჟა, საშუალო ფასი, სალარო / ონლაინ გაყოფა და რამდენმა გაყიდვამ მოიტანა.',
      columns: {
        product: 'პროდუქტი',
        variant: 'ვარიანტი',
        sku: 'SKU',
        category: 'კატეგორია',
        quantity: 'გაყიდული რაოდენობა',
        revenue: 'გაყიდვების ღირებულება',
        cogs: 'თვითღირებულება',
        margin: 'მარჟა',
        marginPct: 'მარჟა %',
        avgPrice: 'საშ. გასაყიდი ფასი',
        posSales: 'გაყიდვები სალაროსთან',
        onlineSales: 'ონლაინ გაყიდვები',
        transactions: 'ტრანზაქციები',
        location: KA_COMMON.location,
      },
    },
    'product-sales-detail': {
      name: 'პროდუქტების გაყიდვების დეტალები',
      description:
        'ყველა გაყიდული პროდუქტის ხაზი ამ პერიოდში: როდის, რა, რამდენი, ვის, რომელი არხით, რა ფასად და თვითღირებულებით, როგორ გადაიხადეს, სად, ვინ გაყიდა და რომელ გაყიდვას ეკუთვნის.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        product: 'პროდუქტი',
        variant: 'ვარიანტი',
        quantity: 'რაოდენობა',
        customer: 'მყიდველი',
        channel: 'არხი',
        price: 'გასაყიდი ფასი',
        cost: 'თვითღირებულება',
        margin: 'მარჟა',
        method: 'გადახდის მეთოდი',
        location: KA_COMMON.location,
        staff: 'თანამშრომელი',
        reference: 'ნომერი',
      },
    },
    'stock-inventory': {
      name: 'მარაგი და ინვენტარი',
      description:
        'ყველა პროდუქტისა და ვარიანტის მიმდინარე მარაგი, ერთეულის თვითღირებულება და მარაგის ღირებულება, მცირე მარაგის ზღვარი და სტატუსი მის მიმართ (მარაგშია, მცირე მარაგი, ამოწურულია, არ ითვლება). მარაგი პროდუქტზე ინახება, არა ფილიალზე.',
      columns: {
        product: 'პროდუქტი',
        variant: 'ვარიანტი',
        sku: 'SKU',
        stock: 'მიმდინარე მარაგი',
        unitCost: 'ერთეულის თვითღირებულება',
        stockValue: 'მარაგის ღირებულება',
        threshold: 'მცირე მარაგის ზღვარი',
        status: KA_COMMON.status,
      },
    },
    'stock-movements': {
      name: 'მარაგის მოძრაობის ისტორია',
      description:
        'პროდუქტების მარაგის ყველა ცვლილება ამ პერიოდში, ძველიდან ახლისკენ: ტიპი (საწყისი მარაგი, მიღებული, გაყიდვა სალაროსთან, ონლაინ გაყიდვა, მყიდველის დაბრუნება, ხელით შესწორება, ინვენტარიზაციის შესწორება, ჩამოწერა), ცვლილება, მარაგი მანამდე და მერე, ღირებულების გავლენა, საიდან მოვიდა, ვინ გააკეთა და შენიშვნა.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        product: 'პროდუქტი',
        variant: 'ვარიანტი',
        sku: 'SKU',
        type: 'მოძრაობის ტიპი',
        delta: 'რაოდენობის ცვლილება',
        before: 'მარაგი მანამდე',
        after: 'მარაგი მერე',
        valueImpact: 'ღირებულების გავლენა',
        reference: 'ნომერი',
        staff: 'თანამშრომელი',
        note: 'შენიშვნა',
      },
    },
    'attendance-by-class': {
      name: 'კლასები და დასწრება',
      description:
        'ყველა კლასის სესია ამ პერიოდში: ვინ ჩაატარა და სად, ტევადობა, რამდენმა დაჯავშნა, დაესწრო, გააუქმა, არ მოვიდა ან ადგილს ელოდა, და დატვირთვა ტევადობის მიმართ.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        class: KA_COMMON.class,
        trainer: KA_COMMON.trainer,
        location: KA_COMMON.location,
        capacity: 'ტევადობა',
        booked: 'დაჯავშნილი',
        attended: 'დაესწრო',
        cancelled: 'გაუქმებული',
        noShows: 'არ მოვიდა',
        waitlist: 'მოლოდინში',
        utilization: 'დატვირთვა',
      },
    },
    'class-utilization': {
      name: 'კლასების დატვირთვა',
      description:
        'დაჯავშნილი ადგილები შეთავაზებულთან შედარებით კლასების მიხედვით - რომელი სესიები ივსება და რომელი ცარიელი რჩება.',
      columns: {
        class: KA_COMMON.class,
        sessions: KA_COMMON.sessions,
        capacity: 'შეთავაზებული ადგილი',
        booked: 'დაჯავშნილი ადგილი',
        utilization: 'დატვირთვა',
      },
    },
    'class-cancellations': {
      name: 'კლასის ჯავშნები',
      description:
        'ყველა ჯავშანი ამ პერიოდის სესიებზე, თითო მწკრივი: ვინ, როდის დაჯავშნა, შედეგი (დაჯავშნილი, დაესწრო, არ მოვიდა, გაუქმებული, მოლოდინში), შემოვიდა თუ არა კლასის ირგვლივ, და ადგილი მოლოდინის სიაში. ჯავშნის გაუქმების დრო არ ინახება.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        class: KA_COMMON.class,
        trainer: KA_COMMON.trainer,
        location: KA_COMMON.location,
        member: KA_COMMON.member,
        bookedAt: 'დაჯავშნის დრო',
        status: 'დასწრების სტატუსი',
        checkedIn: 'შემოვიდა',
        waitlistPosition: 'ადგილი მოლოდინში',
      },
    },
    'waitlist-demand': {
      name: 'მოლოდინის სიის მოთხოვნა',
      description:
        'რამდენად ხშირად შეივსო კლასი და რამდენი დარჩა გარეთ - სად ღირს კიდევ ერთი სესია.',
      columns: {
        class: KA_COMMON.class,
        sessions: KA_COMMON.sessions,
        sessionsFull: 'სავსე სესია',
        waitlisted: 'მოლოდინში',
        fullRate: 'შევსების მაჩვენებელი',
      },
    },
    'pt-sessions': {
      name: 'პერსონალური სესიები',
      description:
        'ყველა პერსონალური სესია ამ პერიოდში, თითო მწკრივი: წევრის მიერ დაჯავშნილი სლოტი (მისი ინვოისით) და მწვრთნელის კალენდრის საკუთარი სესიები. არცერთი კრედიტების პაკეტს არ უკავშირდება, ამიტომ პაკეტის სვეტი ჯერ არ არის.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        member: KA_COMMON.member,
        trainer: KA_COMMON.trainer,
        location: KA_COMMON.location,
        status: KA_COMMON.status,
        duration: 'ხანგრძლივობა (წთ)',
        value: 'სესიის ღირებულება',
      },
    },
    'credit-usage': {
      name: 'PT პაკეტები და კრედიტების გამოყენება',
      description:
        'ყველა კრედიტების პაკეტი, რომელიც წევრს აქვს: ნაყიდი, გამოყენებული და დარჩენილი სესიები ან კრედიტები, როდის იწურება, ბოლო სესია, რომელიც მან დაფარა, და აქტიურია, ამოწურულია თუ ვადაგასული.',
      columns: {
        member: KA_COMMON.member,
        package: 'პაკეტი',
        purchased: 'ნაყიდი',
        used: 'გამოყენებული',
        remaining: 'დარჩენილი',
        expiresOn: 'იწურება',
        lastSession: 'ბოლო სესია',
        status: KA_COMMON.status,
      },
    },
    'trainer-activity': {
      name: 'მწვრთნელების აქტივობა',
      description:
        'რა გააკეთა თითოეულმა მწვრთნელმა პერიოდში: ჩატარებული კლასები და PT სესიები, რამდენი სხვადასხვა წევრი გაწვრთნა და როგორ დასრულდა კლასების ჯავშნები - დაესწრო, გაუქმდა, არ მოვიდა. ფილიალის სვეტში მისი კლასების ფილიალებია; PT სესიას ფილიალი არ აქვს.',
      columns: {
        trainer: KA_COMMON.trainer,
        location: KA_COMMON.location,
        classes: 'ჩატარებული კლასები',
        ptSessions: 'ჩატარებული PT სესიები',
        membersTrained: 'გაწვრთნილი წევრები',
        attended: 'კლასზე დასწრება',
        cancellations: 'გაუქმებები',
        noShows: 'არ მოვიდა',
      },
    },
    'trainer-activity-detail': {
      name: 'მწვრთნელების აქტივობის დეტალები',
      description:
        'პერიოდის ყველა კლასის ჯავშანი და PT სესია, თითო სტრიქონად, თავისი მწვრთნელის ქვეშ: როდის, რა ტიპის, რომელი კლასი ან სესია, რომელი წევრი, სად და როგორ დასრულდა.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        trainer: KA_COMMON.trainer,
        type: 'ტიპი',
        session: 'კლასი / სესია',
        member: KA_COMMON.member,
        location: KA_COMMON.location,
        status: KA_COMMON.status,
      },
    },
    'trainer-performance': {
      name: 'მწვრთნელების შედეგები',
      description:
        'ჩატარებული სესიები მწვრთნელების მიხედვით - ჯგუფური კლასები და პერსონალური სესიები - და რამდენად ივსებოდა მათი კლასები.',
      columns: {
        trainer: KA_COMMON.trainer,
        classes: 'კლასები',
        ptSessions: 'PT სესიები',
        seatsOffered: 'შეთავაზებული ადგილი',
        seatsBooked: 'დაჯავშნილი ადგილი',
        utilization: 'დატვირთვა',
      },
    },
    'no-show-rate': {
      name: 'გაცდენის მაჩვენებელი',
      description: 'ჩატარებული ჯავშნები და გაცდენის მაჩვენებელი მწვრთნელების მიხედვით.',
      columns: {
        trainer: KA_COMMON.trainer,
        completed: 'ჩატარებული ჯავშანი',
        noShow: 'გაცდენა',
        noShowRate: 'გაცდენის მაჩვენებელი',
      },
    },
    'trainer-sales': {
      name: 'მწვრთნელების გაყიდვები',
      description:
        'პერსონალური სესიების გაყიდვები მწვრთნელისა და ფილიალის მიხედვით: გაყიდული სესიების პაკეტები (მიეკუთვნება იმ თანამშრომელს, ვინც გაყიდა - პაკეტი მწვრთნელს არ უკავშირდება) და ჩატარებული PT სესიები (მიეკუთვნება მწვრთნელს, ვინც ატარებს, თითოეულის ინვოისით), და მათი ღირებულება.',
      columns: {
        trainer: KA_COMMON.trainer,
        packagesSold: 'გაყიდული PT პაკეტი',
        sessionsSold: 'გაყიდული PT სესია',
        totalValue: 'სულ გაყიდვების ღირებულება',
        location: KA_COMMON.location,
      },
    },
    'trainer-sales-detail': {
      name: 'მწვრთნელების გაყიდვების დეტალები',
      description:
        'ყველა პერსონალური სესიის გაყიდვა ამ პერიოდში, თითო მწკრივი: რომელ მწვრთნელს მიეკუთვნება, წევრი, პაკეტი ან სესია, რამდენ სესიას შეიცავს, თანხა, როდის და სად.',
      columns: {
        date: 'შეძენის თარიღი',
        trainer: KA_COMMON.trainer,
        member: KA_COMMON.member,
        package: 'პაკეტი',
        sessions: KA_COMMON.sessions,
        amount: KA_COMMON.amount,
        location: KA_COMMON.location,
      },
    },
    'staff-schedule': {
      name: 'პერსონალის განრიგი',
      description:
        'დაგეგმილი სამუშაო დრო: კვირეული ცვლების შაბლონი, დაპროექტებული პერიოდის ყველა დღეზე, რომელზეც მოდის. ცვლის ადგილი განრიგში ჩაწერილი ტექსტია, არა ფილიალის ჩანაწერი.',
      columns: {
        staff: 'თანამშრომელი',
        role: 'როლი',
        date: KA_COMMON.date,
        start: 'დაგეგმილი დაწყება',
        end: 'დაგეგმილი დასრულება',
        location: 'ადგილი',
      },
    },
    'audit-log': {
      name: 'აუდიტის ჟურნალი',
      description:
        'ჩაწერილი მოქმედებები ამ პერიოდში: ვინ, რა, რომელ ჩანაწერს შეეხო, და მნიშვნელობები მანამდე და მერე, სადაც ჩანაწერს აქვს. ჟურნალს დღეს პლატფორმის ოპერატორის მოქმედებები და შეფასებების მოდერაცია წერს; წევრების, ფასებისა და როლების რედაქტირება ჯერ არ აღწევს.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        staff: 'თანამშრომელი',
        action: 'მოქმედება',
        target: 'ჩანაწერი',
        previous: 'წინა მნიშვნელობა',
        next: 'ახალი მნიშვნელობა',
      },
    },
  },
  metrics: {
    sales: {
      name: 'გაყიდვები',
      description:
        'წმინდა გაყიდვები დროში, გადახდის მეთოდები, ვინ რა გაყიდა, საუკეთესო გეგმები და ბოლო დაბრუნებები.',
    },
    revenue: {
      name: 'შემოსავალი',
      description: 'მიღებული თანხები დროში, გეგმების, ფილიალებისა და თვეების მიხედვით.',
    },
    members: {
      name: 'წევრები',
      description:
        'ახალი წევრები დროში, აქტიური და ვადაგასული, გადინების ტენდენცია და თვიური ზრდა.',
    },
    attendance: {
      name: 'დასწრება',
      description: 'შემოსვლები დროში, პიკური საათების რუკა და დღიური ჭრილი.',
    },
    classes: {
      name: 'კლასები',
      description:
        'ყველაზე პოპულარული კლასები, დასწრება / გაცდენა / გაუქმება, გაუქმების ტენდენცია და თითო კლასის შედეგები.',
    },
    staff: {
      name: 'პერსონალი',
      description:
        'ჩატარებული კლასები, დასწრების მაჩვენებელი და დაჯავშნილი სესიები მწვრთნელების მიხედვით, შედეგების ცხრილით.',
    },
    pos: {
      name: 'სალარო',
      description:
        'დღიური გაყიდვები, თანხები გადახდის მეთოდით, პროდუქტების ჭრილი და დღის ბოლოს შეჯამებები.',
    },
    loyalty: {
      name: 'ლოიალობა',
      description:
        'დარიცხული ქულები დროში, დარიცხული და გამოყენებული, გამოყენება ჯილდოს ტიპით და ბოლო გამოყენებები.',
    },
  },
  kpis: {
    refunds: 'დაბრუნებები',
    'net-sales': 'წმინდა გაყიდვები',
    'sale-count': 'გაყიდვები',
    'total-revenue': 'წმინდა შემოსავალი',
    orders: 'შეკვეთები',
    'avg-order': 'საშ. შეკვეთა',
    refunded: 'დაბრუნებული',
    'total-members': 'სულ წევრი',
    'new-members': 'ახალი წევრები',
    'active-members': 'აქტიური',
    'churn-rate': 'გადინების მაჩვენებელი',
    'total-checkins': 'შემოსვლები',
    'unique-members': 'უნიკალური წევრი',
    'avg-per-day': 'საშ. დღეში',
    'classes-held': 'ჩატარებული კლასი',
    'total-booked': 'დაჯავშნილი ადგილი',
    'attendance-rate': 'დასწრების მაჩვენებელი',
    'cancellation-rate': 'გაუქმების მაჩვენებელი',
    trainers: 'აქტიური მწვრთნელი',
    transactions: 'ტრანზაქციები',
    'avg-sale': 'საშ. გაყიდვა',
    'points-issued': 'დარიცხული ქულა',
    'points-redeemed': 'გამოყენებული ქულა',
    'net-points': 'წმინდა ქულა',
    redemptions: 'გამოყენებები',
  },
  sections: {
    'net-sales-over-time': { title: 'წმინდა გაყიდვები დროში' },
    'sales-mix-by-method': { title: 'გაყიდვები გადახდის მეთოდით' },
    'sales-by-seller': { title: 'გაყიდვები თანამშრომლების მიხედვით' },
    'top-selling-plans': { title: 'ყველაზე გაყიდვადი გეგმები' },
    'recent-refunds': {
      title: 'ბოლო დაბრუნებები',
      columns: {
        date: KA_COMMON.date,
        order: 'შეკვეთა',
        amount: KA_COMMON.amount,
        reason: 'მიზეზი',
        processedBy: 'დაამუშავა',
      },
    },
    'revenue-over-time': { title: 'შემოსავალი დროში' },
    'revenue-by-plan': { title: 'შემოსავალი გეგმის ტიპით' },
    'revenue-by-location': { title: 'შემოსავალი ფილიალების მიხედვით' },
    'revenue-monthly': {
      title: 'თვიური ჭრილი',
      columns: { ...KA_COMMON, period: 'თვე' },
    },
    'new-members-over-time': { title: 'ახალი წევრები დროში' },
    'active-vs-expired': { title: 'აქტიური და ვადაგასული' },
    'churn-rate-trend': { title: 'გადინების ტენდენცია' },
    'members-monthly': {
      title: 'თვიური ჭრილი',
      columns: {
        period: 'თვე',
        newMembers: 'ახალი წევრები',
        churned: 'გავიდა',
        netGrowth: 'წმინდა ზრდა',
        totalMembers: 'სულ წევრი',
      },
    },
    'checkins-over-time': { title: 'შემოსვლები დროში' },
    'peak-hours': { title: 'პიკური საათები' },
    'attendance-daily': {
      title: 'დღიური ჭრილი',
      columns: { date: KA_COMMON.date, checkIns: 'შემოსვლები', uniqueMembers: 'უნიკალური წევრი' },
    },
    'most-popular-classes': { title: 'ყველაზე პოპულარული კლასები' },
    'attendance-distribution': { title: 'დასწრების განაწილება' },
    'cancellation-rate-trend': { title: 'გაუქმების ტენდენცია' },
    'class-performance': {
      title: 'კლასების შედეგები',
      columns: {
        class: KA_COMMON.class,
        sessions: KA_COMMON.sessions,
        booked: 'დაჯავშნილი',
        attended: 'დაესწრო',
        noShow: 'არ მოვიდა',
        fillRate: 'შევსება',
        attendanceRate: 'დასწრება',
      },
    },
    'classes-taught-per-trainer': { title: 'ჩატარებული კლასები მწვრთნელზე' },
    'attendance-rate-per-trainer': { title: 'დასწრების მაჩვენებელი მწვრთნელზე' },
    'sessions-booked-per-trainer': { title: 'დაჯავშნილი სესიები მწვრთნელზე' },
    'staff-performance': {
      title: 'პერსონალის შედეგები',
      columns: {
        trainer: KA_COMMON.trainer,
        classes: 'კლასები',
        booked: 'დაჯავშნილი',
        attended: 'დაესწრო',
        noShow: 'არ მოვიდა',
        attendanceRate: 'დასწრება',
        rating: 'საშ. შეფასება',
      },
    },
    'daily-sales': { title: 'დღიური გაყიდვები' },
    'sales-by-method': { title: 'გაყიდვები გადახდის მეთოდით' },
    'product-sales': { title: 'პროდუქტების გაყიდვები' },
    'end-of-day': {
      title: 'დღის ბოლოს შეჯამება',
      columns: { ...KA_COMMON, transactions: 'ტრანზაქციები' },
    },
    'points-issued-over-time': { title: 'დარიცხული ქულები დროში' },
    'points-issued-vs-redeemed': { title: 'დარიცხული და გამოყენებული' },
    'redemptions-by-reward-type': { title: 'გამოყენება ჯილდოს ტიპით' },
    'recent-redemptions': {
      title: 'ბოლო გამოყენებები',
      columns: {
        date: KA_COMMON.date,
        reward: 'ჯილდო',
        type: 'ტიპი',
        points: 'ქულა',
        status: KA_COMMON.status,
      },
    },
  },
  slices: {
    Active: 'აქტიური',
    Expired: 'ვადაგასული',
    Attended: 'დაესწრო',
    'No-show': 'არ მოვიდა',
    Cancelled: 'გაუქმებული',
    Issued: 'დარიცხული',
    Redeemed: 'გამოყენებული',
  },
  values: {
    cash: 'ნაღდი',
    card: 'ბარათი',
    bankTransfer: 'საბანკო გადარიცხვა',
    memberAccount: 'წევრის ანგარიში',
    other: 'სხვა',
    unattributed: 'მიუკუთვნებელი',
    unassigned: 'მიუნიჭებელი',
    noPlan: 'გეგმის გარეშე',
    noLocation: 'ფილიალის გარეშე',
    unknownMember: 'უცნობი',
    classFallback: 'კლასი',
    noShow: 'არ მოვიდა',
    cancelled: 'გაუქმებული',
    anniversary: 'იუბილე',
    birthday: 'დაბადების დღე',
    rewardTypes: {
      pt_session: 'PT სესია',
      day_pass: 'ერთდღიანი საშვი',
      guest_pass: 'სტუმრის საშვი',
      merchandise: 'პროდუქცია',
      drink: 'სასმელი',
      discount: 'ფასდაკლება',
      other: 'სხვა',
    },
    guest: 'სტუმარი',
    channelPos: 'სალარო',
    channelOnline: 'ონლაინ',
    statuses: {
      PENDING: 'მოლოდინში',
      PAID: 'გადახდილი',
      CANCELLED: 'გაუქმებული',
      REFUNDED: 'დაბრუნებული',
      PARTIALLY_REFUNDED: 'ნაწილობრივ დაბრუნებული',
    },
    categoryPlan: 'წევრობის გეგმა',
    categoryMembership: 'წევრობა',
    categorySessionPack: 'სესიების პაკეტი',
    categoryOneTimePlan: 'ერთჯერადი გეგმა',
    categoryPersonalTraining: 'პერსონალური სესია',
    categoryService: 'სერვისი',
    categoryUncategorised: 'კატეგორიის გარეშე',
    membershipStatuses: {
      active: 'აქტიური',
      new: 'ახალი',
      expiring: 'იწურება',
      renewalDue: 'განახლება მოსალოდნელია',
      expired: 'ვადაგასული',
      cancelled: 'გაუქმებული',
      frozen: 'გაყინული',
      none: 'წევრობის გარეშე',
    },
    retentionGroups: {
      renewalDue: 'განახლება მოსალოდნელია',
      expiringSoon: 'მალე იწურება',
      recentlyExpired: 'ახლახან ამოიწურა, არ განუახლებია',
      recentlyCancelled: 'ახლახან გაუქმდა',
      reactivated: 'დაბრუნდა',
      noVisit: 'ვიზიტი არ ყოფილა {days} დღე',
    },
    checkInMethods: { QR: 'QR კოდი', MANUAL: 'ხელით' },
    cardPos: 'ბარათი / სალარო',
    invoiceStatuses: {
      paid: 'გადახდილი',
      unpaid: 'გადაუხდელი',
      overdue: 'ვადაგადაცილებული',
      upcoming: 'მოსალოდნელი',
      refunded: 'დაბრუნებული',
    },
    invoiceTypes: {
      MEMBERSHIP: 'წევრობა',
      PERSONAL_TRAINING: 'პერსონალური სესია',
      CLASS: 'კლასი',
      PRODUCT: 'პროდუქტი',
      SERVICE: 'სერვისი',
      OTHER: 'სხვა',
    },
    intervals: { MONTH: 'თვიური', YEAR: 'წლიური' },
    stockStatuses: {
      inStock: 'მარაგშია',
      lowStock: 'მცირე მარაგი',
      outOfStock: 'ამოწურულია',
      notTracked: 'არ ითვლება',
    },
    movementTypes: {
      initial: 'საწყისი მარაგი',
      received: 'მიღებული მარაგი',
      posSale: 'გაყიდვა სალაროსთან',
      onlineSale: 'ონლაინ გაყიდვა',
      customerReturn: 'მყიდველის დაბრუნება',
      adjustment: 'ხელით შესწორება',
      recount: 'ინვენტარიზაციის შესწორება',
      writeOff: 'ჩამოწერა',
    },
    bookingStatuses: {
      BOOKED: 'დაჯავშნილი',
      WAITLIST: 'მოლოდინში',
      ATTENDED: 'დაესწრო',
      NO_SHOW: 'არ მოვიდა',
      CANCELED: 'გაუქმებული',
    },
    sessionStatuses: {
      SCHEDULED: 'დაგეგმილი',
      OPEN: 'ღია',
      BOOKED: 'დაჯავშნილი',
      COMPLETED: 'ჩატარებული',
      CANCELED: 'გაუქმებული',
      CANCELLED: 'გაუქმებული',
    },
    creditPackStatuses: { active: 'აქტიური', usedUp: 'ამოწურული', expired: 'ვადაგასული' },
    activityTypes: { class: 'კლასი', pt: 'PT სესია' },
    yes: 'დიახ',
    no: 'არა',
    roles: {
      SUPER_ADMIN: 'პლატფორმის ოპერატორი',
      OWNER: 'მფლობელი',
      MANAGER: 'მენეჯერი',
      RECEPTIONIST: 'ადმინისტრატორი',
      TRAINER: 'მწვრთნელი',
      MEMBER: 'წევრი',
    },
    auditActions: {
      'gym.create': 'დარბაზი შეიქმნა',
      'gym.status.update': 'სტატუსი შეიცვალა',
      'gym.impersonate': 'მოთხოვნილია სხვისი სახელით შესვლა',
      'gym.impersonate.start': 'დაიწყო სხვისი სახელით შესვლა',
    },
    weekdays: ['ორშ', 'სამ', 'ოთხ', 'ხუთ', 'პარ', 'შაბ', 'კვი'],
  },
  tabular: { summary: 'შეჯამება', metric: 'მაჩვენებელი', value: 'მნიშვნელობა', unit: 'ერთეული' },
};

/** The strings for a locale. */
export function reportStrings(locale: ReportLocale): ReportStrings {
  return locale === 'ka' ? KA : EN;
}

/* -------------------------------------------------------------------------- */
/*  Localising what the services emit                                          */
/* -------------------------------------------------------------------------- */

/** A report's columns with their labels in `locale`, keys untouched. */
export function localizeColumns(
  key: ReportKey,
  columns: ReportColumn[],
  locale: ReportLocale,
): ReportColumn[] {
  const labels = reportStrings(locale).catalogue[key].columns;
  return columns.map((column) => ({ ...column, label: labels[column.key] ?? column.label }));
}

/** A catalogue entry with its name, description and column labels in `locale`. */
export function localizeDefinition(
  definition: ReportDefinition,
  locale: ReportLocale,
): ReportDefinition {
  if (locale === 'en') return definition;
  const own = reportStrings(locale).catalogue[definition.key];
  return {
    ...definition,
    name: own.name,
    description: own.description,
    columns: localizeColumns(definition.key, definition.columns, locale),
  };
}

/** A computed catalogue report with its name and column labels in `locale`. */
export function localizeReportResult(result: ReportResult, locale: ReportLocale): ReportResult {
  if (locale === 'en') return result;
  return {
    ...result,
    name: reportStrings(locale).catalogue[result.key].name,
    columns: localizeColumns(result.key, result.columns, locale),
  };
}

/** One drill-down section with its title, column labels and slice labels in `locale`. */
function localizeSection(section: ReportSection, strings: ReportStrings): ReportSection {
  const own = strings.sections[section.id];
  const title = own?.title ?? section.title;
  switch (section.kind) {
    case 'table':
      return {
        ...section,
        title,
        columns: section.columns.map((column) => ({
          ...column,
          label: own?.columns?.[column.key] ?? column.label,
        })),
      };
    case 'split':
      return {
        ...section,
        title,
        slices: section.slices.map((slice) => ({
          ...slice,
          label: strings.slices[slice.label] ?? slice.label,
        })),
      };
    case 'heatmap': {
      // The peak-hours rows are weekday abbreviations, emitted in English; any
      // other row vocabulary is left alone.
      const isWeekdays = section.rowLabels.every((label, i) => label === EN.values.weekdays[i]);
      return {
        ...section,
        title,
        rowLabels: isWeekdays ? [...strings.values.weekdays] : section.rowLabels,
      };
    }
    default:
      return { ...section, title };
  }
}

/**
 * A drill-down with every fixed label in `locale`: the metric's name and
 * description, KPI labels by id, section titles by id, table column labels and
 * split slices. Series points, breakdown bars and table rows are DATA (dates,
 * plan names, members) and are never touched — the values the services write
 * into them are already localised at the source via {@link ReportStrings.values}.
 */
export function localizeDrilldown(
  drilldown: ReportDrilldown,
  locale: ReportLocale,
): ReportDrilldown {
  if (locale === 'en') return drilldown;
  const strings = reportStrings(locale);
  return {
    ...drilldown,
    name: strings.metrics[drilldown.metric].name,
    description: strings.metrics[drilldown.metric].description,
    kpis: drilldown.kpis.map((kpi) => ({ ...kpi, label: strings.kpis[kpi.id] ?? kpi.label })),
    sections: drilldown.sections.map((section) => localizeSection(section, strings)),
  };
}
