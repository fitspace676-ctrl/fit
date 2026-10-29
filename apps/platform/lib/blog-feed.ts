import type { BlogLang } from '@fit/types';
import { fetchBlogPosts } from './blog';
import { blogPath, dictionary, postPath } from '@/components/blog/dictionary';

export function escapeXml(value: string): string {
  return value.replace(
    /[<>&"']/g,
    (character) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character]!,
  );
}
export async function blogFeed(lang: BlogLang): Promise<Response> {
  const posts = await fetchBlogPosts({ lang, page: 1, pageSize: 50 });
  const origin = 'https://formacore.io';
  const items = posts.items
    .map((post) => {
      const url = escapeXml(`${origin}${postPath(post.slug, lang)}`);
      return `<item><title>${escapeXml(post.title)}</title><link>${url}</link><description>${escapeXml(post.excerpt ?? '')}</description><pubDate>${new Date(post.publishAt).toUTCString()}</pubDate><guid isPermaLink="true">${url}</guid></item>`;
    })
    .join('');
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>FormaCore ${dictionary[lang].blog}</title><link>${origin}${blogPath(lang)}</link><description>${escapeXml(dictionary[lang].description)}</description><language>${lang}</language><atom:link href="${origin}${blogPath(lang)}/feed.xml" rel="self" type="application/rss+xml"/>${items}</channel></rss>`,
    {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=60',
      },
    },
  );
}
