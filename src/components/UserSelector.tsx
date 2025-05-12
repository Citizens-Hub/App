import { useSelector, useDispatch } from 'react-redux';
import { RootState, setSelectedUser } from '../store';
import { Avatar, Box, Typography, Stack, Tooltip, IconButton } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import { X } from 'lucide-react';

export default function UserSelector() {
  const users = useSelector((state: RootState) => state.upgrades.users);
  const selectedUser = useSelector((state: RootState) => state.upgrades.selectedUser);

  const dispatch = useDispatch();
  if (users.length === 0) {
    return null;
  }

  const handleUserSelect = (userId: number) => {
    dispatch(setSelectedUser(userId));
  };

  return (
    <div className='flex flex-col border border-gray-200 dark:border-gray-800 p-2'>
      <Stack direction="row" spacing={2} sx={{ flexWrap: 'wrap', justifyContent: 'center', m: 1 }}>
        {users.map(user => (
          <Tooltip key={user.id} title={user.nickname || user.username || '用户'} arrow>
            <Avatar 
              src={user.avatar} 
              alt={user.username}
              onClick={() => handleUserSelect(user.id)}
              sx={{
                width: 40, 
                height: 40,
                cursor: 'pointer',
                border: user.id === selectedUser ? '2px solid #1976d2' : 'none',
                opacity: user.id === selectedUser ? 1 : 0.7,
                '&:hover': {
                  opacity: 1,
                  transform: 'scale(1.05)',
                  transition: 'all 0.2s'
                }
              }}
            />
          </Tooltip>
        ))}
      </Stack>
      
      {selectedUser !== -1 && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body2" sx={{ ml: 1 }}>
            <FormattedMessage id="userSelector.currentUser" defaultMessage="Active: {user}" values={{ user: users.find(user => user.id === selectedUser)?.nickname || users.find(user => user.id === selectedUser)?.username }} />
          </Typography>
          <IconButton size="small" onClick={() => handleUserSelect(-1)}>
            <X className='w-4 h-4' />
          </IconButton>
        </Box>
      )}
    </div>
  )
}

