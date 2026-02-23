// ============================================================
// Figma Namer - Module F: Plugin Main Thread Orchestrator
// Runs in the Figma plugin sandbox. Coordinates traversal,
// image export, batch orchestration, and name application.
// Communicates with the UI iframe via postMessage / onmessage.
// ============================================================

import type {
  NodeMetadata,
  NamingResult,
  NamerConfig,
  SoMLabel,
} from '../shared/types';
import { DEFAULT_CONFIG } from '../shared/types';
import type { PluginToUIMessage, UIToPluginMessage } from '../shared/messages';
import { UI_WIDTH, UI_HEIGHT } from '../shared/constants';
import { traverseSelection } from './traversal';

// ============================================================
// State
// ============================================================

/** Active configuration (starts with defaults, updated by UI). */
let config: NamerConfig = { ...DEFAULT_CONFIG };

/** Flag to support cooperative cancellation of long-running flows. */
let cancelled = false;

// ============================================================
// Plugin initialisation
// ============================================================

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });

// ============================================================
// Message listener (UI -> Plugin)
// ============================================================

figma.ui.onmessage = async (msg: UIToPluginMessage) => {
  console.log('[code.ts] Received message:', msg.type);
  try {
    switch (msg.type) {
      case 'START_TRAVERSAL':
        await handleStartTraversal();
        break;

      case 'EXPORT_IMAGE':
        await handleExportImage(msg.nodeIds, msg.scale);
        break;

      case 'START_NAMING':
        await handleStartNaming(msg.globalContext, msg.platform, msg.config);
        break;

      case 'APPLY_NAMES':
        await handleApplyNames(msg.results);
        break;

      case 'APPLY_SINGLE':
        await handleApplySingle(msg.nodeId, msg.newName);
        break;

      case 'REVERT_NAMES':
        await handleRevertNames(msg.results);
        break;

      case 'CANCEL_OPERATION':
        handleCancelOperation();
        break;

      case 'UPDATE_CONFIG':
        handleUpdateConfig(msg.config);
        break;

      case 'SAVE_API_KEYS':
        await figma.clientStorage.setAsync('api_keys', msg.credentials);
        break;

      case 'LOAD_API_KEYS': {
        const stored = await figma.clientStorage.getAsync('api_keys');
        const creds: Record<string, string> = stored ? (stored as Record<string, string>) : {};
        sendToUI({ type: 'API_KEYS_LOADED', credentials: creds });
        break;
      }

      default:
        // Exhaustiveness guard: should never happen if types are correct
        console.warn('[code.ts] Unhandled message type:', (msg as { type: string }).type);
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendToUI({ type: 'ERROR', error: errorMessage, code: 'UNHANDLED_ERROR' });
    figma.notify(`Error: ${errorMessage}`, { error: true });
  }
};

// ============================================================
// Handler: START_TRAVERSAL
// ============================================================

async function handleStartTraversal(): Promise<void> {
  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    sendToUI({ type: 'ERROR', error: 'No layers selected. Please select at least one layer.', code: 'NO_SELECTION' });
    figma.notify('Please select at least one layer first.', { error: true });
    return;
  }

  sendToUI({ type: 'STATUS_UPDATE', status: 'traversing', message: 'Traversing selected layers...' });

  // The traversal itself is synchronous but may take a moment for
  // very large trees. We wrap it in a microtask to allow the status
  // message above to reach the UI before the main thread blocks.
  await yieldToMain();

  const nodes = traverseSelection(selection, config);

  // Send progress (100% since traversal is synchronous)
  sendToUI({ type: 'TRAVERSAL_PROGRESS', processed: nodes.length, total: nodes.length });
  sendToUI({ type: 'TRAVERSAL_COMPLETE', nodes, totalCount: nodes.length });

  if (nodes.length === 0) {
    figma.notify('No nameable layers found in the selection.');
  } else {
    figma.notify(`Found ${nodes.length} nameable layer${nodes.length === 1 ? '' : 's'}.`);
  }
}

// ============================================================
// Handler: EXPORT_IMAGE
// ============================================================

