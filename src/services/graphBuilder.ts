/**
 * Graph Builder Service
 * Transforms USAspending API data into Graphology graph format
 */

import Graph from 'graphology';
import { Award, ContractData } from '../types';
import { scaleLinear } from 'd3-scale';

const NAICS_COLORS: Record<string, string> = {
  '541330': '#FF6B6B', // Engineering services - Red
  '541512': '#4ECDC4', // Computer systems - Teal
  '423810': '#45B7D1', // Construction materials - Blue
  '561210': '#96CEB4', // Security services - Green
  '611310': '#FFEAA7', // Technical training - Yellow
  '811310': '#DDA15E', // Aircraft maintenance - Brown
  '336411': '#BC6C25', // Aircraft parts - Dark brown
  '336414': '#D4A574', // Guided missiles - Tan
  '334511': '#8E7DB3', // Search and detection - Purple
  '334220': '#F4A261', // Radio/TV broadcasting - Orange
  '336412': '#2A9D8F', // Aircraft engine - Teal green
  '541380': '#E9C46A', // Testing - Light yellow
  '561210': '#F07167', // Facilities - Light red
};

const DEFAULT_COLOR = '#A8DADC';

export class GraphBuilder {
  /**
   * Transform award data into normalized contract data
   */
  static normalizeAwards(awards: Award[]): ContractData[] {
    return awards.map((award) => {
      const date = new Date(award.action_date);
      const fiscalYear =
        date.getMonth() >= 9 ? date.getFullYear() + 1 : date.getFullYear();

      return {
        id: award.generated_unique_award_id,
        contractorName: award.recipient_name,
        contractorId: award.recipient_unique_id || award.recipient_id,
        awardValue: award.federal_action_obligation,
        actionDate: award.action_date,
        fiscalYear,
        naicsCode: award.naics_code,
        naicsDescription: award.naics_description,
        pscCode: award.psc_code,
        pscDescription: award.psc_description,
        actionType: award.action_type,
        description: award.description,
        businessTypes: award.business_types,
      };
    });
  }

  /**
   * Build a graphology graph from contract data
   */
  static buildGraph(contracts: ContractData[]): Graph {
    const graph = new Graph();

    if (contracts.length === 0) {
      return graph;
    }

    // Calculate statistics for node sizing
    const contractorSpending = this.aggregateByContractor(contracts);
    const maxSpending = Math.max(...Object.values(contractorSpending));
    const sizeScale = scaleLinear()
      .domain([0, maxSpending])
      .range([15, 50]);

    const naicsSpending = this.aggregateByNAICS(contracts);
    const maxNAICSSpending = Math.max(...Object.values(naicsSpending));
    const naicsSizeScale = scaleLinear()
      .domain([0, maxNAICSSpending])
      .range([12, 35]);

    // Add contractor nodes
    Object.entries(contractorSpending).forEach(([name, spending]) => {
      const count = contracts.filter(
        (c) => c.contractorName === name
      ).length;

      graph.addNode(name, {
        label: name,
        type: 'contractor',
        size: sizeScale(spending),
        color: '#0052cc',
        x: Math.random() * 100,
        y: Math.random() * 100,
        metadata: {
          totalSpending: spending,
          contractCount: count,
          isContractor: true,
        },
      } as any);
    });

    // Add NAICS (industry) nodes
    Object.entries(naicsSpending).forEach(([code, spending]) => {
      const naicsInfo = contracts.find((c) => c.naicsCode === code);
      const count = contracts.filter((c) => c.naicsCode === code).length;
      const nodeId = `naics_${code}`;

      graph.addNode(nodeId, {
        label: naicsInfo?.naicsDescription || `NAICS ${code}`,
        type: 'naics',
        size: naicsSizeScale(spending),
        color: NAICS_COLORS[code] || DEFAULT_COLOR,
        x: Math.random() * 100,
        y: Math.random() * 100,
        metadata: {
          naicsCode: code,
          totalSpending: spending,
          contractCount: count,
        },
      } as any);
    });

    // Add fiscal year nodes
    const years = new Set(contracts.map((c) => c.fiscalYear));
    const yearSpending: Record<number, number> = {};
    years.forEach((year) => {
      const yearContracts = contracts.filter((c) => c.fiscalYear === year);
      yearSpending[year] = yearContracts.reduce(
        (sum, c) => sum + c.awardValue,
        0
      );

      graph.addNode(`year_${year}`, {
        label: `FY${year}`,
        type: 'period',
        size: 18,
        color: '#E8E8E8',
        x: Math.random() * 100,
        y: Math.random() * 100,
        metadata: {
          year,
          totalSpending: yearSpending[year],
          contractCount: yearContracts.length,
        },
      } as any);
    });

    // Add edges: Contractor -> NAICS
    const addedEdges = new Set<string>();
    contracts.forEach((contract) => {
      const edgeKey = `${contract.contractorName}|naics_${contract.naicsCode}`;

      if (!addedEdges.has(edgeKey)) {
        graph.addEdge(contract.contractorName, `naics_${contract.naicsCode}`, {
          type: 'classified_as',
          weight: 1,
          value: contract.awardValue,
        } as any);
        addedEdges.add(edgeKey);
      }
    });

    // Add edges: Contractor -> Fiscal Year
    contracts.forEach((contract) => {
      const edgeKey = `${contract.contractorName}|year_${contract.fiscalYear}`;

      if (!addedEdges.has(edgeKey)) {
        graph.addEdge(contract.contractorName, `year_${contract.fiscalYear}`, {
          type: 'funded_by',
          weight: 1,
          value: contract.awardValue,
        } as any);
        addedEdges.add(edgeKey);
      }
    });

    return graph;
  }

  /**
   * Aggregate spending by contractor
   */
  private static aggregateByContractor(
    contracts: ContractData[]
  ): Record<string, number> {
    return contracts.reduce(
      (acc, contract) => {
        acc[contract.contractorName] =
          (acc[contract.contractorName] || 0) + contract.awardValue;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Aggregate spending by NAICS code
   */
  private static aggregateByNAICS(
    contracts: ContractData[]
  ): Record<string, number> {
    return contracts.reduce(
      (acc, contract) => {
        acc[contract.naicsCode] =
          (acc[contract.naicsCode] || 0) + contract.awardValue;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  /**
   * Export graph as JSON for caching
   */
  static graphToJSON(graph: Graph) {
    return JSON.stringify({
      nodes: graph.nodes().map((nodeId) => ({
        id: nodeId,
        ...graph.getNodeAttributes(nodeId),
      })),
      edges: graph.edges().map((edgeId) => {
        const [source, target] = graph.extremities(edgeId);
        return {
          id: edgeId,
          source,
          target,
          ...graph.getEdgeAttributes(edgeId),
        };
      }),
    });
  }
}
