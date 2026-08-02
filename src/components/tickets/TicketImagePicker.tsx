import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import AddPhotoAlternateIcon from '@mui/icons-material/AddPhotoAlternate';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { useIntl } from 'react-intl';

const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

type TicketImagePickerProps = {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
};

export default function TicketImagePicker({ files, onChange, disabled = false }: TicketImagePickerProps) {
  const intl = useIntl();
  const [error, setError] = useState<string | null>(null);
  const previews = useMemo(() => files.map((file) => ({
    file,
    url: URL.createObjectURL(file),
  })), [files]);

  useEffect(() => () => {
    previews.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [previews]);

  const handleSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    setError(null);

    if (files.length + selectedFiles.length > MAX_IMAGES) {
      setError(intl.formatMessage(
        { id: 'tickets.images.tooMany', defaultMessage: 'You can attach up to {count} images.' },
        { count: MAX_IMAGES },
      ));
      return;
    }

    const unsupportedFile = selectedFiles.find((file) => !SUPPORTED_IMAGE_TYPES.has(file.type));
    if (unsupportedFile) {
      setError(intl.formatMessage({
        id: 'tickets.images.unsupported',
        defaultMessage: 'Only JPEG, PNG, WebP, and GIF images are supported.',
      }));
      return;
    }

    const oversizedFile = selectedFiles.find((file) => file.size <= 0 || file.size > MAX_IMAGE_SIZE);
    if (oversizedFile) {
      setError(intl.formatMessage({
        id: 'tickets.images.tooLarge',
        defaultMessage: 'Each image must be no larger than 5 MB.',
      }));
      return;
    }

    onChange([...files, ...selectedFiles]);
  };

  const removeFile = (index: number) => {
    setError(null);
    onChange(files.filter((_file, fileIndex) => fileIndex !== index));
  };

  return (
    <Box sx={{ display: 'grid', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Button
          component="label"
          variant="outlined"
          startIcon={<AddPhotoAlternateIcon />}
          disabled={disabled || files.length >= MAX_IMAGES}
        >
          {intl.formatMessage({ id: 'tickets.images.add', defaultMessage: 'Add images' })}
          <input
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={handleSelect}
          />
        </Button>
        <Typography variant="caption" color="text.secondary">
          {intl.formatMessage(
            { id: 'tickets.images.count', defaultMessage: '{count}/{max} images' },
            { count: files.length, max: MAX_IMAGES },
          )}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {previews.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 112px))',
            gap: 1,
          }}
        >
          {previews.map((preview, index) => (
            <Box
              key={`${preview.file.name}-${preview.file.lastModified}-${index}`}
              sx={{
                position: 'relative',
                aspectRatio: '1 / 1',
                overflow: 'hidden',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                bgcolor: 'action.hover',
              }}
            >
              <Box
                component="img"
                src={preview.url}
                alt={preview.file.name}
                sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <Tooltip title={intl.formatMessage({ id: 'tickets.images.remove', defaultMessage: 'Remove image' })}>
                <span>
                  <IconButton
                    size="small"
                    onClick={() => removeFile(index)}
                    disabled={disabled}
                    aria-label={intl.formatMessage({ id: 'tickets.images.remove', defaultMessage: 'Remove image' })}
                    sx={{
                      position: 'absolute',
                      top: 4,
                      right: 4,
                      bgcolor: 'rgba(255, 255, 255, 0.92)',
                      color: 'error.main',
                      '&:hover': { bgcolor: 'background.paper' },
                    }}
                  >
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
