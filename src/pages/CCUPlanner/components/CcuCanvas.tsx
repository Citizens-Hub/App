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

import { Ship, CcuSourceType, CcuEdgeData, Ccu } from '../../../types';
import ShipNode from './ShipNode';
import CcuEdge from './CcuEdge';
import ShipSelector from './ShipSelector';
import Toolbar from './Toolbar';
import RouteInfoPanel from './RouteInfoPanel';
import { Alert, Snackbar } from '@mui/material';
import { RootState } from '../../../store';
import { useSelector } from 'react-redux';
import Hanger from './Hanger';

const nodeTypes: NodeTypes = {
  ship: ShipNode,
};

const edgeTypes: EdgeTypes = {
  ccu: CcuEdge,
};

interface CcuCanvasProps {
  ships: Ship[];
  ccus: Ccu[];
}

export default function CcuCanvas({ ships, ccus }: CcuCanvasProps) {
  const intl = useIntl();
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [startShipPrices, setStartShipPrices] = useState<Record<string, number | string>>({});
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

  // 处理起点船价格变化
  const handleStartShipPriceChange = useCallback((nodeId: string, price: number | string) => {
    setStartShipPrices(prev => ({
      ...prev,
      [nodeId]: price
    }));
  }, []);

  const handleClose = () => setAlert((prev) => ({
    ...prev,
    open: false,
    // message: "",
    // type: "success"
  }))

  // 处理连接创建
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);

      if (sourceNode && targetNode) {
        const sourceShip = (sourceNode.data?.ship as Ship);
        const targetShip = (targetNode.data?.ship as Ship);

        // 确保源舰船价格低于目标舰船价格
        if (sourceShip.msrp >= targetShip.msrp) {
          // console.warn('CCU只能从低价船升级到高价船');
          setAlert({
            open: true,
            message: intl.formatMessage({ id: 'ccuPlanner.error.lowerToHigher', defaultMessage: 'CCU只能从低价船升级到高价船' }),
            type: 'warning'
          })
          return;
        }

        // 检查是否已经有从源舰船到目标舰船的路径
        const hasExistingPath = (
          startNode: Node,
          endNodeId: string,
          visited = new Set<string>()
        ): boolean => {
          // 如果当前节点已访问过，返回false避免循环
          if (visited.has(startNode.id)) return false;

          // 标记当前节点为已访问
          visited.add(startNode.id);

          // 如果找到目标节点，返回true
          if (startNode.id === endNodeId) return true;

          // 查找从当前节点出发的所有边
          const outgoingEdges = edges.filter(edge => edge.source.split('-')[1] === startNode.id.split('-')[1]);

          // 对于每条出边，递归检查是否有路径
          for (const edge of outgoingEdges) {
            const nextNode = nodes.find(node => node.id === edge.target);
            if (nextNode && hasExistingPath(nextNode, endNodeId, new Set(visited))) {
              return true;
            }
          }

          return false;
        };

        // 如果已经存在路径，则不创建新连接
        if (hasExistingPath(sourceNode, targetNode.id)) {
          // console.warn('已经存在从源舰船到目标舰船的路径，不创建重复连接');
          setAlert({
            open: true,
            message: intl.formatMessage({ id: 'ccuPlanner.error.pathExists', defaultMessage: '已经存在从源舰船到目标舰船的路径，不创建重复连接' }),
            type: 'warning'
          })
          return;
        }

        const priceDifference = targetShip.msrp - sourceShip.msrp;

        // 创建自定义边缘
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

        const hangerCcu = upgrades.find(upgrade => {
          const from = upgrade.name.split("to")[0].split("-")[1].trim().toUpperCase()
          const to = (upgrade.name.split("to")[1]).trim().split(" ").slice(0, -2).join(" ").toUpperCase()

          return from === sourceShip.name.toUpperCase() && to === targetShip.name.toUpperCase()
        })
        
        if (hangerCcu) {
          // 如果存在机库CCU，则默认使用它
          newEdge.data.sourceType = CcuSourceType.HANGER;
          newEdge.data.customPrice = hangerCcu.value;
        }
        // 如果没有机库CCU，再检查是否有WB选项
        else {
          // 检查目标船只是否有可用的WB SKU
          const targetShipSkus = ccus.find(c => c.id === targetShip.id)?.skus;
          const targetWb = targetShipSkus?.find(sku => sku.price !== targetShip.msrp && sku.available);

          // 如果存在WB SKU且WB价格大于源船只的msrp，则自动选择使用WB
          if (targetWb && sourceShip.msrp < targetWb.price) {
            // 目标船WB价格
            const targetWbPrice = targetWb.price / 100;
            // 源船官方价格
            const sourceShipPrice = sourceShip.msrp / 100;
            // 实际花费是WB价格减去源船价格
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

  // 更新边缘数据
  const updateEdgeData = useCallback(
    (sourceId: string, targetId: string, newData: Partial<CcuEdgeData>) => {
      setEdges(edges => {
        return edges.map(edge => {
          if (edge.source === sourceId && edge.target === targetId) {
            // 确保保留原始msrp差价，以便在显示时能够正确对比价格
            const originalPrice = edge.data?.price;

            return {
              ...edge,
              data: {
                ...(edge.data as CcuEdgeData),
                ...newData,
                // 保留原始价格差，除非明确要求修改
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

  // 处理节点删除
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      // 删除节点
      setNodes(nodes => nodes.filter(node => node.id !== nodeId));

      // 删除与此节点相关的所有边缘连接
      setEdges(edges => edges.filter(edge =>
        edge.source !== nodeId && edge.target !== nodeId
      ));

      // 删除相关的起点船价格
      setStartShipPrices(prev => {
        const newPrices = { ...prev };
        delete newPrices[nodeId];
        return newPrices;
      });
    },
    [setNodes, setEdges]
  );

  // 处理节点复制
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
          onDeleteNode: handleDeleteNode,
          onDuplicateNode: handleDuplicateNode,
          ccus
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [setNodes, updateEdgeData, handleDeleteNode, ccus]
  );

  // 更新节点，向其传递传入的边缘信息
  useEffect(() => {
    setNodes(nodes => {
      return nodes.map(node => {
        // 找到所有连接到此节点的边缘
        const incomingEdges = edges.filter(edge => edge.target === node.id);

        return {
          ...node,
          data: {
            ...node.data,
            incomingEdges: incomingEdges.length > 0 ? incomingEdges : node.data.incomingEdges,
            onUpdateEdge: updateEdgeData,
            onDeleteNode: handleDeleteNode,
            onDuplicateNode: handleDuplicateNode,
            id: node.id,
            ccus
          }
        };
      });
    });
  }, [edges, setNodes, updateEdgeData, handleDeleteNode, handleDuplicateNode, ccus]);

  // 处理拖放事件
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  // 导入JSON文件
  const importFlowData = useCallback((jsonData: string) => {
    try {
      const { nodes: importedNodes, edges: importedEdges, startShipPrices: importedPrices } = JSON.parse(jsonData);

      if (!importedNodes || !Array.isArray(importedNodes)) {
        throw new Error('无效的JSON格式：缺少节点数据');
      }

      // 确保导入的节点引用的舰船存在于当前舰船列表中
      const validNodes = importedNodes.filter(node => {
        const shipId = node.data?.ship?.id;
        return shipId && ships.some(s => s.id === shipId);
      });

      if (validNodes.length === 0) {
        throw new Error('没有找到有效的舰船节点');
      }

      // 确保所有边缘都有sourceType字段
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

      // 只导入有效节点的相关边
      const validNodeIds = new Set(validNodes.map(node => node.id));
      const validEdges = processedEdges.filter((edge: Edge<CcuEdgeData>) =>
        validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
      );

      setNodes(validNodes);
      setEdges(validEdges);

      if (importedPrices) {
        // 仅保留有效节点的起始价格
        const validPrices: Record<string, number | string> = {};
        Object.entries(importedPrices as Record<string, number | string>).forEach(([nodeId, price]) => {
          if (validNodeIds.has(nodeId)) {
            validPrices[nodeId] = price;
          }
        });
        setStartShipPrices(validPrices);
      }

      if (reactFlowInstance) {
        // 自动调整视图以显示所有节点
        setTimeout(() => reactFlowInstance.fitView(), 100);
      }

      return true;
    } catch (error) {
      console.error('导入JSON文件时出错:', error);
      setAlert({
        open: true,
        message: intl.formatMessage(
          { id: 'ccuPlanner.error.importFailed', defaultMessage: '导入失败: {errorMessage}' },
          { errorMessage: (error as Error).message || intl.formatMessage({ id: 'ccuPlanner.error.invalidJson', defaultMessage: '无效的JSON格式' }) }
        ),
        type: 'error'
      });
      return false;
    }
  }, [ships, setNodes, setEdges, reactFlowInstance, intl]);

  // 处理文件导入（通过按钮）
  const handleImport = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, []);

  // 处理文件选择
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

    // 重置input，以便可以重复选择相同的文件
    if (event.target) {
      event.target.value = '';
    }
  }, [importFlowData]);

  // 处理文件拖放
  const onDropFile = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();

    // 检查是否有JSON文件
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

    // 如果不是JSON文件，继续正常的舰船拖放处理
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
          onDeleteNode: handleDeleteNode,
          onDuplicateNode: handleDuplicateNode,
          ccus
        },
      };

      setNodes((nds) => nds.concat(newNode));
    }
  }, [reactFlowInstance, ships, setNodes, updateEdgeData, handleDeleteNode, handleDuplicateNode, importFlowData, ccus]);

  // 处理舰船拖动开始
  const onShipDragStart = (event: React.DragEvent<HTMLDivElement>, ship: Ship) => {
    event.dataTransfer.setData('application/shipId', ship.id.toString());
    event.dataTransfer.effectAllowed = 'move';
  };

  // 清除画布
  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setStartShipPrices({});

    localStorage.setItem('ccu-planner-data', "");
  }, [setNodes, setEdges]);

  // 保存工作流
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

  // 导出为Json
  const handleExport = useCallback(() => {
    if (!reactFlowInstance || !nodes.length) return;

    // 检查节点范围
    getRectOfNodes(nodes);

    // 导出为JSON文件
    const flowData = {
      nodes,
      edges,
      startShipPrices
    };

    const dataStr = JSON.stringify(flowData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    // 创建下载链接并触发下载
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = `ccu-planner-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(downloadLink);
    downloadLink.click();

    // 清理
    setTimeout(() => {
      URL.revokeObjectURL(url);
      document.body.removeChild(downloadLink);
    }, 100);
  }, [reactFlowInstance, nodes, edges, startShipPrices]);

  // 从localStorage加载保存的工作流
  useEffect(() => {
    const savedData = localStorage.getItem('ccu-planner-data');
    if (savedData && reactFlowInstance) {
      try {
        const { nodes: savedNodes, edges: savedEdges, startShipPrices: savedPrices } = JSON.parse(savedData);

        // 确保所有边缘都有sourceType字段
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

  useEffect(() => {
    const attribution = document.querySelector(".react-flow__attribution");
    if (attribution) {
      attribution.remove();
    }
  }, []);

  // 处理节点选择
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  // 关闭路线信息面板
  const closeRouteInfoPanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // 处理画布点击，如果点击空白区域则取消节点选择
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  return (
    <div className="h-full flex">
      <div className="w-[450px] border-r border-gray-200">
        <ShipSelector ships={ships} ccus={ccus} onDragStart={onShipDragStart} />
      </div>

      <div className="w-full h-full relative" ref={reactFlowWrapper}>
        <ReactFlowProvider>
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
            <Controls />
            <MiniMap />
            <Background color="#333" gap={32} />
            <Panel position="bottom-center">
              <Toolbar
                nodes={nodes}
                onClear={handleClear}
                onSave={handleSave}
                onExport={handleExport}
                onImport={handleImport}
              />
            </Panel>
            <Panel position="top-left" className="bg-white w-[340px] border border-gray-200 p-2">
              <Hanger ships={ships} ccus={ccus} onDragStart={onShipDragStart} />
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

      {/* 隐藏的文件输入框，用于导入JSON */}
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