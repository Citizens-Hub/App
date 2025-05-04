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
} from 'reactflow';
import 'reactflow/dist/style.css';

import { Ship, CcuSourceType, CcuEdgeData } from '../../../types';
import ShipNode from './ShipNode';
import CcuEdge from './CcuEdge';
import ShipSelector from './ShipSelector';
import Toolbar from './Toolbar';
import RouteInfoPanel from './RouteInfoPanel';

const nodeTypes: NodeTypes = {
  ship: ShipNode,
};

const edgeTypes: EdgeTypes = {
  ccu: CcuEdge,
};

interface CcuCanvasProps {
  ships: Ship[];
}

export default function CcuCanvas({ ships }: CcuCanvasProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // 处理连接创建
  const onConnect = useCallback(
    (connection: Connection) => {
      const sourceNode = nodes.find((node) => node.id === connection.source);
      const targetNode = nodes.find((node) => node.id === connection.target);
      
      if (sourceNode && targetNode) {
        const sourceShip = (sourceNode.data?.ship as Ship);
        const targetShip = (targetNode.data?.ship as Ship);
        
        // 确保源船舶价格低于目标船舶价格
        if (sourceShip.msrp >= targetShip.msrp) {
          console.warn('CCU只能从低价船升级到高价船');
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
        
        setEdges((eds) => addEdge(newEdge, eds));
      }
    },
    [nodes, setEdges]
  );

  // 更新边缘数据
  const updateEdgeData = useCallback(
    (sourceId: string, targetId: string, newData: Partial<CcuEdgeData>) => {
      setEdges(edges => {
        return edges.map(edge => {
          if (edge.source === sourceId && edge.target === targetId) {
            return {
              ...edge,
              data: {
                ...(edge.data as CcuEdgeData),
                ...newData
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
    },
    [setNodes, setEdges]
  );

  // 更新节点，向其传递传入的边缘信息
  useEffect(() => {
    setNodes(nodes => {
      return nodes.map(node => {
        // 找到所有连接到此节点的边缘
        const incomingEdges = edges.filter(edge => edge.target === node.id);
        
        if (incomingEdges.length > 0) {
          return {
            ...node,
            data: {
              ...node.data,
              incomingEdges,
              onUpdateEdge: updateEdgeData,
              onDeleteNode: handleDeleteNode,
              id: node.id
            }
          };
        }
        return node;
      });
    });
  }, [edges, setNodes, updateEdgeData, handleDeleteNode]);

  // 处理拖放事件
  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const shipId = event.dataTransfer.getData('application/shipId');
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
          onDeleteNode: handleDeleteNode
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, ships, setNodes, updateEdgeData, handleDeleteNode]
  );

  // 处理船舶拖动开始
  const onShipDragStart = (event: React.DragEvent<HTMLDivElement>, ship: Ship) => {
    event.dataTransfer.setData('application/shipId', ship.id.toString());
    event.dataTransfer.effectAllowed = 'move';
  };

  // 清除画布
  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);

    localStorage.setItem('ccu-planner-data', "");
  }, [setNodes, setEdges]);

  // 保存工作流
  const handleSave = useCallback(() => {
    if (!nodes.length) return;

    const flowData = {
      nodes,
      edges,
    };

    const dataStr = JSON.stringify(flowData);
    localStorage.setItem('ccu-planner-data', dataStr);

    alert('CCU 升级路径已保存！');
  }, [nodes, edges]);

  // 导出为图片
  const handleExport = useCallback(() => {
    if (!reactFlowInstance || !nodes.length) return;

    // 检查节点范围
    getRectOfNodes(nodes);
    
    // 这里应该使用html-to-image或dom-to-image库进行实际导出
    // 由于未安装这些库，这里只是提供概念实现
    alert('导出功能需要安装额外的库。请安装html-to-image或dom-to-image库。');
  }, [reactFlowInstance, nodes]);

  // 从localStorage加载保存的工作流
  useEffect(() => {
    const savedData = localStorage.getItem('ccu-planner-data');
    if (savedData && reactFlowInstance) {
      try {
        const { nodes: savedNodes, edges: savedEdges } = JSON.parse(savedData);
        
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
  const onNodeClick = useCallback((event: React.MouseEvent, node: Node) => {
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
        <ShipSelector ships={ships} onDragStart={onShipDragStart} />
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
            onDrop={onDrop}
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
              />
            </Panel>
          </ReactFlow>
          
          {selectedNode && (
            <RouteInfoPanel
              selectedNode={selectedNode}
              edges={edges}
              nodes={nodes}
              onClose={closeRouteInfoPanel}
            />
          )}
        </ReactFlowProvider>
      </div>
    </div>
  );
} 