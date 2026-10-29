import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { AdminBlogPost, BlogLang } from '@fit/types';
import { Badge, Banner } from '@fit/ui-kit';
import { ButtonLink } from '@/components/button-link';
import { ApiError, fetchBlogPost } from '@/lib/api';
import { VISIBILITY, formatWhen } from '../../shared';

export const metadata: Metadata = {
  title: 'Preview — FormaCore SuperAdmin',
};

export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '48rem',
  },
  bar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  barMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  article: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    paddingBlock: '1.5rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  langRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  cover: {
    display: 'block',
    width: '100%',
    aspectRatio: '16 / 9',
    objectFit: 'cover',
    borderRadius: 'var(--radius-card)',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '2rem',
    fontWeight: 800,
    lineHeight: 1.2,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  excerpt: {
    margin: 0,
    fontSize: '1.125rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  byline: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  avatar: {
    width: '2rem',
    height: '2rem',
    borderRadius: '50%',
    objectFit: 'cover',
  },
  tags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.375rem',
  },
  missing: {
    margin: 0,
    fontSize: '0.875rem',
    fontStyle: 'italic',
    color: 'var(--color-text-secondary)',
  },
});

function view(post: AdminBlogPost, lang: BlogLang) {
  return lang === 'ka'
    ? { title: post.titleKa, excerpt: post.excerptKa, html: post.contentHtmlKa }
    : { title: post.titleEn ?? '', excerpt: post.excerptEn, html: post.contentHtmlEn ?? '' };
}

/**
 * Both languages of one post, roughly as the site will set them. The HTML is
 * what the API stored, and the API sanitised it to the blog allow-list on
 * write; the public site sanitises it once more before rendering.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let post: AdminBlogPost;
  try {
    post = await fetchBlogPost(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    return (
      <Banner tone="error">
        {error instanceof ApiError
          ? `Could not load the post (${error.status}): ${error.message}`
          : 'Could not reach the FormaCore API.'}
      </Banner>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <div {...stylex.props(styles.bar)}>
        <ButtonLink href={`/blog/${post.id}`} label="← Back to edit" variant="secondary" />
        <div {...stylex.props(styles.barMeta)}>
          <Badge
            label={VISIBILITY[post.visibility].label}
            tone={VISIBILITY[post.visibility].tone}
          />
          {post.publishAt ? <span>{formatWhen(post.publishAt)}</span> : null}
          <span>/blog/{post.slug}</span>
        </div>
      </div>

      {(['ka', 'en'] as const).map((lang) => {
        const { title, excerpt, html } = view(post, lang);
        const available = post.availableLangs.includes(lang);
        return (
          <article key={lang} lang={lang} {...stylex.props(styles.article)}>
            <div {...stylex.props(styles.langRow)}>
              <Badge label={lang.toUpperCase()} tone={available ? 'accent' : 'neutral'} />
              {lang === 'ka' ? 'Georgian' : 'English'}
            </div>
            {available ? (
              <>
                {post.coverImageUrl ? (
                  // The stored R2 URL, as the site will show it.
                  <img src={post.coverImageUrl} alt="" {...stylex.props(styles.cover)} />
                ) : null}
                <h1 {...stylex.props(styles.title)}>{title}</h1>
                {excerpt ? <p {...stylex.props(styles.excerpt)}>{excerpt}</p> : null}
                <div {...stylex.props(styles.byline)}>
                  {post.author?.photoUrl ? (
                    <img src={post.author.photoUrl} alt="" {...stylex.props(styles.avatar)} />
                  ) : null}
                  {post.author ? <span>{post.author.name}</span> : null}
                  {post.category ? (
                    <Badge
                      label={lang === 'ka' ? post.category.nameKa : post.category.nameEn}
                      tone="neutral"
                    />
                  ) : null}
                </div>
                {html ? (
                  <div className="blog-prose" dangerouslySetInnerHTML={{ __html: html }} />
                ) : (
                  <p {...stylex.props(styles.missing)}>No content yet.</p>
                )}
                {post.tags.length > 0 ? (
                  <div {...stylex.props(styles.tags)}>
                    {post.tags.map((tag) => (
                      <Badge key={tag} label={`#${tag}`} tone="neutral" />
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p {...stylex.props(styles.missing)}>
                No English version. The post appears only on the Georgian blog.
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
