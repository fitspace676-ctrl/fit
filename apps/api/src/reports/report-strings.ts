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
    categoryPersonalTraining: 'Personal training',
    categoryService: 'Service',
    categoryUncategorised: 'Uncategorised',
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
        'რა გაიყიდა - წევრობები, სესიების პაკეტები, პერსონალური ვარჯიშები, სხვა სერვისები და პროდუქტები - რამდენი, რა თანხად, თითოეულის წილი პერიოდის გაყიდვებში და რომელ ფილიალში.',
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
        'ყოველი დღის შემოსავალი და როგორ შეგროვდა - ნაღდი, ბარათი სალაროსთან, ონლაინ, საბანკო გადარიცხვა, წევრის ანგარიში - გაცემული დაბრუნებების, გაყიდვების რაოდენობისა და ჯამის უკან მდგომი ჩეკების გვერდით.',
      columns: {
        date: KA_COMMON.date,
        total: 'სულ გაყიდვები',
        cash: 'ნაღდი',
        card: 'ბარათი / სალარო',
        online: 'ონლაინ',
        bankTransfer: 'საბანკო გადარიცხვა',
        memberAccount: 'წევრის ანგარიში',
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
      name: 'რისკის ქვეშ მყოფი წევრები',
      description:
        'აქტიური წევრები, რომლებიც დიდი ხანია არ მოსულან - ვისთანაც დაკავშირება ღირს, სანამ წავლენ.',
      columns: {
        member: KA_COMMON.member,
        plan: KA_COMMON.plan,
        lastVisit: KA_COMMON.lastVisit,
        daysAway: 'დღე გასული',
        phone: KA_COMMON.phone,
        email: KA_COMMON.email,
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
      name: 'წევრების სია',
      description: 'ყველა წევრი სტატუსით, გეგმით, გაწევრიანების თარიღითა და ბოლო ვიზიტით.',
      columns: {
        member: KA_COMMON.member,
        status: KA_COMMON.status,
        plan: KA_COMMON.plan,
        joined: 'გაწევრიანდა',
        lastVisit: KA_COMMON.lastVisit,
        email: KA_COMMON.email,
      },
    },
    'member-check-in-log': {
      name: 'შემოსვლების ჟურნალი',
      description: 'ყველა ვიზიტი ამ პერიოდში - ვინ, როდის, როგორ და რომელ ფილიალში.',
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
    'outstanding-invoices': {
      name: 'გადაუხდელი ინვოისები',
      description:
        'გადაუხდელი და ჩავარდნილი ინვოისები, ყველაზე ვადაგადაცილებული პირველი, ვინ რამდენს არის ვალში.',
      columns: {
        invoice: 'ინვოისი',
        member: KA_COMMON.member,
        amount: KA_COMMON.amount,
        dueDate: 'ვადა',
        daysOverdue: 'დღე გადაცილებული',
        status: KA_COMMON.status,
      },
    },
    'projected-revenue': {
      name: 'პროგნოზირებული შემოსავალი',
      description:
        'მომავალ პერიოდში ვადამოსული გამოწერის განახლებები და რა თანხის ჩამოჭრაა დაგეგმილი.',
      columns: { period: KA_COMMON.period, renewals: 'განახლებები', expected: 'მოსალოდნელი' },
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
    'attendance-by-class': {
      name: 'კლასებზე დასწრება',
      description:
        'დაჯავშნილი, დასწრებული და გაცდენილი ადგილები კლასების მიხედვით, ორივე მაჩვენებლით.',
      columns: {
        class: KA_COMMON.class,
        trainer: KA_COMMON.trainer,
        booked: 'დაჯავშნილი',
        attended: 'დაესწრო',
        noShow: 'არ მოვიდა',
        attendanceRate: 'დასწრების მაჩვენებელი',
        noShowRate: 'გაცდენის მაჩვენებელი',
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
      name: 'გაუქმებები და გაცდენები',
      description: 'ვინ გააუქმა ან არ მოვიდა, სათითაოდ - წესებისა და გაცდენის საფასურისთვის.',
      columns: {
        date: KA_COMMON.date,
        time: KA_COMMON.time,
        class: KA_COMMON.class,
        member: KA_COMMON.member,
        outcome: 'შედეგი',
        trainer: KA_COMMON.trainer,
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
      name: 'პერსონალური ვარჯიშები',
      description:
        'პერსონალური ვარჯიშები მწვრთნელების მიხედვით. შემოსავალი არ შედის: PT სესიას ფასი არ აქვს, თანხა იმ კრედიტების პაკეტშია, რომლითაც გადაიხადეს.',
      columns: {
        trainer: KA_COMMON.trainer,
        sessions: KA_COMMON.sessions,
        completed: 'ჩატარებული',
        cancelled: 'გაუქმებული',
        completionRate: 'ჩატარების მაჩვენებელი',
      },
    },
    'trainer-performance': {
      name: 'მწვრთნელების შედეგები',
      description:
        'ჩატარებული სესიები მწვრთნელების მიხედვით - ჯგუფური კლასები და პერსონალური ვარჯიშები - და რამდენად ივსებოდა მათი კლასები.',
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
    'gross-sales': 'მთლიანი გაყიდვები',
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
    categoryPersonalTraining: 'პერსონალური ვარჯიში',
    categoryService: 'სერვისი',
    categoryUncategorised: 'კატეგორიის გარეშე',
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
