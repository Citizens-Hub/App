import { Node, Edge, ReactFlowInstance } from 'reactflow';
import { Ccu, CcuEdgeData, CcuSourceType, HangarItem, Ship, WbHistoryData } from '../../../types';

const CCU_PLANNER_STORAGE_KEY = 'ccu-planner-data';
const WORKSPACE_VERSION = 2;

export interface FlowData {
  nodes: Node[];
  edges: Edge<CcuEdgeData>[];
  startShipPrices: Record<string, number | string>;
}

export interface PlannerWorkspaceTab {
  id: string;
  name: string;
  flowData: FlowData;
  lastAutoSavedAt: number | null;
}

export interface PlannerWorkspaceData {
  version: number;
  activeTabId: string;
  tabs: PlannerWorkspaceTab[];
}

export class ImportExportService {
  private serializeFlowData(flowData: FlowData): Record<string, unknown> {
    return {
      nodes: flowData.nodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          ccus: [],
          wbHistory: [],
          hangarItems: [],
          priceHistoryMap: {},
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
          priceHistoryMap: {},
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
    };
  }

  private deserializeFlowData(
    rawFlowData: unknown,
    ships: Ship[],
    data: { hangarItems: HangarItem[]; wbHistory: WbHistoryData[]; ccus: Ccu[] },
    allowEmptyNodes: boolean
  ): FlowData | null {
    if (!rawFlowData || typeof rawFlowData !== 'object') {
      return null;
    }

    return this.importFromJsonData(
      JSON.stringify(rawFlowData),
      ships,
      data,
      { allowEmptyNodes }
    );
  }

  /**
   * Save flow data to local storage
   */
  saveToLocalStorage(flowData: FlowData): void {
    if (!flowData.nodes.length) return;

    const dataStr = JSON.stringify(this.serializeFlowData(flowData));
    localStorage.setItem(CCU_PLANNER_STORAGE_KEY, dataStr);
  }

  /**
   * Load flow data from local storage
   */
  loadFromLocalStorage(ships: Ship[], hangarItems: HangarItem[], wbHistory: WbHistoryData[], ccus: Ccu[]): FlowData | null {
    const workspace = this.loadWorkspaceFromLocalStorage(ships, hangarItems, wbHistory, ccus);
    if (!workspace) {
      return null;
    }

    const activeTab = workspace.tabs.find(tab => tab.id === workspace.activeTabId) || workspace.tabs[0];
    return activeTab?.flowData || null;
  }

  /**
   * Save workspace data (multiple tabs) to local storage
   */
  saveWorkspaceToLocalStorage(workspace: PlannerWorkspaceData): void {
    const serializedTabs = workspace.tabs.map(tab => ({
      id: tab.id,
      name: tab.name,
      flowData: this.serializeFlowData(tab.flowData),
      lastAutoSavedAt: tab.lastAutoSavedAt ?? null
    }));

    if (!serializedTabs.length) {
      localStorage.removeItem(CCU_PLANNER_STORAGE_KEY);
      return;
    }

    const resolvedActiveTabId = serializedTabs.some(tab => tab.id === workspace.activeTabId)
      ? workspace.activeTabId
      : serializedTabs[0].id;

    const payload = {
      version: WORKSPACE_VERSION,
      activeTabId: resolvedActiveTabId,
      tabs: serializedTabs
    };

    localStorage.setItem(CCU_PLANNER_STORAGE_KEY, JSON.stringify(payload));
  }

  /**
   * Load workspace data (multiple tabs) from local storage.
   * Automatically migrates legacy single-route data into one tab.
   */
  loadWorkspaceFromLocalStorage(
    ships: Ship[],
    hangarItems: HangarItem[],
    wbHistory: WbHistoryData[],
    ccus: Ccu[]
  ): PlannerWorkspaceData | null {
    const savedData = localStorage.getItem(CCU_PLANNER_STORAGE_KEY);
    if (!savedData) {
      return null;
    }

    const sharedData = { hangarItems, wbHistory, ccus };

    try {
      const parsed = JSON.parse(savedData) as {
        version?: number;
        activeTabId?: string;
        tabs?: Array<{
          id?: string;
          name?: string;
          flowData?: unknown;
          lastAutoSavedAt?: number | null;
        }>;
      };

      if (parsed && Array.isArray(parsed.tabs)) {
        const tabs = parsed.tabs
          .map((tab, index) => {
            const flowData = this.deserializeFlowData(
              tab.flowData,
              ships,
              sharedData,
              true
            );

            if (!flowData) {
              return null;
            }

            const tabId = typeof tab.id === 'string' && tab.id.trim()
              ? tab.id.trim()
              : `legacy-tab-${index + 1}`;
            const tabName = typeof tab.name === 'string' && tab.name.trim()
              ? tab.name.trim()
              : `Route ${index + 1}`;

            return {
              id: tabId,
              name: tabName,
              flowData,
              lastAutoSavedAt: typeof tab.lastAutoSavedAt === 'number' ? tab.lastAutoSavedAt : null
            };
          })
          .filter((tab): tab is PlannerWorkspaceTab => tab !== null);

        if (tabs.length) {
          const activeTabId = tabs.some(tab => tab.id === parsed.activeTabId)
            ? (parsed.activeTabId as string)
            : tabs[0].id;

          return {
            version: parsed.version || WORKSPACE_VERSION,
            activeTabId,
            tabs
          };
        }
      }
    } catch (error) {
      console.error('Error parsing workspace data, trying legacy format:', error);
    }

    const legacyFlowData = this.importFromJsonData(
      savedData,
      ships,
      sharedData,
      { allowEmptyNodes: true }
    );

    if (!legacyFlowData) {
      return null;
    }

    const legacyTabId = 'legacy-route-1';
    return {
      version: WORKSPACE_VERSION,
      activeTabId: legacyTabId,
      tabs: [
        {
          id: legacyTabId,
          name: 'Route 1',
          flowData: legacyFlowData,
          lastAutoSavedAt: null
        }
      ]
    };
  }

  /**
   * Export flow data to JSON file
   */
  exportToJsonFile(flowData: FlowData): void {
    if (!flowData.nodes.length) return;

    const dataStr = JSON.stringify(this.serializeFlowData(flowData), null, 2);
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
  importFromJsonData(
    jsonData: string,
    ships: Ship[],
    data: { hangarItems: HangarItem[]; wbHistory: WbHistoryData[]; ccus: Ccu[] },
    options?: { allowEmptyNodes?: boolean }
  ): FlowData | null {
    try {
      const { nodes: importedNodes, edges: importedEdges, startShipPrices: importedPrices } = JSON.parse(jsonData);
      const allowEmptyNodes = options?.allowEmptyNodes ?? false;

      if (!importedNodes || !Array.isArray(importedNodes)) {
        throw new Error('Invalid JSON format: missing node data');
      }

      // 确保导入的节点引用的舰船在当前舰船列表中存在
      const validNodes = importedNodes.filter(node => {
        const shipId = node.data?.ship?.id;
        return shipId && ships.some(s => s.id === shipId);
      });

      if (validNodes.length === 0 && !allowEmptyNodes) {
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
    localStorage.removeItem(CCU_PLANNER_STORAGE_KEY);
  }

  /**
   * After importing, adjust the view to show all nodes
   */
  adjustViewToShowAllNodes(reactFlowInstance: ReactFlowInstance): void {
    setTimeout(() => reactFlowInstance.fitView(), 100);
  }
}

export default ImportExportService; 
