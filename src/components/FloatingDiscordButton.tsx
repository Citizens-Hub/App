import { Box, Tooltip } from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import DiscordIcon from '@/icons/DiscordIcon';

const DISCORD_INVITE_URL = 'https://discord.gg/AEuRtb5Vy8';

export default function FloatingDiscordButton() {
  const intl = useIntl();
  const label = intl.formatMessage({
    id: 'floatingDiscord.join',
    defaultMessage: 'Join Discord',
  });

  return (
    <Tooltip
      title={intl.formatMessage({
        id: 'floatingDiscord.tooltip',
        defaultMessage: 'Join our Discord server',
      })}
      placement="left"
    >
      <Box
        component="a"
        href={DISCORD_INVITE_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        sx={{
          position: 'fixed',
          right: { xs: 16, sm: 32 },
          bottom: {
            xs: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
            sm: 'calc(env(safe-area-inset-bottom, 0px) + 32px)',
          },
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          gap: { xs: 1, sm: 1.25 },
          minHeight: { xs: 50, sm: 56 },
          maxWidth: 'calc(100vw - 32px)',
          px: { xs: 2, sm: 2.5 },
          py: 1,
          borderRadius: 999,
          border: '1px solid rgba(255,255,255,0.32)',
          background: 'linear-gradient(135deg, #5865f2 0%, #7c3aed 100%)',
          boxShadow: '0 14px 34px rgba(88, 101, 242, 0.42), 0 0 0 6px rgba(88, 101, 242, 0.16)',
          color: '#fff',
          fontSize: { xs: 15, sm: 16 },
          fontWeight: 800,
          lineHeight: 1,
          textDecoration: 'none',
          textTransform: 'none',
          whiteSpace: 'nowrap',
          transition: 'transform 160ms ease, box-shadow 160ms ease, filter 160ms ease',
          '&:hover': {
            color: '#fff !important',
            filter: 'brightness(1.06)',
            transform: 'translateY(-2px)',
            boxShadow: '0 18px 42px rgba(88, 101, 242, 0.5), 0 0 0 8px rgba(88, 101, 242, 0.18)',
          },
          '&:active': {
            transform: 'translateY(0)',
          },
          '&:focus-visible': {
            outline: '3px solid rgba(255,255,255,0.85)',
            outlineOffset: 3,
          },
        }}
      >
        <DiscordIcon sx={{ width: { xs: 22, sm: 24 }, height: { xs: 22, sm: 24 }, flexShrink: 0 }} />
        <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <FormattedMessage id="floatingDiscord.join" defaultMessage="Join Discord" />
        </Box>
      </Box>
    </Tooltip>
  );
}
