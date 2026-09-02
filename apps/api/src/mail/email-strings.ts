import type { EmailLocale } from './email-locale';

/**
 * Every fixed sentence the transactional emails carry, in both launch
 * languages. The builders in `EmailService` and the branded shell read from
 * here, so adding a language is adding one more block, not touching a dozen
 * templates. Anything a gym can edit (the Settings templates) lives in
 * `@fit/types`; anything a member reads that staff cannot change lives here.
 *
 * House rules for the copy: plain hyphens only (no long dashes), sentences a
 * person on a phone can read in one pass, and the same fact in the same place
 * in both languages so a bilingual gym's mails feel like one product.
 */
export interface EmailStrings {
  /** Fixed chrome shared by every mail. */
  shell: {
    /** Under the footer wordmark: what FormaCore is. */
    platformTagline: string;
    /** Above the raw URL under a button. */
    copyLink: string;
    /** Footer for a gym-sent mail: "Sent by {gym} on FormaCore." */
    sentBy: (gym: string) => string;
    /** Footer for an ops mail: "You're receiving this because you manage {gym} on FormaCore." */
    manageReason: (gym: string) => string;
    greeting: (name?: string) => string;
  };
  verify: {
    subject: string;
    eyebrow: string;
    heading: string;
    preheader: string;
    body: string;
    button: string;
    expires: string;
    ignore: string;
    footer: string;
  };
  reset: {
    subject: string;
    eyebrow: string;
    heading: string;
    preheader: string;
    body: string;
    button: string;
    expires: string;
    ignore: string;
    footer: string;
  };
  onboarding: {
    subject: (gym: string) => string;
    eyebrow: string;
    heading: (gym: string) => string;
    preheader: (gym: string) => string;
    /** `{gym}` is already wrapped in the strong tag by the builder. */
    body: (gymHtml: string) => string;
    button: string;
    expires: string;
    ignore: string;
    footer: (gym: string) => string;
  };
  invite: {
    subject: (gym: string) => string;
    eyebrow: string;
    heading: (gym: string, role: string) => string;
    preheader: (gym: string) => string;
    body: (gymHtml: string, role: string) => string;
    button: string;
    expires: string;
    ignore: string;
    /** Role names as they read inside the sentence. */
    roles: Record<string, string>;
  };
  receipt: {
    subject: (gym: string) => string;
    eyebrow: string;
    heading: string;
    preheader: (total: string, gym: string) => string;
    thanks: (gymHtml: string) => string;
    chargedTo: (member: string) => string;
    subtotal: string;
    discount: string;
    total: string;
    cashReceived: string;
    change: string;
    paidBy: (method: string) => string;
    methods: { cash: string; card: string; bank_transfer: string; member_account: string };
    footer: string;
  };
  invoice: {
    subject: (number: string, gym: string) => string;
    eyebrow: string;
    heading: (number: string) => string;
    preheader: (number: string, gym: string) => string;
    body: (name: string, number: string, gym: string, description: string) => string;
    footer: (gym: string) => string;
  };
  digest: {
    subject: (cadence: string, gym: string) => string;
    eyebrow: (cadence: string) => string;
    heading: (cadence: string) => string;
    cadence: { weekly: string; monthly: string };
    window: { weekly: string; monthly: string };
    preheader: (gym: string, window: string) => string;
    intro: (gymHtml: string, window: string) => string;
    empty: string;
    button: string;
    textTitle: (cadence: string, gym: string) => string;
  };
  lowStock: {
    subject: (count: number, gym: string) => string;
    eyebrow: string;
    heading: string;
    preheader: (count: number, gym: string) => string;
    intro: (count: number, gymHtml: string, threshold: number) => string;
    product: string;
    variant: string;
    onHand: string;
    button: string;
    textTitle: (gym: string) => string;
    textIntro: (count: number, threshold: number) => string;
    textRow: (product: string, variant: string, stock: number) => string;
  };
  daily: {
    subject: (date: string, gym: string) => string;
    eyebrow: string;
    heading: (date: string) => string;
    preheader: (revenue: string, orders: number, checkIns: number) => string;
    intro: (gymHtml: string, date: string) => string;
    revenue: string;
    orders: string;
    checkIns: string;
    newMembers: string;
    lowStock: string;
    button: string;
    textTitle: (gym: string, date: string) => string;
  };
}

