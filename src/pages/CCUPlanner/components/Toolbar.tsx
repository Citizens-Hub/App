import { useState } from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle } from '@mui/material';
import { Download, Upload, Route, HelpCircle, Save, SaveOff } from 'lucide-react';
import { Node } from 'reactflow';
import { FormattedMessage, useIntl } from 'react-intl';

interface ToolbarProps {
  onClear: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenPathBuilder?: () => void;
  onOpenPathReview?: () => void;
  onOpenGuide?: () => void;
  nodes?: Node[];
  saveStatus?: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  lastSavedAt?: number | null;
}

export default function Toolbar({
  onClear,
  onExport,
  onImport,
  onOpenPathBuilder,
  onOpenGuide,
  nodes = [],
  saveStatus = 'idle',
  lastSavedAt = null
}: ToolbarProps) {
  const hasContent = nodes.length > 0;
  const intl = useIntl();
  const [clearDialogOpen, setClearDialogOpen] = useState(false);
  const actionButtonSx = {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    flexShrink: 0,
    minWidth: { xs: 40, sm: 64 },
    px: { xs: 1, sm: 1.5 }
  };

  const saveStatusDisplay = (() => {
    switch (saveStatus) {
      case 'pending':
        return {
          icon: <Save size={15} className="text-amber-600 dark:text-amber-400" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.pending', defaultMessage: 'Auto-save pending' })
        };
      case 'saving':
        return {
          icon: <Save size={15} className="animate-pulse text-blue-600 dark:text-blue-400" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.saving', defaultMessage: 'Saving...' })
        };
      case 'saved':
        return {
          icon: <Save size={15} className="text-emerald-600 dark:text-emerald-400" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.saved', defaultMessage: 'Saved' })
        };
      case 'error':
        return {
          icon: <SaveOff size={15} className="text-red-600 dark:text-red-400" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.error', defaultMessage: 'Auto-save failed' })
        };
      default:
        return {
          icon: <Save size={15} className="text-gray-500" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.idle', defaultMessage: 'Auto-save idle' })
        };
    }
  })();

  const formattedLastSavedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString(intl.locale, { hour: '2-digit', minute: '2-digit' })
    : null;

  // const handleOpenClearDialog = () => {
  //   setClearDialogOpen(true);
  // };

  const handleCloseClearDialog = () => {
    setClearDialogOpen(false);
  };

  const handleConfirmClear = () => {
    onClear();
    setClearDialogOpen(false);
  };
  
  return (
    <>
      <div className="p-2 sm:p-3 my-0 shadow-md flex items-center gap-1.5 sm:gap-2">
        {/* <Button
          variant="outlined"
          color="error"
          onClick={handleOpenClearDialog}
          disabled={!hasContent}
          title={intl.formatMessage({ id: "toolbar.clear", defaultMessage: "Clear" })}
          aria-label={intl.formatMessage({ id: "toolbar.clear", defaultMessage: "Clear" })}
          sx={actionButtonSx}
        >
          <Trash2 size={16} />
          <span className="xl:block hidden">
            <FormattedMessage id="toolbar.clear" defaultMessage="Clear" />
          </span>
        </Button> */}

        <Button
          variant="outlined"
          onClick={onExport}
          disabled={!hasContent}
          title={intl.formatMessage({ id: "toolbar.export", defaultMessage: "Export" })}
          aria-label={intl.formatMessage({ id: "toolbar.export", defaultMessage: "Export" })}
          sx={actionButtonSx}
        >
          <Download size={16} className='shrink-0' />
          <span className="xl:block hidden">
            <FormattedMessage id="toolbar.export" defaultMessage="Export" />
          </span>
        </Button>

        <Button
          variant="outlined"
          onClick={onImport}
          title={intl.formatMessage({ id: "toolbar.import", defaultMessage: "Import" })}
          aria-label={intl.formatMessage({ id: "toolbar.import", defaultMessage: "Import" })}
          sx={actionButtonSx}
        >
          <Upload size={16} className='shrink-0' />
          <span className="xl:block hidden">
            <FormattedMessage id="toolbar.import" defaultMessage="Import" />
          </span>
        </Button>

        {onOpenPathBuilder && (
          <Button
            variant="outlined"
            onClick={onOpenPathBuilder}
            className="joyride-path-builder-trigger"
            title={intl.formatMessage({ id: "toolbar.pathBuilder", defaultMessage: "Path Builder" })}
            aria-label={intl.formatMessage({ id: "toolbar.pathBuilder", defaultMessage: "Path Builder" })}
            color="primary"
            sx={actionButtonSx}
          >
            <Route size={16} className='shrink-0' />
            <span className="xl:block hidden text-nowrap">
              <FormattedMessage id="toolbar.pathBuilder" defaultMessage="Path Builder" />
            </span>
          </Button>
        )}

        {
          onOpenGuide && (
            <Button
              variant="outlined"
              onClick={onOpenGuide}
              title={intl.formatMessage({ id: "toolbar.guide", defaultMessage: "Guide" })}
              aria-label={intl.formatMessage({ id: "toolbar.guide", defaultMessage: "Guide" })}
              sx={actionButtonSx}
            >
              <HelpCircle size={16} className='shrink-0' />
              <span className="xl:block hidden text-nowrap">
                <FormattedMessage id="toolbar.guide" defaultMessage="Guide" />
              </span>
            </Button>
          )
        }

        {hasContent && (
          <div
            className="ml-auto flex items-center px-1 sm:px-2"
            title={formattedLastSavedTime
              ? `${saveStatusDisplay.label} (${formattedLastSavedTime})`
              : saveStatusDisplay.label}
            aria-label={saveStatusDisplay.label}
          >
            {saveStatusDisplay.icon}
          </div>
        )}
      </div>

      <Dialog
        open={clearDialogOpen}
        onClose={handleCloseClearDialog}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          <FormattedMessage id="toolbar.clearConfirmTitle" defaultMessage="Clear all content?" />
        </DialogTitle>
        <DialogContent>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            <FormattedMessage
              id="toolbar.clearConfirmDescription"
              defaultMessage="This action will remove all nodes and connections and cannot be undone."
            />
          </p>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseClearDialog}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleConfirmClear} variant="contained" color="error">
            <FormattedMessage id="common.confirm" defaultMessage="Confirm" />
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
} 
