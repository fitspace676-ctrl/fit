import {
  BlogListingRoute,
  listMetadata,
  type BlogSearchParams,
} from '@/components/blog/blog-routes';
export const revalidate = 60;
export function generateMetadata() {
  return listMetadata('en');
}
export default function Page({ searchParams }: { searchParams: BlogSearchParams }) {
  return <BlogListingRoute lang="en" searchParams={searchParams} />;
}
