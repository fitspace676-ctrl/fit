import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { BackLink, PageHead } from '@/components/ops';
import { Banner } from '@fit/ui-kit';
import { ApiError, fetchBlogAuthors, fetchBlogCategories } from '@/lib/api';
import { PostForm } from '../post-form';

export const metadata: Metadata = {
  title: 'New post — FormaCore SuperAdmin',
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

export default async function NewPostPage() {
  let content;
  try {
    const [categories, authors] = await Promise.all([fetchBlogCategories(), fetchBlogAuthors()]);
    content = <PostForm post={null} categories={categories.items} authors={authors.items} />;
  } catch (error) {
    content = (
      <>
        <PageHead title="New post" eyebrow={<BackLink href="/blog" label="Blog" />} />
        <Banner tone="error">
          {error instanceof ApiError
            ? `Could not load categories and authors (${error.status}): ${error.message}`
            : 'Could not reach the FormaCore API.'}
        </Banner>
      </>
    );
  }

  return <div {...stylex.props(styles.page)}>{content}</div>;
}
