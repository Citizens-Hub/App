import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import { useState } from 'react';
import { Node } from 'reactflow';
import { FormattedMessage } from 'react-intl';
import { Download, Upload, Save, Book, Plus, Trash2 } from 'lucide-react';

interface ToolbarProps {
  nodes: Node[];
  onClear: () => void;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onOpenPathBuilder: () => void;
  onOpenGuide: () => void;
}

export default function Toolbar({ nodes, onClear, onSave, onExport, onImport, onOpenPathBuilder, onOpenGuide }: ToolbarProps) {
  const nodesEmpty = nodes.length === 0;
  const [confirmOpen, setConfirmOpen] = useState(false);
  
  const handleConfirmOpen = () => {
    setConfirmOpen(true);
  };

  const handleConfirmClose = () => {
    setConfirmOpen(false);
  };

  const handleConfirmClear = () => {
    onClear();
    setConfirmOpen(false);
  };

  return (
    <div className="flex flex-wrap gap-2 p-2 rounded-md">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          onClick={onSave}
          disabled={nodesEmpty}
          startIcon={<Save size={16} />}
        >
          <FormattedMessage id="toolbar.save" defaultMessage="Save" />
        </Button>
        <Button
          variant="outlined"
          onClick={onExport}
          disabled={nodesEmpty}
          startIcon={<Download size={16} />}
        >
          <FormattedMessage id="toolbar.export" defaultMessage="Export" />
        </Button>
        <Button
          variant="outlined"
          onClick={onImport}
          startIcon={<Upload size={16} />}
        >
          <FormattedMessage id="toolbar.import" defaultMessage="Import" />
        </Button>
        <Button
          variant="outlined"
          onClick={handleConfirmOpen}
          disabled={nodesEmpty}
          color="error"
          startIcon={<Trash2 size={16} />}
        >
          <FormattedMessage id="toolbar.clear" defaultMessage="Clear" />
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          onClick={onOpenPathBuilder}
          startIcon={<Plus size={16} />}
        >
          <FormattedMessage id="toolbar.pathBuilder" defaultMessage="Path Builder" />
        </Button>
        <Button
          variant="outlined"
          onClick={onOpenGuide}
          startIcon={<Book size={16} />}
        >
          <FormattedMessage id="toolbar.guide" defaultMessage="Guide" />
        </Button>
      </div>

      <Dialog
        open={confirmOpen}
        onClose={handleConfirmClose}
      >
        <DialogTitle>
          <FormattedMessage id="toolbar.confirmClear" defaultMessage="Confirm Clear" />
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            <FormattedMessage
              id="toolbar.confirmClearText"
              defaultMessage="Are you sure you want to clear all nodes? This action cannot be undone."
            />
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleConfirmClose} color="primary">
            <FormattedMessage id="toolbar.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={handleConfirmClear} color="error">
            <FormattedMessage id="toolbar.clear" defaultMessage="Clear" />
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
} 
