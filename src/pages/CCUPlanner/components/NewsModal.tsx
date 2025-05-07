import { Dialog, DialogContent, DialogTitle, IconButton, Typography, Button, Box, Link } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FormattedMessage } from 'react-intl';
import { useState, useEffect } from 'react';
import { useLocale } from '../../../contexts/LocaleContext';
import DiscordIcon from '../../../icons/DiscordIcon';

interface NewsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function NewsModal({ open, onClose }: NewsModalProps) {
  const [canClose, setCanClose] = useState(false);
  const [timeLeft, setTimeLeft] = useState(3);

  const locale = useLocale();

  useEffect(() => {
    if (open) {
      setCanClose(false);

      if (timeLeft > 0) {
        setTimeout(() => {
          setTimeLeft(timeLeft - 1);
        }, 1000);
      } else {
        setCanClose(true);
      }
    }
  }, [open, timeLeft]);

  const handleClose = () => {
    if (canClose) {
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
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
        <Typography variant="h5" component="p" fontWeight="bold">
          <FormattedMessage id="newsModal.title" defaultMessage="Hello" />
        </Typography>
        <IconButton onClick={handleClose} size="large" disabled={!canClose}>
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            <FormattedMessage id="newsModal.welcome" defaultMessage="Welcome to the Star Citizen Upgrade Planner" />
          </Typography>
          <Typography component="p">
            <FormattedMessage id="newsModal.developmentStage" defaultMessage="This tool is still in the development stage, if you find any bugs, please contact me" />
          </Typography>
          <Typography component="p">
            <FormattedMessage id="newsModal.dataSource" defaultMessage="The data of this tool is collected manually, if there are any omissions, please contact me to modify" />
          </Typography>
          <Typography component="p">
            <FormattedMessage id="newsModal.contact" defaultMessage="" />
          </Typography>
        </Box>

        {locale.locale === "en" &&
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Join our Discord server to get the latest news and updates:
            </Typography>
            <Link href="https://discord.gg/qFvv4YJ4" target="_blank" rel="noopener noreferrer" className='flex items-center gap-2'>
              <DiscordIcon />
              https://discord.gg/qFvv4YJ4
            </Link>
          </Box>
        }

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            <FormattedMessage id="newsModal.newDomain" defaultMessage="New domain name enabled" />
          </Typography>
          <Link href="https://citizenshub.app" target="_blank" rel="noopener noreferrer">
            citizenshub.app
          </Link>
          <Typography component="p">
            <FormattedMessage id="newsModal.pleaseDownloadNewExtension" defaultMessage="Due to the original extension did not add the new domain name access permission, please download the browser extension again" />
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            <FormattedMessage id="newsModal.referralLinkTitle" defaultMessage="My referral link" />
          </Typography>
          <Link href="https://www.robertsspaceindustries.com/enlist?referral=STAR-47BR-3ZWH" target="_blank" rel="noopener noreferrer">
            www.robertsspaceindustries.com/enlist?referral=STAR-47BR-3ZWH
          </Link>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleClose}
            size="large"
            disabled={!canClose}
          >
            <FormattedMessage id="newsModal.understood" defaultMessage="Got it" />
            {timeLeft > 0 && `(${timeLeft}s)`}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
} 