async function handleExportImage(nodeIds: string[], scale: number): Promise<void> {
  const rootNode = await getExportNode(nodeIds);
  if (!rootNode) {
    sendToUI({ type: 'ERROR', error: 'Could not find the node to export.', code: 'NODE_NOT_FOUND' });
    return;
  }

  sendToUI({ type: 'STATUS_UPDATE', status: 'rendering_som', message: 'Exporting image...' });

  const effectiveScale = scale > 0 ? scale : config.exportScale;

  try {
    const bytes = await rootNode.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: effectiveScale },
    });

    const imageBase64 = uint8ArrayToBase64(bytes);

    // Compute exported image dimensions from the node's bounding box
    const box = rootNode.absoluteBoundingBox;
    const width = box ? Math.round(box.width * effectiveScale) : 0;
    const height = box ? Math.round(box.height * effectiveScale) : 0;

    sendToUI({ type: 'IMAGE_EXPORTED', imageBase64, width, height });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendToUI({ type: 'ERROR', error: `Image export failed: ${errorMessage}`, code: 'EXPORT_FAILED' });
  }
}

// ============================================================
// Handler: START_NAMING (core flow orchestrator)
// ============================================================

/**
 * The main naming flow, coordinated between plugin and UI:
 *
 * 1. Traverse the selection to collect NodeMetadata.
 * 2. Export a screenshot of the root selection node.
 * 3. Split nodes into batches of `config.batchSize`.
 * 4. For each batch, send metadata + image to the UI.
 *    The UI is responsible for SoM rendering and VLM calls.
 * 5. Send status updates throughout.
 */
async function handleStartNaming(
  globalContext: string,
  platform: string,
  configOverrides?: Partial<NamerConfig>,
): Promise<void> {
  // Reset cancellation flag at the start of a new run
  cancelled = false;

  // Merge any per-session config overrides
  if (configOverrides) {
    config = { ...config, ...configOverrides };
  }

  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    sendToUI({ type: 'ERROR', error: 'No layers selected. Please select at least one layer.', code: 'NO_SELECTION' });
    figma.notify('Please select at least one layer first.', { error: true });
    return;
  }

  // -- Step 1: Traverse --
  sendToUI({ type: 'STATUS_UPDATE', status: 'traversing', message: 'Traversing selected layers...' });
  await yieldToMain();

  const nodes = traverseSelection(selection, config);
  sendToUI({ type: 'TRAVERSAL_PROGRESS', processed: nodes.length, total: nodes.length });
  sendToUI({ type: 'TRAVERSAL_COMPLETE', nodes, totalCount: nodes.length });

  if (nodes.length === 0) {
    sendToUI({ type: 'ERROR', error: 'No nameable layers found in the selection.', code: 'NO_NODES' });
    figma.notify('No nameable layers found in the selection.');
    return;
  }

  if (cancelled) return;

  // -- Step 2: Export root screenshot --
  sendToUI({ type: 'STATUS_UPDATE', status: 'rendering_som', message: 'Exporting screenshot...' });

  const rootNode = getSelectionRoot();
  if (!rootNode) {
    sendToUI({ type: 'ERROR', error: 'Could not determine root node for export.', code: 'NO_ROOT' });
    return;
  }

  let imageBase64: string;
  let imageWidth: number;
  let imageHeight: number;

  try {
    const bytes = await rootNode.exportAsync({
      format: 'PNG',
      constraint: { type: 'SCALE', value: config.exportScale },
    });
    imageBase64 = uint8ArrayToBase64(bytes);

    const box = rootNode.absoluteBoundingBox;
    imageWidth = box ? Math.round(box.width * config.exportScale) : 0;
    imageHeight = box ? Math.round(box.height * config.exportScale) : 0;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendToUI({ type: 'ERROR', error: `Screenshot export failed: ${errorMessage}`, code: 'EXPORT_FAILED' });
    return;
  }

  if (cancelled) return;

  sendToUI({ type: 'IMAGE_EXPORTED', imageBase64, width: imageWidth, height: imageHeight });

  // -- Step 3: Split into batches and compute SoM labels --
  const batches = createBatches(nodes, config.batchSize);
  const totalBatches = batches.length;

  // Compute SoM labels for each batch. Positions are relative to
  // the root node's bounding box, scaled by exportScale.
  const rootBox = rootNode.absoluteBoundingBox;
  const rootX = rootBox ? rootBox.x : 0;
  const rootY = rootBox ? rootBox.y : 0;
  const scale = config.exportScale;

  let globalMarkId = 1;

  // -- Step 4: Send each batch to the UI with labels --
  sendToUI({
    type: 'STATUS_UPDATE',
    status: 'rendering_som',
    message: `Processing ${totalBatches} batch${totalBatches === 1 ? '' : 'es'} (${nodes.length} layers)...`,
  });

  for (let i = 0; i < totalBatches; i++) {
    if (cancelled) {
      sendToUI({ type: 'STATUS_UPDATE', status: 'idle', message: 'Operation cancelled.' });
      return;
    }

    const batchNodes = batches[i];
    const batchLabels: SoMLabel[] = batchNodes.map((node) => {
      const markId = globalMarkId++;
      const box = node.boundingBox;
      return {
        markId,
        nodeId: node.id,
        labelPosition: {
          x: (box.x - rootX) * scale,
          y: (box.y - rootY) * scale,
        },
        highlightBox: {
          x: (box.x - rootX) * scale,
          y: (box.y - rootY) * scale,
          width: box.width * scale,
          height: box.height * scale,
        },
        originalName: node.originalName,
      };
    });

    sendToUI({
      type: 'SOM_BATCH_READY',
      batchIndex: i,
      totalBatches,
      batchNodes,
      batchLabels,
    });

    // Yield control so the UI can process the batch.
    await yieldToMain();
  }
}

