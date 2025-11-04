import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Box, Button, Typography, TextField, InputAdornment } from '@mui/material';
import { Upload, Image as ImageIcon, Copy, Check, Loader2, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';
import { useUploadAttachment } from '@/hooks/swr/blog/useUploadAttachment';
import { useAttachments } from '@/hooks/swr/blog/useAttachments';
import type { Attachment } from '@/hooks/swr/blog/useAttachments';

interface MediaLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onInsert?: (markdown: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

export default function MediaLibraryModal({ open, onClose, onInsert }: MediaLibraryModalProps) {
  const intl = useIntl();
  const { uploadFile, loading: uploading, error: uploadError } = useUploadAttachment();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const limit = 20;
  
  const { data: attachmentsData, mutate } = useAttachments(page, limit);
  const attachments = attachmentsData?.attachments || [];

  // Filter attachments by search term
  const filteredAttachments = attachments.filter(att => 
    att.fileName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Refresh when modal opens
  useEffect(() => {
    if (open) {
      mutate();
    }
  }, [open, mutate]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadFile(file);
      // Refresh attachments list
      mutate();
    } catch (err) {
      console.error('Upload failed:', err);
    }

    // Reset input
    e.target.value = '';
  };

  const getImageUrl = (attachment: Attachment): string => {
    if (attachment.url.startsWith('http')) {
      return attachment.url;
    }
    return `${API_BASE_URL}${attachment.url}`;
  };

  const generateMarkdown = (attachment: Attachment): string => {
    const imageUrl = getImageUrl(attachment);
    return `![${attachment.fileName}](${imageUrl})`;
  };

  const handleCopyMarkdown = async (attachment: Attachment) => {
    const markdown = generateMarkdown(attachment);
    try {
      await navigator.clipboard.writeText(markdown);
      setCopiedId(attachment.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleInsertMarkdown = (attachment: Attachment) => {
    if (onInsert) {
      const markdown = generateMarkdown(attachment);
      onInsert(markdown);
      onClose();
    } else {
      handleCopyMarkdown(attachment);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(intl.locale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            maxHeight: '90vh',
          }
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        borderBottom: '1px solid',
        borderColor: 'divider',
        pb: 2
      }}>
        <Typography variant="h5" component="h2" fontWeight="bold">
          <FormattedMessage id="mediaLibrary.title" defaultMessage="Media Library" />
        </Typography>
        <IconButton onClick={onClose} size="small">
          <X />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column', height: '70vh' }}>
        {/* Header Section: Upload and Search */}
        <Box sx={{ p: 3, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
          {/* Upload Section */}
          <Box sx={{ mb: 2, p: 2, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
            <input
              type="file"
              id="media-upload"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
            <label htmlFor="media-upload">
              <Button
                component="span"
                variant="outlined"
                startIcon={uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                disabled={uploading}
              >
                <FormattedMessage id="mediaLibrary.upload" defaultMessage="Upload Image" />
              </Button>
            </label>
            {uploadError && (
              <Typography variant="body2" color="error" sx={{ mt: 1 }}>
                {uploadError.message}
              </Typography>
            )}
          </Box>

          {/* Search */}
          <TextField
            fullWidth
            placeholder={intl.formatMessage({ id: 'mediaLibrary.search', defaultMessage: 'Search images...' })}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <ImageIcon className="w-4 h-4" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {/* Images Grid - Scrollable */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {filteredAttachments.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <Typography variant="body1" color="text.secondary">
                <FormattedMessage id="mediaLibrary.noImages" defaultMessage="No images found" />
              </Typography>
            </Box>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {filteredAttachments.map((attachment) => (
                <div key={attachment.id}>
                  <Box
                    sx={{
                      border: '1px solid',
                      borderColor: 'divider',
                      borderRadius: 2,
                      overflow: 'hidden',
                      transition: 'all 0.2s',
                      '&:hover': {
                        boxShadow: 2,
                        borderColor: 'primary.main',
                      }
                    }}
                  >
                    {/* Image */}
                    <Box
                      sx={{
                        position: 'relative',
                        width: '100%',
                        paddingTop: '75%', // 4:3 aspect ratio
                        backgroundColor: 'grey.100',
                        cursor: 'pointer',
                      }}
                      onClick={() => handleInsertMarkdown(attachment)}
                    >
                      <img
                        src={getImageUrl(attachment)}
                        alt={attachment.fileName}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    </Box>

                    {/* Info */}
                    <Box sx={{ p: 1.5 }}>
                      <Typography
                        variant="caption"
                        sx={{
                          display: 'block',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          mb: 0.5,
                          fontWeight: 'medium',
                        }}
                        title={attachment.fileName}
                      >
                        {attachment.fileName}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        {formatFileSize(attachment.fileSize)} • {formatDate(attachment.createdAt)}
                      </Typography>

                      {/* Actions */}
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          startIcon={copiedId === attachment.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyMarkdown(attachment);
                          }}
                          sx={{ flex: 1, fontSize: '0.75rem' }}
                        >
                          <FormattedMessage id="mediaLibrary.copy" defaultMessage="Copy" />
                        </Button>
                        {onInsert && (
                          <Button
                            size="small"
                            variant="contained"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInsertMarkdown(attachment);
                            }}
                            sx={{ flex: 1, fontSize: '0.75rem' }}
                          >
                            <FormattedMessage id="mediaLibrary.insert" defaultMessage="Insert" />
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Box>
                </div>
              ))}
            </div>
          )}
        </Box>

        {/* Pagination Controls - Footer */}
        <Box sx={{ 
          p: 2, 
          borderTop: '1px solid', 
          borderColor: 'divider', 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          flexShrink: 0
        }}>
          <Button
            variant="outlined"
            size="small"
            startIcon={<ChevronLeft className="w-4 h-4" />}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <FormattedMessage id="blog.pagination.previous" defaultMessage="Previous" />
          </Button>
          <Typography variant="body2">
            <FormattedMessage 
              id="blog.pagination.page" 
              defaultMessage="Page {current}" 
              values={{ current: page }}
            />
          </Typography>
          <Button
            variant="outlined"
            size="small"
            endIcon={<ChevronRight className="w-4 h-4" />}
            onClick={() => setPage(p => p + 1)}
            disabled={filteredAttachments.length < limit || attachments.length < limit}
          >
            <FormattedMessage id="blog.pagination.next" defaultMessage="Next" />
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}

