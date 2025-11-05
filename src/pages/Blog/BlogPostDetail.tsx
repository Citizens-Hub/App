import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { useBlogPost } from '@/hooks/swr/blog/useBlogPost';
import { useDeleteBlogPost } from '@/hooks/swr/blog/useDeleteBlogPost';
import { useBlogComments } from '@/hooks/swr/blog/useBlogComments';
import { useCreateBlogComment } from '@/hooks/swr/blog/useCreateBlogComment';
import { useDeleteBlogComment } from '@/hooks/swr/blog/useDeleteBlogComment';
import { useUserSession } from '@/hooks/swr/useApi';
import { Loader2, AlertCircle, Calendar, ArrowLeft, Edit, Trash2, MessageSquare, Send } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { format } from 'date-fns';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { UserRole } from '@/types';
import { Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Button, TextField, Snackbar, Alert, IconButton, Box } from '@mui/material';
import { Helmet } from 'react-helmet';

// Declare global Turnstile callback functions
declare global {
  interface Window {
    onTurnstileVerify?: (token: string) => void;
    onTurnstileExpire?: () => void;
    onTurnstileError?: () => void;
    onloadTurnstileCallback?: () => void;
    turnstile?: {
      render: (container: string | HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId: string) => void;
    };
  }
}

