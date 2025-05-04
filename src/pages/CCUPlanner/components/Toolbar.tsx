import { Button } from '@mui/material';
import { Trash2, Download, Save } from 'lucide-react';
import { Node } from 'reactflow';

interface ToolbarProps {
  onClear: () => void;
  onSave: () => void;
  onExport: () => void;
  nodes: Node[];
}

export default function Toolbar({ onClear, onSave, onExport, nodes }: ToolbarProps) {
  const hasContent = nodes.length > 0;
  
  return (
    <div className="bg-gray-100 p-2 shadow-md flex gap-2">
      <Button
        variant="outlined"
        onClick={onClear}
        disabled={!hasContent}
        title="清除画布"
      >
        <Trash2 size={16} />
        <span>清除</span>
      </Button>
      
      <Button
        variant="outlined"
        onClick={onSave}
        disabled={!hasContent}
        title="保存工作流"
      >
        <Save size={16} />
        <span>保存</span>
      </Button>
      
      <Button
        variant="outlined"
        onClick={onExport}
        // disabled={!hasContent}
        disabled
        title="导出为图片"
      >
        <Download size={16} />
        <span>导出</span>
      </Button>
    </div>
  );
} 