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
  Edge,
  XYPosition,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useIntl } from 'react-intl';

import { Ship, CcuSourceType, CcuEdgeData, Ccu, WbHistoryData, HangarItem } from '../../../types';
import ShipNode from './ShipNode';
import CcuEdge from './CcuEdge';
import ShipSelector from './ShipSelector';
import Toolbar from './Toolbar';
import RouteInfoPanel from './RouteInfoPanel';
import { Alert, Snackbar, useMediaQuery } from '@mui/material';
import { selectHangarItems } from '../../../store/upgradesStore';
import { useSelector } from 'react-redux';
import Hangar from './Hangar';
import PathBuilder from './PathBuilder';
import UserSelector from '../../../components/UserSelector';

interface CcuCanvasProps {
  ships: Ship[];
  ccus: Ccu[];
  wbHistory: WbHistoryData[];
  exchangeRates: {
    [currency: string]: number;
  };
}

export default function CcuCanvas({ ships, ccus, wbHistory, exchangeRates }: CcuCanvasProps) {
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
  const [pathBuilderOpen, setPathBuilderOpen] = useState(false);

  // const upgrades = useSelector((state: RootState) => state.upgrades.items);
  const upgrades = useSelector(selectHangarItems);

  // Convert upgrades to HangarItem format
  const hangarItems: HangarItem[] = upgrades.ccus.map(upgrade => ({
    id: Date.now() + Math.random(), // Generate unique ID
    name: upgrade.name,
    type: 'ccu',
    fromShip: upgrade.parsed.from,
    toShip: upgrade.parsed.to,
    price: upgrade.value
  }));

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
          // console.warn('CCU can only be upgraded from low-priced ships to high-priced ships');
          setAlert({
            open: true,
            message: intl.formatMessage({ id: 'ccuPlanner.error.lowerToHigher', defaultMessage: 'CCU can only be upgraded from low-priced ships to high-priced ships' }),
            type: 'warning'
          })
          return;
        }

        const hangarCcu = upgrades.ccus.find(upgrade => {
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

  // Handle path builder
  const handleOpenPathBuilder = useCallback(() => {
    setPathBuilderOpen(true);
  }, []);

  const handleClosePathBuilder = useCallback(() => {
    setPathBuilderOpen(false);
  }, []);

  // Create path from path builder
  const handleCreatePath = useCallback((stepShips: Ship[][]) => {
    if (stepShips.length < 2) return;

    // Check if nodes exist and find suitable position for new nodes
    const nodePositions = nodes.map(node => ({
      x: node.position.x,
      y: node.position.y
    }));

    // Calculate starting position for new nodes
    let startX = 100;
    const startY = 100;

    if (nodePositions.length > 0) {
      // Find the rightmost position of all current nodes
      const maxX = Math.max(...nodePositions.map(pos => pos.x));
      startX = maxX + 300; // Start 300px to the right of the rightmost position
    }

    // Create all nodes and edges
    const newNodes: Node[] = [];
    const newEdges: Edge[] = [];

    // Get all target ships (endpoints)
    const targetShips = stepShips[1];

    // Get all source ships
    const sourceShips = stepShips[0];

    // Get actual ship price (considering discounts)
    const getShipPrice = (ship: Ship): number => {
      // First check if it's a historical or wb name
      let checkedShipName = ship.name;

      // Handle cases where ship data doesn't include suffix but stepShips does
      const matchingTargetShip = stepShips[1].find(s =>
        s.id === ship.id && (s.name.endsWith('-wb') || s.name.endsWith('-historical'))
      );

      if (matchingTargetShip) {
        checkedShipName = matchingTargetShip.name;
      }

      const actualShipName = checkedShipName.replace('-wb', '').replace('-historical', '');

      if (checkedShipName.endsWith('-wb')) {
        return ccus.find(c => c.id === ship.id)?.skus.find(sku => sku.price !== ship.msrp && sku.available)?.price || ship.msrp;
      } else if (checkedShipName.endsWith('-historical')) {
        const historicalPrice = Number(wbHistory.find(wb =>
          wb.name.toUpperCase() === actualShipName.toUpperCase() ||
          wb.name.toUpperCase() === ship.name.trim().toUpperCase())?.price) * 100;

        return historicalPrice || ship.msrp;
      }
      return ship.msrp;
    };

    // Get all ship prices and sort them
    const allShips = [...sourceShips, ...targetShips];
    const uniqueShips = allShips.filter((ship, index, self) =>
      index === self.findIndex(s => s.id === ship.id)
    );

    // Create mapping of ships to their actual prices
    const shipActualPrices = new Map<string, number>();
    uniqueShips.forEach(ship => {
      shipActualPrices.set(ship.id.toString(), getShipPrice(ship));
    });

    // Sort ships by actual price
    const sortedShips = uniqueShips.sort((a, b) =>
      (shipActualPrices.get(a.id.toString()) || 0) - (shipActualPrices.get(b.id.toString()) || 0)
    );

    // Create price level mapping
    const priceLevels: Map<number, Ship[]> = new Map();
    sortedShips.forEach(ship => {
      const price = shipActualPrices.get(ship.id.toString())!;
      if (!priceLevels.has(price)) {
        priceLevels.set(price, []);
      }
      priceLevels.get(price)?.push(ship);
    });

    // Sort price levels
    const sortedPriceLevels = Array.from(priceLevels.keys()).sort((a, b) => a - b);

    // Create nodes for each price level
    let levelX = startX;
    const levelSpacing = 500; // Horizontal spacing between price levels
    const shipNodeMap: Map<string, Node> = new Map(); // Track created nodes

    sortedPriceLevels.forEach((price, levelIndex) => {
      const shipsAtLevel = priceLevels.get(price) || [];

      // Calculate vertical spacing for current level
      const nodeHeight = 500;
      const levelY = startY;
      const shipsSpacing = Math.max(nodeHeight, 600 / (shipsAtLevel.length || 1));

      shipsAtLevel.forEach((ship, shipIndex) => {
        // Check if node for this ship already exists
        const shipKey = `${ship.id}`;
        if (shipNodeMap.has(shipKey)) {
          return; // Skip if node already exists
        }

        const yPos = levelY + shipIndex * shipsSpacing;
        const timestamp = Date.now();
        const nodeId = `ship-${ship.id}-${timestamp + shipIndex + levelIndex * 100}`;

        const shipNode: Node = {
          id: nodeId,
          type: 'ship',
          position: { x: levelX, y: yPos },
          data: {
            ship: {
              ...ship,
              name: ship.name.replace('-historical', '').replace('-wb', '')
            },
            onUpdateEdge: updateEdgeData,
            onDeleteEdge: deleteEdge,
            onDeleteNode: handleDeleteNode,
            onDuplicateNode: handleDuplicateNode,
            ccus,
            wbHistory,
            id: nodeId
          },
        };

        newNodes.push(shipNode);
        shipNodeMap.set(shipKey, shipNode);
      });

      // Move to next price level
      levelX += levelSpacing;
    });

    // Create upgrade edges
    const createdNodes = Array.from(shipNodeMap.values());

    // console.log(sortedPriceLevels, "sortedPriceLevels")

    const levelShips: Node[][] = [];

    // levelShips.push(stepShips[0].map(ship => ({
    //   id: `ship-${ship.id}-${Date.now()}`,
    //   type: 'ship',
    //   position: { x: 0, y: 0 },
    //   data: { ship }
    // })))

    // New connection creation logic: Create edges for all ships (including source ships)
    // Process each price level
    for (let i = 0; i < sortedPriceLevels.length; i++) {
      const currentPrice = sortedPriceLevels[i];

      // Get nodes at current price level
      const currentLevelShips = createdNodes.filter(node => {
        const ship = node.data.ship as Ship;
        const actualPrice = shipActualPrices.get(ship.id.toString());
        // console.log(ship.name, actualPrice, "actualPrice")
        return actualPrice !== undefined && Math.abs(actualPrice - currentPrice) < 1;
      });

      // console.log(currentLevelShips, "currentLevelShips")

      // Create connections for each current level node
      currentLevelShips.forEach(sourceNode => {
        const sourceShip = sourceNode.data.ship as Ship;
        // const sourcePriceValue = shipActualPrices.get(sourceShip.id.toString()) || 0;
        const sourcePriceValue = sourceShip.msrp;

        // Special handling for source ships
        const isSourceShip = sourceShips.some(ship => ship.id === sourceShip.id);
        const isTargetShip = targetShips.some(ship => ship.id === sourceShip.id);

        // Skip if source ship price is 0 or not upgradeable
        if (sourcePriceValue === 0) {
          return;
        }

        // Only create connections for target ships or source ships
        if (!isSourceShip && !isTargetShip) {
          return;
        }

        // For each source ship, find valid target ships
        let foundConnectionInAnyLevel = false;

        for (let j = 0; j < sortedPriceLevels.length; j++) {
          // Only connect to higher price levels
          if (sortedPriceLevels[j] <= currentPrice) {
            continue;
          }

          // If connection found in lower price level, don't continue to higher levels
          if (foundConnectionInAnyLevel) {
            break;
          }

          const nextLevelPrice = sortedPriceLevels[j];

          // Get nodes at next price level
          const nextLevelShips = createdNodes.filter(node => {
            const ship = node.data.ship as Ship;
            const actualPrice = shipActualPrices.get(ship.id.toString());
            return actualPrice !== undefined && Math.abs(actualPrice - nextLevelPrice) < 1;
          });

          // Filter valid target nodes (price higher than current node and part of target path)
          const validTargets = nextLevelShips.filter(targetNode => {
            const targetShip = targetNode.data.ship as Ship;
            const targetPriceValue = shipActualPrices.get(targetShip.id.toString()) || 0;

            // Ensure target price is strictly higher than source price
            if (sourcePriceValue >= targetPriceValue || targetPriceValue === 0) {
              return false;
            }

            // Check if ship is part of target upgrade path
            const isTargetPathShip = targetShips.some(ship => ship.id === targetShip.id);
            return isTargetPathShip;
          });

          // If valid target nodes found at current level, create connections
          if (validTargets.length > 0) {
            validTargets.forEach(targetNode => {
              const targetShip = targetNode.data.ship as Ship;
              const targetPriceValue = shipActualPrices.get(targetShip.id.toString()) || 0;
              const priceDifference = targetPriceValue - sourcePriceValue;

              // Ensure price difference is greater than 0
              if (priceDifference <= 0) {
                return;
              }
            });

            foundConnectionInAnyLevel = true;
          }
        }
      });

      levelShips.push(currentLevelShips);
    }

    levelShips.forEach((level, index) => {
      level.forEach(targetShip => {
        for (let i = index - 1; i >= 0; i--) {
          const sourceShips = levelShips[i].filter(ship => {
            const originShip = stepShips[1].find(s => s.id === ship.data.ship.id);
            const targetShipCost = getShipPrice(targetShip.data.ship);

            const exactMatchCCU = (upgrades.ccus.some(upgrade => upgrade.parsed.from.toUpperCase() === ship.data.ship.name.trim().toUpperCase()) && upgrades.ccus.some(upgrade => upgrade.parsed.to.toUpperCase() === targetShip.data.ship.name.trim().toUpperCase()))

            if (ship.data.ship.msrp >= targetShipCost && !exactMatchCCU) {
              return false;
            }

            if (stepShips[0].find(s => s.id === ship.data.ship.id)) {
              return true;
            }

            return originShip?.name.endsWith('-wb') || 
              originShip?.name.endsWith('-historical') || 
              // If the sourceShip is upgraded from a hangar CCU, it can have an outgoing edge
              upgrades.ccus.some(upgrade => upgrade.parsed.to.toUpperCase() === ship.data.ship.name.trim().toUpperCase()) ||
              // If sourceShip and targetShip are directly matched by a CCU, it can have an outgoing edge
              exactMatchCCU
          });

          if (sourceShips.length > 0) {
            sourceShips.forEach(sourceShip => {
              const priceDifference = targetShip.data.ship.msrp - sourceShip.data.ship.msrp;

              const hangarCcu = upgrades.ccus.find(upgrade => {
                const from = upgrade.parsed.from.toUpperCase();
                const to = upgrade.parsed.to.toUpperCase();
                return from === sourceShip.data.ship.name.trim().toUpperCase() && to === targetShip.data.ship.name.trim().toUpperCase();
              });

              const newEdge: Edge = {
                id: `edge-${sourceShip.id}-${targetShip.id}`,
                source: sourceShip.id,
                target: targetShip.id,
                type: 'ccu',
                animated: true,
                data: {
                  price: priceDifference,
                  sourceShip: sourceShip.data.ship,
                  targetShip: targetShip.data.ship,
                  sourceType: CcuSourceType.OFFICIAL,
                } as CcuEdgeData,
              };

              if (hangarCcu) {
                // If there's a hangar CCU, use it
                newEdge.data.sourceType = CcuSourceType.HANGER;
                newEdge.data.customPrice = hangarCcu.value;
              } else {
                // Handle special price cases
                const targetShipNameInPath = stepShips[1].find(ship => ship.id === targetShip.data.ship.id)?.name;

                if (targetShipNameInPath?.endsWith('-historical')) {
                  const historicalPrice = Number(wbHistory.find(wb =>
                    wb.name.toUpperCase() === targetShipNameInPath.toUpperCase() ||
                    wb.name.toUpperCase() === targetShip.data.ship.name.trim().toUpperCase())?.price) * 100 || targetShip.data.ship.msrp;

                  if (historicalPrice && historicalPrice !== targetShip.data.ship.msrp) {
                    const historicalPriceUSD = historicalPrice / 100;
                    const sourcePriceUSD = sourceShip.data.ship.msrp / 100;
                    const actualPrice = historicalPriceUSD - sourcePriceUSD;

                    // Ensure price difference is greater than 0
                    if (actualPrice <= 0) {
                      return;
                    }

                    newEdge.data.sourceType = CcuSourceType.HISTORICAL;
                    newEdge.data.customPrice = Math.max(0, actualPrice);
                  }
                }
                else if (targetShipNameInPath?.endsWith('-wb')) {
                  const wbPrice = ccus.find(c => c.id === targetShip.data.ship.id)?.skus.find(sku =>
                    sku.price !== targetShip.data.ship.msrp && sku.available)?.price || targetShip.data.ship.msrp;

                  if (wbPrice && wbPrice !== targetShip.data.ship.msrp) {
                    const wbPriceUSD = wbPrice / 100;
                    const sourcePriceUSD = sourceShip.data.ship.msrp / 100;
                    const actualPrice = wbPriceUSD - sourcePriceUSD;

                    // Ensure price difference is greater than 0
                    if (actualPrice <= 0) {
                      return;
                    }

                    newEdge.data.sourceType = CcuSourceType.AVAILABLE_WB;
                    newEdge.data.customPrice = Math.max(0, actualPrice);
                  }
                }
                else {
                  const targetShipSkus = ccus.find(c => c.id === targetShip.data.ship.id)?.skus;
                  const targetWb = targetShipSkus?.find(sku => sku.price !== targetShip.data.ship.msrp && sku.available);

                  if (targetWb && sourceShip.data.ship.msrp < targetWb.price) {
                    const targetWbPrice = targetWb.price / 100;
                    const sourceShipPrice = sourceShip.data.ship.msrp / 100;
                    const actualPrice = targetWbPrice - sourceShipPrice;

                    // Ensure price difference is greater than 0
                    if (actualPrice <= 0) {
                      return;
                    }

                    newEdge.data.sourceType = CcuSourceType.AVAILABLE_WB;
                    newEdge.data.customPrice = Math.max(0, actualPrice);
                  }
                }
              }

              newEdges.push(newEdge);
            })

            break;
          }
        }
      })
    })

    // Update graph
    setNodes(nodes => [...nodes, ...newNodes]);
    setEdges(edges => [...edges, ...newEdges]);

    // If instance exists, adjust view to show all nodes
    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView(), 100);
    }
  }, [nodes, upgrades, ccus, setNodes, setEdges, updateEdgeData, deleteEdge, handleDeleteNode, handleDuplicateNode, wbHistory, reactFlowInstance]);

  const nodeTypes = useMemo(() => ({ ship: ShipNode }), []);
  const edgeTypes = useMemo(() => ({ ccu: CcuEdge }), []);

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
            <Panel position="top-right" className="bg-white dark:bg-[#121212]">
              <UserSelector />
            </Panel>
            <div className="bg-white dark:bg-[#121212] absolute left-[50%] translate-x-[-50%] bottom-[15px] z-10000">
              <Toolbar
                nodes={nodes}
                onClear={handleClear}
                onSave={handleSave}
                onExport={handleExport}
                onImport={handleImport}
                onOpenPathBuilder={handleOpenPathBuilder}
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
              exchangeRates={exchangeRates}
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

      {/* 路径规划器 */}
      <PathBuilder
        open={pathBuilderOpen}
        onClose={handleClosePathBuilder}
        ships={ships}
        ccus={ccus}
        wbHistory={wbHistory}
        hangarItems={hangarItems}
        onCreatePath={handleCreatePath}
      />
    </div>
  );
} 
