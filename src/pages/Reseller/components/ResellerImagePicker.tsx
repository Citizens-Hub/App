import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2, Upload, X } from 'lucide-react';
import { FormattedMessage, useIntl } from 'react-intl';

import { useDeleteResellerMedia, useResellerMedia, useUploadResellerMedia } from '@/hooks';
import { Ship } from '@/types';
import { getMarketImageDisplayUrl } from '@/utils/marketImages';

function normalizeImageUrl(value: string) {
  return value.trim();
}

interface ResellerImagePickerProps {
  imageUrls: string[];
  onChange: (imageUrls: string[]) => void;
  ships?: Ship[];
  label?: string;
  helperText?: string;
}

export default function ResellerImagePicker({
  imageUrls,
  onChange,
  ships,
  label,
  helperText,
}: ResellerImagePickerProps) {
  const intl = useIntl();
  const [manualUrl, setManualUrl] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [page, setPage] = useState(1);
  const { data, mutate, isLoading } = useResellerMedia(page, 30);
  const { uploadFile, loading: uploading, error: uploadError } = useUploadResellerMedia();
  const { deleteAttachment, loading: deleting, error: deleteError } = useDeleteResellerMedia();
  const attachments = data?.attachments || [];

  useEffect(() => {
    if (libraryOpen) {
      void mutate();
    }
  }, [libraryOpen, mutate]);

  const normalizedImageUrls = useMemo(() => (
    Array.from(new Set(imageUrls.map(normalizeImageUrl).filter(Boolean)))
  ), [imageUrls]);

  const handleAddUrl = (value: string) => {
    const normalizedUrl = normalizeImageUrl(value);
    if (!normalizedUrl || normalizedImageUrls.includes(normalizedUrl)) {
      setManualUrl('');
      return;
    }

    onChange([...normalizedImageUrls, normalizedUrl]);
    setManualUrl('');
  };

  const handleRemoveUrl = (url: string) => {
    onChange(normalizedImageUrls.filter((imageUrl) => imageUrl !== url));
  };

  const handleMoveUrl = (url: string, direction: -1 | 1) => {
    const index = normalizedImageUrls.indexOf(url);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= normalizedImageUrls.length) {
      return;
    }

    const nextImageUrls = [...normalizedImageUrls];
    const [removed] = nextImageUrls.splice(index, 1);
    nextImageUrls.splice(nextIndex, 0, removed);
    onChange(nextImageUrls);
  };

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const result = await uploadFile(file);
      await mutate();
      handleAddUrl(result.attachment.url);
      setLibraryOpen(true);
    } catch (error) {
      console.error('Failed to upload reseller image:', error);
    } finally {
      event.target.value = '';
    }
  };

  const handleDeleteAttachment = async (attachmentId: string, attachmentUrl: string) => {
    try {
      await deleteAttachment(attachmentId);
      handleRemoveUrl(attachmentUrl);
      await mutate();
    } catch (error) {
      console.error('Failed to delete reseller image:', error);
    }
  };

  const title = label || intl.formatMessage({
    id: 'reseller.imagePicker.label',
    defaultMessage: 'Listing images',
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          {title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button size="small" variant="outlined" startIcon={<ImageIcon size={16} />} onClick={() => setLibraryOpen(true)}>
            <FormattedMessage id="reseller.imagePicker.openLibrary" defaultMessage="Choose from library" />
          </Button>
          <Button size="small" variant="outlined" component="label" startIcon={<Upload size={16} />} disabled={uploading}>
            {uploading
              ? intl.formatMessage({ id: 'reseller.imagePicker.uploading', defaultMessage: 'Uploading...' })
              : intl.formatMessage({ id: 'reseller.imagePicker.upload', defaultMessage: 'Upload image' })}
            <input hidden type="file" accept="image/*" onChange={handleUpload} />
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField
          fullWidth
          size="small"
          label={intl.formatMessage({ id: 'reseller.imagePicker.manualUrl', defaultMessage: 'Manual image URL' })}
          value={manualUrl}
          onChange={(event) => setManualUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              handleAddUrl(manualUrl);
            }
          }}
          helperText={helperText || intl.formatMessage({
            id: 'reseller.imagePicker.help',
            defaultMessage: 'The first image is used as the cover. Add multiple images for the listing carousel.',
          })}
        />
        <Button variant="contained" onClick={() => handleAddUrl(manualUrl)} disabled={!manualUrl.trim()} sx={{ alignSelf: 'flex-start' }}>
          <Plus size={18} />
        </Button>
      </Box>

      {uploadError && (
        <Alert severity="error">
          {uploadError.message}
        </Alert>
      )}

      {deleteError && (
        <Alert severity="error">
          {deleteError.message}
        </Alert>
      )}

      {normalizedImageUrls.length > 0 ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
          {normalizedImageUrls.map((url, index) => (
            <Box key={url} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, overflow: 'hidden', bgcolor: 'background.paper' }}>
              <Box sx={{ position: 'relative', pt: '62.5%', bgcolor: 'action.hover' }}>
                <Box
                  component="img"
                  src={getMarketImageDisplayUrl(url, { ships, variant: 'thumbLarge' })}
                  alt={intl.formatMessage({ id: 'reseller.imagePicker.previewAlt', defaultMessage: 'Listing image {index}' }, { index: index + 1 })}
                  sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {index === 0 && (
                  <Chip
                    size="small"
                    color="primary"
                    label={intl.formatMessage({ id: 'reseller.imagePicker.cover', defaultMessage: 'Cover' })}
                    sx={{ position: 'absolute', left: 8, top: 8 }}
                  />
                )}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 0.5, p: 0.75 }}>
                <Typography variant="caption" color="text.secondary">
                  #{index + 1}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.25 }}>
                  <IconButton size="small" onClick={() => handleMoveUrl(url, -1)} disabled={index === 0}>
                    <ArrowUp size={14} />
                  </IconButton>
                  <IconButton size="small" onClick={() => handleMoveUrl(url, 1)} disabled={index === normalizedImageUrls.length - 1}>
                    <ArrowDown size={14} />
                  </IconButton>
                  <IconButton size="small" color="error" onClick={() => handleRemoveUrl(url)}>
                    <Trash2 size={14} />
                  </IconButton>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      ) : (
        <Box sx={{ border: '1px dashed', borderColor: 'divider', borderRadius: 1, p: 2 }}>
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id="reseller.imagePicker.empty" defaultMessage="No listing images selected yet." />
          </Typography>
        </Box>
      )}

      <Dialog open={libraryOpen} onClose={() => setLibraryOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2 }}>
          <FormattedMessage id="reseller.imagePicker.libraryTitle" defaultMessage="Reseller image library" />
          <IconButton onClick={() => setLibraryOpen(false)}>
            <X size={18} />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {isLoading && attachments.length === 0 ? (
            <Typography>
              <FormattedMessage id="loading" defaultMessage="Loading..." />
            </Typography>
          ) : attachments.length === 0 ? (
            <Alert severity="info">
              <FormattedMessage id="reseller.imagePicker.libraryEmpty" defaultMessage="Your image library is empty. Upload an image to start using it." />
            </Alert>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 2 }}>
              {attachments.map((attachment) => {
                const isSelected = normalizedImageUrls.includes(attachment.url);

                return (
                  <Box
                    key={attachment.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (isSelected) {
                        handleRemoveUrl(attachment.url);
                      } else {
                        handleAddUrl(attachment.url);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        if (isSelected) {
                          handleRemoveUrl(attachment.url);
                        } else {
                          handleAddUrl(attachment.url);
                        }
                      }
                    }}
                    sx={{
                      border: '1px solid',
                      borderColor: isSelected ? 'primary.main' : 'divider',
                      borderRadius: 1,
                      overflow: 'hidden',
                      cursor: 'pointer',
                      bgcolor: isSelected ? 'action.selected' : 'background.paper',
                    }}
                  >
                    <Box sx={{ position: 'relative', pt: '68%', bgcolor: 'action.hover' }}>
                      <Box
                        component="img"
                        src={getMarketImageDisplayUrl(attachment.url, { ships, variant: 'thumbLarge' })}
                        alt={attachment.fileName}
                        sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      {isSelected && (
                        <Chip
                          size="small"
                          color="primary"
                          label={intl.formatMessage({ id: 'reseller.imagePicker.selected', defaultMessage: 'Selected' })}
                          sx={{ position: 'absolute', right: 8, top: 8 }}
                        />
                      )}
                    </Box>
                    <Box sx={{ p: 1 }}>
                      <Typography variant="caption" sx={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', mb: 0.75 }}>
                        {attachment.fileName}
                      </Typography>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        fullWidth
                        disabled={deleting}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          void handleDeleteAttachment(attachment.id, attachment.url);
                        }}
                        startIcon={<Trash2 size={14} />}
                      >
                        <FormattedMessage id="reseller.imagePicker.delete" defaultMessage="Delete" />
                      </Button>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
            <FormattedMessage id="blog.pagination.previous" defaultMessage="Previous" />
          </Button>
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id="blog.pagination.page" defaultMessage="Page {current}" values={{ current: page }} />
          </Typography>
          <Button onClick={() => setPage((current) => current + 1)} disabled={(data?.pagination.totalPages || 0) <= page}>
            <FormattedMessage id="blog.pagination.next" defaultMessage="Next" />
          </Button>
          <Button variant="contained" onClick={() => setLibraryOpen(false)}>
            <FormattedMessage id="common.done" defaultMessage="Done" />
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