const en: EmailStrings = {
  shell: {
    platformTagline: 'Management platform',
    copyLink: 'Or copy this link into your browser:',
    sentBy: (gym) => `Sent by ${gym} on FormaCore.`,
    manageReason: (gym) => `You're receiving this because you manage ${gym} on FormaCore.`,
    greeting: (name) => (name ? `Hi ${name},` : 'Hi,'),
  },
  verify: {
    subject: 'Verify your email',
    eyebrow: 'Confirm your email',
    heading: 'One more step to get started',
    preheader: 'Confirm your email address to finish setting up your FormaCore account.',
    body: 'Confirm your email address to finish setting up your FormaCore account. It takes a single click.',
    button: 'Verify my email',
    expires: 'This link expires in 24 hours.',
    ignore: "If you didn't create an account, you can safely ignore this email.",
    footer: "You're receiving this because an account was created with this address on FormaCore.",
  },
  reset: {
    subject: 'Reset your password',
    eyebrow: 'Password reset',
    heading: 'Choose a new password',
    preheader: 'Use the link inside to set a new password. It expires in 1 hour.',
    body: 'We received a request to reset the password for your FormaCore account. Pick a new one with the button below.',
    button: 'Reset my password',
    expires: 'This link expires in 1 hour.',
    ignore:
      "If you didn't request a reset, you can ignore this email - your password won't change.",
    footer:
      "You're receiving this because a password reset was requested for your FormaCore account.",
  },
  onboarding: {
    subject: (gym) => `Welcome to FormaCore - finish setting up ${gym}`,
    eyebrow: 'Welcome aboard',
    heading: (gym) => `${gym} is ready`,
    preheader: (gym) => `${gym} is set up on FormaCore. Confirm your email to sign in.`,
    body: (gymHtml) =>
      `${gymHtml} is ready on FormaCore. Confirm your email to finish setting up your gym and sign in to the console.`,
    button: 'Verify email and get started',
    expires: 'This link expires in 24 hours.',
    ignore: "If you didn't create this gym, you can safely ignore this email.",
    footer: (gym) =>
      `You're receiving this because ${gym} was registered on FormaCore with this address.`,
  },
  invite: {
    subject: (gym) => `You're invited to join ${gym} on FormaCore`,
    eyebrow: 'Team invitation',
    heading: (gym, role) => `Join ${gym} as a ${role}`,
    preheader: (gym) => `You've been invited to join ${gym} on FormaCore.`,
    body: (gymHtml, role) =>
      `You've been invited to join ${gymHtml} on FormaCore as a ${role}. Accept the invitation to set up your account and get started.`,
    button: 'Accept invitation',
    expires: 'This invitation expires in 7 days.',
    ignore: "If you weren't expecting it, you can safely ignore this email.",
    roles: {
      owner: 'owner',
      manager: 'manager',
      trainer: 'trainer',
      staff: 'staff member',
      member: 'member',
    },
  },
  receipt: {
    subject: (gym) => `Your receipt from ${gym}`,
    eyebrow: 'Receipt',
    heading: 'Your receipt',
    preheader: (total, gym) => `Your ${total} purchase at ${gym}.`,
    thanks: (gymHtml) => `Thanks for your purchase at ${gymHtml}.`,
    chargedTo: (member) => `Charged to ${member}.`,
    subtotal: 'Subtotal',
    discount: 'Discount',
    total: 'Total',
    cashReceived: 'Cash received',
    change: 'Change',
    paidBy: (method) => `Paid by ${method}.`,
    methods: {
      cash: 'Cash',
      card: 'Card',
      bank_transfer: 'Bank transfer',
      member_account: 'Member account',
    },
    footer: 'This is a receipt for your records. No payment is due.',
  },
  invoice: {
    subject: (number, gym) => `Invoice ${number} from ${gym}`,
    eyebrow: 'Invoice',
    heading: (number) => `Invoice ${number}`,
    preheader: (number, gym) => `Your invoice ${number} from ${gym} is attached as a PDF.`,
    body: (name, number, gym, description) =>
      `Hi ${name},\n\nYour invoice ${number} from ${gym} is attached.\n\n${description}\n\nThanks,\n${gym}`,
    footer: (gym) => `Sent by ${gym} on FormaCore. The invoice is attached as a PDF.`,
  },
  digest: {
    subject: (cadence, gym) => `${cadence} report digest - ${gym}`,
    eyebrow: (cadence) => `${cadence} digest`,
    heading: (cadence) => `${cadence} report digest`,
    cadence: { weekly: 'Weekly', monthly: 'Monthly' },
    window: { weekly: 'the past week', monthly: 'the past 30 days' },
    preheader: (gym, window) => `How ${gym} performed over ${window}.`,
    intro: (gymHtml, window) => `Here's how ${gymHtml} performed over ${window}.`,
    empty: 'No activity in this period.',
    button: 'View full reports',
    textTitle: (cadence, gym) => `${cadence} report digest for ${gym}`,
  },
  lowStock: {
    subject: (count, gym) =>
      `Low stock: ${count} ${count === 1 ? 'item' : 'items'} to reorder - ${gym}`,
    eyebrow: 'Inventory',
    heading: 'Low stock alert',
    preheader: (count, gym) => `${count} ${count === 1 ? 'item' : 'items'} to reorder at ${gym}.`,
    intro: (count, gymHtml, threshold) =>
      `${count} ${count === 1 ? 'item' : 'items'} at ${gymHtml} ${count === 1 ? 'is' : 'are'} at or below your reorder threshold of ${threshold}. Restock before they sell out.`,
    product: 'Product',
    variant: 'Variant',
    onHand: 'On hand',
    button: 'Manage products',
    textTitle: (gym) => `Low stock alert for ${gym}`,
    textIntro: (count, threshold) =>
      `${count} ${count === 1 ? 'item' : 'items'} at or below your reorder threshold of ${threshold}.`,
    textRow: (product, variant, stock) => `${product} - ${variant}: ${stock} on hand`,
  },
  daily: {
    subject: (date, gym) => `Daily summary ${date} - ${gym}`,
    eyebrow: 'End of day',
    heading: (date) => `Daily summary - ${date}`,
    preheader: (revenue, orders, checkIns) =>
      `${revenue} revenue, ${orders} paid orders, ${checkIns} check-ins.`,
    intro: (gymHtml, date) => `How ${gymHtml} did on ${date}.`,
    revenue: 'Revenue',
    orders: 'Paid orders',
    checkIns: 'Check-ins',
    newMembers: 'New members',
    lowStock: 'Low-stock products',
    button: 'Open dashboard',
    textTitle: (gym, date) => `Daily summary for ${gym} - ${date}`,
  },
};

