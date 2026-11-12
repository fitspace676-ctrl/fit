import type { BlogLang } from '@fit/types';

export const dictionary = {
  en: {
    resources: 'Resources',
    allPosts: 'All posts',
    tags: 'Tags',
    readMore: 'Read more',
    back: 'Back to resources',
    published: 'Published',
    writtenBy: 'Written by',
    page: 'Page',
    previous: 'Previous',
    next: 'Next',
    empty: 'No resources yet',
    otherLanguage: 'Other language',
    metaTitle: 'Gym Management Guides and Resources | FormaCore',
    description:
      'Practical guides for gym and studio owners: memberships, class bookings, member retention and running the front desk, from the FormaCore team.',
  },
  ka: {
    resources: 'რესურსები',
    allPosts: 'ყველა სტატია',
    tags: 'ტეგები',
    readMore: 'წაიკითხე მეტი',
    back: 'რესურსებზე დაბრუნება',
    published: 'გამოქვეყნდა',
    writtenBy: 'ავტორი',
    page: 'გვერდი',
    previous: 'წინა',
    next: 'შემდეგი',
    empty: 'რესურსები ჯერ არ არის',
    otherLanguage: 'სხვა ენა',
    metaTitle: 'დარბაზის მართვის რჩევები და რესურსები | FormaCore',
    description:
      'პრაქტიკული რჩევები დარბაზებისა და სტუდიების მფლობელებისთვის: აბონემენტები, ჯავშნები, წევრების შენარჩუნება და მიმღების მუშაობა. FormaCore-ის გუნდისგან.',
  },
} satisfies Record<BlogLang, Record<string, string>>;

export const blogPath = (lang: BlogLang): string =>
  lang === 'ka' ? '/ka/resources' : '/resources';
export const postPath = (slug: string, lang: BlogLang): string =>
  `${blogPath(lang)}/${encodeURIComponent(slug)}`;
export const blogDate = (value: string, lang: BlogLang): string =>
  new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(value));
