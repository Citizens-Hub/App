import { Button } from '@mui/material';
import { Trash2, Download, Save, Upload, Route, HelpCircle, Loader2, CheckCircle2, AlertCircle, Clock3 } from 'lucide-react';
import { Node } from 'reactflow';
import { FormattedMessage, useIntl } from 'react-intl';

interface ToolbarProps {
  onClear: () => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenPathBuilder?: () => void;
  onOpenGuide?: () => void;
  nodes?: Node[];
  saveStatus?: 'idle' | 'pending' | 'saving' | 'saved' | 'error';
  lastSavedAt?: number | null;
}

export default function Toolbar({
  onClear,
  onSave,
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

  const saveStatusDisplay = (() => {
    switch (saveStatus) {
      case 'pending':
        return {
          icon: <Clock3 size={15} className="text-amber-600 dark:text-amber-400" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.pending', defaultMessage: 'Auto-save pending' })
        };
      case 'saving':
        return {
          icon: <Loader2 size={15} className="animate-spin text-blue-600 dark:text-blue-400" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.saving', defaultMessage: 'Saving...' })
        };
      case 'saved':
        return {
          icon: <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.saved', defaultMessage: 'Saved' })
        };
      case 'error':
        return {
          icon: <AlertCircle size={15} className="text-red-600 dark:text-red-400" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.error', defaultMessage: 'Auto-save failed' })
        };
      default:
        return {
          icon: <Clock3 size={15} className="text-gray-500" />,
          label: intl.formatMessage({ id: 'toolbar.saveStatus.idle', defaultMessage: 'Auto-save idle' })
        };
    }
  })();

  const formattedLastSavedTime = lastSavedAt
    ? new Date(lastSavedAt).toLocaleTimeString(intl.locale, { hour: '2-digit', minute: '2-digit' })
    : null;
  
  return (
    <div className="p-4 md:p-2 my-0 lg:m-0 shadow-md flex gap-2">
      <Button
        variant="outlined"
        color="error"
        onClick={onClear}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.clear", defaultMessage: "Clear" })}
        aria-label={intl.formatMessage({ id: "toolbar.clear", defaultMessage: "Clear" })}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Trash2 size={16} />
        <span className="xl:block hidden">
          <FormattedMessage id="toolbar.clear" defaultMessage="Clear" />
        </span>
      </Button>
      
      <Button
        variant="outlined"
        onClick={onSave}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.save", defaultMessage: "Save" })}
        aria-label={intl.formatMessage({ id: "toolbar.save", defaultMessage: "Save" })}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Save size={16} />
        <span className="xl:block hidden">
          <FormattedMessage id="toolbar.save" defaultMessage="Save" />
        </span>
      </Button>
      
      <Button
        variant="outlined"
        onClick={onExport}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.export", defaultMessage: "Export" })}
        aria-label={intl.formatMessage({ id: "toolbar.export", defaultMessage: "Export" })}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Download size={16} />
        <span className="xl:block hidden">
          <FormattedMessage id="toolbar.export" defaultMessage="Export" />
        </span>
      </Button>

      <Button
        variant="outlined"
        onClick={onImport}
        title={intl.formatMessage({ id: "toolbar.import", defaultMessage: "Import" })}
        aria-label={intl.formatMessage({ id: "toolbar.import", defaultMessage: "Import" })}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        <Upload size={16} />
        <span className="xl:block hidden">
          <FormattedMessage id="toolbar.import" defaultMessage="Import" />
        </span>
      </Button>
      
      {onOpenPathBuilder && (
        <Button
          variant="outlined"
          onClick={onOpenPathBuilder}
          title={intl.formatMessage({ id: "toolbar.pathBuilder", defaultMessage: "Path Builder" })}
          aria-label={intl.formatMessage({ id: "toolbar.pathBuilder", defaultMessage: "Path Builder" })}
          color="primary"
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Route size={16} />
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
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <HelpCircle size={16} />
            <span className="xl:block hidden text-nowrap">
              <FormattedMessage id="toolbar.guide" defaultMessage="Guide" />
            </span>
          </Button>
        )
      }

      {hasContent && (
        <div
          className="ml-auto flex items-center px-2"
          title={formattedLastSavedTime
            ? `${saveStatusDisplay.label} (${formattedLastSavedTime})`
            : saveStatusDisplay.label}
          aria-label={saveStatusDisplay.label}
        >
          {saveStatusDisplay.icon}
        </div>
      )}
    </div>
  );
} 
