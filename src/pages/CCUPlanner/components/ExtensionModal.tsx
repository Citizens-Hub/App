import { Dialog, DialogContent, DialogTitle, IconButton, Typography, Button, Box } from '@mui/material';
import { Close } from '@mui/icons-material';

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
          安装扩展程序说明
        </Typography>
        <IconButton onClick={onClose} size="large">
          <Close />
        </IconButton>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Typography variant="body1" component="p">
            由于扩展程序尚未上架 Chrome 商店，需要手动安装：
          </Typography>
          
          <Typography component="div" sx={{ mb: 2, mt: 2 }}>
            <ol style={{ paddingLeft: '1.5rem' }}>
              <li style={{ marginBottom: '0.5rem' }}>下载并解压扩展程序文件</li>
              <li style={{ marginBottom: '0.5rem' }}>打开 Chrome 浏览器，在地址栏输入 <code>chrome://extensions/</code></li>
              <li style={{ marginBottom: '0.5rem' }}>在右上角开启"开发者模式"</li>
              <li style={{ marginBottom: '0.5rem' }}>点击"加载已解压的扩展程序"按钮</li>
              <li style={{ marginBottom: '0.5rem' }}>选择刚才解压的文件夹</li>
              <li>完成安装后，刷新本页面即可使用扩展功能</li>
            </ol>
          </Typography>
          
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
            注意：扩展程序仅用于从您的RSI账户中读取升级信息，不会收集任何个人数据。
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={onClose}
            size="large"
          >
            了解了
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
} 