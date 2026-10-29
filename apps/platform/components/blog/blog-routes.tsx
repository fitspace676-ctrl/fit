import type { Metadata } from 'next';
import type { BlogLang, PublicBlogPost } from '@fit/types';
import { notFound, redirect } from 'next/navigation';
import { fetchBlogCategories, fetchBlogPost, fetchBlogPosts, fetchBlogTags } from '@/lib/blog';
import { BlogListPage } from './blog-list-page';
import { BlogPostPage } from './blog-post-page';
import { blogPath, dictionary, postPath } from './dictionary';

export const BLOG_ORIGIN = 'https://formacore.io';
export type BlogSearchParams = Promise<Record<string, string | string[] | undefined>>;
export type BlogPostParams = Promise<{ slug: string }>;

export function listMetadata(lang: BlogLang): Metadata {
  return {
    title: `${dictionary[lang].blog} - FormaCore`,
    description: dictionary[lang].description,
    alternates: {
      canonical: `${BLOG_ORIGIN}${blogPath(lang)}`,
      languages: { en: `${BLOG_ORIGIN}/blog`, ka: `${BLOG_ORIGIN}/ka/blog` },
      types: { 'application/rss+xml': `${BLOG_ORIGIN}${blogPath(lang)}/feed.xml` },
    },
  };
}
export async function BlogListingRoute({
  lang,
  searchParams,
}: {
  lang: BlogLang;
  searchParams: BlogSearchParams;
}) {
  const query = await searchParams;
  const category = typeof query.category === 'string' ? query.category : undefined;
  const tag = typeof query.tag === 'string' ? query.tag : undefined;
  const rawPage = typeof query.page === 'string' ? Number(query.page) : 1;
  const page = Number.isInteger(rawPage) && rawPage >= 1 && rawPage <= 10000 ? rawPage : 1;
  const [posts, categories, tags] = await Promise.all([
    fetchBlogPosts({ lang, category, tag, page }),
    fetchBlogCategories(lang),
    fetchBlogTags(lang),
  ]);
  return <BlogListPage {...{ lang, posts, categories, tags, category, tag }} />;
}
async function resolvePost(slug: string, lang: BlogLang): Promise<PublicBlogPost> {
  const post = await fetchBlogPost(slug, lang);
  if (post) return post;
  if (lang === 'en' && (await fetchBlogPost(slug, 'ka'))) redirect(postPath(slug, 'ka'));
  notFound();
}
export async function postMetadata(params: BlogPostParams, lang: BlogLang): Promise<Metadata> {
  const { slug } = await params;
  const post = await resolvePost(slug, lang);
  const title = post.metaTitle ?? post.title;
  const description = post.metaDescription ?? post.excerpt ?? undefined;
  const image = post.ogImageUrl ?? post.coverImageUrl;
  const canonical = `${BLOG_ORIGIN}${postPath(slug, lang)}`;
  return {
    title,
    description,
    openGraph: {
      type: 'article',
      title,
      description,
      url: canonical,
      publishedTime: post.publishAt,
      modifiedTime: post.updatedAt,
      ...(image ? { images: [image] } : {}),
    },
    alternates: {
      canonical,
      languages: Object.fromEntries(
        post.availableLangs.map((language) => [
          language,
          `${BLOG_ORIGIN}${postPath(slug, language)}`,
        ]),
      ),
    },
  };
}
export async function BlogArticleRoute({
  lang,
  params,
}: {
  lang: BlogLang;
  params: BlogPostParams;
}) {
  const { slug } = await params;
  return <BlogPostPage lang={lang} post={await resolvePost(slug, lang)} />;
}
