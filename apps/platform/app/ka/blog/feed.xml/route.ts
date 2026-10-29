import { blogFeed } from '@/lib/blog-feed';
export const revalidate = 60;
export function GET() {
  return blogFeed('ka');
}
