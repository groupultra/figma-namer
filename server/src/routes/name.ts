// ============================================================
// POST /api/name
// Starts the batch naming process — supports page-based flow
// ============================================================

import { Router } from 'express';
import type { NodeMetadata, NamingResult, SoMLabel, PageInfo } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';
import { createSession, emitProgress } from '../session/manager';
import { exportNodeImage, exportMultipleNodeImages } from '../figma/image-export';
import { renderSoMImage, renderPageHighlights, renderComponentGrid, detectLabelOverlap } from '../som/renderer';
import { buildSystemPrompt, buildUserPrompt, buildSystemPromptWithPageContext, type NodeSupplement } from '../vlm/prompt-builder';
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
      pages,
      figmaToken,
      fileKey,
      rootNodeId,
      vlmProvider = 'gemini-flash',
      vlmApiKey,
      globalContext = '',
      platform = 'Auto',
      config: configOverrides,
    } = req.body;

    // Support both page-based and legacy node-based flow
    const hasPages = pages && Array.isArray(pages) && pages.length > 0;
    const hasNodes = nodes && Array.isArray(nodes) && nodes.length > 0;

    if (!hasPages && !hasNodes) {
      return res.status(400).json({ error: 'pages or nodes array is required' });
    }
    if (!figmaToken || !fileKey) {
      return res.status(400).json({ error: 'figmaToken and fileKey are required' });
    }
    if (!vlmApiKey) {
      return res.status(400).json({ error: 'vlmApiKey is required' });
    }

    const config = { ...DEFAULT_CONFIG, ...configOverrides };
    const session = createSession();

    if (hasPages) {
      // Page-based flow
      const activePages = (pages as PageInfo[]).filter(p => !p.isAuxiliary && p.nodes.length > 0);
      const totalNodes = activePages.reduce((sum, p) => sum + p.nodes.length, 0);
      const totalBatches = activePages.reduce((sum, p) => sum + Math.ceil(p.nodes.length / config.batchSize), 0);

      session.totalNodes = totalNodes;
      session.totalBatches = totalBatches;
      session.totalPages = activePages.length;
      session.status = 'naming';

      res.json({ sessionId: session.id, totalBatches, totalNodes, totalPages: activePages.length });

      processPageBatches(
        session.id,
        activePages,
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
        emitProgress(session.id, { type: 'error', sessionId: session.id, message: err.message });
      });
    } else {
      // Legacy flat-node flow (unchanged)
      const batchSize = config.batchSize;
      const totalBatches = Math.ceil(nodes.length / batchSize);

      session.totalNodes = nodes.length;
      session.totalBatches = totalBatches;
      session.status = 'naming';

      res.json({ sessionId: session.id, totalBatches, totalNodes: nodes.length });

      processLegacyBatches(
        session.id,
        nodes as NodeMetadata[],
        figmaToken,
        fileKey,
        rootNodeId || null,
        vlmProvider,
        vlmApiKey,
        globalContext,
        platform,
        config,
      ).catch((err) => {
        console.error('[name] Background processing error:', err);
        session.status = 'error';
        session.error = err.message;
        emitProgress(session.id, { type: 'error', sessionId: session.id, message: err.message });
      });
    }
  } catch (err: any) {
    console.error('[name] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Page-based processing (new agentic flow)
// ============================================================

async function processPageBatches(
  sessionId: string,
  pages: PageInfo[],
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

  const allResults: NamingResult[] = [];
  let globalBatchIdx = 0;
  let globalMarkId = 1;

  for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
    const page = pages[pageIdx];
    session.currentPageName = page.name;

    emitProgress(sessionId, {
      type: 'page_started',
      sessionId,
      pageIndex: pageIdx,
      totalPages: pages.length,
      pageName: page.name,
      message: `Starting page ${pageIdx + 1}/${pages.length}: ${page.name}`,
    });

    // -----------------------------------------------------------------
    // 1. Export page screenshot (shared for all batches within this page)
    // -----------------------------------------------------------------
    let pageBase64 = '';
    let pageImgWidth = 0;
    let pageImgHeight = 0;
    try {
      const pageBuf = await exportNodeImage(fileKey, figmaToken, page.nodeId, 1);
      pageBase64 = pageBuf.toString('base64');
      pageImgWidth = pageBuf.readUInt32BE(16);
      pageImgHeight = pageBuf.readUInt32BE(20);
    } catch (err: any) {
      console.warn(`[name] Page image export failed for "${page.name}":`, err.message);
    }

    // -----------------------------------------------------------------
    // 2. Process nodes in batches within this page
    // -----------------------------------------------------------------
    const batchSize = config.batchSize;
    const pageBatches: NodeMetadata[][] = [];
    for (let i = 0; i < page.nodes.length; i += batchSize) {
      pageBatches.push(page.nodes.slice(i, i + batchSize));
    }

    for (let localBatchIdx = 0; localBatchIdx < pageBatches.length; localBatchIdx++) {
      const batch = pageBatches[localBatchIdx];

      emitProgress(sessionId, {
        type: 'batch_started',
        sessionId,
        batchIndex: globalBatchIdx,
        totalBatches: session.totalBatches,
        pageIndex: pageIdx,
        totalPages: pages.length,
        pageName: page.name,
        message: `Page "${page.name}" - Batch ${localBatchIdx + 1}/${pageBatches.length}`,
      });

      // Assign mark IDs for this batch
      const batchMarkStart = globalMarkId;
      const labels: SoMLabel[] = batch.map((node, i) => {
        const markId = globalMarkId++;
        return {
          markId,
          nodeId: node.id,
          labelPosition: { x: node.boundingBox.x, y: node.boundingBox.y },
          highlightBox: node.boundingBox,
          originalName: node.originalName,
        };
      });

      // -----------------------------------------------------------
      // 2.5. Check for label/highlight overlap — split if needed
      // -----------------------------------------------------------
      const pageBBoxForOverlap = page.boundingBox || { x: 0, y: 0, width: pageImgWidth || 1, height: pageImgHeight || 1 };
      const hasOverlap = batch.length > 1 && pageBase64 && pageImgWidth > 0 &&
        detectLabelOverlap(labels, pageBBoxForOverlap, 1, config.labelFontSize);

      if (hasOverlap) {
        console.log(`[name] Overlap detected in page "${page.name}" batch ${localBatchIdx + 1}, processing nodes individually`);

        // Export all node images at once (efficient single API call)
        const nodeIds = batch.map(n => n.id);
        let nodeImagesMap = new Map<string, Buffer>();
        try {
          nodeImagesMap = await exportMultipleNodeImages(fileKey, figmaToken, nodeIds, config.exportScale);
        } catch (err: any) {
          console.warn(`[name] Node image export failed:`, err.message);
        }

        const splitResults: NamingResult[] = [];

        for (let nodeIdx = 0; nodeIdx < batch.length; nodeIdx++) {
          const node = batch[nodeIdx];
          const singleLabel = [labels[nodeIdx]];
          const markId = labels[nodeIdx].markId;

          // Node's individual image
          let nodeImageBase64 = '';
          const nodeBuf = nodeImagesMap.get(node.id);
          if (nodeBuf) {
            nodeImageBase64 = nodeBuf.toString('base64');
          }

          // Render single-node page highlight
          let singleHighlightBase64 = '';
          try {
            singleHighlightBase64 = await renderPageHighlights({
              pageImageBase64: pageBase64,
              pageImageWidth: pageImgWidth,
              pageImageHeight: pageImgHeight,
              pageBBox: pageBBoxForOverlap,
              labels: singleLabel,
              highlightColor: config.highlightColor,
              labelFontSize: config.labelFontSize,
              exportScale: 1,
            });
          } catch (err: any) {
            console.warn(`[name] Single highlight failed for mark ${markId}:`, err.message);
          }

          emitProgress(sessionId, {
            type: 'som_rendered',
            sessionId,
            batchIndex: globalBatchIdx,
            totalBatches: session.totalBatches,
            somImageBase64: singleHighlightBase64 || nodeImageBase64,
            cleanImageBase64: nodeImageBase64,
          });

          // Build VLM images: [page full, node crop, page + single highlight]
          const vlmImages: string[] = [];
          if (pageBase64) vlmImages.push(pageBase64);
          if (nodeImageBase64) vlmImages.push(nodeImageBase64);
          if (singleHighlightBase64) vlmImages.push(singleHighlightBase64);

          // Call VLM for this single node
          const systemPrompt = buildSystemPromptWithPageContext(globalContext, platform);
          const supplements: NodeSupplement[] = [{
            markId,
            originalName: node.originalName,
            textContent: node.textContent,
            boundVariables: node.boundVariables,
            componentProperties: node.componentProperties,
          }];
          const userPrompt = buildUserPrompt(supplements);

          try {
            const result = await callVLM(vlmProvider, vlmApiKey, vlmImages, systemPrompt, userPrompt);
            const parsedNamings = parseNamingResponse(result.content, [markId]);
            const naming = parsedNamings[0];

            splitResults.push({
              markId: naming.markId,
              nodeId: node.id,
              originalName: node.originalName,
              suggestedName: naming.name || node.originalName,
              confidence: naming.confidence,
              imageBase64: nodeImageBase64 || undefined,
            });
          } catch (err: any) {
            console.error(`[name] VLM call failed for node ${node.id}:`, err.message);
            splitResults.push({
              markId,
              nodeId: node.id,
              originalName: node.originalName,
              suggestedName: node.originalName,
              confidence: 0,
              imageBase64: nodeImageBase64 || undefined,
            });
          }
        }

        // Emit progress for the completed split batch
        allResults.push(...splitResults);
        session.completedBatches = globalBatchIdx + 1;
        session.completedNodes += batch.length;
        session.results = allResults;

        emitProgress(sessionId, {
          type: 'batch_complete',
          sessionId,
          batchIndex: globalBatchIdx,
          totalBatches: session.totalBatches,
          completedNodes: session.completedNodes,
          totalNodes: session.totalNodes,
          pageIndex: pageIdx,
          totalPages: pages.length,
          pageName: page.name,
          results: splitResults,
        });

        globalBatchIdx++;
        continue; // Skip normal batch processing
      }

      // -----------------------------------------------------------
      // 3. Export component images + render grid (Image 2)
      // -----------------------------------------------------------
      let nodeImagesMap = new Map<string, Buffer>();
      let componentGridBase64 = '';
      try {
        const nodeIds = batch.map(n => n.id);
        const nodeImages = await exportMultipleNodeImages(fileKey, figmaToken, nodeIds, config.exportScale);
        nodeImagesMap = nodeImages;

        const components: Array<{ markId: number; imageBuffer: Buffer }> = [];
        batch.forEach((node, i) => {
          const buf = nodeImages.get(node.id);
          if (buf) {
            components.push({ markId: batchMarkStart + i, imageBuffer: buf });
          }
        });

        if (components.length > 0) {
          componentGridBase64 = await renderComponentGrid(components);
        }
      } catch (err: any) {
        console.warn(`[name] Component grid failed for batch ${globalBatchIdx}:`, err.message);
      }

      // Fallback: if no grid, use SoM-annotated parent area
      if (!componentGridBase64) {
        try {
          const parentNodeId = findCommonAncestor(batch);
          const imageBuf = await exportNodeImage(fileKey, figmaToken, parentNodeId, config.exportScale);
          const cleanBase64 = imageBuf.toString('base64');
          const imgWidth = imageBuf.readUInt32BE(16);
          const imgHeight = imageBuf.readUInt32BE(20);

          // Use page boundingBox if the parent is the page itself, otherwise
          // look up the parent node's bbox from the page's node list or fall back
          // to computing a bounding envelope from batch nodes.
          let parentBox: { x: number; y: number };
          if (parentNodeId === page.nodeId && page.boundingBox) {
            parentBox = page.boundingBox;
          } else {
            // Find the parent node in the page's node list by parentId
            const parentMeta = page.nodes.find(n => n.id === parentNodeId);
            if (parentMeta) {
              parentBox = parentMeta.boundingBox;
            } else {
              // Compute bounding envelope of all batch nodes as fallback
              const allX = batch.map(n => n.boundingBox.x);
              const allY = batch.map(n => n.boundingBox.y);
              parentBox = { x: Math.min(...allX), y: Math.min(...allY) };
            }
          }

          const relativeLabels = labels.map((label) => ({
            ...label,
            highlightBox: {
              x: (label.highlightBox.x - parentBox.x) * config.exportScale,
              y: (label.highlightBox.y - parentBox.y) * config.exportScale,
              width: label.highlightBox.width * config.exportScale,
              height: label.highlightBox.height * config.exportScale,
            },
          }));

          componentGridBase64 = await renderSoMImage({
            baseImageBase64: cleanBase64,
            baseImageWidth: imgWidth,
            baseImageHeight: imgHeight,
            labels: relativeLabels,
            highlightColor: config.highlightColor,
            labelFontSize: config.labelFontSize * config.exportScale,
          });
        } catch (err: any) {
          console.warn(`[name] SoM fallback failed for batch ${globalBatchIdx}:`, err.message);
        }
      }

      emitProgress(sessionId, {
        type: 'image_exported',
        sessionId,
        batchIndex: globalBatchIdx,
        totalBatches: session.totalBatches,
        cleanImageBase64: componentGridBase64,
        ...(localBatchIdx === 0 && pageBase64 ? { frameImageBase64: pageBase64 } : {}),
      });

      // -----------------------------------------------------------
      // 4. Render page highlights (Image 3)
      // -----------------------------------------------------------
      let pageHighlightBase64 = '';
      if (pageBase64 && pageImgWidth > 0) {
        try {
          // Use the page Frame's own absoluteBoundingBox for coordinate offset
          // This is the correct origin: pixel (0,0) of the exported page image
          // corresponds to page.boundingBox.x, page.boundingBox.y in canvas coords
          const pageBBox = page.boundingBox || { x: 0, y: 0, width: pageImgWidth, height: pageImgHeight };

          pageHighlightBase64 = await renderPageHighlights({
            pageImageBase64: pageBase64,
            pageImageWidth: pageImgWidth,
            pageImageHeight: pageImgHeight,
            pageBBox: pageBBox,
            labels,
            highlightColor: config.highlightColor,
            labelFontSize: config.labelFontSize,
            exportScale: 1, // page image is already at 1x
          });
        } catch (err: any) {
          console.warn(`[name] Page highlights failed:`, err.message);
        }
      }

      emitProgress(sessionId, {
        type: 'som_rendered',
        sessionId,
        batchIndex: globalBatchIdx,
        totalBatches: session.totalBatches,
        somImageBase64: pageHighlightBase64 || componentGridBase64,
        cleanImageBase64: componentGridBase64,
      });

      // -----------------------------------------------------------
      // 5. Call VLM with up to 3 images
      // -----------------------------------------------------------
      const systemPrompt = pageBase64
        ? buildSystemPromptWithPageContext(globalContext, platform)
        : buildSystemPrompt(globalContext, platform);

      const supplements: NodeSupplement[] = batch.map((node, i) => ({
        markId: batchMarkStart + i,
        originalName: node.originalName,
        textContent: node.textContent,
        boundVariables: node.boundVariables,
        componentProperties: node.componentProperties,
      }));
      const userPrompt = buildUserPrompt(supplements);

      // Build image array: [page full, component grid, page highlights]
      const vlmImages: string[] = [];
      if (pageBase64) vlmImages.push(pageBase64);
      if (componentGridBase64) vlmImages.push(componentGridBase64);
      if (pageHighlightBase64 && pageHighlightBase64 !== componentGridBase64) {
        vlmImages.push(pageHighlightBase64);
      }
      // Ensure at least one image
      if (vlmImages.length === 0 && componentGridBase64) {
        vlmImages.push(componentGridBase64);
      }

      let vlmContent: string;
      try {
        const result = await callVLM(vlmProvider, vlmApiKey, vlmImages, systemPrompt, userPrompt);
        vlmContent = result.content;
      } catch (err: any) {
        console.error(`[name] VLM call failed for batch ${globalBatchIdx}:`, err.message);
        emitProgress(sessionId, {
          type: 'error',
          sessionId,
          message: `VLM error on page "${page.name}" batch ${localBatchIdx + 1}: ${err.message}`,
        });
        globalBatchIdx++;
        continue;
      }

      emitProgress(sessionId, {
        type: 'vlm_called',
        sessionId,
        batchIndex: globalBatchIdx,
        totalBatches: session.totalBatches,
      });

      // -----------------------------------------------------------
      // 6. Parse response → results
      // -----------------------------------------------------------
      const expectedMarkIds = batch.map((_, i) => batchMarkStart + i);
      const parsedNamings = parseNamingResponse(vlmContent, expectedMarkIds);

      const batchResults: NamingResult[] = parsedNamings.map((naming, i) => {
        // Get node thumbnail from the exported images
        const nodeBuf = nodeImagesMap.get(batch[i].id);
        let thumbBase64: string | undefined;
        if (nodeBuf) {
          thumbBase64 = nodeBuf.toString('base64');
        }
        return {
          markId: naming.markId,
          nodeId: batch[i].id,
          originalName: batch[i].originalName,
          suggestedName: naming.name || batch[i].originalName,
          confidence: naming.confidence,
          imageBase64: thumbBase64,
        };
      });

      allResults.push(...batchResults);
      session.completedBatches = globalBatchIdx + 1;
      session.completedNodes += batch.length;
      session.results = allResults;

      emitProgress(sessionId, {
        type: 'batch_complete',
        sessionId,
        batchIndex: globalBatchIdx,
        totalBatches: session.totalBatches,
        completedNodes: session.completedNodes,
        totalNodes: session.totalNodes,
        pageIndex: pageIdx,
        totalPages: pages.length,
        pageName: page.name,
        results: batchResults,
      });

      globalBatchIdx++;
    }

    session.completedPages = pageIdx + 1;

    emitProgress(sessionId, {
      type: 'page_complete',
      sessionId,
      pageIndex: pageIdx,
      totalPages: pages.length,
      pageName: page.name,
      completedNodes: session.completedNodes,
      totalNodes: session.totalNodes,
      message: `Page "${page.name}" complete`,
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

// ============================================================
// Legacy flat-node processing (backward compatible)
// ============================================================

async function processLegacyBatches(
  sessionId: string,
  nodes: NodeMetadata[],
  figmaToken: string,
  fileKey: string,
  rootNodeId: string | null,
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

  // Export full frame context image (once)
  let frameBase64: string = '';
  const frameNodeId = rootNodeId || findTopLevelParent(nodes);
  if (frameNodeId) {
    try {
      const frameBuf = await exportNodeImage(fileKey, figmaToken, frameNodeId, 1);
      frameBase64 = frameBuf.toString('base64');
    } catch (err: any) {
      console.warn('[name] Frame context image export failed:', err.message);
    }
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

    // Export batch area
    const parentNodeId = findCommonAncestor(batch);
    let imageBuffer: Buffer;
    try {
      imageBuffer = await exportNodeImage(fileKey, figmaToken, parentNodeId, config.exportScale);
    } catch (err: any) {
      console.warn(`[name] Image export failed for batch ${batchIdx}, trying individual nodes:`, err.message);
      imageBuffer = await exportNodeImage(fileKey, figmaToken, batch[0].id, config.exportScale);
    }

    const cleanBase64 = imageBuffer.toString('base64');

    emitProgress(sessionId, {
      type: 'image_exported',
      sessionId,
      batchIndex: batchIdx,
      totalBatches: batches.length,
      cleanImageBase64: cleanBase64,
      ...(batchIdx === 0 && frameBase64 ? { frameImageBase64: frameBase64 } : {}),
    });

    // Render SoM overlay
    const imgWidth = imageBuffer.readUInt32BE(16);
    const imgHeight = imageBuffer.readUInt32BE(20);

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

    // Use the bounding envelope of all batch nodes to approximate the export origin.
    // The exported parent image's pixel (0,0) corresponds to the parent node's
    // absoluteBoundingBox origin. Since findCommonAncestor returns a parent ID
    // and we don't have its bbox directly, approximate with the min x/y of
    // all batch nodes (the parent bbox.x/y <= min(children.x/y)).
    // For single-parent batches this is correct; for multi-parent it's close enough.
    const allBatchX = batch.map(n => n.boundingBox.x);
    const allBatchY = batch.map(n => n.boundingBox.y);
    const parentBox = {
      x: Math.min(...allBatchX),
      y: Math.min(...allBatchY),
    };
    const relativeLabels = labels.map((label) => ({
      ...label,
      highlightBox: {
        x: (label.highlightBox.x - parentBox.x) * config.exportScale,
        y: (label.highlightBox.y - parentBox.y) * config.exportScale,
        width: label.highlightBox.width * config.exportScale,
        height: label.highlightBox.height * config.exportScale,
      },
    }));

    let somBase64: string;
    try {
      somBase64 = await renderSoMImage({
        baseImageBase64: cleanBase64,
        baseImageWidth: imgWidth,
        baseImageHeight: imgHeight,
        labels: relativeLabels,
        highlightColor: config.highlightColor,
        labelFontSize: config.labelFontSize * config.exportScale,
      });
    } catch (err: any) {
      console.warn(`[name] SoM render failed for batch ${batchIdx}, using raw image:`, err.message);
      somBase64 = cleanBase64;
    }

    emitProgress(sessionId, {
      type: 'som_rendered',
      sessionId,
      batchIndex: batchIdx,
      totalBatches: batches.length,
      somImageBase64: somBase64,
      cleanImageBase64: cleanBase64,
    });

    // Call VLM
    const systemPrompt = buildSystemPrompt(globalContext, platform);
    const supplements: NodeSupplement[] = batch.map((node, i) => ({
      markId: batchIdx * batchSize + i + 1,
      originalName: node.originalName,
      textContent: node.textContent,
      boundVariables: node.boundVariables,
      componentProperties: node.componentProperties,
    }));
    const userPrompt = buildUserPrompt(supplements);

    const vlmImages = frameBase64 ? [frameBase64, somBase64] : [somBase64];

    let vlmContent: string;
    try {
      const result = await callVLM(vlmProvider, vlmApiKey, vlmImages, systemPrompt, userPrompt);
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

// ============================================================
// Shared helpers
// ============================================================

async function callVLM(
  vlmProvider: string,
  vlmApiKey: string,
  images: string[],
  systemPrompt: string,
  userPrompt: string,
): Promise<{ content: string }> {
  switch (vlmProvider) {
    case 'claude-opus':
      return callClaude(vlmApiKey, images, systemPrompt, userPrompt, 'claude-opus-4-6');
    case 'claude-sonnet':
      return callClaude(vlmApiKey, images, systemPrompt, userPrompt, 'claude-sonnet-4-6');
    case 'gpt-5':
      return callOpenAI(vlmApiKey, images, systemPrompt, userPrompt);
    case 'gemini-pro':
      return callGemini(vlmApiKey, images, systemPrompt, userPrompt, 'gemini-3-pro-preview');
    case 'gemini-flash':
    default:
      return callGemini(vlmApiKey, images, systemPrompt, userPrompt, 'gemini-3-flash-preview');
  }
}

function findTopLevelParent(nodes: NodeMetadata[]): string | null {
  if (nodes.length === 0) return null;
  const shallowest = nodes.reduce((a, b) => (a.depth < b.depth ? a : b));
  return shallowest.parentId || shallowest.id;
}

function findCommonAncestor(nodes: NodeMetadata[]): string {
  if (nodes.length === 1) return nodes[0].parentId || nodes[0].id;
  const parentIds = new Set(nodes.map((n) => n.parentId).filter(Boolean));
  if (parentIds.size === 1) return [...parentIds][0]!;
  // When nodes have different parents, pick the shallowest node's parent
  // (closest to root) — this gives the most encompassing export area
  const shallowest = nodes.reduce((a, b) => (a.depth < b.depth ? a : b));
  return shallowest.parentId || shallowest.id;
}

export default router;
