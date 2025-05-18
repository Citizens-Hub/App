import { Node, Edge, ReactFlowInstance } from 'reactflow';
import { CcuEdgeData, CcuSourceType, Ship } from '../../../types';

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

    const dataStr = JSON.stringify(flowData);
    localStorage.setItem('ccu-planner-data', dataStr);
  }

  /**
   * Load flow data from local storage
   */
  loadFromLocalStorage(): FlowData | null {
    const savedData = localStorage.getItem('ccu-planner-data');
    if (!savedData) return null;

    try {
      const { nodes, edges, startShipPrices } = JSON.parse(savedData);

      const processedEdges = edges?.map((edge: Edge<CcuEdgeData>) => {
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

      return {
        nodes: nodes || [],
        edges: processedEdges,
        startShipPrices: startShipPrices || {}
      };
    } catch (error) {
      console.error('Error loading saved CCU paths:', error);
      return null;
    }
  }

  /**
   * Export flow data to JSON file
   */
  exportToJsonFile(flowData: FlowData): void {
    if (!flowData.nodes.length) return;

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
  }

  /**
   * Import flow data from JSON data
   */
  importFromJsonData(jsonData: string, ships: Ship[]): FlowData | null {
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

      if (importedPrices) {
        // Only keep the starting price for valid nodes
        const validPrices: Record<string, number | string> = {};
        Object.entries(importedPrices as Record<string, number | string>).forEach(([nodeId, price]) => {
          if (validNodeIds.has(nodeId)) {
            validPrices[nodeId] = price;
          }
        });
        
        return {
          nodes: validNodes,
          edges: validEdges,
          startShipPrices: validPrices
        };
      }

      return {
        nodes: validNodes,
        edges: validEdges,
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