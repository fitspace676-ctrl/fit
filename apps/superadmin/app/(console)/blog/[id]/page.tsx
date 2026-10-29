import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Banner } from '@fit/ui-kit';
import { ApiError, fetchBlogAuthors, fetchBlogCategories, fetchBlogPost } from '@/lib/api';
import { PostForm } from '../post-form';

export const metadata: Metadata = {
  title: 'Edit post — FormaCore SuperAdmin',
};

export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
    maxWidth: '56rem',
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
});

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let content;
  let title = 'Edit post';
  try {
    const [post, categories, authors] = await Promise.all([
      fetchBlogPost(id),
      fetchBlogCategories(),
      fetchBlogAuthors(),
    ]);
    title = post.titleKa;
    content = <PostForm post={post} categories={categories.items} authors={authors.items} />;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    content = (
      <Banner tone="error">
        {error instanceof ApiError
          ? `Could not load the post (${error.status}): ${error.message}`
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
        <h1 {...stylex.props(styles.title)}>{title}</h1>
      </header>
      {content}
    </div>
  );
}
