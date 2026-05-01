import React, { useState, useMemo } from 'react';
import Graph from 'graphology';
import { FilterState } from '../types';
import { FilterService } from '../services/filters';

interface ControlsProps {
  onFilterChange: (filters: Partial<FilterState>) => void;
  graph: Graph | null;
}

export const Controls: React.FC<ControlsProps> = ({ onFilterChange, graph }) => {
  const [contractorName, setContractorName] = useState('');
  const [minValue, setMinValue] = useState('0');
  const [maxValue, setMaxValue] = useState('999999999');

  const handleApplyFilters = () => {
    onFilterChange({
      contractorName,
      minValue: parseInt(minValue),
      maxValue: parseInt(maxValue),
    });
  };

  const stats = useMemo(
    () => (graph ? FilterService.getGraphStats(graph) : null),
    [graph]
  );
  const topContractors = useMemo(
    () => (graph ? FilterService.getTopContractors(graph, 5) : []),
    [graph]
  );

  return (
    <>
      <div className="controls-section">
        <h3>📊 Statistics</h3>
        <div className="stats-box">
          <p>Total Contractors</p>
          <div className="value">{stats?.contractorCount || 0}</div>
        </div>
        <div className="stats-box">
          <p>Total Contracts</p>
          <div className="value">{stats?.totalContracts || 0}</div>
        </div>
        <div className="stats-box">
          <p>Total Spending</p>
          <div className="value">
            ${((stats?.totalSpending || 0) / 1000000).toFixed(1)}M
          </div>
        </div>
      </div>

      <div className="controls-section">
        <h3>🔍 Filters</h3>
        <div className="control-group">
          <label>Contractor Name</label>
          <input
            type="text"
            value={contractorName}
            onChange={(e) => setContractorName(e.target.value)}
            placeholder="Search..."
          />
        </div>
        <div className="control-group">
          <label>Min Value ($)</label>
          <input
            type="number"
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
          />
        </div>
        <div className="control-group">
          <label>Max Value ($)</label>
          <input
            type="number"
            value={maxValue}
            onChange={(e) => setMaxValue(e.target.value)}
          />
        </div>
        <button className="button" onClick={handleApplyFilters}>
          Apply Filters
        </button>
      </div>

      <div className="controls-section">
        <h3>🏆 Top Contractors</h3>
        {topContractors.length === 0 ? (
          <p style={{ fontSize: '12px', color: '#999' }}>No data</p>
        ) : (
          topContractors.map((contractor) => (
            <div key={contractor.id} className="stats-box">
              <p>{contractor.label}</p>
              <p className="value">${(contractor.spending / 1000000).toFixed(1)}M</p>
            </div>
          ))
        )}
      </div>
    </>
  );
};
