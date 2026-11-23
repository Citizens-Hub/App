import { useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { FormattedMessage } from 'react-intl';
import { getShipDisplayName } from '@/utils/shipDisplay';
import type { CompletedPath } from '../services/PathFinderService';

interface RemovedCompletedRoutesProps {
  routes: CompletedPath[];
  onUnmark: (pathId: string) => void;
}

export default function RemovedCompletedRoutes({ routes, onUnmark }: RemovedCompletedRoutesProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Alert
        severity="info"
        variant="outlined"
        className="shrink-0"
        action={
          <Button onClick={() => setOpen(true)} size="small" color="inherit">
            <FormattedMessage id="ccuPlanner.removedCompletedRoutes.review" defaultMessage="Review removed routes" />
          </Button>
        }
      >
        <FormattedMessage
          id="ccuPlanner.removedCompletedRoutes.notice"
          defaultMessage="CCUs from removed completed routes still count as used."
        />
      </Alert>
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm" aria-labelledby="removed-completed-routes-title">
        <DialogTitle id="removed-completed-routes-title">
          <FormattedMessage id="ccuPlanner.removedCompletedRoutes.title" defaultMessage="Completed routes removed from the canvas" />
        </DialogTitle>
        <DialogContent dividers>
          <p className="mb-3 text-sm">
            <FormattedMessage
              id="ccuPlanner.removedCompletedRoutes.description"
              defaultMessage="If you didn't use the CCUs in a route, unmark it to add them back to the planner's remaining count."
            />
          </p>
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {routes.map(({ pathId, path, ship }, index) => (
              <li key={pathId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-sm">
                  {index + 1}. {path.path.map(node => getShipDisplayName(node.ship)).join(' → ') || getShipDisplayName(ship)}
                </span>
                <Button onClick={() => onUnmark(pathId)} size="small" variant="outlined">
                  <FormattedMessage id="ccuPlanner.removedCompletedRoutes.unmark" defaultMessage="Unmark completed" />
                </Button>
              </li>
            ))}
          </ul>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>
            <FormattedMessage id="common.close" defaultMessage="Close" />
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