const ka: EmailStrings = {
  shell: {
    platformTagline: 'მართვის პლატფორმა',
    copyLink: 'ან დააკოპირეთ ეს ბმული ბრაუზერში:',
    sentBy: (gym) => `გამოგზავნილია ${gym}-ის მიერ FormaCore-ზე.`,
    manageReason: (gym) => `ამ წერილს იღებთ, რადგან FormaCore-ზე ${gym}-ს მართავთ.`,
    greeting: (name) => (name ? `გამარჯობა, ${name},` : 'გამარჯობა,'),
  },
  verify: {
    subject: 'დაადასტურეთ ელფოსტა',
    eyebrow: 'ელფოსტის დადასტურება',
    heading: 'კიდევ ერთი ნაბიჯი დარჩა',
    preheader: 'დაადასტურეთ ელფოსტა, რომ FormaCore ანგარიშის შექმნა დაასრულოთ.',
    body: 'დაადასტურეთ თქვენი ელფოსტის მისამართი, რომ FormaCore ანგარიშის შექმნა დაასრულოთ. ეს ერთი დაწკაპუნებაა.',
    button: 'ელფოსტის დადასტურება',
    expires: 'ბმული 24 საათში იწურება.',
    ignore: 'თუ ანგარიში თქვენ არ შეგიქმნიათ, ეს წერილი უბრალოდ დააიგნორეთ.',
    footer: 'ამ წერილს იღებთ, რადგან ამ მისამართით FormaCore-ზე ანგარიში შეიქმნა.',
  },
  reset: {
    subject: 'პაროლის აღდგენა',
    eyebrow: 'პაროლის აღდგენა',
    heading: 'აირჩიეთ ახალი პაროლი',
    preheader: 'ახალი პაროლის დასაყენებლად გამოიყენეთ შიგნით მოცემული ბმული. ის 1 საათში იწურება.',
    body: 'მივიღეთ მოთხოვნა თქვენი FormaCore ანგარიშის პაროლის აღდგენაზე. ახალი პაროლი ქვემოთ მოცემული ღილაკით აირჩიეთ.',
    button: 'პაროლის შეცვლა',
    expires: 'ბმული 1 საათში იწურება.',
    ignore:
      'თუ პაროლის აღდგენა თქვენ არ მოგითხოვიათ, ეს წერილი დააიგნორეთ - თქვენი პაროლი არ შეიცვლება.',
    footer: 'ამ წერილს იღებთ, რადგან თქვენი FormaCore ანგარიშისთვის პაროლის აღდგენა მოითხოვეს.',
  },
  onboarding: {
    subject: (gym) => `კეთილი იყოს თქვენი მობრძანება FormaCore-ზე - დაასრულეთ ${gym}-ის მომზადება`,
    eyebrow: 'კეთილი იყოს თქვენი მობრძანება',
    heading: (gym) => `${gym} მზადაა`,
    preheader: (gym) => `${gym} FormaCore-ზე შეიქმნა. შესასვლელად დაადასტურეთ ელფოსტა.`,
    body: (gymHtml) =>
      `${gymHtml} FormaCore-ზე მზადაა. დაადასტურეთ ელფოსტა, რომ დარბაზის მომზადება დაასრულოთ და კონსოლში შეხვიდეთ.`,
    button: 'დადასტურება და დაწყება',
    expires: 'ბმული 24 საათში იწურება.',
    ignore: 'თუ ეს დარბაზი თქვენ არ შეგიქმნიათ, ეს წერილი უბრალოდ დააიგნორეთ.',
    footer: (gym) => `ამ წერილს იღებთ, რადგან ${gym} FormaCore-ზე ამ მისამართით დარეგისტრირდა.`,
  },
  invite: {
    subject: (gym) => `მოწვევა: შემოუერთდით ${gym}-ს FormaCore-ზე`,
    eyebrow: 'გუნდში მოწვევა',
    heading: (gym, role) => `შემოუერთდით ${gym}-ს ${role} როლით`,
    preheader: (gym) => `მოგიწვიეს ${gym}-ში FormaCore-ზე.`,
    body: (gymHtml, role) =>
      `მოგიწვიეს ${gymHtml}-ში FormaCore-ზე ${role} როლით. მოწვევის მისაღებად შექმენით ანგარიში და დაიწყეთ მუშაობა.`,
    button: 'მოწვევის მიღება',
    expires: 'მოწვევა 7 დღეში იწურება.',
    ignore: 'თუ ამ მოწვევას არ ელოდით, ეს წერილი უბრალოდ დააიგნორეთ.',
    roles: {
      owner: 'მფლობელის',
      manager: 'მენეჯერის',
      trainer: 'მწვრთნელის',
      staff: 'თანამშრომლის',
      member: 'წევრის',
    },
  },
  receipt: {
    subject: (gym) => `თქვენი ჩეკი - ${gym}`,
    eyebrow: 'ჩეკი',
    heading: 'თქვენი ჩეკი',
    preheader: (total, gym) => `თქვენი შენაძენი ${gym}-ში: ${total}.`,
    thanks: (gymHtml) => `გმადლობთ შენაძენისთვის ${gymHtml}-ში.`,
    chargedTo: (member) => `ჩამოიჭრა: ${member}.`,
    subtotal: 'ჯამი',
    discount: 'ფასდაკლება',
    total: 'სულ',
    cashReceived: 'მიღებული ნაღდი',
    change: 'ხურდა',
    paidBy: (method) => `გადახდის მეთოდი: ${method}.`,
    methods: {
      cash: 'ნაღდი',
      card: 'ბარათი',
      bank_transfer: 'საბანკო გადარიცხვა',
      member_account: 'წევრის ანგარიში',
    },
    footer: 'ეს ჩეკი თქვენი ჩანაწერებისთვისაა. გადასახდელი არაფერია.',
  },
  invoice: {
    subject: (number, gym) => `ინვოისი ${number} - ${gym}`,
    eyebrow: 'ინვოისი',
    heading: (number) => `ინვოისი ${number}`,
    preheader: (number, gym) => `თქვენი ინვოისი ${number} ${gym}-იდან PDF ფაილად არის მიმაგრებული.`,
    body: (name, number, gym, description) =>
      `გამარჯობა, ${name},\n\nთქვენი ინვოისი ${number} ${gym}-იდან წერილს ახლავს.\n\n${description}\n\nმადლობით,\n${gym}`,
    footer: (gym) =>
      `გამოგზავნილია ${gym}-ის მიერ FormaCore-ზე. ინვოისი PDF ფაილად არის მიმაგრებული.`,
  },
  digest: {
    subject: (cadence, gym) => `${cadence} ანგარიშების შეჯამება - ${gym}`,
    eyebrow: (cadence) => `${cadence} შეჯამება`,
    heading: (cadence) => `${cadence} ანგარიშების შეჯამება`,
    cadence: { weekly: 'ყოველკვირეული', monthly: 'ყოველთვიური' },
    window: { weekly: 'გასულ კვირაში', monthly: 'ბოლო 30 დღეში' },
    preheader: (gym, window) => `როგორ იმუშავა ${gym}-მა ${window}.`,
    intro: (gymHtml, window) => `აი, როგორ იმუშავა ${gymHtml}-მა ${window}.`,
    empty: 'ამ პერიოდში აქტივობა არ ყოფილა.',
    button: 'სრული ანგარიშების ნახვა',
    textTitle: (cadence, gym) => `${cadence} ანგარიშების შეჯამება - ${gym}`,
  },
  lowStock: {
    subject: (count, gym) => `მარაგი იწურება: ${count} პოზიცია შესავსებია - ${gym}`,
    eyebrow: 'მარაგები',
    heading: 'მარაგი იწურება',
    preheader: (count, gym) => `${gym}-ში ${count} პოზიცია შესავსებია.`,
    intro: (count, gymHtml, threshold) =>
      `${gymHtml}-ში ${count} პოზიცია შესავსები ზღვარზეა ან მის ქვემოთ (ზღვარი: ${threshold}). შეავსეთ მარაგი, სანამ გაიყიდება.`,
    product: 'პროდუქტი',
    variant: 'ვარიანტი',
    onHand: 'მარაგში',
    button: 'პროდუქტების მართვა',
    textTitle: (gym) => `მარაგი იწურება - ${gym}`,
    textIntro: (count, threshold) =>
      `${count} პოზიცია შესავსები ზღვარზეა ან მის ქვემოთ (ზღვარი: ${threshold}).`,
    textRow: (product, variant, stock) => `${product} - ${variant}: მარაგში ${stock}`,
  },
  daily: {
    subject: (date, gym) => `დღის შეჯამება ${date} - ${gym}`,
    eyebrow: 'დღის დასასრული',
    heading: (date) => `დღის შეჯამება - ${date}`,
    preheader: (revenue, orders, checkIns) =>
      `შემოსავალი ${revenue}, ${orders} გადახდილი შეკვეთა, ${checkIns} ვიზიტი.`,
    intro: (gymHtml, date) => `როგორ ჩაიარა ${date}-მა ${gymHtml}-ში.`,
    revenue: 'შემოსავალი',
    orders: 'გადახდილი შეკვეთები',
    checkIns: 'ვიზიტები',
    newMembers: 'ახალი წევრები',
    lowStock: 'პროდუქტები დაბალი მარაგით',
    button: 'დაფის გახსნა',
    textTitle: (gym, date) => `დღის შეჯამება - ${gym} - ${date}`,
  },
};

/** The copy set for one locale. */
export const EMAIL_STRINGS: Record<EmailLocale, EmailStrings> = { en, ka };

/** Shorthand for the copy set a builder renders with. */
export function emailStrings(locale: EmailLocale): EmailStrings {
  return EMAIL_STRINGS[locale];
}
