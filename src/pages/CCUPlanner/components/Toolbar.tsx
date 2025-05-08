import { Button } from '@mui/material';
import { Trash2, Download, Save, Upload } from 'lucide-react';
import { Node } from 'reactflow';
import { FormattedMessage, useIntl } from 'react-intl';

interface ToolbarProps {
  onClear: () => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  nodes: Node[];
}

export default function Toolbar({ onClear, onSave, onExport, onImport, nodes }: ToolbarProps) {
  const hasContent = nodes.length > 0;
  const intl = useIntl();
  
  return (
    <div className="p-4 md:p-2 my-10 lg:m-0 shadow-md flex gap-2">
      <Button
        variant="outlined"
        onClick={onClear}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.clear", defaultMessage: "Clear" })}
      >
        <Trash2 size={16} />
        <span className="md:block hidden">
          <FormattedMessage id="toolbar.clear" defaultMessage="Clear" />
        </span>
      </Button>
      
      <Button
        variant="outlined"
        onClick={onSave}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.save", defaultMessage: "Save" })}
      >
        <Save size={16} />
        <span className="md:block hidden">
          <FormattedMessage id="toolbar.save" defaultMessage="Save" />
        </span>
      </Button>
      
      <Button
        variant="outlined"
        onClick={onExport}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.export", defaultMessage: "Export" })}
      >
        <Download size={16} />
        <span className="md:block hidden">
          <FormattedMessage id="toolbar.export" defaultMessage="Export" />
        </span>
      </Button>

      <Button
        variant="outlined"
        onClick={onImport}
        title={intl.formatMessage({ id: "toolbar.import", defaultMessage: "Import" })}
      >
        <Upload size={16} />
        <span className="md:block hidden">
          <FormattedMessage id="toolbar.import" defaultMessage="Import" />
        </span>
      </Button>
    </div>
  );
} 
