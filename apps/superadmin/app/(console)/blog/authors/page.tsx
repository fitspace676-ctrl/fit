import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { Banner } from '@fit/ui-kit';
import { ApiError, fetchBlogAuthors } from '@/lib/api';
import { AuthorsManager } from './authors-manager';

export const metadata: Metadata = {
  title: 'Blog authors — FormaCore SuperAdmin',
};

export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '48rem',
  },
  header: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.375rem',
  },
  back: {
    fontSize: '0.875rem',
    color: {
      default: 'var(--color-text-secondary)',
      ':hover': 'var(--color-text-accent)',
    },
    textDecoration: 'none',
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
});

export default async function BlogAuthorsPage() {
  let content;
  try {
    const { items } = await fetchBlogAuthors();
    content = <AuthorsManager authors={items} />;
  } catch (error) {
    content = (
      <Banner tone="error">
        {error instanceof ApiError
          ? `Could not load authors (${error.status}): ${error.message}`
          : 'Could not reach the FormaCore API.'}
      </Banner>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <Link href="/blog" {...stylex.props(styles.back)}>
          ← Blog
        </Link>
        <h1 {...stylex.props(styles.title)}>Authors</h1>
        <p {...stylex.props(styles.subtitle)}>
          The bylines a post can carry: a name, a photo and a short bio in each language.
        </p>
      </header>
      {content}
    </div>
  );
}
