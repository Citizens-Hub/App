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
    <div className="bg-gray-100 p-2 shadow-md flex gap-2">
      <Button
        variant="outlined"
        onClick={onClear}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.clear", defaultMessage: "清除画布" })}
      >
        <Trash2 size={16} />
        <span>
          <FormattedMessage id="toolbar.clear" defaultMessage="清除" />
        </span>
      </Button>
      
      <Button
        variant="outlined"
        onClick={onSave}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.save", defaultMessage: "保存工作流" })}
      >
        <Save size={16} />
        <span>
          <FormattedMessage id="toolbar.save" defaultMessage="保存" />
        </span>
      </Button>
      
      <Button
        variant="outlined"
        onClick={onExport}
        disabled={!hasContent}
        title={intl.formatMessage({ id: "toolbar.export", defaultMessage: "导出Json" })}
      >
        <Download size={16} />
        <span>
          <FormattedMessage id="toolbar.export" defaultMessage="导出" />
        </span>
      </Button>

      <Button
        variant="outlined"
        onClick={onImport}
        title={intl.formatMessage({ id: "toolbar.import", defaultMessage: "导入Json" })}
      >
        <Upload size={16} />
        <span>
          <FormattedMessage id="toolbar.import" defaultMessage="导入" />
        </span>
      </Button>
    </div>
  );
} 