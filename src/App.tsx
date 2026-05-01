import React, { useState, useEffect, useMemo } from 'react';
import Graph from 'graphology';
import { ContractData, FilterState, Award } from './types';
import { GraphComponent } from './components/Graph';
import { Controls } from './components/Controls';
import { NodeDetails } from './components/NodeDetails';
import { DataToggle } from './components/DataToggle';
import { GraphBuilder } from './services/graphBuilder';
import { FilterService } from './services/filters';
import { usaspendingClient } from './services/usaspending';
import { getMockAwards } from './services/mockData';

const App: React.FC = () => {
  const [graph, setGraph] = useState<Graph | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contracts, setContracts] = useState<ContractData[]>([]);
  const [filteredGraph, setFilteredGraph] = useState<Graph | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [useMockData, setUseMockData] = useState(
    import.meta.env.VITE_USE_MOCK_DATA === 'true' || true
  );
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [filters, setFilters] = useState<Partial<FilterState>>({
    minValue: 0,
    maxValue: 999999999,
  });

  // Load graph data
  useEffect(() => {
    const loadGraph = async () => {
      try {
        setLoading(true);
        setError(null);
        setIsDataLoading(true);

        let awards: Award[] = [];

        if (useMockData) {
          console.log('Loading mock data...');
          awards = getMockAwards();
        } else {
          console.log('Fetching from USAspending API...');
          const fiscalYears = [
            ...(import.meta.env.VITE_FISCAL_YEARS || '2024,2025')
              .split(',')
              .map((y) => parseInt(y)),
          ];
          awards = await usaspendingClient.getAllAwards({
            fiscalYears,
            maxPages: 5,
          });
        }

        console.log(`Loaded ${awards.length} awards`);

        // Transform to contracts
        const normalizedContracts = GraphBuilder.normalizeAwards(awards);
        setContracts(normalizedContracts);

        // Build graph
        const newGraph = GraphBuilder.buildGraph(normalizedContracts);
        setGraph(newGraph);
        setFilteredGraph(newGraph);
        setSelectedNode(null);

        console.log(
          `Graph built: ${newGraph.order} nodes, ${newGraph.size} edges`
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Failed to load graph';
        setError(message);
        console.error('Error loading graph:', err);
      } finally {
        setLoading(false);
        setIsDataLoading(false);
      }
    };

    loadGraph();
  }, [useMockData]);

  // Apply filters to graph
  useEffect(() => {
    if (!graph || contracts.length === 0) return;

    const filtered = FilterService.filterContracts(contracts, filters);

    if (filtered.length === 0) {
      setFilteredGraph(graph);
      return;
    }

    const filteredGraph = GraphBuilder.buildGraph(filtered);
    setFilteredGraph(filteredGraph);
  }, [filters, graph, contracts]);

  const handleFilterChange = (newFilters: Partial<FilterState>) => {
    setFilters({ ...filters, ...newFilters });
    setSelectedNode(null);
  };

  const handleNodeSelect = (nodeId: string) => {
    setSelectedNode(nodeId);
  };

  const handleDataToggle = (use: boolean) => {
    setUseMockData(use);
  };

  if (error) {
    return (
      <>
        <div className="header">
          <div>
            <h1>🛩️ AFRC Contracts Knowledge Graph</h1>
            <p>Air Force Reserve Component Procurement Visualization</p>
          </div>
          <DataToggle
            useMockData={useMockData}
            onToggle={handleDataToggle}
            isLoading={isDataLoading}
          />
        </div>
        <div className="app-container">
          <div className="loading">
            <span>❌ Error: {error}</span>
            <button
              className="button"
              onClick={() => setUseMockData(!useMockData)}
              style={{ width: 'auto', paddingLeft: '16px', paddingRight: '16px' }}
            >
              Try {useMockData ? 'Live API' : 'Mock Data'}
            </button>
          </div>
        </div>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <div className="header">
          <div>
            <h1>🛩️ AFRC Contracts Knowledge Graph</h1>
            <p>Air Force Reserve Component Procurement Visualization</p>
          </div>
          <DataToggle
            useMockData={useMockData}
            onToggle={handleDataToggle}
            isLoading={isDataLoading}
          />
        </div>
        <div className="app-container">
          <div className="loading">
            <div className="spinner"></div>
            <span>
              {useMockData
                ? 'Loading mock data...'
                : 'Fetching AFRC contracts from USAspending...'}
            </span>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="header">
        <div className="header-left">
          <div>
            <h1>🛩️ AFRC Contracts Knowledge Graph</h1>
            <p>Air Force Reserve Component Procurement Visualization</p>
          </div>
        </div>
        <DataToggle
          useMockData={useMockData}
          onToggle={handleDataToggle}
          isLoading={isDataLoading}
        />
      </div>
      <div className="app-container">
        <div className="graph-container">
          {filteredGraph && (
            <GraphComponent
              graph={filteredGraph}
              onNodeSelect={handleNodeSelect}
              selectedNode={selectedNode}
            />
          )}
        </div>
        <div className="controls-sidebar">
          <Controls onFilterChange={handleFilterChange} graph={filteredGraph} />
        </div>
      </div>
      {selectedNode && filteredGraph && (
        <NodeDetails
          graph={filteredGraph}
          nodeId={selectedNode}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </>
  );
};

export default App;
