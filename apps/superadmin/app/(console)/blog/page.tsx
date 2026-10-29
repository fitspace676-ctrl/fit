import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { listAdminBlogPostsQuerySchema, type BlogLang, type BlogPostStatus } from '@fit/types';
import { Banner, Button, Field } from '@fit/ui-kit';
import { ButtonLink } from '@/components/button-link';
import { ApiError, fetchBlogPosts } from '@/lib/api';
import { PostsTable } from './posts-table';

export const metadata: Metadata = {
  title: 'Blog — FormaCore SuperAdmin',
  description: 'The formacore.io blog: drafts, scheduled and published posts.',
};

// Drafts and schedules change under the operator; never cache this view.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '72rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  search: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '0.5rem',
    flexGrow: 1,
    maxWidth: '28rem',
  },
  searchField: {
    flexGrow: 1,
  },
  filters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.25rem',
  },
  pager: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  count: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  pagerButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
});

interface Filters {
  q?: string;
  status?: BlogPostStatus;
  lang?: BlogLang;
}

/** This page's own URL with the given filters and page. */
function hrefWith(filters: Filters, page = 1): string {
  const params = new URLSearchParams();
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.lang) params.set('lang', filters.lang);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return query ? `/blog?${query}` : '/blog';
}

const STATUS_FILTERS: { label: string; value?: BlogPostStatus }[] = [
  { label: 'Any status' },
  { label: 'Drafts', value: 'DRAFT' },
  { label: 'Published & scheduled', value: 'PUBLISHED' },
];

const LANG_FILTERS: { label: string; value?: BlogLang }[] = [
  { label: 'Any language' },
  // Every post has Georgian, so the one useful language filter is English.
  { label: 'With English', value: 'en' },
];

/**
 * The platform blog's posts. Like Activity, every filter is a link and the
 * whole screen renders from the query string, so a filtered view is a URL.
 */
export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = listAdminBlogPostsQuerySchema.safeParse({ ...raw, pageSize: PAGE_SIZE });
  const query = parsed.success ? parsed.data : { page: 1, pageSize: PAGE_SIZE };
  const active: Filters = {
    q: 'q' in query ? query.q : undefined,
    status: 'status' in query ? query.status : undefined,
    lang: 'lang' in query ? query.lang : undefined,
  };
  const filtered = Boolean(active.q || active.status || active.lang);

  let content;
  let pager = null;
  try {
    const { items, total, page, pageSize } = await fetchBlogPosts(query);
    const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
    const to = Math.min(page * pageSize, total);
    content = <PostsTable posts={items} filtered={filtered} />;
    pager = (
      <div {...stylex.props(styles.pager)}>
        <span {...stylex.props(styles.count)}>
          {from}–{to} of {total}
        </span>
        <div {...stylex.props(styles.pagerButtons)}>
          {page > 1 ? (
            <ButtonLink
              href={hrefWith(active, page - 1)}
              label="Previous"
              variant="secondary"
              size="inline"
            />
          ) : null}
          {to < total ? (
            <ButtonLink
              href={hrefWith(active, page + 1)}
              label="Next"
              variant="secondary"
              size="inline"
            />
          ) : null}
        </div>
      </div>
    );
  } catch (error) {
    content = (
      <Banner tone="error">
        {error instanceof ApiError
          ? `Could not load posts (${error.status}): ${error.message}`
          : 'Could not reach the FormaCore API.'}
      </Banner>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.heading)}>
          <h1 {...stylex.props(styles.title)}>Blog</h1>
          <p {...stylex.props(styles.subtitle)}>
            Posts on formacore.io. Georgian is required on every post; English is optional.
          </p>
        </div>
        <div {...stylex.props(styles.headerActions)}>
          <ButtonLink href="/blog/categories" label="Categories" variant="ghost" />
          <ButtonLink href="/blog/authors" label="Authors" variant="ghost" />
          <ButtonLink href="/blog/new" label="New post" />
        </div>
      </header>

      <div {...stylex.props(styles.toolbar)}>
        {/* A plain GET form: submitting it is just navigating to the filtered URL. */}
        <form method="get" action="/blog" {...stylex.props(styles.search)}>
          {active.status ? <input type="hidden" name="status" value={active.status} /> : null}
          {active.lang ? <input type="hidden" name="lang" value={active.lang} /> : null}
          <Field
            label="Search"
            labelHidden
            name="q"
            type="search"
            placeholder="Search title or slug"
            defaultValue={active.q ?? ''}
            xstyle={styles.searchField}
          />
          <Button type="submit" variant="secondary" size="card" label="Search" />
        </form>

        <div {...stylex.props(styles.filters)}>
          {STATUS_FILTERS.map((option) => (
            <ButtonLink
              key={option.label}
              href={hrefWith({ ...active, status: option.value })}
              label={option.label}
              variant={active.status === option.value ? 'primary' : 'ghost'}
              size="inline"
            />
          ))}
        </div>
        <div {...stylex.props(styles.filters)}>
          {LANG_FILTERS.map((option) => (
            <ButtonLink
              key={option.label}
              href={hrefWith({ ...active, lang: option.value })}
              label={option.label}
              variant={active.lang === option.value ? 'primary' : 'ghost'}
              size="inline"
            />
          ))}
        </div>
      </div>

      {content}
      {pager}
    </div>
  );
}
