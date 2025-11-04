import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useBlogPost } from '@/hooks/swr/blog/useBlogPost';
import { useDeleteBlogPost } from '@/hooks/swr/blog/useDeleteBlogPost';
import { Loader2, AlertCircle, Calendar, ArrowLeft, Edit, Trash2 } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { format } from 'date-fns';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { UserRole } from '@/types';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button } from '@mui/material';

export default function BlogPostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const intl = useIntl();
  const { data, error, isLoading } = useBlogPost(slug || null);
  const { user } = useSelector((state: RootState) => state.user);
  const { deletePost, loading: deleting, error: deleteError } = useDeleteBlogPost();
  const isAdmin = user.role === UserRole.Admin;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
        </div>
      </div>
    );
  }

  if (error || !data?.post) {
    return (
      <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="flex items-center gap-2 text-red-600 mb-4">
            <AlertCircle className="w-5 h-5" />
            <span>
              <FormattedMessage id="blog.error.notFound" defaultMessage="Blog post not found" />
            </span>
          </div>
          <Link
            to="/blog"
            className="text-orange-600 dark:text-orange-400 hover:underline"
          >
            <FormattedMessage id="blog.backToList" defaultMessage="Back to blog list" />
          </Link>
        </div>
      </div>
    );
  }

  const post = data.post;
  const formattedDate = format(new Date(post.createdAt), 'yyyy-MM-dd');

  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!slug) return;

    try {
      const result = await deletePost(slug);
      if (result.success) {
        navigate('/blog');
      }
    } catch (err) {
      console.error('Failed to delete blog post:', err);
      // Error will be handled by the hook
    }
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  return (
    <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
      <article className="max-w-4xl mx-auto text-left">
        <Link
          to="/blog"
          className="inline-flex items-center text-gray-600 dark:text-gray-400 hover:text-orange-600 dark:hover:text-orange-400 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          <FormattedMessage id="blog.backToList" defaultMessage="Back to blog list" />
        </Link>

        <header className="mb-8">
          <div className="flex items-start justify-between mb-4">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100">
              {post.title}
            </h1>
            {isAdmin && (
              <div className="flex items-center gap-2 ml-4">
                <Link
                  to={`/blog/${slug}/edit`}
                  className="inline-flex items-center px-4 py-2"
                >
                  <Edit className="w-4 h-4 mr-2" />
                  <FormattedMessage id="blog.edit.button" defaultMessage="Edit" />
                </Link>
                <button
                  onClick={handleDeleteClick}
                  className="inline-flex items-center px-4 py-2 text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition-colors"
                  disabled={deleting}
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  <FormattedMessage id="blog.delete.button" defaultMessage="Delete" />
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400 mb-6">
            <div className="flex items-center">
              <div className="flex items-center">
                <img
                  src={post.author.avatar}
                  alt={post.author.name}
                  className="w-6 h-6 rounded-full mr-2"
                />
                <span>{post.author.name}</span>
              </div>
            </div>
            <div className="flex items-center">
              <Calendar className="w-4 h-4 mr-2" />
              <span>{formattedDate}</span>
            </div>
          </div>
        </header>

        <div className="prose prose-lg dark:prose-invert max-w-none text-left">
          <MarkdownPreview
            source={post.content}
            wrapperElement={{
              'data-color-mode': document.documentElement.classList.contains('dark') ? 'dark' : 'light',
            }}
          />
        </div>
      </article>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onClose={handleDeleteCancel}>
        <DialogTitle>
          <FormattedMessage id="blog.delete.confirmTitle" defaultMessage="Confirm Delete" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            <FormattedMessage
              id="blog.delete.confirmMessage"
              defaultMessage="Are you sure you want to delete this blog post? This action cannot be undone."
            />
          </DialogContentText>
          {deleteError && (
            <div className="mt-4 text-red-600 dark:text-red-400">
              {deleteError.message || intl.formatMessage({ id: 'blog.delete.error', defaultMessage: 'Failed to delete blog post' })}
            </div>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDeleteCancel} disabled={deleting}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleDeleteConfirm} color="error" disabled={deleting} autoFocus>
            {deleting ? (
              <FormattedMessage id="blog.delete.deleting" defaultMessage="Deleting..." />
            ) : (
              <FormattedMessage id="common.confirm" defaultMessage="Confirm" />
            )}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

