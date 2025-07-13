import { useEffect } from 'react';
import { Typography, Box, CircularProgress, Tabs, Tab } from '@mui/material';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { FormattedMessage } from 'react-intl';
import { useLocale } from '@/contexts/LocaleContext';
import { useDocumentData } from '@/hooks';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`privacy-tabpanel-${index}`}
      aria-labelledby={`privacy-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ pt: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

function a11yProps(index: number) {
  return {
    id: `privacy-tab-${index}`,
    'aria-controls': `privacy-tabpanel-${index}`,
  };
}

export default function Privacy() {
  const { locale } = useLocale();
  
  // 使用通用文档获取钩子
  const { 
    content, 
    language, 
    toggleLanguage, 
    isLoading: loading, 
    error 
  } = useDocumentData('/docs/privacy.md', '/docs/privacy.en.md');
  
  // 根据当前语言设置选项卡值
  const tabValue = language === 'zh' ? 0 : 1;

  // 选项卡切换事件
  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    if ((newValue === 0 && language === 'en') || (newValue === 1 && language === 'zh')) {
      toggleLanguage();
    }
  };

  // 初始化选项卡值，根据应用语言环境
  useEffect(() => {
    if ((locale === 'zh-CN' && language === 'en') || 
        (locale !== 'zh-CN' && language === 'zh')) {
      toggleLanguage();
    }
  }, [locale, language, toggleLanguage]);

  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto'>
      <Typography variant="h4" component="h1" gutterBottom>
        <FormattedMessage id="privacy.heading" defaultMessage="Privacy Policy" />
      </Typography>

      <Box sx={{ mt: 4, maxWidth: '800px', margin: '0 auto' }}>
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Typography color="error">
            {error instanceof Error ? error.message : 'Failed to load document'}
          </Typography>
        )}

        {!loading && !error && (
          <Box>
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
              <Tabs value={tabValue} onChange={handleTabChange} centered>
                <Tab label="中文" {...a11yProps(0)} />
                <Tab label="English" {...a11yProps(1)} />
              </Tabs>
            </Box>

            <TabPanel value={tabValue} index={tabValue}>
              <Box sx={{
                backgroundColor: 'background.paper',
                borderRadius: 1,
                p: 3,
                textAlign: 'left',
                margin: '0 auto'
              }}>
                <MarkdownPreview source={content} />
              </Box>
            </TabPanel>
          </Box>
        )}
      </Box>
    </div>
  );
}
