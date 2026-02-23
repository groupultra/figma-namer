// ============================================================
// Figma Namer - useNamingFlow Hook
// Manages the entire naming session state and postMessage comms
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  NamingSession,
  NamingResult,
  NamerConfig,
  SessionStatus,
  NodeMetadata,
} from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/types';
import type { PluginToUIMessage, UIToPluginMessage } from '../../shared/messages';

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

  /** Start the naming flow */
  startNaming: (globalContext: string, platform: string, configOverrides?: Partial<NamerConfig>) => void;
  /** Apply selected naming results */
  applyNames: (results: NamingResult[]) => void;
  /** Cancel the current operation */
  cancelOperation: () => void;
  /** Reset back to idle */
  reset: () => void;
  /** Update config */
  updateConfig: (config: Partial<NamerConfig>) => void;
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

  // accumulate results across batches
  const accumulatedResults = useRef<NamingResult[]>([]);

  /** Listen for messages from the main thread */
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage as PluginToUIMessage | undefined;
      if (!msg) return;

      switch (msg.type) {
        case 'CONFIG_LOADED':
          setConfig(msg.config);
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
          break;

        case 'SOM_BATCH_READY':
          setSession((prev) => ({
            ...prev,
            currentBatch: msg.batchIndex,
            totalBatches: msg.totalBatches,
            status: 'calling_vlm',
          }));
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
  }, []);

  const startNaming = useCallback(
    (globalContext: string, platform: string, configOverrides?: Partial<NamerConfig>) => {
      accumulatedResults.current = [];
      setError(null);
      setApplyStats(null);
      setCurrentBatchImage(null);
      setCurrentBatchImageSize(null);
      setTraversalProgress({ processed: 0, total: 0 });
      setStatusMessage('Starting...');
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
    [],
  );

  const applyNames = useCallback((results: NamingResult[]) => {
    setSession((prev) => ({ ...prev, status: 'applying' }));
    postToPlugin({ type: 'APPLY_NAMES', results });
  }, []);

  const cancelOperation = useCallback(() => {
    postToPlugin({ type: 'CANCEL_OPERATION' });
    setSession((prev) => ({ ...prev, status: 'idle' }));
    setError(null);
    setStatusMessage('');
  }, []);

  const reset = useCallback(() => {
    accumulatedResults.current = [];
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
    startNaming,
    applyNames,
    cancelOperation,
    reset,
    updateConfig,
  };
}
