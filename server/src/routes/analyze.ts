// ============================================================
// POST /api/analyze
// Fetches a Figma file tree, traverses it, and returns node stats
// ============================================================

import { Router } from 'express';
import { parseFigmaUrl } from '../figma/url-parser';
import { getFile } from '../figma/client';
import { traverseFileTree } from '../figma/traversal';
import { DEFAULT_CONFIG } from '@shared/types';
import type { NamerConfig, FigmaNode, AnalyzeResult } from '@shared/types';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { figmaUrl, figmaToken, config: configOverrides } = req.body;

    if (!figmaUrl || !figmaToken) {
      return res.status(400).json({ error: 'figmaUrl and figmaToken are required' });
    }

    // Parse URL
    const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);

    // Fetch file from Figma REST API
    const fileData = await getFile(fileKey, figmaToken, nodeId);

    // Get the root nodes to traverse
    let rootNodes: FigmaNode[];
    if (nodeId && fileData.nodes) {
      // When specific node is requested, Figma returns { nodes: { "id": { document: ... } } }
      const nodeData = fileData.nodes[nodeId];
      if (!nodeData?.document) {
        return res.status(404).json({ error: `Node ${nodeId} not found in file` });
      }
      rootNodes = [nodeData.document as FigmaNode];
    } else {
      // Full file: traverse all pages or the document children
      const doc = fileData.document;
      if (!doc?.children) {
        return res.status(404).json({ error: 'No document found in file' });
      }
      rootNodes = doc.children as FigmaNode[];
    }

    // Merge config
    const config: NamerConfig = { ...DEFAULT_CONFIG, ...configOverrides };

    // Traverse
    const nodes = traverseFileTree(rootNodes, config);

    // Compute stats
    const nodesByType: Record<string, number> = {};
    for (const node of nodes) {
      nodesByType[node.nodeType] = (nodesByType[node.nodeType] || 0) + 1;
    }

    const estimatedBatches = Math.ceil(nodes.length / config.batchSize);

    const result: AnalyzeResult = {
      totalNodes: nodes.length,
      nodesByType,
      nodes,
      estimatedBatches,
      rootName: fileData.name || 'Untitled',
    };

    res.json(result);
  } catch (err: any) {
    console.error('[analyze] Error:', err.message);
    const status = err.message?.includes('Figma API error 403') ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

export default router;
