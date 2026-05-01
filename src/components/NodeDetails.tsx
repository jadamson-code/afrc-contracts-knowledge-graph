import React from 'react';
import Graph from 'graphology';

interface NodeDetailsProps {
  graph: Graph;
  nodeId: string;
  onClose: () => void;
}

export const NodeDetails: React.FC<NodeDetailsProps> = ({
  graph,
  nodeId,
  onClose,
}) => {
  const nodeAttrs = graph.getNodeAttributes(nodeId) as any;
  const neighbors = graph.neighbors(nodeId).length;

  return (
    <div className="details-panel">
      <button className="close-button" onClick={onClose}>
        ✕
      </button>
      <h3>{nodeAttrs.label}</h3>
      <p>
        <span className="label">Type:</span> {nodeAttrs.type}
      </p>
      <p>
        <span className="label">Connections:</span> {neighbors}
      </p>
      {nodeAttrs.metadata && (
        <>
          {nodeAttrs.metadata.totalSpending && (
            <p>
              <span className="label">Total Spending:</span> $
              {((nodeAttrs.metadata.totalSpending as number) / 1000000).toFixed(1)}M
            </p>
          )}
          {nodeAttrs.metadata.contractCount && (
            <p>
              <span className="label">Contracts:</span>{' '}
              {nodeAttrs.metadata.contractCount}
            </p>
          )}
          {nodeAttrs.metadata.naicsCode && (
            <p>
              <span className="label">NAICS Code:</span>{' '}
              {nodeAttrs.metadata.naicsCode}
            </p>
          )}
          {nodeAttrs.metadata.year && (
            <p>
              <span className="label">Fiscal Year:</span>{' '}
              {nodeAttrs.metadata.year}
            </p>
          )}
        </>
      )}
    </div>
  );
};
