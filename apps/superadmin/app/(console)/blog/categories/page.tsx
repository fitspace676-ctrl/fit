import type { Metadata } from 'next';
import { BackLink, PageHead } from '@/components/ops';
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
    maxWidth: '72rem',
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
      <PageHead
        title="Categories"
        eyebrow={<BackLink href="/blog" label="Blog" />}
        description="Group posts on the blog page. Each category needs a Georgian and an English name."
      />
      {content}
    </div>
  );
}
