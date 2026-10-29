import Link from 'next/link';
import type {
  BlogLang,
  PublicBlogPostListResponse,
  PublicBlogCategoryListResponse,
  PublicBlogTagListResponse,
} from '@fit/types';
import { BlogShell } from './blog-shell';
import { blogDate, blogPath, dictionary, postPath } from './dictionary';

export function blogListUrl(
  lang: BlogLang,
  filters: { category?: string; tag?: string; page?: number },
): string {
  const query = new URLSearchParams();
  if (filters.category) query.set('category', filters.category);
  if (filters.tag) query.set('tag', filters.tag);
  if (filters.page && filters.page > 1) query.set('page', String(filters.page));
  return `${blogPath(lang)}${query.size ? `?${query}` : ''}`;
}
const chip =
  'inline-flex rounded-full border px-4 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500';
function chipClass(active: boolean): string {
  return `${chip} ${active ? 'border-brand-500 bg-brand-500 text-white' : 'border-overlay/15 bg-overlay/[0.04] text-strong hover:bg-overlay/10'}`;
}
export function BlogListPage({
  lang,
  posts,
  categories,
  tags,
  category,
  tag,
}: {
  lang: BlogLang;
  posts: PublicBlogPostListResponse;
  categories: PublicBlogCategoryListResponse;
  tags: PublicBlogTagListResponse;
  category?: string;
  tag?: string;
}) {
  const d = dictionary[lang];
  const pages = Math.ceil(posts.total / posts.pageSize);
  return (
    <BlogShell lang={lang}>
      <header className="mb-12 max-w-2xl">
        <p className="mb-4 font-mono text-xs tracking-widest text-brand-600 dark:text-brand-300">
          FormaCore
        </p>
        <h1 className="font-display text-5xl font-black tracking-tight sm:text-7xl">{d.blog}</h1>
        <p className="mt-6 text-lg leading-relaxed text-muted">{d.intro}</p>
        <Link
          href={blogPath(lang === 'en' ? 'ka' : 'en')}
          hrefLang={lang === 'en' ? 'ka' : 'en'}
          className="mt-5 inline-block text-sm text-brand-600 underline dark:text-brand-300"
        >
          {d.otherLanguage}: {lang === 'en' ? 'ქართული' : 'English'}
        </Link>
      </header>
      <div className="mb-10 space-y-5 border-y border-overlay/10 py-6">
        <nav aria-label={d.categories} className="flex flex-wrap items-center gap-2">
          <span className="mr-3 text-sm font-semibold text-muted">{d.categories}</span>
          <Link
            href={blogListUrl(lang, { tag })}
            aria-current={!category ? 'page' : undefined}
            className={chipClass(!category)}
          >
            {d.allPosts}
          </Link>
          {categories.items.map((item) => (
            <Link
              key={item.slug}
              href={blogListUrl(lang, { category: item.slug, tag })}
              aria-current={category === item.slug ? 'page' : undefined}
              className={chipClass(category === item.slug)}
            >
              {item.name}
            </Link>
          ))}
        </nav>
        {tags.items.length > 0 && (
          <nav aria-label={d.tags} className="flex flex-wrap items-center gap-2">
            <span className="mr-3 text-sm font-semibold text-muted">{d.tags}</span>
            <Link
              href={blogListUrl(lang, { category })}
              aria-current={!tag ? 'page' : undefined}
              className={chipClass(!tag)}
            >
              {d.allPosts}
            </Link>
            {tags.items.map((item) => (
              <Link
                key={item.tag}
                href={blogListUrl(lang, { category, tag: item.tag })}
                aria-current={tag === item.tag ? 'page' : undefined}
                className={chipClass(tag === item.tag)}
              >
                #{item.tag}
              </Link>
            ))}
          </nav>
        )}
      </div>
      {posts.items.length === 0 ? (
        <p className="rounded-3xl border border-overlay/10 bg-overlay/[0.03] px-6 py-20 text-center text-lg text-muted">
          {d.empty}
        </p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {posts.items.map((post) => (
            <article
              key={post.id}
              className="group overflow-hidden rounded-3xl border border-overlay/10 bg-surface/60 transition hover:border-brand-500/40"
            >
              {post.coverImageUrl && (
                <Link href={postPath(post.slug, lang)} tabIndex={-1} aria-hidden="true">
                  <img
                    src={post.coverImageUrl}
                    alt=""
                    loading="lazy"
                    className="aspect-[16/10] w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                  />
                </Link>
              )}
              <div className="p-6">
                <div className="flex flex-wrap gap-3 text-xs text-muted">
                  <time dateTime={post.publishAt}>{blogDate(post.publishAt, lang)}</time>
                  {post.category && (
                    <span className="text-brand-600 dark:text-brand-300">{post.category.name}</span>
                  )}
                </div>
                <h2 className="mt-4 break-words font-display text-2xl font-bold tracking-tight">
                  <Link href={postPath(post.slug, lang)}>{post.title}</Link>
                </h2>
                {post.excerpt && (
                  <p className="mt-3 line-clamp-3 break-words leading-relaxed text-muted">
                    {post.excerpt}
                  </p>
                )}
                <Link
                  href={postPath(post.slug, lang)}
                  className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-600 dark:text-brand-300"
                >
                  {d.readMore}
                  <span aria-hidden="true">→</span>
                  <span className="sr-only">: {post.title}</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
      {pages > 1 && (
        <nav aria-label={d.page} className="mt-12 flex flex-wrap items-center justify-center gap-5">
          {posts.page > 1 && (
            <Link
              className={chipClass(false)}
              href={blogListUrl(lang, { category, tag, page: posts.page - 1 })}
            >
              {d.previous}
            </Link>
          )}
          <span className="text-sm text-muted">
            {d.page} {posts.page} / {pages}
          </span>
          {posts.page < pages && (
            <Link
              className={chipClass(false)}
              href={blogListUrl(lang, { category, tag, page: posts.page + 1 })}
            >
              {d.next}
            </Link>
          )}
        </nav>
      )}
    </BlogShell>
  );
}
