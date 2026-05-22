import { useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { FormattedMessage, useIntl } from 'react-intl';
import { useSelector } from 'react-redux';

import { RootState } from '@/store';

const API_BASE_URL = import.meta.env.VITE_PUBLIC_API_ENDPOINT;

type FlashState = {
  severity: 'success' | 'error' | 'warning';
  text: string;
} | null;

type TaskId = 'daily-maintenance' | 'hourly-ccu-refresh';
type CacheTarget = 'price-history' | 'wb';

type BusyAction = `task:${TaskId}` | `cache:${CacheTarget}` | null;

const TASKS: Array<{
  id: TaskId;
  titleMessageId: string;
  titleDefaultMessage: string;
  descriptionMessageId: string;
  descriptionDefaultMessage: string;
}> = [
  {
    id: 'daily-maintenance',
    titleMessageId: 'admin.maintenance.task.daily.title',
    titleDefaultMessage: 'Run daily maintenance jobs',
    descriptionMessageId: 'admin.maintenance.task.daily.description',
    descriptionDefaultMessage: 'Queue the same jobs used by the daily cron: ships, LTI ships, BI report, and deleted-account release.',
  },
  {
    id: 'hourly-ccu-refresh',
    titleMessageId: 'admin.maintenance.task.hourlyCcu.title',
    titleDefaultMessage: 'Run hourly CCU refresh',
    descriptionMessageId: 'admin.maintenance.task.hourlyCcu.description',
    descriptionDefaultMessage: 'Queue the same CCU refresh job used by the hourly cron.',
  },
];

const CACHE_TARGETS: Array<{
  id: CacheTarget;
  titleMessageId: string;
  titleDefaultMessage: string;
  descriptionMessageId: string;
  descriptionDefaultMessage: string;
}> = [
  {
    id: 'price-history',
    titleMessageId: 'admin.maintenance.cache.priceHistory.title',
    titleDefaultMessage: 'Clear price history cache',
    descriptionMessageId: 'admin.maintenance.cache.priceHistory.description',
    descriptionDefaultMessage: 'Deletes the CCU price history KV cache and its encrypted variants. The next request will repopulate it from the latest database record.',
  },
  {
    id: 'wb',
    titleMessageId: 'admin.maintenance.cache.wb.title',
    titleDefaultMessage: 'Clear WB cache',
    descriptionMessageId: 'admin.maintenance.cache.wb.description',
    descriptionDefaultMessage: 'Deletes the cached WB list used by the WB history endpoint.',
  },
];

async function parseErrorResponse(response: Response): Promise<string | null> {
  const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
  return payload?.error || payload?.message || null;
}

export default function AdminMaintenanceManager() {
  const intl = useIntl();
  const token = useSelector((state: RootState) => state.user.user.token);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [flash, setFlash] = useState<FlashState>(null);

  const runTask = async (taskId: TaskId) => {
    setBusyAction(`task:${taskId}`);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/maintenance/run-task`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ taskId }),
      });

      if (!response.ok) {
        throw new Error(
          (await parseErrorResponse(response))
          || intl.formatMessage({
            id: 'admin.maintenance.task.runError',
            defaultMessage: 'Failed to queue the scheduled task.',
          }),
        );
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.maintenance.task.runSuccess',
          defaultMessage: 'Scheduled task queued successfully.',
        }),
      });
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error
          ? error.message
          : intl.formatMessage({
              id: 'admin.maintenance.task.runError',
              defaultMessage: 'Failed to queue the scheduled task.',
            }),
      });
    } finally {
      setBusyAction(null);
    }
  };

  const clearCache = async (target: CacheTarget) => {
    setBusyAction(`cache:${target}`);
    setFlash(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/maintenance/clear-cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target }),
      });

      if (!response.ok) {
        throw new Error(
          (await parseErrorResponse(response))
          || intl.formatMessage({
            id: 'admin.maintenance.cache.clearError',
            defaultMessage: 'Failed to clear the cache.',
          }),
        );
      }

      setFlash({
        severity: 'success',
        text: intl.formatMessage({
          id: 'admin.maintenance.cache.clearSuccess',
          defaultMessage: 'Cache cleared successfully.',
        }),
      });
    } catch (error) {
      setFlash({
        severity: 'error',
        text: error instanceof Error
          ? error.message
          : intl.formatMessage({
              id: 'admin.maintenance.cache.clearError',
              defaultMessage: 'Failed to clear the cache.',
            }),
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <Paper sx={{ p: 3, border: '1px solid', borderColor: 'divider' }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            <FormattedMessage
              id="admin.maintenance.title"
              defaultMessage="Task Runner & Cache Cleanup"
            />
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            <FormattedMessage
              id="admin.maintenance.description"
              defaultMessage="Manually queue selected scheduled jobs and clear specific KV caches without changing the original cron flow."
            />
          </Typography>
        </Box>

        <Alert severity="info">
          <FormattedMessage
            id="admin.maintenance.notice"
            defaultMessage="This panel does not replace the existing cron execution path. It only adds manual admin-triggered entry points."
          />
        </Alert>

        {flash ? <Alert severity={flash.severity}>{flash.text}</Alert> : null}

        <Stack spacing={1.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            <FormattedMessage
              id="admin.maintenance.section.tasks"
              defaultMessage="Scheduled Jobs"
            />
          </Typography>

          {TASKS.map((task) => {
            const isBusy = busyAction === `task:${task.id}`;
            return (
              <Paper
                key={task.id}
                variant="outlined"
                sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    <FormattedMessage id={task.titleMessageId} defaultMessage={task.titleDefaultMessage} />
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    <FormattedMessage id={task.descriptionMessageId} defaultMessage={task.descriptionDefaultMessage} />
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  onClick={() => void runTask(task.id)}
                  disabled={Boolean(busyAction)}
                >
                  {isBusy
                    ? intl.formatMessage({ id: 'admin.maintenance.running', defaultMessage: 'Running...' })
                    : intl.formatMessage({ id: 'admin.maintenance.run', defaultMessage: 'Run now' })}
                </Button>
              </Paper>
            );
          })}
        </Stack>

        <Stack spacing={1.5}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            <FormattedMessage
              id="admin.maintenance.section.caches"
              defaultMessage="KV Caches"
            />
          </Typography>

          {CACHE_TARGETS.map((target) => {
            const isBusy = busyAction === `cache:${target.id}`;
            return (
              <Paper
                key={target.id}
                variant="outlined"
                sx={{ p: 2, display: 'flex', gap: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <Box sx={{ minWidth: 0, flex: '1 1 320px' }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    <FormattedMessage id={target.titleMessageId} defaultMessage={target.titleDefaultMessage} />
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    <FormattedMessage id={target.descriptionMessageId} defaultMessage={target.descriptionDefaultMessage} />
                  </Typography>
                </Box>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={() => void clearCache(target.id)}
                  disabled={Boolean(busyAction)}
                >
                  {isBusy
                    ? intl.formatMessage({ id: 'admin.maintenance.clearing', defaultMessage: 'Clearing...' })
                    : intl.formatMessage({ id: 'admin.maintenance.clear', defaultMessage: 'Clear cache' })}
                </Button>
              </Paper>
            );
          })}
        </Stack>
      </Stack>
    </Paper>
  );
}
