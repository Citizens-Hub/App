import { Dialog, DialogContent, DialogTitle, IconButton, Typography, Button, Box } from '@mui/material';
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
          <FormattedMessage id="extensionModal.title" defaultMessage="Install Extension Instructions" />
        </Typography>
        <IconButton onClick={onClose} size="large">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" component="p">
            <FormattedMessage id="extensionModal.description" defaultMessage="Since the extension is not yet on the Chrome Store, it needs to be installed manually:" />
          </Typography>
          
          <Typography component="div" sx={{ mb: 2, mt: 2 }}>
            <ol style={{ paddingLeft: '1.5rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>
                <FormattedMessage id="extensionModal.step1" defaultMessage="Download and extract the extension files" />
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <FormattedMessage id="extensionModal.step2" defaultMessage="Open Chrome browser and enter chrome://extensions/ in the address bar" />
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <FormattedMessage 
                  id="extensionModal.step3" 
                  defaultMessage='Enable "Developer mode" in the top right corner' 
                />
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <FormattedMessage 
                  id="extensionModal.step4" 
                  defaultMessage='Click "Load unpacked extension" button' 
                />
              </li>
              <li style={{ marginBottom: '0.5rem' }}>
                <FormattedMessage id="extensionModal.step5" defaultMessage="Select the folder you just extracted" />
              </li>
              <li>
                <FormattedMessage id="extensionModal.step6" defaultMessage="After installation, refresh this page to use the extension" />
              </li>
            </ol>
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
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