import Graph from "graphology";

export async function loadDataset(): Promise<Graph> {
  function parseCSVRow(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') {
          current += '"';
          i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        fields.push(current);
        current = "";
      } else {
        current += ch;
      }
    }
    fields.push(current);
    return fields;
  }

  const [nodesRes, edgesRes] = await Promise.all([fetch("/data/demo-nodes.csv"), fetch("/data/demo-edges.csv")]);
  const [nodesText, edgesText] = await Promise.all([nodesRes.text(), edgesRes.text()]);

  const nodeLines = nodesText.trim().split("\n").slice(1);
  const edgeLines = edgesText.trim().split("\n").slice(1);

  // Build graph (multi to support both citation and co-authorship between same nodes)
  const graph = new Graph({ multi: true, type: "directed" });

  const nodeKeys: string[] = [];
  for (const line of nodeLines) {
    const fields = parseCSVRow(line);
    const key = String(nodeKeys.length);
    nodeKeys.push(key);

    graph.addNode(key, {
      author: fields[0],
      x: parseFloat(fields[1]),
      y: parseFloat(fields[2]),
      score: parseFloat(fields[3]),
      modularityClass: parseInt(fields[4], 10),
      label: fields[7] || fields[0],
    });
  }

  for (const line of edgeLines) {
    const [source, target, type] = line.split(",");
    if (graph.hasNode(source) && graph.hasNode(target)) {
      graph.addEdge(source, target, {
        type: type === "a" ? "coauthored" : "cites",
      });
    }
  }

  return graph;
}