// ============================================================
// Handler: APPLY_NAMES
// ============================================================

async function handleApplyNames(results: NamingResult[]): Promise<void> {
  console.log('[code.ts] handleApplyNames called with', results.length, 'results');
  sendToUI({ type: 'STATUS_UPDATE', status: 'applying', message: 'Applying names...' });

  let appliedCount = 0;
  let failedCount = 0;

  for (const result of results) {
    try {
      const node = await figma.getNodeByIdAsync(result.nodeId);
      if (!node) {
        console.log('[code.ts] Node NOT FOUND:', result.nodeId);
        failedCount++;
        continue;
      }

      if ('name' in node) {
        (node as SceneNode).name = result.suggestedName;
        appliedCount++;
      } else {
        failedCount++;
      }
    } catch (_e) {
      console.log('[code.ts] Error renaming node:', result.nodeId, _e);
      failedCount++;
    }
  }

  console.log('[code.ts] Apply complete. Applied:', appliedCount, 'Failed:', failedCount);
  sendToUI({ type: 'APPLY_COMPLETE', appliedCount, failedCount });
  sendToUI({ type: 'STATUS_UPDATE', status: 'completed', message: 'Names applied.' });

  const message = failedCount > 0
    ? `Renamed ${appliedCount} layer${appliedCount === 1 ? '' : 's'} (${failedCount} failed).`
    : `Successfully renamed ${appliedCount} layer${appliedCount === 1 ? '' : 's'}.`;
  figma.notify(message);
}

// ============================================================
// Handler: APPLY_SINGLE
// ============================================================

async function handleApplySingle(nodeId: string, newName: string): Promise<void> {
  try {
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || !('name' in node)) {
      sendToUI({ type: 'ERROR', error: `Node ${nodeId} not found or cannot be renamed.`, code: 'NODE_NOT_FOUND' });
      return;
    }

    (node as SceneNode).name = newName;

    sendToUI({ type: 'APPLY_COMPLETE', appliedCount: 1, failedCount: 0 });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendToUI({ type: 'ERROR', error: `Failed to rename node: ${errorMessage}`, code: 'RENAME_FAILED' });
  }
}

// ============================================================
// Handler: REVERT_NAMES
// ============================================================

async function handleRevertNames(results: NamingResult[]): Promise<void> {
  sendToUI({ type: 'STATUS_UPDATE', status: 'applying', message: 'Reverting names...' });

  let appliedCount = 0;
  let failedCount = 0;

  for (const result of results) {
    try {
      const node = await figma.getNodeByIdAsync(result.nodeId);
      if (!node || !('name' in node)) {
        failedCount++;
        continue;
      }

      (node as SceneNode).name = result.originalName;
      appliedCount++;
    } catch (_e) {
      failedCount++;
    }
  }

  sendToUI({ type: 'APPLY_COMPLETE', appliedCount, failedCount });
  sendToUI({ type: 'STATUS_UPDATE', status: 'completed', message: 'Names reverted.' });

  const message = failedCount > 0
    ? `Reverted ${appliedCount} layer${appliedCount === 1 ? '' : 's'} (${failedCount} failed).`
    : `Successfully reverted ${appliedCount} layer${appliedCount === 1 ? '' : 's'}.`;
  figma.notify(message);
}

// ============================================================
// Handler: CANCEL_OPERATION
// ============================================================

