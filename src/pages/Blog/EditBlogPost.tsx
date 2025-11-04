import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useUpdateBlogPost } from '@/hooks/swr/blog/useUpdateBlogPost';
import { useBlogPost } from '@/hooks/swr/blog/useBlogPost';
import { useUploadAttachment } from '@/hooks/swr/blog/useUploadAttachment';
import { FormattedMessage, useIntl } from 'react-intl';
import { Loader2, Save, X, Upload, XCircle } from 'lucide-react';
import { UpdateBlogPostRequest } from '@/types';
import MDEditor from '@uiw/react-md-editor';
import '@uiw/react-md-editor/markdown-editor.css';
import { Button } from '@mui/material';

export default function EditBlogPost() {
  const intl = useIntl();
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const { data: blogPostData, isLoading: isLoadingPost, error: postError } = useBlogPost(slug || null);
  const { updatePost, loading, error } = useUpdateBlogPost();
  const { uploadFile, loading: uploading, error: uploadError } = useUploadAttachment();
  
  const [formData, setFormData] = useState<UpdateBlogPostRequest>({
    slug: '',
    title: '',
    content: '',
    language: '',
    excerpt: '',
    published: false,
    image: null,
  });

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isSlugManuallyEdited, setIsSlugManuallyEdited] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Load post data when available
  useEffect(() => {
    if (blogPostData?.post) {
      const post = blogPostData.post;
      setFormData({
        slug: post.slug,
        title: post.title,
        content: post.content,
        language: post.language,
        excerpt: post.excerpt || '',
        published: post.published,
        image: post.image || null,
      });
      if (post.image) {
        setPreviewImage(post.image);
      }
    }
  }, [blogPostData]);

  useEffect(() => {
    // Check if dark mode is enabled
    const checkDarkMode = () => {
      setIsDarkMode(document.documentElement.classList.contains('dark'));
    };
    
    checkDarkMode();
    
    // Watch for dark mode changes
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    
    return () => observer.disconnect();
  }, []);

  // Generate slug from title
  const generateSlug = (title: string): string => {
    return title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove special characters
      .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
      .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
  };

  // Auto-generate slug when title changes (if slug hasn't been manually edited)
  useEffect(() => {
    if (!isSlugManuallyEdited && formData.title && blogPostData?.post) {
      const autoSlug = generateSlug(formData.title);
      if (autoSlug !== blogPostData.post.slug) {
        setFormData((prev) => ({ ...prev, slug: autoSlug }));
      }
    }
  }, [formData.title, isSlugManuallyEdited, blogPostData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!slug) {
      setSubmitError(intl.formatMessage({ id: 'blog.edit.invalidSlug', defaultMessage: 'Invalid post slug' }));
      return;
    }

    try {
      // Clean up preview URL if exists
      if (previewImage && previewImage.startsWith('blob:')) {
        URL.revokeObjectURL(previewImage);
      }
      
      const result = await updatePost(slug, formData);
      if (result.success) {
        navigate(`/blog/${result.post.slug}`);
      }
    } catch (err) {
      const error = err as Error;
      setSubmitError(error.message || intl.formatMessage({ id: 'blog.edit.error', defaultMessage: 'Failed to update blog post' }));
    }
  };

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (previewImage && previewImage.startsWith('blob:')) {
        URL.revokeObjectURL(previewImage);
      }
    };
  }, [previewImage]);

  const handleChange = (field: keyof UpdateBlogPostRequest, value: string | boolean | null) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await uploadFile(file);
      if (result.success && result.attachment) {
        handleChange('image', result.attachment.url);
        // Create preview URL for display
        const previewUrl = URL.createObjectURL(file);
        setPreviewImage(previewUrl);
      }
    } catch (err) {
      const error = err as Error;
      setSubmitError(error.message || intl.formatMessage({ id: 'blog.edit.uploadError', defaultMessage: 'Failed to upload image' }));
    }

    // Reset input
    e.target.value = '';
  };

  const handleRemoveImage = () => {
    handleChange('image', null);
    if (previewImage && previewImage.startsWith('blob:')) {
      URL.revokeObjectURL(previewImage);
    }
    setPreviewImage(null);
  };

  if (isLoadingPost) {
    return (
      <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-orange-600" />
        </div>
      </div>
    );
  }

  if (postError || !blogPostData?.post) {
    return (
      <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
        <div className="flex flex-col items-center justify-center py-12">
          <div className="flex items-center gap-2 text-red-600 mb-4">
            <X className="w-5 h-5" />
            <span>
              <FormattedMessage id="blog.edit.notFound" defaultMessage="Blog post not found" />
            </span>
          </div>
          <Button
            onClick={() => navigate('/blog')}
            className="mt-4"
          >
            <FormattedMessage id="blog.backToList" defaultMessage="Back to blog list" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-6">
          <FormattedMessage id="blog.edit.title" defaultMessage="Edit Blog Post" />
        </h1>

        <form onSubmit={handleSubmit} className="space-y-6 w-full">
          {/* Slug */}
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
              <FormattedMessage id="blog.create.slug" defaultMessage="Slug" />
            </label>
            <input
              type="text"
              id="slug"
              value={formData.slug || ''}
              onChange={(e) => {
                setIsSlugManuallyEdited(true);
                handleChange('slug', e.target.value);
              }}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              placeholder="my-blog-post"
            />
          </div>

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
              <FormattedMessage id="blog.create.title" defaultMessage="Title" />
            </label>
            <input
              type="text"
              id="title"
              value={formData.title || ''}
              onChange={(e) => handleChange('title', e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Excerpt */}
          <div>
            <label htmlFor="excerpt" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
              <FormattedMessage id="blog.create.excerpt" defaultMessage="Excerpt" />
            </label>
            <textarea
              id="excerpt"
              value={formData.excerpt || ''}
              onChange={(e) => handleChange('excerpt', e.target.value)}
              required
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Cover Image */}
          <div>
            <label htmlFor="coverImage" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
              <FormattedMessage id="blog.create.coverImage" defaultMessage="Cover Image" />
            </label>
            <div className="space-y-3">
              <input
                type="file"
                id="coverImage"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                disabled={uploading}
              />
              {previewImage || formData.image ? (
                <div className="relative">
                  <img
                    src={previewImage || formData.image || ''}
                    alt="Cover preview"
                    className="w-full h-64 object-cover rounded-lg border border-gray-300 dark:border-gray-600"
                  />
                  <div className="absolute top-2 right-2 flex gap-2">
                    <label
                      htmlFor="coverImage"
                      className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors cursor-pointer"
                      title={intl.formatMessage({ id: 'blog.create.changeImage', defaultMessage: 'Change image' })}
                    >
                      <Upload className="w-5 h-5" />
                    </label>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      aria-label={intl.formatMessage({ id: 'blog.create.removeImage', defaultMessage: 'Remove image' })}
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ) : (
                <label
                  htmlFor="coverImage"
                  className="block border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 cursor-pointer hover:border-orange-500 dark:hover:border-orange-500 transition-colors"
                >
                  <div className="flex flex-col items-center justify-center">
                    <Upload className="w-8 h-8 text-gray-400 dark:text-gray-500 mb-2" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      <FormattedMessage id="blog.create.uploadCoverImage" defaultMessage="Click to upload cover image" />
                    </span>
                  </div>
                </label>
              )}
              {uploading && (
                <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  <FormattedMessage id="blog.create.uploading" defaultMessage="Uploading..." />
                </div>
              )}
              {uploadError && !uploading && (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {uploadError.message}
                </div>
              )}
            </div>
          </div>

          {/* Content */}
          <div>
            <label htmlFor="content" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
              <FormattedMessage id="blog.create.content" defaultMessage="Content (Markdown)" />
            </label>
            <div data-color-mode={isDarkMode ? 'dark' : 'light'}>
              <MDEditor
                value={formData.content || ''}
                onChange={(value) => handleChange('content', value || '')}
                preview="live"
                visibleDragbar={true}
                height={500}
              />
            </div>
          </div>

          {/* Language */}
          <div>
            <label htmlFor="language" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 text-left">
              <FormattedMessage id="blog.create.language" defaultMessage="Language" />
            </label>
            <select
              id="language"
              value={formData.language || ''}
              onChange={(e) => handleChange('language', e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Published */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="published"
              checked={formData.published || false}
              onChange={(e) => handleChange('published', e.target.checked)}
              className="w-4 h-4 text-orange-600 border-gray-300 rounded focus:ring-orange-500"
            />
            <label htmlFor="published" className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300 text-left">
              <FormattedMessage id="blog.create.published" defaultMessage="Published" />
            </label>
          </div>

          {/* Error message */}
          {(error || submitError) && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">
                {submitError || error?.message || intl.formatMessage({ id: 'blog.edit.error', defaultMessage: 'Failed to update blog post' })}
              </p>
            </div>
          )}

          {/* Upload error message */}
          {uploadError && !uploading && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">
                {uploadError.message || intl.formatMessage({ id: 'blog.edit.uploadError', defaultMessage: 'Failed to upload image' })}
              </p>
            </div>
          )}

          {/* Submit button */}
          <div className="flex items-center gap-4">
            <Button
              type="submit"
              variant="outlined"
              color="primary"
              disabled={loading || uploading}
              className="inline-flex items-center px-6 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  <FormattedMessage id="blog.edit.saving" defaultMessage="Saving..." />
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  <FormattedMessage id="blog.edit.submit" defaultMessage="Update Post" />
                </>
              )}
            </Button>
            <Button
              type="button"
              color="error"
              onClick={() => navigate(`/blog/${slug}`)}
              className="inline-flex items-center px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              <X className="w-5 h-5 mr-2" />
              <FormattedMessage id="blog.create.cancel" defaultMessage="Cancel" />
            </Button>
          </div>
        </form>
      </div>
      <style>{`
        /* MDEditor tooltip left alignment */
        .w-md-editor-toolbar [data-tooltip]::before,
        .w-md-editor-toolbar [title]::before {
          left: 0 !important;
          right: auto !important;
          transform: translateX(0) !important;
        }
        .w-md-editor-toolbar [data-tooltip]::after,
        .w-md-editor-toolbar [title]::after {
          left: 8px !important;
          right: auto !important;
        }
        /* Make MDEditor full width */
        .w-md-editor {
          width: 100% !important;
        }
        .w-md-editor-text {
          width: 100% !important;
        }
        /* Use default fonts for markdown editor */
        .w-md-editor,
        .w-md-editor *,
        .w-md-editor-text,
        .w-md-editor-text *,
        .w-md-editor-text-textarea,
        .w-md-editor-text-textarea * {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        }
        /* Use monospace font for code editor area */
        .w-md-editor-text-textarea {
          font-family: 'Courier New', Courier, 'Lucida Console', Monaco, monospace !important;
        }
        /* Use default font for preview area */
        .w-md-editor-preview,
        .w-md-editor-preview * {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
        }
        /* Code blocks in preview should use monospace */
        .w-md-editor-preview code,
        .w-md-editor-preview pre {
          font-family: 'Courier New', Courier, 'Lucida Console', Monaco, monospace !important;
        }
      `}</style>
    </div>
  );
}

