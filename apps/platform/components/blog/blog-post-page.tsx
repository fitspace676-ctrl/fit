import Link from 'next/link';
import type { BlogLang, PublicBlogPost } from '@fit/types';
import { sanitizeBlogHtml } from '@/lib/blog-html';
import { BlogShell } from './blog-shell';
import { blogDate, blogPath, dictionary, postPath } from './dictionary';
import { blogListUrl } from './blog-list-page';

export function BlogPostPage({ post, lang }: { post: PublicBlogPost; lang: BlogLang }) {
  const d = dictionary[lang];
  const other = lang === 'en' ? 'ka' : 'en';
  return (
    <BlogShell lang={lang}>
      <article>
        <div className="mx-auto max-w-[760px]">
          <Link href={blogPath(lang)} className="text-sm text-brand-600 dark:text-brand-300">
            ← {d.back}
          </Link>
          {post.category && (
            <Link
              href={blogListUrl(lang, { category: post.category.slug })}
              className="mt-8 block text-sm font-semibold text-brand-600 dark:text-brand-300"
            >
              {post.category.name}
            </Link>
          )}
          <h1 className="mt-5 break-words font-display text-4xl font-black leading-tight tracking-tight sm:text-6xl">
            {post.title}
          </h1>
          {post.excerpt && (
            <p className="mt-6 break-words text-xl leading-relaxed text-muted">{post.excerpt}</p>
          )}
          <div className="my-8 flex flex-wrap items-center gap-6 text-sm text-muted">
            {post.author && (
              <div className="flex items-center gap-3">
                {post.author.photoUrl && (
                  <img
                    src={post.author.photoUrl}
                    alt=""
                    className="h-11 w-11 rounded-full object-cover"
                  />
                )}
                <div>
                  <p className="text-xs">{d.writtenBy}</p>
                  <p className="font-semibold text-fg">{post.author.name}</p>
                </div>
              </div>
            )}
            <div>
              <p className="text-xs">{d.published}</p>
              <time dateTime={post.publishAt}>{blogDate(post.publishAt, lang)}</time>
            </div>
            {post.availableLangs.includes(other) && (
              <Link
                href={postPath(post.slug, other)}
                hrefLang={other}
                className="text-brand-600 underline dark:text-brand-300"
              >
                {d.otherLanguage}: {other === 'ka' ? 'ქართული' : 'English'}
              </Link>
            )}
          </div>
        </div>
        {post.coverImageUrl && (
          <img
            src={post.coverImageUrl}
            alt=""
            className="mb-12 aspect-[16/9] w-full rounded-3xl object-cover"
          />
        )}
        <div className="mx-auto max-w-[760px]">
          <div
            className="blog-content"
            dangerouslySetInnerHTML={{ __html: sanitizeBlogHtml(post.contentHtml) }}
          />
          {post.tags.length > 0 && (
            <nav
              aria-label={d.tags}
              className="mt-12 flex flex-wrap gap-3 border-t border-overlay/10 pt-6"
            >
              {post.tags.map((tag) => (
                <Link
                  key={tag}
                  href={blogListUrl(lang, { tag })}
                  className="rounded-full border border-overlay/15 px-4 py-2 text-sm text-muted hover:text-fg"
                >
                  #{tag}
                </Link>
              ))}
            </nav>
          )}
          <Link
            href={blogPath(lang)}
            className="mt-10 inline-block text-sm font-semibold text-brand-600 dark:text-brand-300"
          >
            ← {d.back}
          </Link>
        </div>
      </article>
    </BlogShell>
  );
}
