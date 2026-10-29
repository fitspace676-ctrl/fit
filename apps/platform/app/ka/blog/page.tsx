import {
  BlogListingRoute,
  listMetadata,
  type BlogSearchParams,
} from '@/components/blog/blog-routes';
export const revalidate = 60;
export function generateMetadata() {
  return listMetadata('ka');
}
export default function Page({ searchParams }: { searchParams: BlogSearchParams }) {
  return <BlogListingRoute lang="ka" searchParams={searchParams} />;
}
