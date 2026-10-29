import { BlogArticleRoute, postMetadata, type BlogPostParams } from '@/components/blog/blog-routes';
export const revalidate = 60;
export function generateMetadata({ params }: { params: BlogPostParams }) {
  return postMetadata(params, 'en');
}
export default function Page({ params }: { params: BlogPostParams }) {
  return <BlogArticleRoute lang="en" params={params} />;
}
