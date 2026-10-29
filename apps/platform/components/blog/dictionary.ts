import type { BlogLang } from '@fit/types';

export const dictionary = {
  en: {
    blog: 'Blog',
    allPosts: 'All posts',
    categories: 'Categories',
    tags: 'Tags',
    readMore: 'Read more',
    back: 'Back to blog',
    published: 'Published',
    writtenBy: 'Written by',
    page: 'Page',
    previous: 'Previous',
    next: 'Next',
    empty: 'No posts yet',
    otherLanguage: 'Other language',
    intro: 'Ideas, stories and practical guidance for your gym.',
    description: 'News and practical guidance from FormaCore.',
  },
  ka: {
    blog: 'ბლოგი',
    allPosts: 'ყველა სტატია',
    categories: 'კატეგორიები',
    tags: 'ტეგები',
    readMore: 'წაიკითხე მეტი',
    back: 'ბლოგზე დაბრუნება',
    published: 'გამოქვეყნდა',
    writtenBy: 'ავტორი',
    page: 'გვერდი',
    previous: 'წინა',
    next: 'შემდეგი',
    empty: 'სტატიები ჯერ არ არის',
    otherLanguage: 'სხვა ენა',
    intro: 'იდეები, ამბები და პრაქტიკული რჩევები თქვენი დარბაზისთვის.',
    description: 'სიახლეები და პრაქტიკული რჩევები FormaCore-ისგან.',
  },
} satisfies Record<BlogLang, Record<string, string>>;

export const blogPath = (lang: BlogLang): string => (lang === 'ka' ? '/ka/blog' : '/blog');
export const postPath = (slug: string, lang: BlogLang): string =>
  `${blogPath(lang)}/${encodeURIComponent(slug)}`;
export const blogDate = (value: string, lang: BlogLang): string =>
  new Intl.DateTimeFormat(lang === 'ka' ? 'ka-GE' : 'en-GB', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(value));
