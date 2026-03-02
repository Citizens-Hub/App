import { Box, Button, Paper, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { FormattedMessage } from 'react-intl';

const SUPPORT_PROMPT_VISIT_COUNT_KEY = 'supportPrompt.visitCount';
const SUPPORT_PROMPT_NEVER_KEY = 'supportPrompt.neverShow';
const SUPPORT_PROMPT_THRESHOLD = 3;

const CHROME_WEBSTORE_REVIEW_URL = 'https://chromewebstore.google.com/detail/citizens-hub/hngpbfpdnkobjjjbdmfncbbjjhpdmaap/reviews';
const GITHUB_STAR_URL = 'https://github.com/EduarteXD/citizenshub';

function getVisitCount(): number {
  const raw = localStorage.getItem(SUPPORT_PROMPT_VISIT_COUNT_KEY);
  const parsed = Number.parseInt(raw || '0', 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

export default function SupportPrompt() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const neverShow = localStorage.getItem(SUPPORT_PROMPT_NEVER_KEY) === 'true';
    if (neverShow) {
      return;
    }

    const nextVisitCount = getVisitCount() + 1;
    localStorage.setItem(SUPPORT_PROMPT_VISIT_COUNT_KEY, String(nextVisitCount));

    if (nextVisitCount >= SUPPORT_PROMPT_THRESHOLD) {
      setOpen(true);
    }
  }, []);

  const closeForNow = () => {
    setOpen(false);
  };

  const neverShowAgain = () => {
    localStorage.setItem(SUPPORT_PROMPT_NEVER_KEY, 'true');
    setOpen(false);
  };

  const openExternalAndClose = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    neverShowAgain();
  };

  if (!open) {
    return null;
  }

  return (
    <Box
      sx={{
        position: 'fixed',
        right: 16,
        bottom: 24,
        width: {
          xs: 'calc(100vw - 32px)',
          sm: 360
        },
        zIndex: 1400
      }}
    >
      <Paper
        elevation={10}
        sx={{
          p: 2,
          borderRadius: 2
        }}
      >
        <Typography variant="subtitle1" fontWeight={700} sx={{ mb: 1 }}>
          <FormattedMessage id="supportPrompt.title" defaultMessage="Support Citizens' Hub" />
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          <FormattedMessage
            id="supportPrompt.description"
            defaultMessage="If this app helps you, could you leave a review on Chrome Web Store or give our GitHub repo a star?"
          />
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1, flexWrap: 'wrap' }}>
            <Button size="small" variant="outlined" onClick={closeForNow}>
              <FormattedMessage id="supportPrompt.nextTime" defaultMessage="Later" />
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => openExternalAndClose(CHROME_WEBSTORE_REVIEW_URL)}
            >
              <FormattedMessage id="supportPrompt.review" defaultMessage="Review" />
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={() => openExternalAndClose(GITHUB_STAR_URL)}
            >
              <FormattedMessage id="supportPrompt.star" defaultMessage="Give a Star" />
            </Button>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Button size="small" variant="text" color="inherit" onClick={neverShowAgain}>
              <FormattedMessage id="supportPrompt.never" defaultMessage="Don't remind me again" />
            </Button>
          </Box>
        </Box>
      </Paper>
    </Box>
  );
}
