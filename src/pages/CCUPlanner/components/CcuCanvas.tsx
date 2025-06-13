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
  ReactFlowProvider,
  Panel,
  ReactFlowInstance,
  getRectOfNodes,
  XYPosition,
  EdgeProps,
  Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { FormattedMessage, useIntl } from 'react-intl';

import { Ship, CcuEdgeData, Ccu, WbHistoryData } from '../../../types';
import ShipNode from './ShipNode';
import CcuEdge from './CcuEdge';
import ShipSelector from './ShipSelector';
import Toolbar from './Toolbar';
import RouteInfoPanel from './RouteInfoPanel';
import { Alert, Dialog, DialogContent, DialogTitle, IconButton, Snackbar, useMediaQuery } from '@mui/material';
import { selectHangarItems } from '../../../store/upgradesStore';
import { useSelector } from 'react-redux';
import Hangar from './Hangar';
import PathBuilder from './PathBuilder';
import UserSelector from '../../../components/UserSelector';
import Guide from './Guide';
import { Close } from '@mui/icons-material';
import pathFinderService, { CompletePath } from '../services/PathFinderService';
import { CcuPlannerProvider } from '../context/CcuPlannerContext';
import { useCcuPlanner } from '../context/useCcuPlanner';
import Crawler from '../../../components/Crawler';

interface CcuCanvasProps {
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  exchangeRates: {
    [currency: string]: number;
  };
}

