import { Dialog, DialogContent, DialogTitle, IconButton, Typography, Button, Box, Link } from '@mui/material';
import { Close } from '@mui/icons-material';
import { FormattedMessage } from 'react-intl';

interface NewsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function NewsModal({ open, onClose }: NewsModalProps) {
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
          <FormattedMessage id="newsModal.title" defaultMessage="Hello" />
        </Typography>
        <IconButton onClick={onClose} size="large">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            <FormattedMessage id="newsModal.welcome" defaultMessage="欢迎使用星际公民升级规划工具" />
          </Typography>
          <Typography component="p">
            <FormattedMessage id="newsModal.developmentStage" defaultMessage="本工具还处在开发阶段，如果发现bug可以联系我" />
          </Typography>
          <Typography component="p">
            <FormattedMessage id="newsModal.dataSource" defaultMessage="本工具的数据来源于手工收集，如有疏漏请联系我修改" />
          </Typography>
          <Typography component="p">
            <FormattedMessage id="newsModal.contact" defaultMessage="QQ群：1045858475" />
          </Typography>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            <FormattedMessage id="newsModal.newDomain" defaultMessage="新域名已启用" />
          </Typography>
          <Link href="https://citizenshub.app" target="_blank" rel="noopener noreferrer">
            citizenshub.app
          </Link>
        </Box>

        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            <FormattedMessage id="newsModal.referralLinkTitle" defaultMessage="本人邀请链接" />
          </Typography>
          <Link href="https://www.robertsspaceindustries.com/enlist?referral=STAR-47BR-3ZWH" target="_blank" rel="noopener noreferrer">
            www.robertsspaceindustries.com/enlist?referral=STAR-47BR-3ZWH
          </Link>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, gap: 2 }}>
          {/* <Button 
            variant="outlined" 
            color="primary" 
            onClick={onDismiss}
            size="large"
          >
            不再提示
          </Button> */}
          <Button 
            variant="contained" 
            color="primary" 
            onClick={onClose}
            size="large"
          >
            <FormattedMessage id="newsModal.understood" defaultMessage="了解了" />
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
} 