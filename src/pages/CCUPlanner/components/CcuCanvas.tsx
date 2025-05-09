import { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  NodeTypes,
  EdgeTypes,
  ReactFlowProvider,
  Panel,
  ReactFlowInstance,
  getRectOfNodes,
  Edge,
  XYPosition,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useIntl } from 'react-intl';

import { Ship, CcuSourceType, CcuEdgeData, Ccu, WbHistoryData } from '../../../types';
import ShipNode from './ShipNode';
import CcuEdge from './CcuEdge';
import ShipSelector from './ShipSelector';
import Toolbar from './Toolbar';
import RouteInfoPanel from './RouteInfoPanel';
import { Alert, Snackbar, useMediaQuery } from '@mui/material';
import { RootState } from '../../../store';
import { useSelector } from 'react-redux';
import Hangar from './Hangar';

const nodeTypes: NodeTypes = {
  ship: ShipNode,
};

const edgeTypes: EdgeTypes = {
  ccu: CcuEdge,
};

interface CcuCanvasProps {
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
}

export default function CcuCanvas({ ships, ccus, wbHistory }: CcuCanvasProps) {
  const intl = useIntl();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [startShipPrices, setStartShipPrices] = useState<Record<string, number | string>>({});
  const isMobile = useMediaQuery('(max-width: 644px)');
  const [alert, setAlert] = useState<{
    open: boolean,
    message: string,
    type: "success" | "error" | "warning"
  }>({
    open: false,
    message: "",
    type: "success"
  });

  const upgrades = useSelector((state: RootState) => state.upgrades.items);

  // Handle starting ship price change
  const handleStartShipPriceChange = useCallback((nodeId: string, price: number | string) => {
    setStartShipPrices(prev => ({
      ...prev,
      [nodeId]: price
    }));
  }, []);

  const handleClose = () => setAlert((prev) => ({
    ...prev,
    open: false
  }))

  // Handle connection creation
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);

      if (sourceNode && targetNode) {
        const sourceShip = (sourceNode.data?.ship as Ship);
        const targetShip = (targetNode.data?.ship as Ship);

        if (sourceShip.msrp === 0) {
          setAlert({
            open: true,
            message: intl.formatMessage({ id: 'ccuPlanner.error.sourceShipPriceZero', defaultMessage: 'Can\'t upgrade from this ship' }),
            type: 'warning'
          })
          return;
        }

        // Ensure the source ship price is lower than the target ship price
        if (sourceShip.msrp >= targetShip.msrp && targetShip.msrp !== 0) {
          // console.warn('CCU只能从低价船升级到高价船');
          setAlert({
            open: true,
            message: intl.formatMessage({ id: 'ccuPlanner.error.lowerToHigher', defaultMessage: 'CCU can only be upgraded from low-priced ships to high-priced ships' }),
            type: 'warning'
          })
          return;
        }

        const hangarCcu = upgrades.find(upgrade => {
          const from = upgrade.parsed.from.toUpperCase()
          const to = upgrade.parsed.to.toUpperCase()

          return from === sourceShip.name.trim().toUpperCase() && to === targetShip.name.trim().toUpperCase()
        })

        if (targetShip.msrp === 0) {
          if (hangarCcu === undefined) {
            setAlert({
              open: true,
              message: intl.formatMessage({ id: 'ccuPlanner.error.targetShipPriceZero', defaultMessage: 'This ship can only be upgraded using a hangar CCU' }),
              type: 'warning'
            })
            return;
          }
        }

        // Check if there is already a path from the source ship to the target ship
        const hasExistingPath = (
          startNode: Node,
          endNodeId: string,
          visited = new Set<string>()
        ): boolean => {
          // If the current node has been visited, return false to avoid loops
          if (visited.has(startNode.id)) return false;

          // Mark the current node as visited
          visited.add(startNode.id);

          // If the target node is found, return true
          if (startNode.id === endNodeId) return true;

          // Find all edges originating from the current node
          const outgoingEdges = edges.filter(edge => edge.source.split('-')[1] === startNode.id.split('-')[1]);

          // For each outgoing edge, recursively check if there is a path
          for (const edge of outgoingEdges) {
            const nextNode = nodes.find(node => node.id === edge.target);
            if (nextNode && hasExistingPath(nextNode, endNodeId, new Set(visited))) {
              return true;
            }
          }

          return false;
        };

        // If a path already exists, do not create a new connection
        if (hasExistingPath(sourceNode, targetNode.id)) {
          setAlert({
            open: true,
            message: intl.formatMessage({ id: 'ccuPlanner.error.pathExists', defaultMessage: 'A path already exists from the source ship to the target ship, do not create a duplicate connection' }),
            type: 'warning'
          })
          return;
        }

        const priceDifference = targetShip.msrp - sourceShip.msrp;

        const newEdge = {
          id: `edge-${sourceNode.id}-${targetNode.id}`,
          ...connection,
          type: 'ccu',
          animated: true,
          data: {
            price: priceDifference,
            sourceShip,
            targetShip,
            sourceType: CcuSourceType.OFFICIAL,
          } as CcuEdgeData,
        };
        
        if (hangarCcu) {
          // If there is a hangar CCU, use it by default
          newEdge.data.sourceType = CcuSourceType.HANGER;
          newEdge.data.customPrice = hangarCcu.value;
        }
        // If there is no hangar CCU, check if there is a WB option
        else {
          // Check if the target ship has an available WB SKU
          const targetShipSkus = ccus.find(c => c.id === targetShip.id)?.skus;
          const targetWb = targetShipSkus?.find(sku => sku.price !== targetShip.msrp && sku.available);

          // If there is a WB SKU and the WB price is greater than the source ship's msrp, automatically select WB
          if (targetWb && sourceShip.msrp < targetWb.price) {
            const targetWbPrice = targetWb.price / 100;
            const sourceShipPrice = sourceShip.msrp / 100;
            const actualPrice = targetWbPrice - sourceShipPrice;

            newEdge.data.sourceType = CcuSourceType.AVAILABLE_WB;
            newEdge.data.customPrice = Math.max(0, actualPrice);
          }
        }

        setEdges((eds) => addEdge(newEdge, eds));
      }
    },
    [nodes, upgrades, setEdges, edges, ccus, intl]
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
      const { nodes: importedNodes, edges: importedEdges, startShipPrices: importedPrices } = JSON.parse(jsonData);

      if (!importedNodes || !Array.isArray(importedNodes)) {
        throw new Error('Invalid JSON format: missing node data');
      }

      // Ensure the imported nodes reference ships that exist in the current ship list
      const validNodes = importedNodes.filter(node => {
        const shipId = node.data?.ship?.id;
        return shipId && ships.some(s => s.id === shipId);
      });

      if (validNodes.length === 0) {
        throw new Error('No valid ship nodes found');
      }

      // Ensure all edges have a sourceType field
      const processedEdges = importedEdges?.map((edge: Edge<CcuEdgeData>) => {
        if (edge.data && !edge.data.sourceType) {
          return {
            ...edge,
            data: {
              ...edge.data,
              sourceType: CcuSourceType.OFFICIAL
            }
          };
        }
        return edge;
      }) || [];

      // Only import edges related to valid nodes
      const validNodeIds = new Set(validNodes.map(node => node.id));
      const validEdges = processedEdges.filter((edge: Edge<CcuEdgeData>) =>
        validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
      );

      setNodes(validNodes);
      setEdges(validEdges);

      if (importedPrices) {
        // Only keep the starting prices for valid nodes
        const validPrices: Record<string, number | string> = {};
        Object.entries(importedPrices as Record<string, number | string>).forEach(([nodeId, price]) => {
          if (validNodeIds.has(nodeId)) {
            validPrices[nodeId] = price;
          }
        });
        setStartShipPrices(validPrices);
      }

      if (reactFlowInstance) {
        // Automatically adjust the view to display all nodes
        setTimeout(() => reactFlowInstance.fitView(), 100);
      }

      return true;
    } catch (error) {
      console.error('Error importing JSON file:', error);
      setAlert({
        open: true,
        message: intl.formatMessage(
          { id: 'ccuPlanner.error.importFailed', defaultMessage: 'Import failed: {errorMessage}' },
          { errorMessage: (error as Error).message || intl.formatMessage({ id: 'ccuPlanner.error.invalidJson', defaultMessage: 'Invalid JSON format' }) }
        ),
        type: 'error'
      });
      return false;
    }
  }, [ships, setNodes, setEdges, reactFlowInstance, intl]);

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
      const position = reactFlowInstance.project({
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

    localStorage.setItem('ccu-planner-data', "");
  }, [setNodes, setEdges]);

  const handleSave = useCallback(() => {
    if (!nodes.length) return;

    const flowData = {
      nodes,
      edges,
      startShipPrices
    };

    const dataStr = JSON.stringify(flowData);
    localStorage.setItem('ccu-planner-data', dataStr);

    setAlert({
      open: true,
      message: intl.formatMessage({ id: 'ccuPlanner.success.saved', defaultMessage: 'CCU 升级路径已保存！' }),
      type: 'success'
    });
  }, [nodes, edges, startShipPrices, intl]);

  const handleExport = useCallback(() => {
    if (!reactFlowInstance || !nodes.length) return;

    getRectOfNodes(nodes);

    const flowData = {
      nodes,
      edges,
      startShipPrices
    };

    const dataStr = JSON.stringify(flowData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `ccu-planner-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();

    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(downloadLink);
    }, 100);
  }, [reactFlowInstance, nodes, edges, startShipPrices]);

  useEffect(() => {
    const savedData = localStorage.getItem('ccu-planner-data');
    if (savedData && reactFlowInstance) {
      try {
        const { nodes: savedNodes, edges: savedEdges, startShipPrices: savedPrices } = JSON.parse(savedData);

        const processedEdges = savedEdges?.map((edge: Edge<CcuEdgeData>) => {
          if (edge.data && !edge.data.sourceType) {
            return {
              ...edge,
              data: {
                ...edge.data,
                sourceType: CcuSourceType.OFFICIAL
              }
            };
          }
          return edge;
        }) || [];

        setNodes(savedNodes || []);
        setEdges(processedEdges);
        if (savedPrices) {
          setStartShipPrices(savedPrices);
        }
      } catch (error) {
        console.error('加载保存的CCU路径时出错:', error);
      }
    }
  }, [reactFlowInstance, setNodes, setEdges]);

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

  return (
     <div className="h-[100%] w-full flex sm:flex-row flex-col">
      <div className="sm:w-[450px] w-full sm:h-full border-r border-gray-200 dark:border-gray-800 relative">
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
            <Controls position={isMobile ? "top-right" : "bottom-left"} className='dark:invert-90 !shadow-none flex flex-col gap-1' />
            <MiniMap className='dark:invert-90 sm:block hidden' />
            <Background color="#333" gap={32} />
            <Panel position="bottom-center" className="bg-white dark:bg-[#121212] absolute">
              <Toolbar
                nodes={nodes}
                onClear={handleClear}
                onSave={handleSave}
                onExport={handleExport}
                onImport={handleImport}
              />
            </Panel>
            <Panel position="top-left" className="bg-white dark:bg-[#121212] md:w-[340px] w-[320px] border border-gray-200 dark:border-gray-800 p-2">
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

      <Snackbar 
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'center'
        }} 
        open={alert.open} 
        autoHideDuration={6000} 
        onClose={handleClose}
      >
        <Alert
          onClose={handleClose}
          severity={alert.type}
          variant="filled"
          sx={{ width: '100%' }}

        >
          {alert.message}
        </Alert>
      </Snackbar>
    </div>
  );
} 
