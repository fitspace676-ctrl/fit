import type { Metadata } from 'next';
import { BackLink, PageHead } from '@/components/ops';
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
    maxWidth: '72rem',
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
      <PageHead
        title="Authors"
        eyebrow={<BackLink href="/blog" label="Blog" />}
        description="The bylines a post can carry: a name, a photo and a short bio in each language."
      />
      {content}
    </div>
  );
}
