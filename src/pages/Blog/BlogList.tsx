import { useState } from 'react';
import { Link } from 'react-router';
import { useBlogPosts } from '@/hooks/swr/blog/useBlogPosts';
import BlogPostCard from './BlogPostCard';
import { Loader2, AlertCircle, Plus } from 'lucide-react';
import { FormattedMessage } from 'react-intl';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { UserRole } from '@/types';

export default function BlogList() {
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useBlogPosts(page, 10);
  const { user } = useSelector((state: RootState) => state.user);
  const isAdmin = user.role === UserRole.Admin;

  const CreateButton = () => (
    isAdmin ? (
      <div className="mb-6 flex justify-end">
        <Link
          to="/blog/create"
          className="inline-flex items-center gap-2 px-4 py-2"
        >
          <Plus className="w-5 h-5" />
          <FormattedMessage id="blog.createNew" defaultMessage="Create Post" />
        </Link>
      </div>
    ) : null
  );

  if (isLoading) {
    return (
      <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
        <div className="max-w-[1200px] mx-auto">
          <CreateButton />
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
        <div className="max-w-[1200px] mx-auto">
          <CreateButton />
          <div className="flex items-center justify-center py-12">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              <span>
                <FormattedMessage id="blog.error.loading" defaultMessage="Failed to load blog posts" />
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!data?.posts || data.posts.length === 0) {
    return (
      <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
        <div className="max-w-[1200px] mx-auto">
          <CreateButton />
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400">
              <FormattedMessage id="blog.noPosts" defaultMessage="No blog posts found" />
            </p>
          </div>
        </div>
      </div>
    );
  }

  const posts = data.posts;
  const pagination = data.pagination;
  const featuredPost = posts.length > 0 ? posts[0] : null;
  const otherPosts = posts.slice(1);

  return (
    <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
      <div className="max-w-[1200px] mx-auto">
        <CreateButton />
        {/* Featured post (first post) */}
        {featuredPost && (
          <BlogPostCard post={featuredPost} featured />
        )}

        {/* Other posts in grid layout */}
        {otherPosts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-12">
            {otherPosts.map((post) => (
              <BlogPostCard key={post.id} post={post} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-12">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <FormattedMessage id="blog.pagination.previous" defaultMessage="Previous" />
            </button>
            <span className="text-gray-600 dark:text-gray-400">
              <FormattedMessage
                id="blog.pagination.page"
                defaultMessage="Page {current} of {total}"
                values={{ current: page, total: pagination.totalPages }}
              />
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <FormattedMessage id="blog.pagination.next" defaultMessage="Next" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

