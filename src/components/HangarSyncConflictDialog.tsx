import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { FormattedMessage } from 'react-intl';

import type { HangarSyncRecord } from '@/hooks/swr/hangar/useHangarSync';

export interface HangarSyncConflictDialogProps {
  open: boolean;
  remoteRecord: HangarSyncRecord | null;
  onUseCloudVersion: () => void | Promise<void>;
  onKeepLocalVersion: () => void | Promise<void>;
}

export default function HangarSyncConflictDialog({
  open,
  remoteRecord,
  onUseCloudVersion,
  onKeepLocalVersion,
}: HangarSyncConflictDialogProps) {

  return (
    <Dialog open={open} maxWidth="sm" fullWidth>
      <DialogTitle>
        <FormattedMessage id="hangarSync.conflictTitle" defaultMessage="Hangar Sync Conflict" />
      </DialogTitle>
      <DialogContent className="flex flex-col gap-4">
        <Alert severity="warning">
          <FormattedMessage
            id="hangarSync.conflictDescription"
            defaultMessage="Your local hangar data conflicts with a newer cloud version. Choose which version should be kept."
          />
        </Alert>

        <div className="flex flex-col gap-2">
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id="hangarSync.remoteVersion" defaultMessage="Cloud version" />
          </Typography>
          <Typography variant="body1">
            <FormattedMessage
              id="hangarSync.remoteVersionDetails"
              defaultMessage="Cloud hangar version {hangarUpdatedAt}, synced at {updatedAt}"
              values={{
                hangarUpdatedAt: remoteRecord?.hangarUpdatedAt ? new Date(remoteRecord.hangarUpdatedAt).toLocaleString() : '-',
                updatedAt: remoteRecord?.updatedAt ? new Date(remoteRecord.updatedAt).toLocaleString() : '-',
              }}
            />
          </Typography>
        </div>

        <div className="flex flex-col gap-2">
          <Typography variant="body2" color="text.secondary">
            <FormattedMessage id="hangarSync.localVersion" defaultMessage="Local version" />
          </Typography>
          <Typography variant="body1">
            <FormattedMessage
              id="hangarSync.localVersionDetails"
              defaultMessage="Contains your latest local changes and can overwrite the cloud version."
            />
          </Typography>
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => void onUseCloudVersion()}>
          <FormattedMessage id="hangarSync.useCloud" defaultMessage="Use Cloud Version" />
        </Button>
        <Button variant="contained" onClick={() => void onKeepLocalVersion()}>
          <FormattedMessage id="hangarSync.keepLocal" defaultMessage="Keep Local and Overwrite Cloud" />
        </Button>
      </DialogActions>
    </Dialog>
  );
}
