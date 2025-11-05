import { useState } from 'react';
import { useSelector } from 'react-redux';
import { useIntl } from 'react-intl';
import { CircularProgress, Tooltip, Snackbar, Alert, IconButton } from '@mui/material';
import { Heart } from 'lucide-react';
import { RootState } from '@/store';
import { useUserSession, useWatchlistData } from '@/hooks';

interface AddToWatchlistButtonProps {
  shipId: number;
  shipName?: string;
  onSuccess?: () => void;
  size?: 'small' | 'medium' | 'large';
}

export default function AddToWatchlistButton({
  shipId,
  shipName,
  onSuccess,
  size = 'medium',
}: AddToWatchlistButtonProps) {
  const intl = useIntl();
  const { user } = useSelector((state: RootState) => state.user);
  const { data: userSession } = useUserSession();
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success',
  });

  const isLoggedIn = !!user.token;
  const isEmailVerified = userSession?.user?.emailVerified ?? false;
  const canAddToWatchlist = isLoggedIn && isEmailVerified;
  const { isInWatchlist, mutate: mutateWatchlist } = useWatchlistData();
  const shipInWatchlist = canAddToWatchlist ? isInWatchlist(shipId) : false;

  const handleToggleWatchlist = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canAddToWatchlist) return;

    setLoading(true);
    const isAdding = !shipInWatchlist;
    try {
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_API_ENDPOINT}/api/watchlist`, {
        method: isAdding ? 'POST' : 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`,
        },
        body: JSON.stringify({ shipId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        await mutateWatchlist();
        setSnackbar({
          open: true,
          message: intl.formatMessage(
            {
              id: isAdding ? 'watchlist.addSuccess' : 'watchlist.removeSuccess',
              defaultMessage: isAdding ? 'Added {shipName} to watchlist' : 'Removed {shipName} from watchlist',
            },
            { shipName: shipName || 'ship' }
          ),
          severity: 'success',
        });
        onSuccess?.();
      } else {
        setSnackbar({
          open: true,
          message: data.message || intl.formatMessage({
            id: isAdding ? 'watchlist.addFailed' : 'watchlist.removeFailed',
            defaultMessage: isAdding ? 'Failed to add to watchlist' : 'Failed to remove from watchlist',
          }),
          severity: 'error',
        });
      }
    } catch (error) {
      setSnackbar({
        open: true,
        message: intl.formatMessage({
          id: isAdding ? 'watchlist.addError' : 'watchlist.removeError',
          defaultMessage: isAdding
            ? 'An error occurred while adding to watchlist'
            : 'An error occurred while removing from watchlist',
        }),
        severity: 'error',
      });
      console.error('Watchlist error:', error);
    } finally {
      setLoading(false);
    }
  };

  const iconSize = size === 'small' ? 20 : size === 'large' ? 28 : 24;
  const heartIcon = loading ? (
    <CircularProgress size={iconSize} color="inherit" />
  ) : (
    <Heart 
      size={iconSize} 
      fill={shipInWatchlist ? '#f44336' : 'none'} 
      style={{ color: '#f44336' }}
    />
  );

  const disabledHeart = (
    <IconButton size={size} disabled>
      <Heart size={iconSize} style={{ color: '#f44336', opacity: 0.3 }} />
    </IconButton>
  );

  if (!isLoggedIn) {
    return (
      <Tooltip title={intl.formatMessage({ id: 'watchlist.loginRequired', defaultMessage: 'Login required to add to watchlist' })}>
        <span>{disabledHeart}</span>
      </Tooltip>
    );
  }

  if (!isEmailVerified) {
    return (
      <Tooltip title={intl.formatMessage({ id: 'watchlist.emailVerificationRequired', defaultMessage: 'Email verification required to add to watchlist' })}>
        <span>{disabledHeart}</span>
      </Tooltip>
    );
  }

  return (
    <>
      <Tooltip 
        title={intl.formatMessage(
          {
            id: shipInWatchlist ? 'watchlist.removeFromWatchlist' : 'watchlist.addToWatchlist',
            defaultMessage: shipInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist',
          },
          { shipName: shipName || 'ship' }
        )}
      >
        <span>
          <IconButton
            size={size}
            onClick={handleToggleWatchlist}
            disabled={loading}
            aria-label={intl.formatMessage(
              {
                id: shipInWatchlist ? 'watchlist.removeFromWatchlist' : 'watchlist.addToWatchlist',
                defaultMessage: shipInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist',
              },
              { shipName: shipName || 'ship' }
            )}
          >
            {heartIcon}
          </IconButton>
        </span>
      </Tooltip>
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(prev => ({ ...prev, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </>
  );
}

