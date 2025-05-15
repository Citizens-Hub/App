import { Dialog, DialogContent, DialogTitle, IconButton, Typography, Button, Box, Link } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FormattedMessage } from 'react-intl';

interface ExtensionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function ExtensionModal({ open, onClose }: ExtensionModalProps) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            p: 1
          }
        }
      }}
    >
      <DialogTitle sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        pb: 1
      }}>
        <Typography variant="h5" component="h2" fontWeight="bold">
          <FormattedMessage id="extensionModal.title" defaultMessage="Install Extension" />
        </Typography>
        <IconButton onClick={onClose} size="large">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" component="p" sx={{ mb: 3 }}>
            <FormattedMessage id="extensionModal.description" defaultMessage="Install the extension for:" />
          </Typography>
          
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body1" component="div">
              <FormattedMessage id="extensionModal.chromeEdge" defaultMessage="Chrome & Edge:" />
              <Box component="span" sx={{ display: 'flex', gap: 2 }}>
                <Link 
                  href="https://chromewebstore.google.com/detail/hngpbfpdnkobjjjbdmfncbbjjhpdmaap?utm_source=item-share-cb" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <FormattedMessage id="extensionModal.chromeLink" defaultMessage="Chrome Web Store" />
                </Link>
                <Link 
                  href="/Citizens-Hub-Chrome.crx" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <FormattedMessage id="extensionModal.manualLink" defaultMessage="Manual" />
                </Link>
              </Box>
            </Typography>
            
            <Typography variant="body1" component="div">
              <FormattedMessage id="extensionModal.firefox" defaultMessage="Firefox:" />
              <Box component="span" sx={{ display: 'flex', gap: 2 }}>
                <Link 
                  href="https://addons.mozilla.org/en-US/firefox/addon/citizens-hub/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <FormattedMessage id="extensionModal.firefoxLink" defaultMessage="Firefox Add-ons" />
                </Link>
                <Link 
                  href="/citizens_hub-1.0.0.xpi" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <FormattedMessage id="extensionModal.manualLink" defaultMessage="Manual" />
                </Link>
              </Box>
            </Typography>
          </Box>
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            <FormattedMessage id="extensionModal.note" defaultMessage="Note: The extension is only used to read upgrade information from your RSI account and does not collect any personal data." />
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={onClose}
            size="large"
          >
            <FormattedMessage id="extensionModal.understood" defaultMessage="Got it" />
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
} 