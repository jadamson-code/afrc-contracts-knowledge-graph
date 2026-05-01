/**
 * Filter and query utilities for contract data
 */

import Graph from 'graphology';
import { ContractData, FilterState } from '../types';

export class FilterService {
  /**
   * Filter contracts based on filter state
   */
  static filterContracts(
    contracts: ContractData[],
    filters: Partial<FilterState>
  ): ContractData[] {
    return contracts.filter((contract) => {
      // Contractor name filter
      if (
        filters.contractorName &&
        !contract.contractorName
          .toLowerCase()
          .includes(filters.contractorName.toLowerCase())
      ) {
        return false;
      }

      // Award value range
      if (
        filters.minValue !== undefined &&
        contract.awardValue < filters.minValue
      ) {
        return false;
      }
      if (
        filters.maxValue !== undefined &&
        contract.awardValue > filters.maxValue
      ) {
        return false;
      }

      // NAICS code filter
      if (
        filters.naicsCode &&
        !contract.naicsCode.startsWith(filters.naicsCode)
      ) {
        return false;
      }

      // Fiscal year filter
      if (
        filters.fiscalYear &&
        contract.fiscalYear !== filters.fiscalYear
      ) {
        return false;
      }

      // Action type filter
      if (
        filters.actionType &&
        contract.actionType !== filters.actionType
      ) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get connected subgraph for a given node
   */
  static getNodeNeighborhood(
    graph: Graph,
    nodeId: string,
    depth: number = 1
  ): Set<string> {
    const neighborhood = new Set<string>();
    const queue: [string, number][] = [[nodeId, 0]];

    while (queue.length > 0) {
      const [currentNode, currentDepth] = queue.shift()!;
      neighborhood.add(currentNode);

      if (currentDepth < depth) {
        // Add neighbors
        graph.neighbors(currentNode).forEach((neighbor) => {
          if (!neighborhood.has(neighbor)) {
            queue.push([neighbor, currentDepth + 1]);
          }
        });
      }
    }

    return neighborhood;
  }

  /**
   * Get top contractors by spending
   */
  static getTopContractors(
    graph: Graph,
    limit: number = 10
  ): Array<{ id: string; label: string; spending: number }> {
    const contractors = graph
      .nodes()
      .filter((nodeId) => {
        const attrs = graph.getNodeAttributes(nodeId);
        return (attrs as any).type === 'contractor';
      })
      .map((nodeId) => {
        const attrs = graph.getNodeAttributes(nodeId) as any;
        return {
          id: nodeId,
          label: attrs.label,
          spending: (attrs.metadata?.totalSpending as number) || 0,
        };
      })
      .sort((a, b) => b.spending - a.spending)
      .slice(0, limit);

    return contractors;
  }

  /**
   * Calculate graph statistics
   */
  static getGraphStats(graph: Graph) {
    const nodes = graph.nodes();
    const edges = graph.edges();

    const contractorNodes = nodes.filter((n) => {
      const attrs = graph.getNodeAttributes(n) as any;
      return attrs.type === 'contractor';
    });

    const totalSpending = contractorNodes.reduce((sum, nodeId) => {
      const attrs = graph.getNodeAttributes(nodeId) as any;
      return sum + ((attrs.metadata?.totalSpending as number) || 0);
    }, 0);

    const totalContracts = contractorNodes.reduce((sum, nodeId) => {
      const attrs = graph.getNodeAttributes(nodeId) as any;
      return sum + ((attrs.metadata?.contractCount as number) || 0);
    }, 0);

    return {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      contractorCount: contractorNodes.length,
      totalSpending,
      totalContracts,
      averageContractorSpending: totalSpending / contractorNodes.length,
      density: contractorNodes.length > 1 ? (2 * edges.length) / (nodes.length * (nodes.length - 1)) : 0,
    };
  }
}