export default function CcuCanvas({ ships, ccus, wbHistory, exchangeRates }: CcuCanvasProps) {
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
  const intl = useIntl();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [startShipPrices, setStartShipPrices] = useState<Record<string, number | string>>({});
  const isMobile = useMediaQuery('(max-width: 644px)');
  const [pathBuilderOpen, setPathBuilderOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [selectedPath, setSelectedPath] = useState<{ edges: { edge: Edge<CcuEdgeData>; }[]; } | undefined>(undefined);

  // Use data from context
  const {
    ships,
    ccus,
    wbHistory,
    hangarItems,
    edgeService,
    pathBuilderService,
    importExportService,
    handlePathCompletionChange,
    showAlert,
    getServiceData
  } = useCcuPlanner();

  // Get upgrade items from Redux
  const upgrades = useSelector(selectHangarItems);

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

  const importFlowData = useCallback((jsonData: string) => {
    try {
      const importedData = importExportService.importFromJsonData(jsonData, ships, { hangarItems, wbHistory, ccus });

      if (!importedData) {
        throw new Error('Import failed');
      }

      setNodes(importedData.nodes);
      setEdges(importedData.edges);
      setStartShipPrices(importedData.startShipPrices);

      // Clean up completed paths to avoid confusion with newly imported paths
      pathFinderService.clearCompletedPaths();

      // Refresh edge status without showing notification messages
      refreshEdgesOnPathCompletion(false);

      if (reactFlowInstance) {
        importExportService.adjustViewToShowAllNodes(reactFlowInstance);
      }

      // Display import success notification
      showAlert(
        intl.formatMessage({
          id: 'ccuPlanner.success.imported',
          defaultMessage: 'CCU upgrade path imported successfully!'
        })
      );

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
      return false;
    }
  }, [importExportService, ships, hangarItems, wbHistory, ccus, setNodes, setEdges, refreshEdgesOnPathCompletion, reactFlowInstance, intl, showAlert]);

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

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setStartShipPrices({});

    // Clean up completed path states
    pathFinderService.clearCompletedPaths();

    // Refresh edge status without showing notification messages
    refreshEdgesOnPathCompletion(false);

    // Use ImportExportService to clear data
    importExportService.clearFlowData();

    // Display success notification
    showAlert(
      intl.formatMessage({
        id: 'ccuPlanner.success.cleared',
        defaultMessage: 'Canvas cleared successfully!'
      })
    );
  }, [setNodes, setEdges, importExportService, intl, refreshEdgesOnPathCompletion, showAlert]);

  const handleSave = useCallback(() => {
    if (!nodes.length) return;

    const flowData = {
      nodes,
      edges,
      startShipPrices
    };

    // Use ImportExportService to save data
    importExportService.saveToLocalStorage(flowData);

    showAlert(
      intl.formatMessage({
        id: 'ccuPlanner.success.saved',
        defaultMessage: 'CCU upgrade path saved successfully!'
      })
    );
  }, [nodes, edges, startShipPrices, intl, importExportService, showAlert]);

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
  }, [reactFlowInstance, nodes, edges, startShipPrices, importExportService]);

  useEffect(() => {
    // Use ImportExportService to load data
    if (reactFlowInstance) {
      const savedData = importExportService.loadFromLocalStorage(ships, hangarItems, wbHistory, ccus);
      if (savedData) {
        setNodes(savedData.nodes);
        setEdges(savedData.edges);
        setStartShipPrices(savedData.startShipPrices);
      }
    }
  }, [reactFlowInstance, setNodes, setEdges, importExportService, ships, wbHistory, ccus, hangarItems]);

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
  }, []);

  const handleClosePathBuilder = useCallback(() => {
    setPathBuilderOpen(false);
  }, []);

  // Create path from path builder
  const handleCreatePath = useCallback((stepShips: Ship[][]) => {
    // Use PathBuilderService to create path
    const { nodes: newNodes, edges: newEdges } = pathBuilderService.createPath({
      stepShips,
      ships,
      ...getServiceData()
    });

    // Update chart
    setNodes(nodes => [...nodes, ...newNodes]);
    setEdges(edges => [...edges, ...newEdges]);

    // If instance exists, adjust view to show all nodes
    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView(), 100);
    }
  }, [pathBuilderService, ships, getServiceData, setNodes, setEdges, reactFlowInstance]);

  const nodeTypes = useMemo(() => ({ ship: ShipNode }), []);
  const edgeTypes = useMemo(() => ({
    ccu: (props: EdgeProps<CcuEdgeData>) => (
      <CcuEdge
        {...props}
        selectedPath={selectedPath}
      />
    ),
  }), [selectedPath]);

  const handleSelectedPathChange = useCallback((path: CompletePath | null) => {
    setSelectedPath(path ? { edges: path.edges } : undefined);
  }, []);

  return (
    <div className="h-[100%] w-full flex sm:flex-row flex-col">
      <div className="min-w-[320px] w-full sm:w-fit sm:h-full border-r border-gray-200 dark:border-gray-800 relative">
        <ShipSelector ships={ships} ccus={ccus} wbHistory={wbHistory} onDragStart={onShipDragStart} onMobileAdd={onMobileAdd} />
      </div>

      <div className="md:w-full sm:h-full w-full h-full flex-1 relative" ref={reactFlowWrapper}>
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
            <Controls position={isMobile ? "top-left" : "bottom-left"} className='dark:invert-90 !shadow-none flex flex-col gap-1' />
            <MiniMap className='dark:invert-90 xl:block hidden' />
            <Background color="#333" gap={32} />
            <Panel position="top-right">
              <div className='gap-2 hidden sm:flex'>
                <div className='flex flex-col gap-2 items-center justify-center'>
                  <Crawler ships={ships} />
                </div>
                <div className='bg-white dark:bg-[#121212]'>
                  <UserSelector />
                </div>
              </div>
            </Panel>
            <div className="bg-white dark:bg-[#121212] absolute left-[50%] translate-x-[-50%] bottom-[15px] z-10000">
              <Toolbar
                nodes={nodes}
                onClear={handleClear}
                onSave={handleSave}
                onExport={handleExport}
                onImport={handleImport}
                onOpenPathBuilder={handleOpenPathBuilder}
                onOpenGuide={() => setGuideOpen(true)}
              />
            </div>
            <Panel position="top-left" className="bg-white dark:bg-[#121212] md:w-[340px] w-[320px] border border-gray-200 dark:border-gray-800 p-2 hidden sm:block">
              <Hangar ships={ships} ccus={ccus} onDragStart={onShipDragStart} />
            </Panel>
          </ReactFlow>

          {selectedNode && (
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
          )}
        </ReactFlowProvider>
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
    </div>
  );
} 
