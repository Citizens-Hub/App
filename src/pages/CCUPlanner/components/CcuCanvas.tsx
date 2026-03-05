import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  ReactFlowProvider,
  Panel,
  ReactFlowInstance,
  getRectOfNodes,
  XYPosition,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FormattedMessage, useIntl } from 'react-intl';

import { Ship, CcuEdgeData, Ccu, WbHistoryData, PriceHistoryEntity } from '@/types';
import ShipNode from './ShipNode';
import CcuEdge from './CcuEdge';
import ShipSelector from './ShipSelector';
import Toolbar from './Toolbar';
import RouteInfoPanel from './RouteInfoPanel';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Input, Snackbar, useMediaQuery } from '@mui/material';
import { selectUsersHangarItems } from '@/store/upgradesStore';
import { useSelector } from 'react-redux';
import Hangar from './Hangar';
import PathBuilder, { ReviewedPathBuildResult } from './PathBuilder';
import UserSelector from '@/components/UserSelector';
import Guide from './Guide';
import { Close } from '@mui/icons-material';
import pathFinderService, { CompletePath } from '../services/PathFinderService';
import { CcuPlannerProvider } from '../context/CcuPlannerContext';
import { useCcuPlanner } from '../context/useCcuPlanner';
import { useNavigate } from 'react-router';
import { BiSlots, reportBi } from '@/report';
import Joyride, { ACTIONS, EVENTS, STATUS, CallBackProps, Step as JoyrideStep } from 'react-joyride';
import { Plus, X } from 'lucide-react';
import type { FlowData, PlannerWorkspaceData } from '../services/ImportExportService';
import { getCompletedPathsStorageKeyForTab } from '../services/completedPathsStorage';

const EXPLORE_PATH_JOYRIDE_STORAGE_KEY = 'ccuPlannerExplorePathJoyrideSeen';
const DEFAULT_TAB_ID = 'route-1';
type AutoSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface PlannerTabState {
  id: string;
  name: string;
  flowData: FlowData;
  autoSaveStatus: AutoSaveStatus;
  lastAutoSavedAt: number | null;
}

interface CcuCanvasProps {
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  exchangeRates: {
    [currency: string]: number;
  };
  priceHistoryMap: Record<number, PriceHistoryEntity>;
}

const createEmptyFlowData = (): FlowData => ({
  nodes: [],
  edges: [],
  startShipPrices: {}
});

export default function CcuCanvas({ ships, ccus, wbHistory, exchangeRates, priceHistoryMap }: CcuCanvasProps) {
  const [alert, setAlert] = useState<{
    open: boolean,
    message: string,
    type: "success" | "error" | "warning"
  }>({
    open: false,
    message: "",
    type: "success"
  });

  // Wrap all content in CcuPlannerProvider
  return (
    <CcuPlannerProvider
      ships={ships}
      ccus={ccus}
      wbHistory={wbHistory}
      exchangeRates={exchangeRates}
      priceHistoryMap={priceHistoryMap}
      setAlert={setAlert}
    >
      <CcuCanvasContent />
      <Snackbar
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'center'
        }}
        open={alert.open}
        autoHideDuration={6000}
        onClose={() => setAlert(prev => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setAlert(prev => ({ ...prev, open: false }))}
          severity={alert.type}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {alert.message}
        </Alert>
      </Snackbar>
    </CcuPlannerProvider>
  );
}

