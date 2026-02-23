// ============================================================
// Figma Namer - SSE Progress Hook
// Listens to Server-Sent Events for real-time batch progress
// Supports page-level and batch-level events
// ============================================================

import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProgressEvent, NamingResult, StructureAnalysis } from '@shared/types';

export interface UseSSEProgressReturn {
  isConnected: boolean;
  currentBatch: number;
  totalBatches: number;
  completedNodes: number;
  totalNodes: number;
  latestMessage: string;
  /** SoM annotated image (numbered labels) */
  latestSomImage: string | null;
  /** Clean base image (no markup) */
  latestCleanImage: string | null;
  /** Full frame context image */
  frameImage: string | null;
  batchResults: NamingResult[];
  allComplete: boolean;
  error: string | null;
  /** Page-level progress */
  currentPage: number;
  totalPages: number;
  currentPageName: string;
  /** Structure analysis result */
  structureAnalysis: StructureAnalysis | null;
  connect: (sessionId: string) => void;
  disconnect: () => void;
}

export function useSSEProgress(): UseSSEProgressReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [completedNodes, setCompletedNodes] = useState(0);
  const [totalNodes, setTotalNodes] = useState(0);
  const [latestMessage, setLatestMessage] = useState('');
  const [latestSomImage, setLatestSomImage] = useState<string | null>(null);
  const [latestCleanImage, setLatestCleanImage] = useState<string | null>(null);
  const [frameImage, setFrameImage] = useState<string | null>(null);
  const [batchResults, setBatchResults] = useState<NamingResult[]>([]);
  const [allComplete, setAllComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPageName, setCurrentPageName] = useState('');
  const [structureAnalysis, setStructureAnalysis] = useState<StructureAnalysis | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback((sessionId: string) => {
    disconnect();

    setCurrentBatch(0);
    setTotalBatches(0);
    setCompletedNodes(0);
    setTotalNodes(0);
    setLatestMessage('Connecting...');
    setLatestSomImage(null);
    setLatestCleanImage(null);
    setFrameImage(null);
    setBatchResults([]);
    setAllComplete(false);
    setError(null);
    setCurrentPage(0);
    setTotalPages(0);
    setCurrentPageName('');
    setStructureAnalysis(null);

    const es = new EventSource(`/api/progress/${sessionId}`);
    eventSourceRef.current = es;

    es.onopen = () => {
      setIsConnected(true);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ProgressEvent;
        const eventType = data.type as string;

        switch (eventType) {
          case 'connected':
            setLatestMessage('Connected to server');
            break;

          case 'structure_analysis_started':
            setLatestMessage(data.message ?? 'Analyzing file structure...');
            break;

          case 'structure_analysis_complete':
            if (data.structureAnalysis) setStructureAnalysis(data.structureAnalysis);
            setLatestMessage(data.message ?? 'Structure analysis complete');
            break;

          case 'page_started':
            setCurrentPage(data.pageIndex ?? 0);
            if (data.totalPages) setTotalPages(data.totalPages);
            if (data.pageName) setCurrentPageName(data.pageName);
            setLatestMessage(data.message ?? `Starting page: ${data.pageName}`);
            break;

          case 'page_complete':
            setLatestMessage(data.message ?? `Page complete: ${data.pageName}`);
            break;

          case 'batch_started':
            setCurrentBatch(data.batchIndex ?? 0);
            setTotalBatches(data.totalBatches ?? 0);
            if (data.pageIndex !== undefined) setCurrentPage(data.pageIndex);
            if (data.totalPages) setTotalPages(data.totalPages);
            if (data.pageName) setCurrentPageName(data.pageName);
            setLatestMessage(data.message ?? `Processing batch ${(data.batchIndex ?? 0) + 1}`);
            break;

          case 'image_exported':
            if (data.cleanImageBase64) setLatestCleanImage(data.cleanImageBase64);
            if (data.frameImageBase64) setFrameImage(data.frameImageBase64);
            setLatestMessage('Image exported, rendering SoM marks...');
            break;

          case 'som_rendered':
            if (data.somImageBase64) setLatestSomImage(data.somImageBase64);
            if (data.cleanImageBase64) setLatestCleanImage(data.cleanImageBase64);
            setLatestMessage('SoM overlay rendered, calling AI model...');
            break;

          case 'vlm_called':
            setLatestMessage('AI model responded, parsing results...');
            break;

          case 'batch_complete':
            setCompletedNodes(data.completedNodes ?? 0);
            setTotalNodes(data.totalNodes ?? 0);
            if (data.results) {
              setBatchResults((prev) => [...prev, ...data.results!]);
            }
            if (data.pageName) {
              setLatestMessage(
                `Page "${data.pageName}" - Batch ${(data.batchIndex ?? 0) + 1}/${data.totalBatches ?? 0} complete`,
              );
            } else {
              setLatestMessage(
                `Batch ${(data.batchIndex ?? 0) + 1} of ${data.totalBatches ?? 0} complete`,
              );
            }
            break;

          case 'all_complete':
            setAllComplete(true);
            setLatestMessage('All batches complete!');
            if (data.results) {
              setBatchResults(data.results);
            }
            es.close();
            setIsConnected(false);
            break;

          case 'error':
            setError(data.message ?? 'Unknown error');
            setLatestMessage(`Error: ${data.message}`);
            es.close();
            setIsConnected(false);
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        setIsConnected(false);
      }
    };
  }, [disconnect]);

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    currentBatch,
    totalBatches,
    completedNodes,
    totalNodes,
    latestMessage,
    latestSomImage,
    latestCleanImage,
    frameImage,
    batchResults,
    allComplete,
    error,
    currentPage,
    totalPages,
    currentPageName,
    structureAnalysis,
    connect,
    disconnect,
  };
}
