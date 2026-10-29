import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PublicBlogPostSummary } from '@fit/types';
import { LeadCtaProvider } from '@/components/marketing/lead-cta-provider';
import { BlogListPage } from './blog-list-page';
import { dictionary } from './dictionary';

const post: PublicBlogPostSummary = {
  id: '1',
  slug: 'gym-guide',
  lang: 'en',
  title: 'A better gym',
  excerpt: 'A practical guide.',
  coverImageUrl: null,
  ogImageUrl: null,
  metaTitle: null,
  metaDescription: null,
  tags: ['growth'],
  category: { slug: 'guides', name: 'Guides' },
  author: null,
  publishAt: '2026-10-29T08:00:00Z',
  updatedAt: '2026-10-29T08:00:00Z',
  availableLangs: ['en', 'ka'],
};
function renderList(items: PublicBlogPostSummary[], total = items.length) {
  return render(
    <LeadCtaProvider>
      <BlogListPage
        lang="en"
        posts={{ items, total, page: 1, pageSize: 12 }}
        categories={{ items: [{ slug: 'guides', name: 'Guides', postCount: 1 }] }}
        tags={{ items: [{ tag: 'growth', count: 1 }] }}
        category="guides"
        tag="growth"
      />
    </LeadCtaProvider>,
  );
}
describe('BlogListPage', () => {
  it('shows an empty state', () => {
    renderList([]);
    expect(screen.getByText('No posts yet')).toBeInTheDocument();
  });
  it('renders posts, category and tag filters', () => {
    renderList([post], 13);
    expect(screen.getByRole('heading', { name: post.title })).toBeInTheDocument();
    expect(screen.getByText(post.excerpt!)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Guides' })).toHaveAttribute(
      'href',
      '/blog?category=guides&tag=growth',
    );
    expect(screen.getByRole('link', { name: '#growth' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute(
      'href',
      '/blog?category=guides&tag=growth&page=2',
    );
  });
  it('keeps Georgian copy free of dashes and Mtavruli', () => {
    expect(Object.values(dictionary.ka).join(' ')).not.toMatch(/[—–\u1c90-\u1cbf]/);
  });
});