export default function BlogPostDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const intl = useIntl();
  const { data, error, isLoading } = useBlogPost(slug || null);
  const { user } = useSelector((state: RootState) => state.user);
  const { data: userSession } = useUserSession();
  const { deletePost, loading: deleting, error: deleteError } = useDeleteBlogPost();
  const { data: commentsData, mutate: mutateComments } = useBlogComments(slug || null);
  const { createComment, loading: creatingComment, error: createCommentError } = useCreateBlogComment();
  const { deleteComment, loading: deletingComment, error: deleteCommentError } = useDeleteBlogComment();
  const isAdmin = user.role === UserRole.Admin;
  const isLoggedIn = !!user.token;
  const isEmailVerified = userSession?.user?.emailVerified ?? false;
  const canComment = isLoggedIn && isEmailVerified;

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteCommentDialogOpen, setDeleteCommentDialogOpen] = useState(false);
  const [commentToDelete, setCommentToDelete] = useState<string | null>(null);
  const [commentContent, setCommentContent] = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileWidgetId, setTurnstileWidgetId] = useState<string | null>(null);
  const [turnstileError, setTurnstileError] = useState<string>('');

  // Load Turnstile script
  useEffect(() => {
    if (!canComment) return;

    // Set global callback functions
    window.onTurnstileVerify = (token: string) => {
      setTurnstileToken(token);
      setTurnstileError('');
    };

    window.onTurnstileExpire = () => {
      setTurnstileToken(null);
    };

    window.onTurnstileError = () => {
      setTurnstileError(intl.formatMessage({ id: 'blog.comment.turnstileError', defaultMessage: 'Captcha verification failed. Please try again.' }));
      setTurnstileToken(null);
    };

    window.onloadTurnstileCallback = () => {
      if (window.turnstile) {
        const widgetId = window.turnstile.render('#turnstile-comment-container', {
          sitekey: import.meta.env.VITE_PUBLIC_TURNSTILE_SITE_KEY,
          callback: (token: string) => {
            if (window.onTurnstileVerify) {
              window.onTurnstileVerify(token);
            }
          },
          'expired-callback': () => {
            if (window.onTurnstileExpire) {
              window.onTurnstileExpire();
            }
          },
          'error-callback': () => {
            if (window.onTurnstileError) {
              window.onTurnstileError();
            }
          }
        });
        setTurnstileWidgetId(widgetId);
      }
    };

    // Cleanup function
    return () => {
      window.onTurnstileVerify = undefined;
      window.onTurnstileExpire = undefined;
      window.onTurnstileError = undefined;
      window.onloadTurnstileCallback = undefined;
    };
  }, [canComment, intl]);

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

  const handleCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data?.post || !commentContent.trim()) return;

    if (!turnstileToken) {
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: 'blog.comment.captchaRequired', defaultMessage: 'Please complete the captcha verification' }),
        severity: 'error',
      });
      return;
    }

    try {
      await createComment(data.post.id, {
        content: commentContent.trim(),
        turnstileToken
      });
      setCommentContent('');
      setTurnstileToken(null);
      // Reset Turnstile
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
      }
      mutateComments();
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: 'blog.comment.createSuccess', defaultMessage: 'Comment posted successfully' }),
        severity: 'success',
      });
    } catch {
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: 'blog.comment.createError', defaultMessage: 'Failed to post comment' }),
        severity: 'error',
      });
      // Reset Turnstile on error
      if (window.turnstile && turnstileWidgetId) {
        window.turnstile.reset(turnstileWidgetId);
        setTurnstileToken(null);
      }
    }
  };

  const handleDeleteCommentClick = (commentId: string) => {
    setCommentToDelete(commentId);
    setDeleteCommentDialogOpen(true);
  };

  const handleDeleteCommentConfirm = async () => {
    if (!commentToDelete) return;

    try {
      const result = await deleteComment(commentToDelete);
      if (result.success) {
        mutateComments();
        setSnackbar({
          open: true,
          message: intl.formatMessage({ id: 'blog.comment.deleteSuccess', defaultMessage: 'Comment deleted successfully' }),
          severity: 'success',
        });
      }
    } catch {
      setSnackbar({
        open: true,
        message: intl.formatMessage({ id: 'blog.comment.deleteError', defaultMessage: 'Failed to delete comment' }),
        severity: 'error',
      });
    } finally {
      setDeleteCommentDialogOpen(false);
      setCommentToDelete(null);
    }
  };

  const handleDeleteCommentCancel = () => {
    setDeleteCommentDialogOpen(false);
    setCommentToDelete(null);
  };

  const canDeleteComment = (commentAuthorId: string) => {
    return isAdmin || user.id === commentAuthorId;
  };

  const comments = commentsData?.comments || [];

  // Prepare SEO meta information
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const pageUrl = `${baseUrl}/blog/${slug}`;
  const metaTitle = `${post.title} | Citizens' Hub`;
  const metaDescription = post.excerpt || post.content.substring(0, 160).replace(/[#*`]/g, '').trim() || `${post.title} - Star Citizen blog post on Citizens' Hub`;
  const metaImage = post.image 
    ? `${import.meta.env.VITE_PUBLIC_API_ENDPOINT}${post.image}`
    : `${baseUrl}/logo.png`;
  const metaKeywords = post.tags && post.tags.length > 0
    ? `Star Citizen, ${post.tags.join(', ')}`
    : 'Star Citizen, blog, news, guides, updates';

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <meta name="keywords" content={metaKeywords} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:image" content={metaImage} />
        <meta property="article:published_time" content={post.createdAt} />
        <meta property="article:modified_time" content={post.updatedAt} />
        <meta property="article:author" content={post.author.name} />
        {post.tags && post.tags.length > 0 && post.tags.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDescription} />
        <meta name="twitter:image" content={metaImage} />
        <link rel="canonical" href={pageUrl} />
        <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback" async defer></script>
      </Helmet>
      <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto pb-[120px]">
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

          <div className="prose prose-lg dark:prose-invert max-w-none text-left mb-12">
            <MarkdownPreview
              source={post.content}
              wrapperElement={{
                'data-color-mode': document.documentElement.classList.contains('dark') ? 'dark' : 'light',
              }}
            />
          </div>

          {/* Comments Section */}
          <section className="mt-12 border-t border-gray-200 dark:border-gray-700 pt-8">
            <div className="flex items-center gap-2 mb-6">
              <MessageSquare className="w-5 h-5 text-gray-600 dark:text-gray-400" />
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                <FormattedMessage id="blog.comment.title" defaultMessage="Comments" />
                {comments.length > 0 && (
                  <span className="ml-2 text-lg font-normal text-gray-600 dark:text-gray-400">
                    ({comments.length})
                  </span>
                )}
              </h2>
            </div>

            {/* Comment Form */}
            {canComment ? (
              <form onSubmit={handleCommentSubmit} className="mb-8">
                <div className="mb-4">
                  <TextField
                    fullWidth
                    multiline
                    rows={4}
                    value={commentContent}
                    onChange={(e) => setCommentContent(e.target.value)}
                    placeholder={intl.formatMessage({ id: 'blog.comment.placeholder', defaultMessage: 'Write your comment...' })}
                    variant="outlined"
                    disabled={creatingComment}
                    error={!!createCommentError}
                    helperText={createCommentError?.message}
                  />
                </div>
                {turnstileError && (
                  <div className="mb-2 text-sm text-red-600 dark:text-red-400">
                    {turnstileError}
                  </div>
                )}
                <div className="flex justify-between items-start">
                  <Box sx={{ mb: 2, display: 'flex', justifyContent: 'left' }}>
                    <div id="turnstile-comment-container"></div>
                  </Box>
                  <Button
                    type="submit"
                    variant="outlined"
                    startIcon={creatingComment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    disabled={!commentContent.trim() || creatingComment || !turnstileToken}
                  >
                    {creatingComment ? (
                      <FormattedMessage id="blog.comment.submitting" defaultMessage="Submitting..." />
                    ) : (
                      <FormattedMessage id="blog.comment.submit" defaultMessage="Post Comment" />
                    )}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mb-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {!isLoggedIn ? (
                    <FormattedMessage
                      id="blog.comment.loginRequired"
                      defaultMessage="Please log in to post a comment."
                    />
                  ) : (
                    <FormattedMessage
                      id="blog.comment.emailVerificationRequired"
                      defaultMessage="Please verify your email to post a comment."
                    />
                  )}
                </p>
              </div>
            )}

            {/* Comments List */}
            {comments.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <FormattedMessage id="blog.comment.noComments" defaultMessage="No comments yet. Be the first to comment!" />
              </div>
            ) : (
              <div className="space-y-6">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="border-b border-gray-200 dark:border-gray-700 pb-6 last:border-b-0"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={comment.author.avatar}
                          alt={comment.author.name}
                          className="w-10 h-10 rounded-full"
                        />
                        <div>
                          <div className="font-semibold text-gray-900 dark:text-gray-100">
                            {comment.author.name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {format(new Date(comment.createdAt), 'yyyy-MM-dd HH:mm')}
                          </div>
                        </div>
                      </div>
                      {canDeleteComment(comment.author.id) && (
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteCommentClick(comment.id)}
                          disabled={deletingComment}
                        >
                          <Trash2 className="w-4 h-4" />
                        </IconButton>
                      )}
                    </div>
                    <div className="prose dark:prose-invert max-w-none text-gray-700 dark:text-gray-300">
                      <MarkdownPreview
                        source={comment.content}
                        wrapperElement={{
                          'data-color-mode': document.documentElement.classList.contains('dark') ? 'dark' : 'light',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
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

        {/* Delete comment confirmation dialog */}
        <Dialog open={deleteCommentDialogOpen} onClose={handleDeleteCommentCancel}>
          <DialogTitle>
            <FormattedMessage id="blog.comment.delete.confirmTitle" defaultMessage="Confirm Delete" />
          </DialogTitle>
          <DialogContent>
            <DialogContentText>
              <FormattedMessage
                id="blog.comment.delete.confirmMessage"
                defaultMessage="Are you sure you want to delete this comment? This action cannot be undone."
              />
            </DialogContentText>
            {deleteCommentError && (
              <div className="mt-4 text-red-600 dark:text-red-400">
                {deleteCommentError.message || intl.formatMessage({ id: 'blog.comment.deleteError', defaultMessage: 'Failed to delete comment' })}
              </div>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDeleteCommentCancel} disabled={deletingComment}>
              <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
            </Button>
            <Button onClick={handleDeleteCommentConfirm} color="error" disabled={deletingComment} autoFocus>
              {deletingComment ? (
                <FormattedMessage id="blog.comment.delete.deleting" defaultMessage="Deleting..." />
              ) : (
                <FormattedMessage id="common.confirm" defaultMessage="Confirm" />
              )}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Snackbar for notifications */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={6000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            sx={{ width: '100%' }}
          >
            {snackbar.message}
          </Alert>
        </Snackbar>
      </div>
    </>
  );
}

