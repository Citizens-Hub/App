import { Dialog, DialogContent, DialogTitle, IconButton, Typography, Button, Box } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FormattedMessage, useIntl } from 'react-intl';
import DiscordIcon from '@/icons/DiscordIcon';
import { Link } from 'react-router';

interface NewsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function NewsModal({ open, onClose }: NewsModalProps) {
  const { locale } = useIntl()

  const handleClose = () => {
    onClose();
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
        <IconButton onClick={handleClose} size="large">
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

        {locale === "en" &&
          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Join our Discord server to get the latest news and updates:
            </Typography>
            <Link to="https://discord.gg/AEuRtb5Vy8" target="_blank" rel="noopener noreferrer" className='flex items-center gap-2'>
              <DiscordIcon />
              https://discord.gg/AEuRtb5Vy8
            </Link>
          </Box>
        }

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            <FormattedMessage id="newsModal.newFeature" defaultMessage="New feature" />
          </Typography>
          <Typography component="p">
            <FormattedMessage id="newsModal.newFeatureDescription" defaultMessage="You can now set the priority of CCU sources used by default when creating connections in the {settings}" values={{
              settings: <Link to="/app-settings"><FormattedMessage id="newsModal.settings" defaultMessage="App Settings" /></Link>
            }} />
          </Typography>
          <img
            src="/imgs/new-feature.png"
            alt="New feature"
            className="w-full h-auto"
          />
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleClose}
            size="large"
          >
            <FormattedMessage id="newsModal.understood" defaultMessage="Got it" />
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
} 