import type {
  BlogLang,
  PublicBlogPost,
  PublicBlogPostListResponse,
  PublicBlogCategoryListResponse,
  PublicBlogTagListResponse,
  PublicBlogIndexResponse,
} from '@fit/types';

async function blogFetch<T>(path: string, allowMissing = false): Promise<T | null> {
  const base = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3005';
  const response = await fetch(`${base.replace(/\/$/, '')}/platform/blog/${path}`, {
    next: { revalidate: 60 },
  });
  if (allowMissing && response.status === 404) return null;
  if (!response.ok) throw new Error(`Blog API failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchBlogPosts({
  lang,
  category,
  tag,
  page = 1,
  pageSize = 12,
}: {
  lang: BlogLang;
  category?: string;
  tag?: string;
  page?: number;
  pageSize?: number;
}): Promise<PublicBlogPostListResponse> {
  const query = new URLSearchParams({ lang, page: String(page), pageSize: String(pageSize) });
  if (category) query.set('category', category);
  if (tag) query.set('tag', tag);
  return (await blogFetch<PublicBlogPostListResponse>(`posts?${query}`))!;
}
export function fetchBlogPost(slug: string, lang: BlogLang): Promise<PublicBlogPost | null> {
  return blogFetch<PublicBlogPost>(`posts/${encodeURIComponent(slug)}?lang=${lang}`, true);
}
export async function fetchBlogCategories(lang: BlogLang): Promise<PublicBlogCategoryListResponse> {
  return (await blogFetch<PublicBlogCategoryListResponse>(`categories?lang=${lang}`))!;
}
export async function fetchBlogTags(lang: BlogLang): Promise<PublicBlogTagListResponse> {
  return (await blogFetch<PublicBlogTagListResponse>(`tags?lang=${lang}`))!;
}
export async function fetchBlogIndex(): Promise<PublicBlogIndexResponse> {
  return (await blogFetch<PublicBlogIndexResponse>('index'))!;
}
