// ============================================================
// POST /api/name
// Starts the batch naming process
// ============================================================

import { Router } from 'express';
import type { NodeMetadata, NamingResult, SoMLabel } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';
import { createSession, emitProgress } from '../session/manager';
import { exportNodeImage } from '../figma/image-export';
import { renderSoMImage } from '../som/renderer';
import { buildSystemPrompt, buildUserPrompt, type NodeSupplement } from '../vlm/prompt-builder';
import { callClaude, type ClaudeModel } from '../vlm/claude-client';
import { callOpenAI } from '../vlm/openai-client';
import { callGemini, type GeminiModel } from '../vlm/gemini-client';

const router = Router();

/** Parse VLM response JSON to extract namings */
function parseNamingResponse(content: string, expectedMarkIds: number[]): Array<{ markId: number; name: string; confidence: number }> {
  try {
    // Strip markdown fences
    let cleaned = content.trim();
    const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) cleaned = fenceMatch[1].trim();

    // Try parsing as { namings: [...] } or [...]
    let parsed: any;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Try extracting JSON object/array
      const objMatch = cleaned.match(/\{[\s\S]*\}/);
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (objMatch) parsed = JSON.parse(objMatch[0]);
      else if (arrMatch) parsed = JSON.parse(arrMatch[0]);
      else return expectedMarkIds.map((id) => ({ markId: id, name: '', confidence: 0 }));
    }

    const namings = Array.isArray(parsed) ? parsed : parsed?.namings;
    if (!Array.isArray(namings)) {
      return expectedMarkIds.map((id) => ({ markId: id, name: '', confidence: 0 }));
    }

    const map = new Map<number, { markId: number; name: string; confidence: number }>();
    for (const item of namings) {
      const markId = item.markId ?? item.mark_id ?? item.id;
      const name = item.name ?? item.suggested_name ?? '';
      const confidence = typeof item.confidence === 'number' ? Math.min(1, Math.max(0, item.confidence)) : 0.5;
      if (markId != null && !map.has(Number(markId))) {
        map.set(Number(markId), { markId: Number(markId), name: String(name), confidence });
      }
    }

    return expectedMarkIds.map((id) => map.get(id) || { markId: id, name: '', confidence: 0 });
  } catch {
    return expectedMarkIds.map((id) => ({ markId: id, name: '', confidence: 0 }));
  }
}

