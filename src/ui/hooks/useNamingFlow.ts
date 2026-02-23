// ============================================================
// Figma Namer - useNamingFlow Hook
// Manages the entire naming session state and postMessage comms
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  NamingSession,
  NamingResult,
  NamingBatch,
  NamerConfig,
  SessionStatus,
  NodeMetadata,
  SoMLabel,
} from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/types';
import type { PluginToUIMessage, UIToPluginMessage } from '../../shared/messages';
import { renderSoMImage } from '../../plugin/som/renderer';
import { VLMClient } from '../../vlm/client';
import { PROVIDER_KEY_FAMILY } from '../../vlm/providers';

/** Convenience: send a message to the Figma plugin main thread */
function postToPlugin(msg: UIToPluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

/** Create an empty NamingSession */
function createEmptySession(): NamingSession {
  return {
    sessionId: '',
    globalContext: '',
    platform: '',
    allNodes: [],
    results: [],
    status: 'idle',
    currentBatch: 0,
    totalBatches: 0,
    startedAt: 0,
  };
}

export interface UseNamingFlowReturn {
  /** The full session state */
  session: NamingSession;
  /** Current status for convenience */
  status: SessionStatus;
  /** Latest error message (if any) */
  error: string | null;
  /** Latest status message from main thread */
  statusMessage: string;
  /** Traversal progress */
  traversalProgress: { processed: number; total: number };
  /** Current batch SoM image (base64) */
  currentBatchImage: string | null;
  /** Image dimensions */
  currentBatchImageSize: { width: number; height: number } | null;
  /** Final apply stats */
  applyStats: { applied: number; failed: number } | null;
  /** Config loaded from main thread */
  config: NamerConfig;
  /** Stored API keys (keyed by provider family: google, anthropic, openai) */
  apiKeys: Record<string, string>;
  /** Currently selected VLM provider */
  vlmProvider: string;

  /** Start the naming flow */
  startNaming: (globalContext: string, platform: string, vlmProvider: string, apiKey: string, configOverrides?: Partial<NamerConfig>) => void;
  /** Apply selected naming results */
  applyNames: (results: NamingResult[]) => void;
  /** Cancel the current operation */
  cancelOperation: () => void;
  /** Reset back to idle */
  reset: () => void;
  /** Update config */
  updateConfig: (config: Partial<NamerConfig>) => void;
  /** Save API keys */
  saveApiKeys: (credentials: Record<string, string>) => void;
  /** Set VLM provider */
  setVlmProvider: (provider: string) => void;
}

export function useNamingFlow(): UseNamingFlowReturn {
  const [session, setSession] = useState<NamingSession>(createEmptySession);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [traversalProgress, setTraversalProgress] = useState({ processed: 0, total: 0 });
  const [currentBatchImage, setCurrentBatchImage] = useState<string | null>(null);
  const [currentBatchImageSize, setCurrentBatchImageSize] = useState<{ width: number; height: number } | null>(null);
  const [applyStats, setApplyStats] = useState<{ applied: number; failed: number } | null>(null);
  const [config, setConfig] = useState<NamerConfig>(DEFAULT_CONFIG);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [vlmProvider, setVlmProvider] = useState<string>(DEFAULT_CONFIG.vlmProvider);

  // accumulate results across batches
  const accumulatedResults = useRef<NamingResult[]>([]);

  // Current session params for batch processing
  const sessionParams = useRef<{
    globalContext: string;
    platform: string;
    vlmProvider: string;
    apiKey: string;
    baseImageBase64: string;
    baseImageWidth: number;
    baseImageHeight: number;
    highlightColor: string;
    labelFontSize: number;
  } | null>(null);

  // Track whether we're cancelled
  const cancelledRef = useRef(false);

  /** Load API keys on mount */
  useEffect(() => {
    postToPlugin({ type: 'LOAD_API_KEYS' });
  }, []);

  /** Listen for messages from the main thread */
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data.pluginMessage as PluginToUIMessage | undefined;
      if (!msg) return;

      switch (msg.type) {
        case 'CONFIG_LOADED':
          setConfig(msg.config);
          break;

        case 'API_KEYS_LOADED':
          setApiKeys(msg.credentials);
          break;

        case 'STATUS_UPDATE':
          setStatusMessage(msg.message);
          setSession((prev) => ({ ...prev, status: msg.status }));
          break;

        case 'TRAVERSAL_PROGRESS':
          setTraversalProgress({ processed: msg.processed, total: msg.total });
          break;

        case 'TRAVERSAL_COMPLETE':
          setSession((prev) => ({
            ...prev,
            allNodes: msg.nodes,
            status: 'rendering_som',
          }));
          break;

        case 'IMAGE_EXPORTED':
          setCurrentBatchImage(msg.imageBase64);
          setCurrentBatchImageSize({ width: msg.width, height: msg.height });
          // Store for batch processing
          if (sessionParams.current) {
            sessionParams.current.baseImageBase64 = msg.imageBase64;
            sessionParams.current.baseImageWidth = msg.width;
            sessionParams.current.baseImageHeight = msg.height;
          }
          break;

        case 'SOM_BATCH_READY':
          setSession((prev) => ({
            ...prev,
            currentBatch: msg.batchIndex,
            totalBatches: msg.totalBatches,
            status: 'calling_vlm',
          }));
          // Process the batch asynchronously
          await processBatch(
            msg.batchIndex,
            msg.totalBatches,
            msg.batchNodes,
            msg.batchLabels,
          );
          break;

        case 'NAMING_RESULTS':
          accumulatedResults.current = [...accumulatedResults.current, ...msg.results];
          setSession((prev) => ({
            ...prev,
            results: accumulatedResults.current,
            currentBatch: msg.batchIndex + 1,
          }));
          break;

        case 'ALL_BATCHES_COMPLETE':
          accumulatedResults.current = msg.allResults;
          setSession((prev) => ({
            ...prev,
            results: msg.allResults,
            status: 'previewing',
          }));
          break;

        case 'APPLY_COMPLETE':
          console.log('[useNamingFlow] APPLY_COMPLETE received:', msg.appliedCount, 'applied,', msg.failedCount, 'failed');
          setApplyStats({ applied: msg.appliedCount, failed: msg.failedCount });
          setSession((prev) => ({ ...prev, status: 'completed' }));
          break;

        case 'ERROR':
          setError(msg.error);
          setSession((prev) => ({ ...prev, status: 'error' }));
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Process a single batch: render SoM image, call VLM, accumulate results.
   */
  async function processBatch(
    batchIndex: number,
    totalBatches: number,
    batchNodes: NodeMetadata[],
    batchLabels: SoMLabel[],
  ): Promise<void> {
    const params = sessionParams.current;
    if (!params) {
      setError('Session parameters not initialized');
      setSession((prev) => ({ ...prev, status: 'error' }));
      return;
    }

    if (cancelledRef.current) return;

    try {
      setStatusMessage(`Rendering SoM overlay for batch ${batchIndex + 1}/${totalBatches}...`);

      // 1. Render SoM image using Canvas API
      const somImageBase64 = await renderSoMImage({
        baseImageBase64: params.baseImageBase64,
        baseImageWidth: params.baseImageWidth,
        baseImageHeight: params.baseImageHeight,
        labels: batchLabels,
        highlightColor: params.highlightColor,
        labelFontSize: params.labelFontSize,
      });

      if (cancelledRef.current) return;

      // Update the displayed image to the SoM-annotated version
      setCurrentBatchImage(somImageBase64);

      setStatusMessage(`Calling AI for batch ${batchIndex + 1}/${totalBatches}...`);

      // 2. Build a NamingBatch and call VLM
      const batch: NamingBatch = {
        batchIndex,
        totalBatches,
        nodes: batchNodes,
        labels: batchLabels,
        markedImageBase64: somImageBase64,
      };

      const client = new VLMClient({
        vlmProvider: params.vlmProvider,
        apiKey: params.apiKey,
      });

      const results = await client.generateNamesForBatch(
        batch,
        params.globalContext,
        params.platform,
      );

      if (cancelledRef.current) return;

      // 3. Accumulate results
      accumulatedResults.current = [...accumulatedResults.current, ...results];
      setSession((prev) => ({
        ...prev,
        results: [...accumulatedResults.current],
        currentBatch: batchIndex + 1,
      }));

      // 4. Check if this was the last batch
      if (batchIndex === totalBatches - 1) {
        setSession((prev) => ({
          ...prev,
          results: [...accumulatedResults.current],
          status: 'previewing',
        }));
        setStatusMessage('All batches complete. Review the results.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(`Batch ${batchIndex + 1} failed: ${errorMessage}`);
      setSession((prev) => ({ ...prev, status: 'error' }));
    }
  }

  const startNaming = useCallback(
    (globalContext: string, platform: string, provider: string, apiKey: string, configOverrides?: Partial<NamerConfig>) => {
      accumulatedResults.current = [];
      cancelledRef.current = false;
      setError(null);
      setApplyStats(null);
      setCurrentBatchImage(null);
      setCurrentBatchImageSize(null);
      setTraversalProgress({ processed: 0, total: 0 });
      setStatusMessage('Starting...');

      // Store session params for batch processing
      sessionParams.current = {
        globalContext,
        platform,
        vlmProvider: provider,
        apiKey,
        baseImageBase64: '',
        baseImageWidth: 0,
        baseImageHeight: 0,
        highlightColor: config.highlightColor,
        labelFontSize: config.labelFontSize,
      };

      setSession({
        sessionId: `session_${Date.now()}`,
        globalContext,
        platform: platform as NamingSession['platform'],
        allNodes: [],
        results: [],
        status: 'traversing',
        currentBatch: 0,
        totalBatches: 0,
        startedAt: Date.now(),
      });

      postToPlugin({
        type: 'START_NAMING',
        globalContext,
        platform,
        config: configOverrides,
      });
    },
    [config.highlightColor, config.labelFontSize],
  );

  const applyNames = useCallback((results: NamingResult[]) => {
    console.log('[useNamingFlow] applyNames called with', results.length, 'results');
    if (results.length > 0) {
      console.log('[useNamingFlow] first result:', JSON.stringify(results[0]));
    }
    setSession((prev) => ({ ...prev, status: 'applying' }));
    console.log('[useNamingFlow] posting APPLY_NAMES to plugin');
    postToPlugin({ type: 'APPLY_NAMES', results });
    console.log('[useNamingFlow] APPLY_NAMES posted');
  }, []);

  const cancelOperation = useCallback(() => {
    cancelledRef.current = true;
    postToPlugin({ type: 'CANCEL_OPERATION' });
    setSession((prev) => ({ ...prev, status: 'idle' }));
    setError(null);
    setStatusMessage('');
  }, []);

  const reset = useCallback(() => {
    accumulatedResults.current = [];
    cancelledRef.current = false;
    sessionParams.current = null;
    setSession(createEmptySession());
    setError(null);
    setStatusMessage('');
    setApplyStats(null);
    setCurrentBatchImage(null);
    setCurrentBatchImageSize(null);
    setTraversalProgress({ processed: 0, total: 0 });
  }, []);

  const updateConfig = useCallback((cfg: Partial<NamerConfig>) => {
    setConfig((prev) => ({ ...prev, ...cfg }));
    postToPlugin({ type: 'UPDATE_CONFIG', config: cfg });
  }, []);

  const saveApiKeys = useCallback((credentials: Record<string, string>) => {
    setApiKeys(credentials);
    postToPlugin({ type: 'SAVE_API_KEYS', credentials });
  }, []);

  return {
    session,
    status: session.status,
    error,
    statusMessage,
    traversalProgress,
    currentBatchImage,
    currentBatchImageSize,
    applyStats,
    config,
    apiKeys,
    vlmProvider,
    startNaming,
    applyNames,
    cancelOperation,
    reset,
    updateConfig,
    saveApiKeys,
    setVlmProvider,
  };
}
