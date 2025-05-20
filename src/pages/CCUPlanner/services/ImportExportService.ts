import { Node, Edge, ReactFlowInstance } from 'reactflow';
import { Ccu, CcuEdgeData, CcuSourceType, HangarItem, Ship, WbHistoryData } from '../../../types';

interface FlowData {
  nodes: Node[];
  edges: Edge<CcuEdgeData>[];
  startShipPrices: Record<string, number | string>;
}

export class ImportExportService {
  /**
   * Save flow data to local storage
   */
  saveToLocalStorage(flowData: FlowData): void {
    if (!flowData.nodes.length) return;

    const dataStr = JSON.stringify({
      nodes: flowData.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          ccus: [],
          wbHistory: [],
          hangarItems: [],
          ship: {
            id: node.data.ship.id,
            name: node.data.ship.name
          },
          incomingEdges: {
            id: node.data.incomingEdges?.id,
            name: node.data.incomingEdges?.name
          },
          outgoingEdges: {
            id: node.data.outgoingEdges?.id,
            name: node.data.outgoingEdges?.name
          }
        },
        position: {
          x: Math.round(node.position.x),
          y: Math.round(node.position.y)
        },
        positionAbsolute: {
          x: Math.round(node.positionAbsolute?.x || 0),
          y: Math.round(node.positionAbsolute?.y || 0)
        }
      })),
      edges: flowData.edges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
          ccus: [],
          wbHistory: [],
          hangarItems: [],
          sourceShip: {
            id: edge.data?.sourceShip?.id,
            name: edge.data?.sourceShip?.name
          },
          targetShip: {
            id: edge.data?.targetShip?.id,
            name: edge.data?.targetShip?.name
          }
        }
      })),
      startShipPrices: flowData.startShipPrices
    });

    localStorage.setItem('ccu-planner-data', dataStr);
  }

  /**
   * Load flow data from local storage
   */
  loadFromLocalStorage(ships: Ship[], hangarItems: HangarItem[], wbHistory: WbHistoryData[], ccus: Ccu[]): FlowData | null {
    const savedData = localStorage.getItem('ccu-planner-data');
    if (!savedData) return null;

    return this.importFromJsonData(savedData, ships, { hangarItems, wbHistory, ccus });
  }

  /**
   * Export flow data to JSON file
   */
  exportToJsonFile(flowData: FlowData): void {
    if (!flowData.nodes.length) return;

    const dataStr = JSON.stringify({
      nodes: flowData.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          ccus: [],
          wbHistory: [],
          hangarItems: [],
          ship: {
            id: node.data.ship.id,
            name: node.data.ship.name
          },
          incomingEdges: {
            id: node.data.incomingEdges?.id,
            name: node.data.incomingEdges?.name
          },
          outgoingEdges: {
            id: node.data.outgoingEdges?.id,
            name: node.data.outgoingEdges?.name
          }
        },
        position: {
          x: Math.round(node.position.x),
          y: Math.round(node.position.y)
        },
        positionAbsolute: {
          x: Math.round(node.positionAbsolute?.x || 0),
          y: Math.round(node.positionAbsolute?.y || 0)
        }
      })),
      edges: flowData.edges.map(edge => ({
        ...edge,
        data: {
          ...edge.data,
          ccus: [],
          wbHistory: [],
          hangarItems: [],
          sourceShip: {
            id: edge.data?.sourceShip?.id,
            name: edge.data?.sourceShip?.name
          },
          targetShip: {
            id: edge.data?.targetShip?.id,
            name: edge.data?.targetShip?.name
          }
        }
      })),
      startShipPrices: flowData.startShipPrices
    }, null, 2);
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
  }

  /**
   * Import flow data from JSON data
   */
  importFromJsonData(jsonData: string, ships: Ship[], data: { hangarItems: HangarItem[], wbHistory: WbHistoryData[], ccus: Ccu[] }): FlowData | null {
    try {
      const { nodes: importedNodes, edges: importedEdges, startShipPrices: importedPrices } = JSON.parse(jsonData);

      if (!importedNodes || !Array.isArray(importedNodes)) {
        throw new Error('Invalid JSON format: missing node data');
      }

      // 确保导入的节点引用的舰船在当前舰船列表中存在
      const validNodes = importedNodes.filter(node => {
        const shipId = node.data?.ship?.id;
        return shipId && ships.some(s => s.id === shipId);
      });

      if (validNodes.length === 0) {
        throw new Error('No valid ship nodes found');
      }

      // 更新节点数据，确保包含最新的舰船信息
      const updatedNodes = validNodes.map(node => {
        const currentShip = ships.find(s => s.id === node.data.ship.id);
        if (currentShip) {
          return {
            ...node,
            data: {
              ...node.data,
              ship: currentShip,
              ccus: data.ccus,
              wbHistory: data.wbHistory,
              hangarItems: data.hangarItems
            }
          };
        }
        return node;
      });

      // 确保所有边都有sourceType字段
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

      // 只导入与有效节点相关的边
      const validNodeIds = new Set(updatedNodes.map(node => node.id));
      const validEdges = processedEdges.filter((edge: Edge<CcuEdgeData>) =>
        validNodeIds.has(edge.source) && validNodeIds.has(edge.target)
      );

      // 更新边的数据，确保包含最新的价格信息
      const updatedEdges = validEdges.map((edge: Edge<CcuEdgeData>) => {
        const sourceNode = updatedNodes.find(n => n.id === edge.source);
        const targetNode = updatedNodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode && edge.data) {
          return {
            ...edge,
            data: {
              ...edge.data,
              sourceShip: sourceNode.data.ship,
              targetShip: targetNode.data.ship,
              ccus: data.ccus,
              wbHistory: data.wbHistory,
              hangarItems: data.hangarItems
            }
          };
        }
        return edge;
      });

      if (importedPrices) {
        const validPrices: Record<string, number | string> = {};
        Object.entries(importedPrices as Record<string, number | string>).forEach(([nodeId, price]) => {
          if (validNodeIds.has(nodeId)) {
            validPrices[nodeId] = price;
          }
        });
        
        return {
          nodes: updatedNodes,
          edges: updatedEdges,
          startShipPrices: validPrices
        };
      }

      return {
        nodes: updatedNodes,
        edges: updatedEdges,
        startShipPrices: {}
      };
    } catch (error) {
      console.error('Error importing JSON file:', error);
      return null;
    }
  }

  /**
   * Clear flow data
   */
  clearFlowData(): void {
    localStorage.setItem('ccu-planner-data', '');
  }

  /**
   * After importing, adjust the view to show all nodes
   */
  adjustViewToShowAllNodes(reactFlowInstance: ReactFlowInstance): void {
    setTimeout(() => reactFlowInstance.fitView(), 100);
  }
}

export default ImportExportService; 