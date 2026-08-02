import { useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import BrokenImageOutlinedIcon from '@mui/icons-material/BrokenImageOutlined';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import { useIntl } from 'react-intl';
import { TicketAttachment } from '@/types';

type TicketAttachmentGalleryProps = {
  attachments: TicketAttachment[];
};

function TicketAttachmentPreview({ attachment }: { attachment: TicketAttachment }) {
  const intl = useIntl();
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  if (failed) {
    return (
      <Box
        sx={{
          aspectRatio: '4 / 3',
          display: 'grid',
          placeItems: 'center',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          color: 'text.disabled',
          bgcolor: 'action.hover',
        }}
      >
        <BrokenImageOutlinedIcon />
      </Box>
    );
  }

  return (
    <>
      <Box
        component="button"
        type="button"
        onClick={() => setOpen(true)}
        aria-label={intl.formatMessage(
          { id: 'tickets.images.view', defaultMessage: 'View {fileName}' },
          { fileName: attachment.fileName },
        )}
        sx={{
          width: '100%',
          aspectRatio: '4 / 3',
          p: 0,
          overflow: 'hidden',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'action.hover',
          cursor: 'zoom-in',
          '&:focus-visible': {
            outline: '2px solid',
            outlineColor: 'primary.main',
            outlineOffset: 2,
          },
        }}
      >
        <Box
          component="img"
          src={attachment.url}
          alt={attachment.fileName}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="subtitle1" noWrap title={attachment.fileName}>
            {attachment.fileName}
          </Typography>
          <Box sx={{ display: 'flex', flexShrink: 0 }}>
            <Tooltip title={intl.formatMessage({ id: 'common.download', defaultMessage: 'Download' })}>
              <IconButton
                component="a"
                href={attachment.url}
                download={attachment.fileName}
                aria-label={intl.formatMessage({ id: 'common.download', defaultMessage: 'Download' })}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}>
              <IconButton
                onClick={() => setOpen(false)}
                aria-label={intl.formatMessage({ id: 'common.close', defaultMessage: 'Close' })}
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1, display: 'grid', placeItems: 'center', bgcolor: 'common.black' }}>
          <Box
            component="img"
            src={attachment.url}
            alt={attachment.fileName}
            decoding="async"
            sx={{ display: 'block', maxWidth: '100%', maxHeight: '78vh', objectFit: 'contain' }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function TicketAttachmentGallery({ attachments }: TicketAttachmentGalleryProps) {
  if (!attachments.length) {
    return null;
  }

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 160px))',
        gap: 1,
        mt: 1.5,
      }}
    >
      {attachments.map((attachment) => (
        <TicketAttachmentPreview key={attachment.id} attachment={attachment} />
      ))}
    </Box>
  );
}