function handleCancelOperation(): void {
  cancelled = true;
  sendToUI({ type: 'STATUS_UPDATE', status: 'idle', message: 'Operation cancelled.' });
  figma.notify('Operation cancelled.');
}

// ============================================================
// Handler: UPDATE_CONFIG
// ============================================================

function handleUpdateConfig(partial: Partial<NamerConfig>): void {
  config = { ...config, ...partial };
  sendToUI({ type: 'CONFIG_LOADED', config });
}

// ============================================================
// Utility: sendToUI
// ============================================================

/**
 * Sends a typed message from the plugin main thread to the UI iframe.
 */
function sendToUI(message: PluginToUIMessage): void {
  figma.ui.postMessage(message);
}

// ============================================================
// Utility: getSelectionRoot
// ============================================================

/**
 * Returns the top-level root node of the current selection.
 *
 * If a single node is selected, that node is the root.
 * If multiple nodes are selected, we find their common parent
 * (usually a Frame or Page) and use that as the export root.
 * Falls back to the first selected node if no common parent is found.
 */
function getSelectionRoot(): SceneNode | null {
  const selection = figma.currentPage.selection;
  if (selection.length === 0) {
    return null;
  }

  if (selection.length === 1) {
    return selection[0];
  }

  // Multiple nodes selected: use their common parent if it's a SceneNode
  const firstParent = selection[0].parent;
  if (firstParent && firstParent.type !== 'PAGE' && firstParent.type !== 'DOCUMENT') {
    // Check if all selected nodes share the same parent
    const allSameParent = selection.every((n) => n.parent === firstParent);
    if (allSameParent) {
      return firstParent as SceneNode;
    }
  }

  // Fallback: return the first selected node
  return selection[0];
}

// ============================================================
// Utility: getExportNode
// ============================================================

/**
 * Resolves the node to export from a list of node IDs.
 * If multiple IDs are provided, attempts to find their common
 * parent. Falls back to the first valid node.
 */
async function getExportNode(nodeIds: string[]): Promise<SceneNode | null> {
  if (nodeIds.length === 0) {
    return getSelectionRoot();
  }

  const nodes: SceneNode[] = [];
  for (const id of nodeIds) {
    const node = await figma.getNodeByIdAsync(id);
    if (node && 'absoluteBoundingBox' in node) {
      nodes.push(node as SceneNode);
    }
  }

  if (nodes.length === 0) {
    return null;
  }

  if (nodes.length === 1) {
    return nodes[0];
  }

  // Multiple nodes: use common parent
  const firstParent = nodes[0].parent;
  if (firstParent && firstParent.type !== 'PAGE' && firstParent.type !== 'DOCUMENT') {
    const allSameParent = nodes.every((n) => n.parent === firstParent);
    if (allSameParent) {
      return firstParent as SceneNode;
    }
  }

  return nodes[0];
}

// ============================================================
// Utility: createBatches
// ============================================================

/**
 * Splits a flat array of NodeMetadata into batches of the given size.
 *
 * @param nodes     - All nodes to batch.
 * @param batchSize - Maximum number of nodes per batch.
 * @returns An array of NodeMetadata arrays, each with at most `batchSize` elements.
 */
function createBatches(nodes: NodeMetadata[], batchSize: number): NodeMetadata[][] {
  const effectiveBatchSize = Math.max(1, batchSize);
  const batches: NodeMetadata[][] = [];

  for (let i = 0; i < nodes.length; i += effectiveBatchSize) {
    batches.push(nodes.slice(i, i + effectiveBatchSize));
  }

  return batches;
}

// ============================================================
// Utility: uint8ArrayToBase64
// ============================================================

/**
 * Converts a Uint8Array of bytes to a Base64-encoded string.
 *
 * This implementation is compatible with the Figma plugin sandbox,
 * which does not provide `btoa` or `Buffer`. We accumulate a binary
 * string and then encode it manually using a lookup table.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const len = bytes.length;
  let result = '';

  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;

    result += CHARS[b0 >> 2];
    result += CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    result += i + 1 < len ? CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? CHARS[b2 & 0x3f] : '=';
  }

  return result;
}

// ============================================================
// Utility: yieldToMain
// ============================================================

/**
 * Yields execution so pending messages (e.g. status updates) can
 * be flushed to the UI before the main thread resumes heavy work.
 *
 * In the Figma plugin sandbox, `setTimeout` is available and
 * returns control to the event loop.
 */
function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
