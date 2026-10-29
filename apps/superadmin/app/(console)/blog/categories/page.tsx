import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import { Banner } from '@fit/ui-kit';
import { ApiError, fetchBlogCategories } from '@/lib/api';
import { CategoriesManager } from './categories-manager';

export const metadata: Metadata = {
  title: 'Blog categories — FormaCore SuperAdmin',
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

export default async function BlogCategoriesPage() {
  let content;
  try {
    const { items } = await fetchBlogCategories();
    content = <CategoriesManager categories={items} />;
  } catch (error) {
    content = (
      <Banner tone="error">
        {error instanceof ApiError
          ? `Could not load categories (${error.status}): ${error.message}`
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
        <h1 {...stylex.props(styles.title)}>Categories</h1>
        <p {...stylex.props(styles.subtitle)}>
          Group posts on the blog page. Each category needs a Georgian and an English name.
        </p>
      </header>
      {content}
    </div>
  );
}
