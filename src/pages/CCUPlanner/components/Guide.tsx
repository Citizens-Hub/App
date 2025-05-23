import { useEffect, useState } from 'react';
import { Typography, Box, CircularProgress, Tabs, Tab } from '@mui/material';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useLocale } from '../../../contexts/LocaleContext';
import { FormattedMessage } from 'react-intl';

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

export default function Guide({ showTitle = false }: { showTitle?: boolean }) {
  const { locale } = useLocale();
  const [chineseMarkdown, setChineseMarkdown] = useState<string>('');
  const [englishMarkdown, setEnglishMarkdown] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(locale === 'zh-CN' ? 0 : 1);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  useEffect(() => {
    const fetchChangelogs = async () => {
      try {
        setLoading(true);

        // Get Chinese changelog
        const chineseResponse = await fetch('/docs/guide.md');
        if (!chineseResponse.ok) {
          throw new Error(`Unable to fetch Chinese guide: ${chineseResponse.status}`);
        }
        const chineseText = await chineseResponse.text();
        setChineseMarkdown(chineseText);

        // Get English changelog
        const englishResponse = await fetch('/docs/guide.en.md');
        if (!englishResponse.ok) {
          throw new Error(`Unable to fetch English guide: ${englishResponse.status}`);
        }
        const englishText = await englishResponse.text();
        setEnglishMarkdown(englishText);

        setError(null);
      } catch (err) {
        console.error('Error fetching guide:', err);
        setError((err as Error).message || 'Error fetching guide');
      } finally {
        setLoading(false);
      }
    };

    fetchChangelogs();
  }, []);

  return (
    <div className='w-full h-full overflow-auto'>
      {
        showTitle && (
          <Typography variant="h4" component="h1" gutterBottom>
            <FormattedMessage id="guide.title" defaultMessage="Guide" />
          </Typography>
        )
      }
      <Box sx={{ mt: 4, maxWidth: '1200px', margin: '0 auto' }}>
        {loading && (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
            <CircularProgress />
          </Box>
        )}

        {error && (
          <Typography color="error">
            {error}
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

            <TabPanel value={tabValue} index={0}>
              <Box sx={{
                backgroundColor: 'background.paper',
                borderRadius: 1,
                p: 3,
                textAlign: 'left',
                margin: '0 auto'
              }}>
                <MarkdownPreview source={chineseMarkdown} />
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1}>
              <Box sx={{
                backgroundColor: 'background.paper',
                borderRadius: 1,
                p: 3,
                textAlign: 'left',
                margin: '0 auto'
              }}
              >
                <MarkdownPreview source={englishMarkdown} />
              </Box>
            </TabPanel>
          </Box>
        )}
      </Box>
    </div>
  );
}
