import { Link } from 'react-router';
import { format } from 'date-fns';
import { BlogPost } from '@/types';
import { Calendar } from 'lucide-react';

interface BlogPostCardProps {
  post: BlogPost;
  featured?: boolean;
}

export default function BlogPostCard({ post, featured = false }: BlogPostCardProps) {
  const formattedDate = format(new Date(post.createdAt), 'yyyy-MM-dd');
  const hasImage = post.image != null;

  if (featured) {
    return (
      <div className="mb-12">
        <Link to={`/blog/${post.slug}`} className="block group">
          <div className="flex gap-8 items-start">
            {/* Text content */}
            <div className="flex-1 text-left">
              <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-3 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
                {post.title}
              </h2>
              <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-4">
                <Calendar className="w-4 h-4 mr-2" />
                <span>{formattedDate}</span>
              </div>
              {post.excerpt && (
                <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-3">
                  {post.excerpt}
                </p>
              )}
              <div className="flex items-center gap-3">
                <img
                  src={post.author.avatar}
                  alt={post.author.name}
                  className="w-10 h-10 rounded-full"
                />
                <div>
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {post.author.name}
                  </div>
                </div>
              </div>
            </div>

            {/* Image on the right */}
            {hasImage && post.image && (
              <div className="flex-shrink-0 w-[45%] h-fit">
                <img
                  src={`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}${post.image}`}
                  alt={post.title}
                  className="w-full h-full object-cover rounded-lg"
                />
              </div>
            )}
          </div>
        </Link>
      </div>
    );
  }

  return (
    <article className="mb-8 pb-8">
      <Link to={`/blog/${post.slug}`} className="block group">
        <div className="text-left">
          <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">
            {post.title}
          </h3>
          <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 mb-3">
            <Calendar className="w-4 h-4 mr-2" />
            <span>{formattedDate}</span>
          </div>
          {/* Tags */}
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-3 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-md"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-start gap-4 justify-between">
            {post.excerpt && (
              <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-9 flex-1">
                {post.excerpt}
              </p>
            )}
            {hasImage && post.image && (
              <div className="mb-4 w-fit overflow-hidden rounded-lg flex-2">
                <img
                  src={`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}${post.image}`}
                  alt={post.title}
                  className="w-full h-auto object-contain group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* <img
              src={post.author.avatar}
              alt={post.author.name}
              className="w-8 h-8 rounded-full"
            /> */}
            <span className="text-sm text-gray-600 dark:text-gray-400">{post.author.name}</span>
          </div>
        </div>
      </Link>
    </article>
  );
}

