import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { BackLink, PageHead } from '@/components/ops';
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
    maxWidth: '72rem',
  },
});

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let content;
  try {
    const [post, categories, authors] = await Promise.all([
      fetchBlogPost(id),
      fetchBlogCategories(),
      fetchBlogAuthors(),
    ]);
    content = <PostForm post={post} categories={categories.items} authors={authors.items} />;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound();
    content = (
      <>
        <PageHead title="Edit post" eyebrow={<BackLink href="/blog" label="Blog" />} />
        <Banner tone="error">
          {error instanceof ApiError
            ? `Could not load the post (${error.status}): ${error.message}`
            : 'Could not reach the FormaCore API.'}
        </Banner>
      </>
    );
  }

  return <div {...stylex.props(styles.page)}>{content}</div>;
}