// Move main functionality to this child component
function CcuCanvasContent() {
  const AUTO_SAVE_IDLE_MS = 500;
  const AUTO_SAVE_BOOTSTRAP_DELAY_MS = 500;
  const navigate = useNavigate();
  const intl = useIntl();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<number | null>(null);
  const joyrideStepRetryTimeoutRef = useRef<number | null>(null);
  const [plannerTabs, setPlannerTabs] = useState<PlannerTabState[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>('');
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [startShipPrices, setStartShipPrices] = useState<Record<string, number | string>>({});
  const isMobile = useMediaQuery('(max-width: 644px)');
  const [pathBuilderOpen, setPathBuilderOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>('idle');
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const [explorePathJoyrideRun, setExplorePathJoyrideRun] = useState(false);
  const [explorePathJoyrideStepIndex, setExplorePathJoyrideStepIndex] = useState(0);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState('');
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);

  // Use data from context
  const {
    ships,
    ccus,
    wbHistory,
    hangarItems,
    edgeService,
    importExportService,
    handlePathCompletionChange,
    showAlert,
    getServiceData,
    setSelectedPathEdgeIds
  } = useCcuPlanner();

  // Get upgrade items from Redux
  const upgrades = useSelector(selectUsersHangarItems);

  const getNextRouteName = useCallback((existingTabs: PlannerTabState[]): string => {
    return intl.formatMessage(
      { id: 'ccuPlanner.tab.defaultName', defaultMessage: 'Route {index}' },
      { index: existingTabs.length + 1 }
    );
  }, [intl]);

  const createRouteTabId = useCallback(() => {
    return `route-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }, []);

  const ensureCompletedPathsStorageInitialized = useCallback((tabId: string) => {
    const storageKey = getCompletedPathsStorageKeyForTab(tabId);
    if (localStorage.getItem(storageKey) === null) {
      localStorage.setItem(storageKey, '[]');
    }
  }, []);

  const cloneEdges = useCallback((value: Edge<CcuEdgeData>[]): Edge<CcuEdgeData>[] => {
    return value.map(edge => {
      if (edge.data) {
        return {
          ...edge,
          data: {
            ...edge.data
          }
        };
      }
      return {
        ...edge
      };
    });
  }, []);

  const persistWorkspace = useCallback((tabs: PlannerTabState[], nextActiveTabId: string) => {
    const workspace: PlannerWorkspaceData = {
      version: 2,
      activeTabId: nextActiveTabId,
      tabs: tabs.map(tab => ({
        id: tab.id,
        name: tab.name,
        flowData: tab.flowData,
        lastAutoSavedAt: tab.lastAutoSavedAt
      }))
    };

    importExportService.saveWorkspaceToLocalStorage(workspace);
  }, [importExportService]);

  const syncCompletedPathsStorage = useCallback((tabId: string) => {
    const completedPathStorageKey = getCompletedPathsStorageKeyForTab(tabId);
    pathFinderService.setCompletedPathsStorageKey(completedPathStorageKey);
    pathFinderService.loadCompletedPathsFromStorage();
  }, []);

  const loadTabIntoCanvas = useCallback((tab: PlannerTabState) => {
    setNodes(tab.flowData.nodes);
    setEdges(cloneEdges(tab.flowData.edges));
    setStartShipPrices(tab.flowData.startShipPrices);
    setAutoSaveStatus(tab.autoSaveStatus);
    setLastAutoSavedAt(tab.lastAutoSavedAt);
    setSelectedNode(null);
    setSelectedPathEdgeIds([]);
    syncCompletedPathsStorage(tab.id);
  }, [setNodes, setEdges, cloneEdges, setSelectedPathEdgeIds, syncCompletedPathsStorage]);

  const clearAutoSaveTimer = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      window.clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }
  }, []);

  // Handle path completion status change, refresh edge styles
  const refreshEdgesOnPathCompletion = useCallback((showAlert: boolean = true) => {
    // Trigger edge re-rendering by creating new edge data references
    setEdges(currentEdges => {
      return currentEdges.map(edge => {
        if (edge.data) {
          return {
            ...edge,
            data: {
              ...edge.data
            }
          };
        }
        return edge;
      });
    });

    // Call the method in context to handle alerts
    handlePathCompletionChange(showAlert);
  }, [setEdges, handlePathCompletionChange]);

  // Handle starting ship price change
  const handleStartShipPriceChange = useCallback((nodeId: string, price: number | string) => {
    setStartShipPrices(prev => ({
      ...prev,
      [nodeId]: price
    }));
  }, []);

  // Handle connection creation
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);

      if (sourceNode && targetNode) {
        const sourceShip = (sourceNode.data?.ship as Ship);
        const targetShip = (targetNode.data?.ship as Ship);

        // Use edgeService.canCreateEdge method to check if an edge can be created
        if (!edgeService.canCreateEdge(sourceShip, targetShip)) {
          if (sourceShip.msrp === 0) {
            showAlert(
              intl.formatMessage({
                id: 'ccuPlanner.error.sourceShipPriceZero',
                defaultMessage: 'Cannot upgrade from this ship as its price is zero.'
              }),
              'warning'
            );
          } else {
            showAlert(
              intl.formatMessage({
                id: 'ccuPlanner.error.lowerToHigher',
                defaultMessage: 'CCU can only be upgraded from lower-priced ships to higher-priced ships.'
              }),
              'warning'
            );
          }
          return;
        }

        // Check for hangar CCU
        const hangarCcu = upgrades.ccus.find(upgrade => {
          const from = upgrade.parsed.from.toUpperCase()
          const to = upgrade.parsed.to.toUpperCase()

          return from === sourceShip.name.trim().toUpperCase() && to === targetShip.name.trim().toUpperCase()
        })

        // If target ship price is 0 and no hangar CCU, disallow upgrade
        if (targetShip.msrp === 0 && !hangarCcu) {
          showAlert(
            intl.formatMessage({
              id: 'ccuPlanner.error.targetShipPriceZero',
              defaultMessage: 'This ship can only be upgraded using a hangar CCU as its price is zero.'
            }),
            'warning'
          );
          return;
        }

        const hasExistingPath = (
          startNode: Node,
          endNodeId: string,
        ): boolean => {
          const directConnection = edges.some(edge =>
            edge.source.split('-')[1] === startNode.id.split('-')[1] &&
            edge.target === endNodeId
          );

          return directConnection;
        };

        // If a path already exists, do not create a new connection
        if (hasExistingPath(sourceNode, targetNode.id)) {
          showAlert(
            intl.formatMessage({
              id: 'ccuPlanner.error.pathExists',
              defaultMessage: 'A path already exists from the source ship to the target ship. Duplicate connections are not allowed.'
            }),
            'warning'
          );
          return;
        }

        // Use edgeService to create edge data
        const edgeData = edgeService.createEdgeData({
          sourceShip,
          targetShip,
          ...getServiceData()
        });

        const newEdge = {
          id: `edge-${sourceNode.id}-${targetNode.id}`,
          ...connection,
          type: 'ccu',
          animated: true,
          data: edgeData,
        };

        setEdges((eds) => addEdge(newEdge, eds));
      }
    },
    [nodes, edgeService, setEdges, intl, edges, getServiceData, showAlert, upgrades.ccus]
  );

  const updateEdgeData = useCallback(
    (sourceId: string, targetId: string, newData: Partial<CcuEdgeData>) => {
      setEdges(edges => {
        return edges.map(edge => {
          if (edge.source === sourceId && edge.target === targetId) {
            // Ensure the original msrp difference is retained so that it can be displayed correctly
            const originalPrice = edge.data?.price;

            return {
              ...edge,
              data: {
                ...(edge.data as CcuEdgeData),
                ...newData,
                // Keep the original price difference unless explicitly requested to modify
                price: newData.price !== undefined ? newData.price : originalPrice
              }
            };
          }
          return edge;
        });
      });
    },
    [setEdges]
  );

  const deleteEdge = useCallback((edgeId: string) => {
    setEdges(edges => edges.filter(edge => edge.id !== edgeId));
  }, [setEdges]);

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes(nodes => nodes.filter(node => node.id !== nodeId));

      // Delete all edge connections related to this node
      setEdges(edges => edges.filter(edge =>
        edge.source !== nodeId && edge.target !== nodeId
      ));

      // Delete related starting ship prices
      setStartShipPrices(prev => {
        const newPrices = { ...prev };
        delete newPrices[nodeId];
        return newPrices;
      });
    },
    [setNodes, setEdges]
  );

  const handleDuplicateNode = useCallback(
    (ship: Ship, position: XYPosition) => {

      position.x = position.x + 300;
      position.y = position.y + 50;

      const newNode: Node = {
        id: `ship-${ship.id}-${Date.now()}`,
        type: 'ship',
        position: position as XYPosition,
        data: {
          ship,
          onUpdateEdge: updateEdgeData,
          onDeleteEdge: deleteEdge,
          onDeleteNode: handleDeleteNode,
          onDuplicateNode: handleDuplicateNode,
          ccus
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, updateEdgeData, handleDeleteNode, ccus, deleteEdge]
  );

  useEffect(() => {
    setNodes(nodes => {
      return nodes.map(node => {
        // Find all edges connected to this node
        const incomingEdges = edges.filter(edge => edge.target === node.id);

        return {
          ...node,
          data: {
            ...node.data,
            incomingEdges: incomingEdges,
            onUpdateEdge: updateEdgeData,
            onDeleteEdge: deleteEdge,
            onDeleteNode: handleDeleteNode,
            onDuplicateNode: handleDuplicateNode,
            id: node.id,
            ccus,
            wbHistory
          }
        };
      });
    });
  }, [edges, setNodes, updateEdgeData, handleDeleteNode, handleDuplicateNode, ccus, deleteEdge, wbHistory]);

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const currentFlowData = useMemo<FlowData>(() => ({
    nodes,
    edges,
    startShipPrices
  }), [nodes, edges, startShipPrices]);

  const withCurrentTabSnapshot = useCallback((tabs: PlannerTabState[]): PlannerTabState[] => {
    if (!activeTabId) {
      return tabs;
    }

    return tabs.map(tab => {
      if (tab.id !== activeTabId) {
        return tab;
      }

      return {
        ...tab,
        flowData: currentFlowData,
        autoSaveStatus,
        lastAutoSavedAt
      };
    });
  }, [activeTabId, autoSaveStatus, currentFlowData, lastAutoSavedAt]);

  const switchToTab = useCallback((targetTabId: string) => {
    if (targetTabId === activeTabId) {
      return;
    }

    clearAutoSaveTimer();
    setPlannerTabs(prevTabs => {
      const syncedTabs = withCurrentTabSnapshot(prevTabs);
      const targetTab = syncedTabs.find(tab => tab.id === targetTabId);

      if (!targetTab) {
        return prevTabs;
      }

      setActiveTabId(targetTab.id);
      loadTabIntoCanvas(targetTab);
      persistWorkspace(syncedTabs, targetTab.id);
      return syncedTabs;
    });
  }, [activeTabId, clearAutoSaveTimer, loadTabIntoCanvas, persistWorkspace, withCurrentTabSnapshot]);

  const addTab = useCallback(() => {
    clearAutoSaveTimer();

    setPlannerTabs(prevTabs => {
      const syncedTabs = withCurrentTabSnapshot(prevTabs);
      const newTabId = createRouteTabId();
      ensureCompletedPathsStorageInitialized(newTabId);
      const newTab: PlannerTabState = {
        id: newTabId,
        name: getNextRouteName(syncedTabs),
        flowData: createEmptyFlowData(),
        autoSaveStatus: 'idle',
        lastAutoSavedAt: null
      };

      const nextTabs = [...syncedTabs, newTab];
      setActiveTabId(newTab.id);
      loadTabIntoCanvas(newTab);
      persistWorkspace(nextTabs, newTab.id);
      return nextTabs;
    });
  }, [clearAutoSaveTimer, createRouteTabId, ensureCompletedPathsStorageInitialized, getNextRouteName, loadTabIntoCanvas, persistWorkspace, withCurrentTabSnapshot]);

  const closeTab = useCallback((tabId: string) => {
    clearAutoSaveTimer();

    setPlannerTabs(prevTabs => {
      const syncedTabs = withCurrentTabSnapshot(prevTabs);
      const currentIndex = syncedTabs.findIndex(tab => tab.id === tabId);
      if (currentIndex === -1) {
        return prevTabs;
      }

      const nextTabs = syncedTabs.filter(tab => tab.id !== tabId);
      if (!nextTabs.length) {
        const newTabId = createRouteTabId();
        ensureCompletedPathsStorageInitialized(newTabId);
        const newTab: PlannerTabState = {
          id: newTabId,
          name: getNextRouteName(nextTabs),
          flowData: createEmptyFlowData(),
          autoSaveStatus: 'idle',
          lastAutoSavedAt: null
        };

        setActiveTabId(newTab.id);
        loadTabIntoCanvas(newTab);
        persistWorkspace([newTab], newTab.id);
        return [newTab];
      }

      const nextActiveTabId = tabId === activeTabId
        ? (nextTabs[Math.max(currentIndex - 1, 0)]?.id || nextTabs[0].id)
        : activeTabId;

      const nextActiveTab = nextTabs.find(tab => tab.id === nextActiveTabId) || nextTabs[0];
      setActiveTabId(nextActiveTab.id);
      loadTabIntoCanvas(nextActiveTab);
      persistWorkspace(nextTabs, nextActiveTab.id);
      return nextTabs;
    });
  }, [activeTabId, clearAutoSaveTimer, createRouteTabId, ensureCompletedPathsStorageInitialized, getNextRouteName, loadTabIntoCanvas, persistWorkspace, withCurrentTabSnapshot]);

  const requestCloseTab = useCallback((tabId: string) => {
    setPendingCloseTabId(tabId);
  }, []);

  const cancelCloseTab = useCallback(() => {
    setPendingCloseTabId(null);
  }, []);

  const confirmCloseTab = useCallback(() => {
    if (!pendingCloseTabId) {
      return;
    }

    closeTab(pendingCloseTabId);
    setPendingCloseTabId(null);
  }, [closeTab, pendingCloseTabId]);

  const startRenameTab = useCallback((tabId: string) => {
    const tab = plannerTabs.find(item => item.id === tabId);
    if (!tab) {
      return;
    }

    setEditingTabId(tabId);
    setEditingTabName(tab.name);
  }, [plannerTabs]);

  const commitRenameTab = useCallback((tabId: string) => {
    const nextName = editingTabName.trim();
    if (!nextName) {
      setEditingTabId(null);
      setEditingTabName('');
      return;
    }

    setPlannerTabs(prevTabs => {
      const syncedTabs = withCurrentTabSnapshot(prevTabs);
      const nextTabs = syncedTabs.map(tab => {
        if (tab.id !== tabId) {
          return tab;
        }

        return {
          ...tab,
          name: nextName
        };
      });

      const resolvedActiveTabId = activeTabId || nextTabs[0]?.id || tabId;
      persistWorkspace(nextTabs, resolvedActiveTabId);
      return nextTabs;
    });

    setEditingTabId(null);
    setEditingTabName('');
  }, [activeTabId, editingTabName, persistWorkspace, withCurrentTabSnapshot]);

  const cancelRenameTab = useCallback(() => {
    setEditingTabId(null);
    setEditingTabName('');
  }, []);

  const handleTabDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, tabId: string) => {
    setDraggingTabId(tabId);
    setDragOverTabId(tabId);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', tabId);
  }, []);

  const handleTabDragOver = useCallback((event: React.DragEvent<HTMLDivElement>, tabId: string) => {
    event.preventDefault();
    if (draggingTabId && draggingTabId !== tabId) {
      setDragOverTabId(tabId);
    }
  }, [draggingTabId]);

  const handleTabDrop = useCallback((event: React.DragEvent<HTMLDivElement>, targetTabId: string) => {
    event.preventDefault();
    const sourceTabId = draggingTabId || event.dataTransfer.getData('text/plain');

    if (!sourceTabId || sourceTabId === targetTabId) {
      setDraggingTabId(null);
      setDragOverTabId(null);
      return;
    }

    setPlannerTabs(prevTabs => {
      const syncedTabs = withCurrentTabSnapshot(prevTabs);
      const sourceIndex = syncedTabs.findIndex(tab => tab.id === sourceTabId);
      const targetIndex = syncedTabs.findIndex(tab => tab.id === targetTabId);

      if (sourceIndex < 0 || targetIndex < 0) {
        return prevTabs;
      }

      const reorderedTabs = [...syncedTabs];
      const [movedTab] = reorderedTabs.splice(sourceIndex, 1);
      reorderedTabs.splice(targetIndex, 0, movedTab);
      const resolvedActiveTabId = activeTabId || reorderedTabs[0]?.id || movedTab.id;
      persistWorkspace(reorderedTabs, resolvedActiveTabId);
      return reorderedTabs;
    });

    setDraggingTabId(null);
    setDragOverTabId(null);
  }, [activeTabId, draggingTabId, persistWorkspace, withCurrentTabSnapshot]);

  const handleTabDragEnd = useCallback(() => {
    setDraggingTabId(null);
    setDragOverTabId(null);
  }, []);

  useEffect(() => {
    if (!activeTabId) {
      return;
    }

    setPlannerTabs(prevTabs => {
      let changed = false;
      const nextTabs = prevTabs.map(tab => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        if (
          tab.flowData.nodes === nodes &&
          tab.flowData.edges === edges &&
          tab.flowData.startShipPrices === startShipPrices &&
          tab.autoSaveStatus === autoSaveStatus &&
          tab.lastAutoSavedAt === lastAutoSavedAt
        ) {
          return tab;
        }

        changed = true;
        return {
          ...tab,
          flowData: currentFlowData,
          autoSaveStatus,
          lastAutoSavedAt
        };
      });

      return changed ? nextTabs : prevTabs;
    });
  }, [activeTabId, autoSaveStatus, currentFlowData, edges, lastAutoSavedAt, nodes, startShipPrices]);

  useEffect(() => {
    if (!editingTabId) {
      return;
    }

    const exists = plannerTabs.some(tab => tab.id === editingTabId);
    if (!exists) {
      setEditingTabId(null);
      setEditingTabName('');
    }
  }, [editingTabId, plannerTabs]);

  const importFlowData = useCallback((jsonData: string) => {
    try {
      const importedData = importExportService.importFromJsonData(jsonData, ships, { hangarItems, wbHistory, ccus });

      if (!importedData) {
        throw new Error('Import failed');
      }

      const importedAt = Date.now();
      clearAutoSaveTimer();
      setPlannerTabs(prevTabs => {
        const syncedTabs = withCurrentTabSnapshot(prevTabs);
        const newTabId = createRouteTabId();
        ensureCompletedPathsStorageInitialized(newTabId);

        const newTab: PlannerTabState = {
          id: newTabId,
          name: getNextRouteName(syncedTabs),
          flowData: importedData,
          autoSaveStatus: 'saved',
          lastAutoSavedAt: importedAt
        };

        const nextTabs = [...syncedTabs, newTab];
        setActiveTabId(newTab.id);
        loadTabIntoCanvas(newTab);
        persistWorkspace(nextTabs, newTab.id);
        return nextTabs;
      });

      // Display import success notification
      showAlert(
        intl.formatMessage({
          id: 'ccuPlanner.success.imported',
          defaultMessage: 'CCU upgrade path imported successfully!'
        })
      );

      reportBi<{
        success: boolean,
      }>({
        slot: BiSlots.IMPORT_ROUTE,
        data: { success: true }
      })

      return true;
    } catch (error) {
      console.error('Error importing JSON file:', error);
      showAlert(
        intl.formatMessage(
          { id: 'ccuPlanner.error.importFailed', defaultMessage: 'Import failed: {errorMessage}' },
          { errorMessage: (error as Error).message || intl.formatMessage({ id: 'ccuPlanner.error.invalidJson', defaultMessage: 'Invalid JSON format' }) }
        ),
        'error'
      );

      reportBi<{
        success: boolean,
        error: string
      }>({
        slot: BiSlots.IMPORT_ROUTE,
        data: { success: false, error: (error as Error).message }
      })
      return false;
    }
  }, [importExportService, ships, hangarItems, wbHistory, ccus, clearAutoSaveTimer, withCurrentTabSnapshot, createRouteTabId, ensureCompletedPathsStorageInitialized, getNextRouteName, loadTabIntoCanvas, persistWorkspace, intl, showAlert]);

  const handleImport = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  const handleFileSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) {
        importFlowData(content);
      }
    };
    reader.readAsText(file);

    if (event.target) {
      event.target.value = '';
    }
  }, [importFlowData]);

  const onDropFile = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    const items = Array.from(event.dataTransfer.items);
    const jsonItem = items.find(item =>
      item.kind === 'file' && item.type === 'application/json'
    );

    if (jsonItem) {
      const file = jsonItem.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          if (content) {
            importFlowData(content);
          }
        };
        reader.readAsText(file);
        return;
      }
    }

    const shipId = event.dataTransfer.getData('application/shipId');
    if (shipId) {
      const ship = ships.find((s) => s.id.toString() === shipId);

      if (!ship || !reactFlowInstance || !reactFlowWrapper.current) {
        return;
      }

      const reactFlowBounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const newNode: Node = {
        id: `ship-${ship.id}-${Date.now()}`,
        type: 'ship',
        position,
        data: {
          ship,
          onUpdateEdge: updateEdgeData,
          onDeleteEdge: deleteEdge,
          onDeleteNode: handleDeleteNode,
          onDuplicateNode: handleDuplicateNode,
          ccus
        },
      };

      setNodes((nds) => nds.concat(newNode));
    }
  }, [importFlowData, ships, reactFlowInstance, updateEdgeData, deleteEdge, handleDeleteNode, handleDuplicateNode, ccus, setNodes]);

  const onShipDragStart = (event: React.DragEvent<HTMLDivElement>, ship: Ship) => {
    event.dataTransfer.setData('application/shipId', ship.id.toString());
    event.dataTransfer.effectAllowed = 'move';
  };

  const saveFlowData = useCallback((mode: 'manual' | 'auto' = 'manual') => {
    if (!plannerTabs.length || !activeTabId) return;

    const flowData: FlowData = currentFlowData;

    try {
      if (mode === 'auto') {
        setAutoSaveStatus('saving');
      }

      const savedAt = Date.now();
      const updatedTabs = plannerTabs.map(tab => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        return {
          ...tab,
          flowData,
          autoSaveStatus: 'saved' as AutoSaveStatus,
          lastAutoSavedAt: savedAt
        };
      });

      setPlannerTabs(updatedTabs);
      persistWorkspace(updatedTabs, activeTabId);
      setAutoSaveStatus('saved');
      setLastAutoSavedAt(savedAt);

      if (mode === 'manual') {
        showAlert(
          intl.formatMessage({
            id: 'ccuPlanner.success.saved',
            defaultMessage: 'CCU upgrade path saved successfully!'
          })
        );
      }
    } catch (error) {
      setAutoSaveStatus('error');
      setPlannerTabs(prevTabs => prevTabs.map(tab => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        return {
          ...tab,
          autoSaveStatus: 'error' as AutoSaveStatus
        };
      }));
      showAlert(
        intl.formatMessage(
          { id: 'ccuPlanner.error.saveFailed', defaultMessage: 'Save failed: {errorMessage}' },
          { errorMessage: (error as Error).message || intl.formatMessage({ id: 'ccuPlanner.error.unknown', defaultMessage: 'Unknown error' }) }
        ),
        'error'
      );
    }
  }, [plannerTabs, activeTabId, currentFlowData, persistWorkspace, showAlert, intl]);

  const saveFlowDataRef = useRef(saveFlowData);
  useEffect(() => {
    saveFlowDataRef.current = saveFlowData;
  }, [saveFlowData]);

  const handleClear = useCallback(() => {
    if (!activeTabId) {
      return;
    }

    clearAutoSaveTimer();
    setNodes([]);
    setEdges([]);
    setStartShipPrices({});
    setAutoSaveStatus('idle');
    setLastAutoSavedAt(null);
    setSelectedPathEdgeIds([]);

    // Clean up completed path states
    pathFinderService.clearCompletedPaths();

    // Refresh edge status without showing notification messages
    refreshEdgesOnPathCompletion(false);

    setPlannerTabs(prevTabs => {
      const updatedTabs = prevTabs.map(tab => {
        if (tab.id !== activeTabId) {
          return tab;
        }

        return {
          ...tab,
          flowData: createEmptyFlowData(),
          autoSaveStatus: 'idle' as AutoSaveStatus,
          lastAutoSavedAt: null
        };
      });

      persistWorkspace(updatedTabs, activeTabId);
      return updatedTabs;
    });

    // Display success notification
    showAlert(
      intl.formatMessage({
        id: 'ccuPlanner.success.cleared',
        defaultMessage: 'Canvas cleared successfully!'
      })
    );
  }, [activeTabId, setNodes, setEdges, setSelectedPathEdgeIds, intl, refreshEdgesOnPathCompletion, showAlert, clearAutoSaveTimer, persistWorkspace]);

  const handleExport = useCallback(() => {
    if (!reactFlowInstance || !nodes.length) return;

    getRectOfNodes(nodes);

    const flowData = {
      nodes,
      edges,
      startShipPrices
    };

    // Use ImportExportService to export data
    importExportService.exportToJsonFile(flowData);

    reportBi<null>({
      slot: BiSlots.EXPORT_ROUTE,
      data: null
    })
  }, [reactFlowInstance, nodes, edges, startShipPrices, importExportService]);

  useEffect(() => {
    if (!reactFlowInstance) {
      return;
    }

    setAutoSaveEnabled(false);
    clearAutoSaveTimer();
    setAutoSaveStatus('idle');

    const loadedWorkspace = importExportService.loadWorkspaceFromLocalStorage(ships, hangarItems, wbHistory, ccus);
    if (loadedWorkspace?.tabs.length) {
      const initialTabs: PlannerTabState[] = loadedWorkspace.tabs.map(tab => ({
        id: tab.id,
        name: tab.name,
        flowData: tab.flowData,
        autoSaveStatus: 'idle',
        lastAutoSavedAt: tab.lastAutoSavedAt ?? null
      }));
      const initialActiveTabId = initialTabs.some(tab => tab.id === loadedWorkspace.activeTabId)
        ? loadedWorkspace.activeTabId
        : initialTabs[0].id;
      const initialActiveTab = initialTabs.find(tab => tab.id === initialActiveTabId) || initialTabs[0];

      setPlannerTabs(initialTabs);
      setActiveTabId(initialActiveTabId);
      loadTabIntoCanvas(initialActiveTab);
      persistWorkspace(initialTabs, initialActiveTabId);
    } else {
      const defaultTab: PlannerTabState = {
        id: DEFAULT_TAB_ID,
        name: getNextRouteName([]),
        flowData: createEmptyFlowData(),
        autoSaveStatus: 'idle',
        lastAutoSavedAt: null
      };

      setPlannerTabs([defaultTab]);
      setActiveTabId(defaultTab.id);
      loadTabIntoCanvas(defaultTab);
      persistWorkspace([defaultTab], defaultTab.id);
    }

    const enableAutoSaveTimer = window.setTimeout(() => {
      setAutoSaveEnabled(true);
    }, AUTO_SAVE_BOOTSTRAP_DELAY_MS);

    return () => {
      window.clearTimeout(enableAutoSaveTimer);
    };
  }, [reactFlowInstance, importExportService, ships, wbHistory, ccus, hangarItems, clearAutoSaveTimer, AUTO_SAVE_BOOTSTRAP_DELAY_MS, loadTabIntoCanvas, getNextRouteName, persistWorkspace]);

  useEffect(() => {
    if (!autoSaveEnabled || !activeTabId || !nodes.length) return;

    clearAutoSaveTimer();
    setAutoSaveStatus('pending');
    autoSaveTimeoutRef.current = window.setTimeout(() => {
      saveFlowDataRef.current('auto');
      autoSaveTimeoutRef.current = null;
    }, AUTO_SAVE_IDLE_MS);

    return clearAutoSaveTimer;
  }, [autoSaveEnabled, activeTabId, nodes, edges, startShipPrices, clearAutoSaveTimer, AUTO_SAVE_IDLE_MS]);

  useEffect(() => {
    if (!reactFlowInstance || !activeTabId) {
      return;
    }

    const fitTimer = window.setTimeout(() => {
      reactFlowInstance.fitView({ padding: 0.2, duration: 260 });
    }, 90);

    return () => {
      window.clearTimeout(fitTimer);
    };
  }, [reactFlowInstance, activeTabId]);

  useEffect(() => {
    return () => {
      clearAutoSaveTimer();
    };
  }, [clearAutoSaveTimer]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const closeRouteInfoPanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  //MS on mobile, creates and adds the node to the canvas 
  const onMobileAdd = useCallback((ship: Ship) => {
    if (!reactFlowInstance || !reactFlowWrapper.current) return;

    //MS compute center in screen coords
    const bounds = reactFlowWrapper.current.getBoundingClientRect();
    const centerScreen = {
      x: bounds.width / 2,
      y: bounds.height / 2,
    };

    //MS project to canvas coords
    const rawPos = reactFlowInstance.project(centerScreen);

    //MS optional: snap to 100px grid
    const gridSize = 100;
    const position: XYPosition = {
      x: Math.round(rawPos.x / gridSize) * gridSize,
      y: Math.round(rawPos.y / gridSize) * gridSize,
    };

    //MS build your node
    const newNode: Node = {
      id: `ship-${ship.id}-${Date.now()}`,
      type: 'ship',
      position,
      data: {
        ship,
        onUpdateEdge: updateEdgeData,
        onDeleteEdge: deleteEdge,
        onDeleteNode: handleDeleteNode,
        onDuplicateNode: handleDuplicateNode,
        ccus,
        wbHistory,
      },
    };

    //MS drop it in
    setNodes((nds) => nds.concat(newNode));
  }, [
    reactFlowInstance,
    reactFlowWrapper,
    updateEdgeData,
    deleteEdge,
    handleDeleteNode,
    handleDuplicateNode,
    ccus,
    wbHistory,
    setNodes,
  ]);

  const proOptions = { hideAttribution: true };

  // Handle path builder
  const handleOpenPathBuilder = useCallback(() => {
    setPathBuilderOpen(true);

    reportBi<null>({
      slot: BiSlots.PLANNER_USE,
      data: null
    })
  }, []);

  const handleClosePathBuilder = useCallback(() => {
    setPathBuilderOpen(false);
  }, []);

  // Add reviewed path from path builder
  const handleCreatePath = useCallback((result: ReviewedPathBuildResult) => {
    const { nodes: reviewedNodes, edges: reviewedEdges } = result;

    if (reviewedNodes.length === 0 || reviewedEdges.length === 0) {
      showAlert(
        intl.formatMessage({
          id: 'pathBuilder.error.noPath',
          defaultMessage: 'No valid path could be generated with the selected settings.'
        }),
        'warning'
      );
      return;
    }

    const routeMinX = Math.min(...reviewedNodes.map(node => node.position.x));
    const routeMaxX = Math.max(...reviewedNodes.map(node => node.position.x));
    const routeMinY = Math.min(...reviewedNodes.map(node => node.position.y));
    const routeMaxY = Math.max(...reviewedNodes.map(node => node.position.y));
    const routeWidth = routeMaxX - routeMinX;
    const routeHeight = routeMaxY - routeMinY;
    const INSERT_VERTICAL_GAP = 400;

    let anchorX = 100;
    let anchorY = 100;

    if (nodes.length > 0) {
      const existingMinX = Math.min(...nodes.map(node => node.position.x));
      const existingMaxX = Math.max(...nodes.map(node => node.position.x));
      const existingMaxY = Math.max(...nodes.map(node => node.position.y));
      const existingCenterX = existingMinX + (existingMaxX - existingMinX) / 2;
      anchorX = existingCenterX - routeWidth / 2;
      anchorY = existingMaxY + INSERT_VERTICAL_GAP;
    } else if (reactFlowInstance && reactFlowWrapper.current) {
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const centerFlowPosition = reactFlowInstance.screenToFlowPosition({
        x: bounds.width / 2,
        y: bounds.height / 2
      });
      anchorX = centerFlowPosition.x - routeWidth / 2;
      anchorY = centerFlowPosition.y - routeHeight / 2;
    }

    const offsetX = anchorX - routeMinX;
    const offsetY = anchorY - routeMinY;

    const existingNodeIdSet = new Set(nodes.map(node => node.id));
    const idMapping = new Map<string, string>();
    const idSeed = Date.now();

    const positionedNodes = reviewedNodes.map((node, index) => {
      let nextId = `ship-${node.data?.ship?.id ?? 'pb'}-${idSeed + index}`;
      while (existingNodeIdSet.has(nextId)) {
        nextId = `ship-${node.data?.ship?.id ?? 'pb'}-${idSeed + index}-${Math.random().toString(36).slice(2, 6)}`;
      }
      existingNodeIdSet.add(nextId);
      idMapping.set(node.id, nextId);

      return {
        ...node,
        id: nextId,
        position: {
          x: node.position.x + offsetX,
          y: node.position.y + offsetY
        },
        data: {
          ...node.data,
          id: nextId
        }
      };
    });

    const existingEdgeIdSet = new Set(edges.map(edge => edge.id));
    const positionedEdges = reviewedEdges.flatMap((edge, index) => {
      const mappedSource = idMapping.get(edge.source);
      const mappedTarget = idMapping.get(edge.target);
      if (!mappedSource || !mappedTarget) {
        return [];
      }

      let nextEdgeId = `edge-${mappedSource}-${mappedTarget}-${idSeed + index}`;
      while (existingEdgeIdSet.has(nextEdgeId)) {
        nextEdgeId = `edge-${mappedSource}-${mappedTarget}-${idSeed + index}-${Math.random().toString(36).slice(2, 6)}`;
      }
      existingEdgeIdSet.add(nextEdgeId);

      return [{
        ...edge,
        id: nextEdgeId,
        source: mappedSource,
        target: mappedTarget
      }];
    });

    setNodes(prevNodes => [...prevNodes, ...positionedNodes]);
    setEdges(prevEdges => [...prevEdges, ...positionedEdges]);

    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView(), 100);
    }
  }, [setNodes, setEdges, reactFlowInstance, showAlert, intl, nodes, edges]);

  const nodeTypes = useMemo(() => ({ ship: ShipNode }), []);
  const edgeTypes = useMemo(() => ({ ccu: CcuEdge }), []);

  const handleSelectedPathChange = useCallback((path: CompletePath | null) => {
    setSelectedPathEdgeIds(path ? path.edges.map(pathEdge => pathEdge.edge.id) : []);
  }, [setSelectedPathEdgeIds]);

  const explorePathJoyrideLocale = useMemo(() => ({
    back: intl.formatMessage({ id: 'joyride.back', defaultMessage: 'Back' }),
    close: intl.formatMessage({ id: 'joyride.close', defaultMessage: 'Close' }),
    last: intl.formatMessage({ id: 'joyride.last', defaultMessage: 'Finish' }),
    next: intl.formatMessage({ id: 'joyride.next', defaultMessage: 'Next' }),
    nextLabelWithProgress: intl.formatMessage(
      { id: 'joyride.nextWithProgress', defaultMessage: 'Next ({step}/{steps})' },
      { step: '{step}', steps: '{steps}' }
    ),
    skip: intl.formatMessage({ id: 'joyride.skip', defaultMessage: 'Skip Tutorial' }),
  }), [intl]);

  const explorePathJoyrideSteps = useMemo<JoyrideStep[]>(() => [
    {
      target: '.joyride-path-builder-trigger',
      title: intl.formatMessage({ id: 'pathBuilder.joyride.title.trigger', defaultMessage: 'Open Explore' }),
      content: intl.formatMessage({
        id: 'pathBuilder.joyride.content.trigger',
        defaultMessage: 'Click here to open Explore and auto-generate an upgrade route from your starting ship to your target ship.'
      }),
      disableBeacon: true,
      placement: 'top'
    },
    {
      target: '.joyride-path-builder-start-ship',
      title: intl.formatMessage({ id: 'pathBuilder.joyride.title.startShip', defaultMessage: 'Pick a Starting Ship' }),
      content: intl.formatMessage({
        id: 'pathBuilder.joyride.content.startShip',
        defaultMessage: 'Select the ship you currently own or plan to start from. You can also use the LTI quick-select list.'
      })
    },
    {
      target: '.joyride-path-builder-target-ship',
      title: intl.formatMessage({ id: 'pathBuilder.joyride.title.targetShip', defaultMessage: 'Pick a Target Ship' }),
      content: intl.formatMessage({
        id: 'pathBuilder.joyride.content.targetShip',
        defaultMessage: 'Choose the final ship you want to reach. The selectable list is filtered based on price progression.'
      })
    },
    {
      target: '.joyride-path-builder-options',
      title: intl.formatMessage({ id: 'pathBuilder.joyride.title.options', defaultMessage: 'Configure Strategy' }),
      content: intl.formatMessage({
        id: 'pathBuilder.joyride.content.options',
        defaultMessage: 'Adjust date range and route options here, such as Warbond history, price increases, and hangar preference.'
      })
    },
    {
      target: '.joyride-path-builder-create',
      title: intl.formatMessage({ id: 'pathBuilder.joyride.title.create', defaultMessage: 'Generate Route' }),
      content: intl.formatMessage({
        id: 'pathBuilder.joyride.content.create',
        defaultMessage: 'After setting everything up, click this button to generate and review the route before adding it to the canvas.'
      }),
      placement: 'top-end'
    }
  ], [intl]);

  const scheduleExplorePathJoyrideStepRetry = useCallback((stepIndex: number, delayMs: number = 300) => {
    if (joyrideStepRetryTimeoutRef.current) {
      window.clearTimeout(joyrideStepRetryTimeoutRef.current);
      joyrideStepRetryTimeoutRef.current = null;
    }

    joyrideStepRetryTimeoutRef.current = window.setTimeout(() => {
      setExplorePathJoyrideStepIndex(stepIndex);
      joyrideStepRetryTimeoutRef.current = null;
    }, delayMs);
  }, []);

  const finishExplorePathJoyride = useCallback(() => {
    if (joyrideStepRetryTimeoutRef.current) {
      window.clearTimeout(joyrideStepRetryTimeoutRef.current);
      joyrideStepRetryTimeoutRef.current = null;
    }
    setExplorePathJoyrideRun(false);
    setExplorePathJoyrideStepIndex(0);
    localStorage.setItem(EXPLORE_PATH_JOYRIDE_STORAGE_KEY, 'true');
  }, []);

  const handleExplorePathJoyrideCallback = useCallback((data: CallBackProps) => {
    const { action, index, status, type } = data;

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      finishExplorePathJoyride();
      return;
    }

    if (type === EVENTS.STEP_AFTER) {
      if (index === 0 && action !== ACTIONS.PREV) {
        if (!pathBuilderOpen) {
          setPathBuilderOpen(true);
        }
        scheduleExplorePathJoyrideStepRetry(1, 320);
        return;
      }

      const nextIndex = action === ACTIONS.PREV ? index - 1 : index + 1;
      setExplorePathJoyrideStepIndex(Math.max(nextIndex, 0));
      return;
    }

    if (type === EVENTS.TARGET_NOT_FOUND) {
      if (index > 0 && !pathBuilderOpen) {
        setPathBuilderOpen(true);
      }

      scheduleExplorePathJoyrideStepRetry(Math.max(index, 0), 320);
    }
  }, [finishExplorePathJoyride, pathBuilderOpen, scheduleExplorePathJoyrideStepRetry]);

  useEffect(() => {
    const hasSeenExplorePathJoyride = localStorage.getItem(EXPLORE_PATH_JOYRIDE_STORAGE_KEY) === 'true';
    if (hasSeenExplorePathJoyride) {
      return;
    }

    const timer = window.setTimeout(() => {
      setExplorePathJoyrideStepIndex(0);
      setExplorePathJoyrideRun(true);
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (joyrideStepRetryTimeoutRef.current) {
        window.clearTimeout(joyrideStepRetryTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (explorePathJoyrideRun && explorePathJoyrideStepIndex > 0 && !pathBuilderOpen) {
      setPathBuilderOpen(true);
    }
  }, [explorePathJoyrideRun, explorePathJoyrideStepIndex, pathBuilderOpen]);

  return (
    <div className="h-[100%] w-full flex sm:flex-row flex-col">
      <Joyride
        callback={handleExplorePathJoyrideCallback}
        continuous
        hideCloseButton
        run={explorePathJoyrideRun}
        stepIndex={explorePathJoyrideStepIndex}
        scrollToFirstStep
        showProgress
        showSkipButton
        disableScrolling
        disableOverlayClose
        spotlightClicks
        steps={explorePathJoyrideSteps}
        locale={explorePathJoyrideLocale}
        styles={{
          options: {
            zIndex: 20000,
          },
          tooltip: {
            maxWidth: 320
          },
          tooltipFooter: {
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'nowrap'
          },
          buttonNext: {
            whiteSpace: 'nowrap',
            flexShrink: 0,
            minWidth: 116
          },
          buttonBack: {
            whiteSpace: 'nowrap',
            flexShrink: 0
          },
          buttonSkip: {
            whiteSpace: 'nowrap',
            flexShrink: 0
          }
        }}
      />

      <div className="min-w-[320px] w-full sm:w-fit sm:h-full border-r border-gray-200 dark:border-gray-800 relative">
        <ShipSelector ships={ships} ccus={ccus} onDragStart={onShipDragStart} onMobileAdd={onMobileAdd} />
      </div>

      <div className="md:w-full sm:h-full w-full h-full flex-1 min-h-0 flex flex-col">
        <div className="h-10 shrink-0 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#181818]">
          <div className="h-full flex items-stretch overflow-x-auto">
            {plannerTabs.map(tab => {
              const isActive = tab.id === activeTabId;
              const isEditing = editingTabId === tab.id;
              const isDropTarget = dragOverTabId === tab.id && draggingTabId && draggingTabId !== tab.id;

              return (
                <div
                  key={tab.id}
                  draggable={!isEditing}
                  onClick={() => switchToTab(tab.id)}
                  onDoubleClick={() => startRenameTab(tab.id)}
                  onDragStart={(event) => handleTabDragStart(event, tab.id)}
                  onDragOver={(event) => handleTabDragOver(event, tab.id)}
                  onDrop={(event) => handleTabDrop(event, tab.id)}
                  onDragEnd={handleTabDragEnd}
                  className={`relative flex h-full items-center justify-between border-r border-slate-300 dark:border-slate-600 px-2 gap-1 min-w-[120px] ${isActive
                    ? 'bg-white dark:bg-[#121212]'
                    : 'bg-[#eceef1] dark:bg-[#222]'
                    } ${draggingTabId === tab.id ? 'opacity-55' : ''}`}
                >
                  {isDropTarget && (
                    <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded bg-sky-500" />
                  )}
                  {isEditing ? (
                    <Input
                      autoFocus
                      value={editingTabName}
                      // maxLength={48}
                      onChange={(event) => setEditingTabName(event.target.value)}
                      onBlur={() => commitRenameTab(tab.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          commitRenameTab(tab.id);
                        }
                        if (event.key === 'Escape') {
                          cancelRenameTab();
                        }
                      }}
                      placeholder={intl.formatMessage({ id: 'ccuPlanner.tab.renamePlaceholder', defaultMessage: 'Tab name' })}
                    />
                  ) : (
                    <div className='cursor-pointer'>
                      {tab.name}
                    </div>
                  )}
                  {!isEditing && (
                    <div
                      className="flex h-5 w-5 items-center justify-center rounded text-slate-500 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                      onClick={(event) => {
                        event.stopPropagation();
                        requestCloseTab(tab.id);
                      }}
                      title={intl.formatMessage({ id: 'ccuPlanner.tab.close', defaultMessage: 'Close route tab' })}
                    >
                      <X size={12} />
                    </div>
                  )}
                </div>
              );
            })}
            <div
              className="h-full w-10 shrink-0 flex items-center justify-center border-r border-slate-300 dark:border-slate-600 bg-[#eceef1] dark:bg-[#222] text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-[#2a2a2a] cursor-pointer"
              onClick={addTab}
              title={intl.formatMessage({ id: 'ccuPlanner.tab.add', defaultMessage: 'Add route tab' })}
            >
              <Plus size={14} />
            </div>
          </div>
        </div>

        <div className="relative flex-1 min-h-0" ref={reactFlowWrapper}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              proOptions={proOptions}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setReactFlowInstance}
              onDrop={onDropFile}
              onDragOver={onDragOver}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
            >
              <Controls position={isMobile ? "top-left" : "bottom-left"} className='dark:invert-90 !shadow-none flex gap-1' />
              <MiniMap className='dark:invert-90 xl:block hidden' />
              <Background color="#333" gap={32} />
              <Panel position="top-right">
                <div className='gap-2 hidden sm:flex'>
                  {/* <div className='flex flex-col gap-2 items-center justify-center'>
                    <Crawler ships={ships} />
                  </div> */}
                  <div className='bg-white dark:bg-[#121212]'>
                    <UserSelector />
                  </div>
                </div>
              </Panel>
              <div className="bg-white dark:bg-[#121212] absolute left-[50%] translate-x-[-50%] bottom-[15px] z-10000">
                <Toolbar
                  nodes={nodes}
                  saveStatus={autoSaveStatus}
                  lastSavedAt={lastAutoSavedAt}
                  onClear={handleClear}
                  onExport={handleExport}
                  onImport={handleImport}
                  onOpenPathBuilder={handleOpenPathBuilder}
                  onOpenGuide={() => {
                    // setGuideOpen(true)
                    reportBi<null>({
                      slot: BiSlots.VIEW_GUIDE,
                      data: null
                    })
                    navigate('/blog/usage-guide-how-to-use-ccu-planner-to-plan-your-upgrade-path' + (intl.locale.startsWith('zh') ? '-zh' : ''))
                  }}
                />
              </div>
              <Panel position="top-left" className="bg-white dark:bg-[#121212] md:w-[340px] w-[320px] border border-gray-200 dark:border-gray-800 p-2 hidden sm:block">
                <Hangar ships={ships} ccus={ccus} onDragStart={onShipDragStart} />
              </Panel>
            </ReactFlow>

            <RouteInfoPanel
              selectedNode={selectedNode}
              edges={edges}
              nodes={nodes}
              onClose={closeRouteInfoPanel}
              startShipPrices={startShipPrices}
              onStartShipPriceChange={handleStartShipPriceChange}
              onPathCompletionChange={refreshEdgesOnPathCompletion}
              onSelectedPathChange={handleSelectedPathChange}
            />
          </ReactFlowProvider>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      {/* Path Planner */}
      <PathBuilder
        open={pathBuilderOpen}
        onClose={handleClosePathBuilder}
        onCreatePath={handleCreatePath}
      />

      <Dialog
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        maxWidth="xl"
        fullWidth
      >
        <DialogTitle className="flex justify-between items-center border-b border-gray-200">
          <div>
            <FormattedMessage id="guide.title" defaultMessage="Guide" />
          </div>
          <IconButton onClick={() => setGuideOpen(false)} size="small">
            <Close />
          </IconButton>
        </DialogTitle>

        <DialogContent>
          <Guide />
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingCloseTabId)}
        onClose={cancelCloseTab}
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
          <Button onClick={cancelCloseTab}>
            <FormattedMessage id="common.cancel" defaultMessage="Cancel" />
          </Button>
          <Button onClick={confirmCloseTab} variant="contained" color="error">
            <FormattedMessage id="common.confirm" defaultMessage="Confirm" />
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}