router.post('/', async (req, res) => {
  try {
    const {
      nodes,
      figmaToken,
      fileKey,
      vlmProvider = 'claude',
      vlmApiKey,
      globalContext = '',
      platform = 'Auto',
      config: configOverrides,
    } = req.body;

    if (!nodes || !Array.isArray(nodes) || nodes.length === 0) {
      return res.status(400).json({ error: 'nodes array is required' });
    }
    if (!figmaToken || !fileKey) {
      return res.status(400).json({ error: 'figmaToken and fileKey are required' });
    }
    if (!vlmApiKey) {
      return res.status(400).json({ error: 'vlmApiKey is required' });
    }

    const config = { ...DEFAULT_CONFIG, ...configOverrides };
    const session = createSession();
    const batchSize = config.batchSize;
    const totalBatches = Math.ceil(nodes.length / batchSize);

    session.totalNodes = nodes.length;
    session.totalBatches = totalBatches;
    session.status = 'naming';

    // Return session ID immediately so client can connect to SSE
    res.json({ sessionId: session.id, totalBatches, totalNodes: nodes.length });

    // Process batches asynchronously
    processBatches(
      session.id,
      nodes as NodeMetadata[],
      figmaToken,
      fileKey,
      vlmProvider,
      vlmApiKey,
      globalContext,
      platform,
      config,
    ).catch((err) => {
      console.error('[name] Background processing error:', err);
      session.status = 'error';
      session.error = err.message;
      emitProgress(session.id, {
        type: 'error',
        sessionId: session.id,
        message: err.message,
      });
    });
  } catch (err: any) {
    console.error('[name] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

async function processBatches(
  sessionId: string,
  nodes: NodeMetadata[],
  figmaToken: string,
  fileKey: string,
  vlmProvider: string,
  vlmApiKey: string,
  globalContext: string,
  platform: string,
  config: any,
) {
  const { getSession } = await import('../session/manager');
  const session = getSession(sessionId);
  if (!session) return;

  const batchSize = config.batchSize;
  const batches: NodeMetadata[][] = [];
  for (let i = 0; i < nodes.length; i += batchSize) {
    batches.push(nodes.slice(i, i + batchSize));
  }

  const allResults: NamingResult[] = [];

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    emitProgress(sessionId, {
      type: 'batch_started',
      sessionId,
      batchIndex: batchIdx,
      totalBatches: batches.length,
      message: `Processing batch ${batchIdx + 1} of ${batches.length}`,
    });

    // Find a common parent node to export as image
    // Use the first node's parent or the node itself for image export
    const parentNodeId = findCommonAncestor(batch);

    // Export the parent frame image
    let imageBuffer: Buffer;
    try {
      imageBuffer = await exportNodeImage(fileKey, figmaToken, parentNodeId, config.exportScale);
    } catch (err: any) {
      console.warn(`[name] Image export failed for batch ${batchIdx}, trying individual nodes:`, err.message);
      // Fallback: try exporting the first node
      imageBuffer = await exportNodeImage(fileKey, figmaToken, batch[0].id, config.exportScale);
    }

    emitProgress(sessionId, {
      type: 'image_exported',
      sessionId,
      batchIndex: batchIdx,
      totalBatches: batches.length,
    });

    const imageBase64 = imageBuffer.toString('base64');

    // Build SoM labels using bounding boxes relative to parent
    const labels: SoMLabel[] = batch.map((node, i) => {
      const markId = batchIdx * batchSize + i + 1;
      return {
        markId,
        nodeId: node.id,
        labelPosition: { x: node.boundingBox.x, y: node.boundingBox.y },
        highlightBox: node.boundingBox,
        originalName: node.originalName,
      };
    });

    // Get image dimensions from buffer (PNG header)
    const imgWidth = imageBuffer.readUInt32BE(16);
    const imgHeight = imageBuffer.readUInt32BE(20);

    // Compute relative bounding boxes for SoM overlay
    // The exported image covers the parent node's bounding box
    const parentBox = batch[0].boundingBox; // Approximation
    const relativeLabels = labels.map((label) => ({
      ...label,
      highlightBox: {
        x: (label.highlightBox.x - parentBox.x) * config.exportScale,
        y: (label.highlightBox.y - parentBox.y) * config.exportScale,
        width: label.highlightBox.width * config.exportScale,
        height: label.highlightBox.height * config.exportScale,
      },
    }));

    // Render SoM overlay
    let somBase64: string;
    try {
      somBase64 = await renderSoMImage({
        baseImageBase64: imageBase64,
        baseImageWidth: imgWidth,
        baseImageHeight: imgHeight,
        labels: relativeLabels,
        highlightColor: config.highlightColor,
        labelFontSize: config.labelFontSize * config.exportScale,
      });
    } catch (err: any) {
      console.warn(`[name] SoM render failed for batch ${batchIdx}, using raw image:`, err.message);
      somBase64 = imageBase64;
    }

    emitProgress(sessionId, {
      type: 'som_rendered',
      sessionId,
      batchIndex: batchIdx,
      totalBatches: batches.length,
      somImageBase64: somBase64,
    });

    // Build prompts
    const systemPrompt = buildSystemPrompt(globalContext, platform);
    const supplements: NodeSupplement[] = batch.map((node, i) => ({
      markId: batchIdx * batchSize + i + 1,
      textContent: node.textContent,
      boundVariables: node.boundVariables,
      componentProperties: node.componentProperties,
    }));
    const userPrompt = buildUserPrompt(supplements);

    // Call VLM
    let vlmContent: string;
    try {
      let result;
      switch (vlmProvider) {
        case 'claude-opus':
          result = await callClaude(vlmApiKey, somBase64, systemPrompt, userPrompt, 'claude-opus-4-6');
          break;
        case 'claude-sonnet':
          result = await callClaude(vlmApiKey, somBase64, systemPrompt, userPrompt, 'claude-sonnet-4-6');
          break;
        case 'gpt-5':
          result = await callOpenAI(vlmApiKey, somBase64, systemPrompt, userPrompt);
          break;
        case 'gemini-pro':
          result = await callGemini(vlmApiKey, somBase64, systemPrompt, userPrompt, 'gemini-3-pro-preview');
          break;
        case 'gemini-flash':
        default:
          result = await callGemini(vlmApiKey, somBase64, systemPrompt, userPrompt, 'gemini-3-flash-preview');
      }
      vlmContent = result.content;
    } catch (err: any) {
      console.error(`[name] VLM call failed for batch ${batchIdx}:`, err.message);
      emitProgress(sessionId, {
        type: 'error',
        sessionId,
        message: `VLM error on batch ${batchIdx + 1}: ${err.message}`,
      });
      continue;
    }

    emitProgress(sessionId, {
      type: 'vlm_called',
      sessionId,
      batchIndex: batchIdx,
      totalBatches: batches.length,
    });

    // Parse response
    const expectedMarkIds = batch.map((_, i) => batchIdx * batchSize + i + 1);
    const parsedNamings = parseNamingResponse(vlmContent, expectedMarkIds);

    // Map back to NamingResult
    const batchResults: NamingResult[] = parsedNamings.map((naming, i) => ({
      markId: naming.markId,
      nodeId: batch[i].id,
      originalName: batch[i].originalName,
      suggestedName: naming.name || batch[i].originalName,
      confidence: naming.confidence,
    }));

    allResults.push(...batchResults);
    session.completedBatches = batchIdx + 1;
    session.completedNodes += batch.length;
    session.results = allResults;

    emitProgress(sessionId, {
      type: 'batch_complete',
      sessionId,
      batchIndex: batchIdx,
      totalBatches: batches.length,
      completedNodes: session.completedNodes,
      totalNodes: session.totalNodes,
      results: batchResults,
    });
  }

  session.status = 'complete';
  emitProgress(sessionId, {
    type: 'all_complete',
    sessionId,
    completedNodes: session.completedNodes,
    totalNodes: session.totalNodes,
    results: allResults,
  });
}

/**
 * Find a common ancestor node ID for a batch of nodes.
 * If nodes share a parent, use that; otherwise use the first node's parent.
 */
function findCommonAncestor(nodes: NodeMetadata[]): string {
  if (nodes.length === 1) return nodes[0].parentId || nodes[0].id;

  // Check if all nodes share the same parent
  const parentIds = new Set(nodes.map((n) => n.parentId).filter(Boolean));
  if (parentIds.size === 1) {
    return [...parentIds][0]!;
  }

  // Fallback: use first node's parent
  return nodes[0].parentId || nodes[0].id;
}

export default router;
