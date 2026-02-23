// ============================================================
// Figma Namer - Web Dashboard Naming Flow Hook
// Orchestrates the full analyze → name → preview → export flow
// Supports page-based agentic flow
// ============================================================

import { useState, useCallback, useRef } from 'react';
import type { NodeMetadata, NamingResult, NamerConfig, AnalyzeResult, PageInfo, StructureAnalysis } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';
import { useSSEProgress } from './useSSEProgress';

export type DashboardStatus =
  | 'idle'
  | 'analyzing'
  | 'counted'
  | 'naming'
  | 'previewing'
  | 'done';

export interface UseNamingFlowReturn {
  status: DashboardStatus;
  error: string | null;
  analyzeResult: AnalyzeResult | null;
  sessionId: string | null;
  fileKey: string | null;
  results: NamingResult[];
  // SSE progress
  currentBatch: number;
  totalBatches: number;
  completedNodes: number;
  totalNodes: number;
  progressMessage: string;
  somPreviewImage: string | null;
  cleanPreviewImage: string | null;
  framePreviewImage: string | null;
  // Page-level progress
  currentPage: number;
  totalPages: number;
  currentPageName: string;
  structureAnalysis: StructureAnalysis | null;
  // Actions
  analyze: (figmaUrl: string, figmaToken: string, vlmApiKey?: string, globalContext?: string, config?: Partial<NamerConfig>) => Promise<void>;
  startNaming: (params: {
    figmaToken: string;
    vlmProvider: string;
    vlmApiKey: string;
    globalContext: string;
    platform: string;
    config?: Partial<NamerConfig>;
    pages?: PageInfo[];
  }) => Promise<void>;
  reset: () => void;
  goToPreview: () => void;
}

export function useNamingFlow(): UseNamingFlowReturn {
  const [status, setStatus] = useState<DashboardStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [fileKey, setFileKey] = useState<string | null>(null);
  const [rootNodeId, setRootNodeId] = useState<string | null>(null);
  const [results, setResults] = useState<NamingResult[]>([]);
  const nodesRef = useRef<NodeMetadata[]>([]);
  const pagesRef = useRef<PageInfo[]>([]);

  const sse = useSSEProgress();

  const sseRef = useRef(sse);
  sseRef.current = sse;

  const analyze = useCallback(async (
    figmaUrl: string,
    figmaToken: string,
    vlmApiKey?: string,
    globalContext?: string,
    config?: Partial<NamerConfig>,
  ) => {
    setStatus('analyzing');
    setError(null);
    setAnalyzeResult(null);

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaUrl, figmaToken, vlmApiKey, globalContext, config }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Analysis failed (${res.status})`);
      }

      const data: AnalyzeResult = await res.json();
      setAnalyzeResult(data);
      nodesRef.current = data.nodes;
      pagesRef.current = data.pages || [];
      setRootNodeId(data.rootNodeId ?? null);

      // Extract fileKey from URL for later use
      const keyMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
      if (keyMatch) setFileKey(keyMatch[1]);

      setStatus('counted');
    } catch (err: any) {
      setError(err.message);
      setStatus('idle');
    }
  }, []);

  const startNaming = useCallback(async (params: {
    figmaToken: string;
    vlmProvider: string;
    vlmApiKey: string;
    globalContext: string;
    platform: string;
    config?: Partial<NamerConfig>;
    pages?: PageInfo[];
  }) => {
    setStatus('naming');
    setError(null);
    setResults([]);

    try {
      const activePages = params.pages || pagesRef.current;
      const usePages = activePages.length > 0;

      const res = await fetch('/api/name', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(usePages ? { pages: activePages } : { nodes: nodesRef.current }),
          figmaToken: params.figmaToken,
          fileKey,
          rootNodeId,
          vlmProvider: params.vlmProvider,
          vlmApiKey: params.vlmApiKey,
          globalContext: params.globalContext,
          platform: params.platform,
          config: params.config,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Naming failed (${res.status})`);
      }

      const data = await res.json();
      setSessionId(data.sessionId);

      // Connect to SSE for progress
      sseRef.current.connect(data.sessionId);
    } catch (err: any) {
      setError(err.message);
      setStatus('counted');
    }
  }, [fileKey, rootNodeId]);

  const reset = useCallback(() => {
    sse.disconnect();
    setStatus('idle');
    setError(null);
    setAnalyzeResult(null);
    setSessionId(null);
    setFileKey(null);
    setRootNodeId(null);
    setResults([]);
    nodesRef.current = [];
    pagesRef.current = [];
  }, [sse]);

  const goToPreview = useCallback(() => {
    if (sse.batchResults.length > 0) {
      setResults(sse.batchResults);
      setStatus('previewing');
    }
  }, [sse.batchResults]);

  // Check SSE completion status
  if (status === 'naming' && sse.allComplete && results.length === 0) {
    setResults(sse.batchResults);
    setStatus('previewing');
  }
  if (status === 'naming' && sse.error && !error) {
    setError(sse.error);
  }

  return {
    status,
    error,
    analyzeResult,
    sessionId,
    fileKey,
    results,
    currentBatch: sse.currentBatch,
    totalBatches: sse.totalBatches,
    completedNodes: sse.completedNodes,
    totalNodes: sse.totalNodes,
    progressMessage: sse.latestMessage,
    somPreviewImage: sse.latestSomImage,
    cleanPreviewImage: sse.latestCleanImage,
    framePreviewImage: sse.frameImage,
    currentPage: sse.currentPage,
    totalPages: sse.totalPages,
    currentPageName: sse.currentPageName,
    structureAnalysis: sse.structureAnalysis,
    analyze,
    startNaming,
    reset,
    goToPreview,
  };
}
