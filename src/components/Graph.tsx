import React, { useEffect, useRef, useState } from 'react';
import Graph from 'graphology';
import Sigma from 'sigma';
import { EdgeCurveProgram } from '@sigma/edge-curve';
import FA2Layout from 'graphology-layout-forceatlas2';

interface GraphComponentProps {
  graph: Graph;
  onNodeSelect: (nodeId: string) => void;
  selectedNode: string | null;
}

export const GraphComponent: React.FC<GraphComponentProps> = ({
  graph,
  onNodeSelect,
  selectedNode,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const [isLayouting, setIsLayouting] = useState(true);

  useEffect(() => {
    if (!containerRef.current || graph.order === 0) return;

    // Run ForceAtlas2 layout
    setIsLayouting(true);
    const settings = FA2Layout.inferSettings(graph);
    const iterations = parseInt(import.meta.env.VITE_LAYOUT_ITERATIONS || '50');
    FA2Layout.assign(graph, { iterations, settings });
    setIsLayouting(false);

    // Initialize Sigma
    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: true,
      renderEdgeLabels: false,
      defaultEdgeType: 'curved',
      edgeProgramClasses: {
        curved: EdgeCurveProgram,
      },
      defaultNodeColor: '#0052cc',
    });

    sigmaRef.current = sigma;

    // Handle node clicks
    sigma.on('clickNode', ({ node }) => {
      onNodeSelect(node);
    });

    // Highlight selected node with zoom
    if (selectedNode) {
      const nodePosition = graph.getNodeAttributes(selectedNode);
      sigma.getCamera().animate(
        {
          x: nodePosition.x,
          y: nodePosition.y,
          ratio: 0.5,
        },
        {
          duration: 600,
        }
      );
    }

    return () => {
      sigma.kill();
    };
  }, [graph, selectedNode, onNodeSelect]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      {isLayouting && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 50,
            background: 'rgba(255, 255, 255, 0.95)',
            padding: '24px 32px',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          }}
        >
          <div className="loading">
            <div className="spinner"></div>
            <span>Computing graph layout...</span>
          </div>
        </div>
      )}
    </div>
  );
};
