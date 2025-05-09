import { Button } from '@mui/material';
import { Trash2, Download, Save, Upload, Route } from 'lucide-react';
import { Node } from 'reactflow';
import { FormattedMessage, useIntl } from 'react-intl';

interface ToolbarProps {
  onClear: () => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenPathBuilder?: () => void;
  nodes?: Node[];
}

export default function Toolbar({ onClear, onSave, onExport, onImport, onOpenPathBuilder, nodes = [] }: ToolbarProps) {
  const hasContent = nodes.length > 0;
  const intl = useIntl();
  
  return (
    <div className="p-4 md:p-2 my-0 lg:m-0 shadow-md flex gap-2">
      <Button
        variant="outlined"
        onClick={onClear}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.clear", defaultMessage: "Clear" })}
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
    </div>
  );
} 
