import { useDispatch, useSelector } from 'react-redux';
import { Avatar, Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { FormattedMessage, useIntl } from 'react-intl';
import { X } from 'lucide-react';

import { RootState } from '../store';
import { setSelectedUser } from '../store/upgradesStore';

interface UserSelectorProps {
  variant?: 'standalone' | 'embedded';
  align?: 'start' | 'center';
  minHeight?: number;
  preserveSpace?: boolean;
  showActiveUser?: boolean;
}

export default function UserSelector({
  variant = 'standalone',
  align = 'start',
  minHeight = 64,
  preserveSpace = false,
  showActiveUser = true,
}: UserSelectorProps) {
  const intl = useIntl();
  const users = useSelector((state: RootState) => state.upgrades.users);
  const selectedUser = useSelector((state: RootState) => state.upgrades.selectedUser);
  const dispatch = useDispatch();

  const selectableUsers = users.filter((user) => !user.isAnonymous);
  const selectedUserEntry = users.find((user) => user.id === selectedUser);
  const isEmbedded = variant === 'embedded';
  const hasActiveSelection = selectedUser !== -1;
  const clearSelectionLabel = intl.formatMessage({
    id: 'userSelector.clearSelection',
    defaultMessage: 'Clear user selection',
  });

  if (selectableUsers.length === 0 && !preserveSpace) {
    return null;
  }

  const handleUserSelect = (userId: number) => {
    dispatch(setSelectedUser(userId));
  };

  const handleClearSelection = () => {
    dispatch(setSelectedUser(-1));
  };

  return (
    <Box
      sx={{
        display: 'flex',
        minHeight,
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 1,
        px: isEmbedded ? 0 : 1.5,
        py: isEmbedded ? 0 : 1.25,
        border: isEmbedded ? 'none' : '1px solid',
        borderColor: isEmbedded ? 'transparent' : 'divider',
        borderRadius: isEmbedded ? 0 : '4px',
        bgcolor: isEmbedded ? 'transparent' : 'background.paper',
      }}
    >
      {selectableUsers.length === 0 ? (
        <Box
          sx={{
            minHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: align === 'start' ? 'flex-start' : 'center',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id="userSelector.empty" defaultMessage="No synced users yet" />
          </Typography>
        </Box>
      ) : (
        <>
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            sx={{
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: align === 'start' ? 'flex-start' : 'center',
            }}
          >
            {selectableUsers.map((user) => {
              const userName = user.nickname || user.username || 'User';
              const isSelected = user.id === selectedUser;

              return (
                <Tooltip key={user.id} title={userName} arrow>
                  <Avatar
                    src={user.avatar || 'https://cdn.robertsspaceindustries.com/static/images/account/avatar_default_big.jpg'}
                    alt={user.username}
                    onClick={() => handleUserSelect(user.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleUserSelect(user.id);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={intl.formatMessage(
                      { id: 'userSelector.selectUser', defaultMessage: 'Select user {userName}' },
                      { userName },
                    )}
                    sx={{
                      width: 38,
                      height: 38,
                      cursor: 'pointer',
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: isSelected ? '#2563eb' : 'divider',
                      boxShadow: isSelected
                        ? `0 0 0 1px ${alpha('#2563eb', 0.28)}`
                        : 'none',
                      opacity: isSelected ? 1 : 0.72,
                      transition: 'transform 0.16s ease, opacity 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease',
                      '&:hover': {
                        opacity: 1,
                        transform: 'translateY(-1px)',
                        borderColor: '#2563eb',
                      },
                      '&:focus-visible': {
                        outline: '2px solid #2563eb',
                        outlineOffset: 2,
                      },
                    }}
                  />
                </Tooltip>
              );
            })}
            {!showActiveUser && hasActiveSelection && (
              <Tooltip title={clearSelectionLabel} arrow>
                <IconButton
                  size="small"
                  onClick={handleClearSelection}
                  aria-label={clearSelectionLabel}
                  sx={{
                    width: 38,
                    height: 38,
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: '999px',
                    color: 'text.secondary',
                    bgcolor: 'background.paper',
                    transition: 'color 0.16s ease, border-color 0.16s ease, background-color 0.16s ease',
                    '&:hover': {
                      color: '#2563eb',
                      borderColor: '#2563eb',
                      bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                    },
                    '&:focus-visible': {
                      outline: '2px solid #2563eb',
                      outlineOffset: 2,
                    },
                  }}
                >
                  <X className="h-4 w-4" />
                </IconButton>
              </Tooltip>
            )}
          </Stack>

          {showActiveUser && hasActiveSelection && selectedUserEntry && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: align === 'start' ? 'flex-start' : 'center',
                gap: 1,
                minHeight: 24,
              }}
            >
              <Typography variant="body2" color="text.secondary">
                <FormattedMessage
                  id="userSelector.currentUser"
                  defaultMessage="Active: {user}"
                  values={{ user: selectedUserEntry.nickname || selectedUserEntry.username }}
                />
              </Typography>
              <IconButton
                size="small"
                onClick={handleClearSelection}
                aria-label={clearSelectionLabel}
                sx={{
                  borderRadius: '4px',
                  color: 'text.secondary',
                }}
              >
                <X className="h-4 w-4" />
              </IconButton>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
