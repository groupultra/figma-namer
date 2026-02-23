// ============================================================
// POST /api/analyze
// Fetches a Figma file tree, optionally runs AI structure analysis,
// then returns node stats with page grouping
// ============================================================

import { Router } from 'express';
import { parseFigmaUrl } from '../figma/url-parser';
import { getFile } from '../figma/client';
import { traverseFileTree, extractNodesById } from '../figma/traversal';
import { buildCondensedTreeSummary } from '../figma/tree-summarizer';
import { buildStructureAnalysisPrompt } from '../vlm/prompt-builder';
import { callGemini } from '../vlm/gemini-client';
import { DEFAULT_CONFIG } from '@shared/types';
import type { NamerConfig, FigmaNode, AnalyzeResult, StructureAnalysis, PageInfo } from '@shared/types';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { figmaUrl, figmaToken, vlmApiKey, globalContext, config: configOverrides } = req.body;

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
      const nodeData = fileData.nodes[nodeId];
      if (!nodeData?.document) {
        return res.status(404).json({ error: `Node ${nodeId} not found in file` });
      }
      rootNodes = [nodeData.document as FigmaNode];
    } else {
      const doc = fileData.document;
      if (!doc?.children) {
        return res.status(404).json({ error: 'No document found in file' });
      }
      rootNodes = doc.children as FigmaNode[];
    }

    // Merge config
    const config: NamerConfig = { ...DEFAULT_CONFIG, ...configOverrides };

    // Determine root node ID for frame context exports
    const rootNodeId = nodeId || (rootNodes.length === 1 ? rootNodes[0].id : null);

    // ------------------------------------------------------------------
    // Try AI structure analysis if vlmApiKey is provided
    // ------------------------------------------------------------------
    let structureAnalysis: StructureAnalysis | undefined;
    let pages: PageInfo[] | undefined;

    if (vlmApiKey) {
      try {
        const analysisResult = await runStructureAnalysis(rootNodes, vlmApiKey, globalContext || '');
        structureAnalysis = analysisResult;

        // Extract nodes for each non-auxiliary page
        pages = [];
        for (const page of analysisResult.pages) {
          // Look up the page Frame node to get its absoluteBoundingBox
          const pageFrameNode = findPageNode(rootNodes, page.nodeId);
          const pageBBox = pageFrameNode?.absoluteBoundingBox ?? undefined;

          if (page.isAuxiliary) {
            pages.push({ ...page, boundingBox: pageBBox }); // Include but with empty nodes
            continue;
          }

          if (page.nodeIdsToName.length > 0) {
            // Extract specific nodes identified by AI
            const targetIds = new Set(page.nodeIdsToName);
            const pageNodes = extractNodesById(rootNodes, targetIds, config);
            pages.push({ ...page, nodes: pageNodes, boundingBox: pageBBox });
          } else {
            // Fallback: traverse the page subtree
            if (pageFrameNode) {
              const pageNodes = traverseFileTree([pageFrameNode], config);
              pages.push({
                ...page,
                nodes: pageNodes,
                nodeIdsToName: pageNodes.map(n => n.id),
                boundingBox: pageBBox,
              });
            } else {
              pages.push({ ...page, boundingBox: pageBBox });
            }
          }
        }
      } catch (err: any) {
        console.warn('[analyze] Structure analysis failed, falling back to traversal:', err.message);
        // Fall through to standard traversal
      }
    }

    // ------------------------------------------------------------------
    // Standard traversal (always run for stats, also used as fallback)
    // ------------------------------------------------------------------
    const allNodes = pages
      ? pages.flatMap(p => p.nodes)
      : traverseFileTree(rootNodes, config);

    // Compute stats
    const nodesByType: Record<string, number> = {};
    for (const node of allNodes) {
      nodesByType[node.nodeType] = (nodesByType[node.nodeType] || 0) + 1;
    }

    const estimatedBatches = Math.ceil(allNodes.length / config.batchSize);

    const result: AnalyzeResult = {
      totalNodes: allNodes.length,
      nodesByType,
      nodes: allNodes,
      estimatedBatches,
      rootName: fileData.name || 'Untitled',
      rootNodeId,
      structureAnalysis,
      pages,
      totalPages: pages?.filter(p => !p.isAuxiliary).length,
    };

    res.json(result);
  } catch (err: any) {
    console.error('[analyze] Error:', err.message);
    const status = err.message?.includes('Figma API error 403') ? 403 : 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * Run AI structure analysis using Gemini Flash (cheap, text-only).
 */
async function runStructureAnalysis(
  rootNodes: FigmaNode[],
  vlmApiKey: string,
  globalContext: string,
): Promise<StructureAnalysis> {
  // Round 0: Generate condensed tree summary
  const treeSummary = buildCondensedTreeSummary(rootNodes);
  console.log(`[analyze] Tree summary: ${treeSummary.length} chars`);

  // Round 1: Call Gemini Flash for structure analysis (text-only, no images)
  const { system, user } = buildStructureAnalysisPrompt(treeSummary, globalContext);

  const result = await callGemini(
    vlmApiKey,
    [], // No images — text-only analysis
    system,
    user,
    'gemini-3-flash-preview',
  );

  // Parse response
  let parsed: any;
  try {
    let cleaned = result.content.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting JSON object
    const objMatch = result.content.match(/\{[\s\S]*\}/);
    if (objMatch) {
      parsed = JSON.parse(objMatch[0]);
    } else {
      throw new Error('Failed to parse structure analysis response');
    }
  }

  const pages: PageInfo[] = (parsed.pages || []).map((p: any) => ({
    nodeId: p.nodeId || '',
    name: p.name || '',
    pageRole: p.pageRole || '',
    isAuxiliary: p.isAuxiliary === true,
    nodeIdsToName: Array.isArray(p.nodeIdsToName) ? p.nodeIdsToName : [],
    nodes: [], // Will be populated later
  }));

  return {
    fileType: parsed.fileType || 'unknown',
    reasoning: parsed.reasoning || '',
    pages,
    analysisModel: 'gemini-3-flash-preview',
  };
}

/**
 * Find a page node by ID in root nodes (shallow search).
 */
function findPageNode(rootNodes: FigmaNode[], nodeId: string): FigmaNode | null {
  for (const root of rootNodes) {
    if (root.id === nodeId) return root;
    if (root.children) {
      for (const child of root.children) {
        if (child.id === nodeId) return child;
      }
    }
  }
  return null;
}

export default router;
