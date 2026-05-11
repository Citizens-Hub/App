import { useEffect, useState } from 'react';
import { Typography, Box, CircularProgress, Tabs, Tab } from '@mui/material';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { FormattedMessage, useIntl } from 'react-intl';
import { useLocale } from '../contexts/LocaleContext';

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
  panelPrefix: string;
}

interface PolicyDocumentPageProps {
  chineseDocPath: string;
  englishDocPath: string;
  panelPrefix: string;
  titleDefaultMessage: string;
  titleId: string;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, panelPrefix, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`${panelPrefix}-tabpanel-${index}`}
      aria-labelledby={`${panelPrefix}-tab-${index}`}
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

function getA11yProps(panelPrefix: string, index: number) {
  return {
    id: `${panelPrefix}-tab-${index}`,
    'aria-controls': `${panelPrefix}-tabpanel-${index}`,
  };
}

export default function PolicyDocumentPage({
  chineseDocPath,
  englishDocPath,
  panelPrefix,
  titleDefaultMessage,
  titleId,
}: PolicyDocumentPageProps) {
  const intl = useIntl();
  const { locale } = useLocale();
  const [chineseMarkdown, setChineseMarkdown] = useState('');
  const [englishMarkdown, setEnglishMarkdown] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState(locale.startsWith('zh') ? 0 : 1);

  const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
    setTabValue(newValue);
  };

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);

        const chineseResponse = await fetch(chineseDocPath);
        if (!chineseResponse.ok) {
          throw new Error(`Unable to fetch Chinese document: ${chineseResponse.status}`);
        }
        const chineseText = await chineseResponse.text();
        setChineseMarkdown(chineseText);

        const englishResponse = await fetch(englishDocPath);
        if (!englishResponse.ok) {
          throw new Error(`Unable to fetch English document: ${englishResponse.status}`);
        }
        const englishText = await englishResponse.text();
        setEnglishMarkdown(englishText);

        setError(null);
      } catch (err) {
        console.error('Failed to fetch policy document:', err);
        setError((err as Error).message || 'Failed to fetch policy document.');
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, [chineseDocPath, englishDocPath]);

  return (
    <div className='w-full h-[calc(100vh-65px)] absolute top-[65px] left-0 right-0 p-8 overflow-auto'>
      <Typography variant="h4" component="h1" gutterBottom>
        <FormattedMessage id={titleId} defaultMessage={titleDefaultMessage} />
      </Typography>

      <Box sx={{ mt: 4, maxWidth: '800px', margin: '0 auto' }}>
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
                <Tab
                  label={intl.formatMessage({ id: 'language.name.zh', defaultMessage: 'Chinese' })}
                  {...getA11yProps(panelPrefix, 0)}
                />
                <Tab
                  label={intl.formatMessage({ id: 'language.name.en', defaultMessage: 'English' })}
                  {...getA11yProps(panelPrefix, 1)}
                />
              </Tabs>
            </Box>

            <TabPanel value={tabValue} index={0} panelPrefix={panelPrefix}>
              <Box
                sx={{
                  backgroundColor: 'background.paper',
                  borderRadius: 1,
                  p: 3,
                  textAlign: 'left',
                  margin: '0 auto',
                }}
              >
                <MarkdownPreview source={chineseMarkdown} />
              </Box>
            </TabPanel>

            <TabPanel value={tabValue} index={1} panelPrefix={panelPrefix}>
              <Box
                sx={{
                  backgroundColor: 'background.paper',
                  borderRadius: 1,
                  p: 3,
                  textAlign: 'left',
                  margin: '0 auto',
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
