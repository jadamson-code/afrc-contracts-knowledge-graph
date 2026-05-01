/**
 * Transform contract data into Graphology graph format
 * Usage: npm run transform-data
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';
import { GraphBuilder } from '../src/services/graphBuilder';

const RAW_DATA_DIR = './data/raw';
const PROCESSED_DATA_DIR = './data/processed';

function findLatestDataFile(): string | null {
  try {
    const files = readdirSync(RAW_DATA_DIR)
      .filter((f) => f.startsWith('contracts_') && f.endsWith('.json'))
      .sort()
      .reverse();

    return files.length > 0 ? join(RAW_DATA_DIR, files[0]) : null;
  } catch {
    return null;
  }
}

async function main() {
  try {
    console.log('🔄 Transforming contract data to graph format...');

    // Find latest data file
    const dataFile = findLatestDataFile();
    if (!dataFile) {
      console.error('❌ No contract data found. Run: npm run fetch-data');
      process.exit(1);
    }

    console.log(`📖 Loading ${dataFile}`);
    const rawData = JSON.parse(readFileSync(dataFile, 'utf-8'));

    // Normalize and build graph
    const contracts = GraphBuilder.normalizeAwards(rawData);
    const graph = GraphBuilder.buildGraph(contracts);

    console.log(
      `✅ Built graph with ${graph.order} nodes and ${graph.size} edges`
    );

    // Save graph data
    mkdirSync(PROCESSED_DATA_DIR, { recursive: true });
    const graphFile = join(
      PROCESSED_DATA_DIR,
      `graph_${new Date().toISOString().split('T')[0]}.json`
    );
    const graphJSON = GraphBuilder.graphToJSON(graph);
    writeFileSync(graphFile, graphJSON);
    console.log(`💾 Saved to ${graphFile}`);

    // Print stats
    const contractorNodes = graph
      .nodes()
      .filter((n) => (graph.getNodeAttributes(n) as any).type === 'contractor');
    const totalSpending = contractorNodes.reduce((sum, nodeId) => {
      const attrs = graph.getNodeAttributes(nodeId) as any;
      return sum + ((attrs.metadata?.totalSpending as number) || 0);
    }, 0);

    console.log('\n📊 Graph Statistics:');
    console.log(`   Total Nodes: ${graph.order}`);
    console.log(`   Total Edges: ${graph.size}`);
    console.log(`   Contractors: ${contractorNodes.length}`);
    console.log(`   Total Spending: $${(totalSpending / 1000000).toFixed(1)}M`);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
