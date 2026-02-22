// ============================================================
// Figma Namer - Message Protocol
// Communication between Plugin Main Thread <-> UI Iframe
// ============================================================

import type {
  NodeMetadata,
  NamingResult,
  NamingSession,
  NamerConfig,
  SessionStatus,
} from './types';

// ---- Messages from Main Thread -> UI ----

export type PluginToUIMessage =
  | { type: 'TRAVERSAL_COMPLETE'; nodes: NodeMetadata[]; totalCount: number }
  | { type: 'TRAVERSAL_PROGRESS'; processed: number; total: number }
  | { type: 'IMAGE_EXPORTED'; imageBase64: string; width: number; height: number }
  | { type: 'SOM_BATCH_READY'; batchIndex: number; totalBatches: number }
  | { type: 'NAMING_RESULTS'; results: NamingResult[]; batchIndex: number }
  | { type: 'ALL_BATCHES_COMPLETE'; allResults: NamingResult[] }
  | { type: 'APPLY_COMPLETE'; appliedCount: number; failedCount: number }
  | { type: 'STATUS_UPDATE'; status: SessionStatus; message: string }
  | { type: 'ERROR'; error: string; code: string }
  | { type: 'CONFIG_LOADED'; config: NamerConfig };

// ---- Messages from UI -> Main Thread ----

export type UIToPluginMessage =
  | { type: 'START_TRAVERSAL' }
  | { type: 'START_NAMING'; globalContext: string; platform: string; config?: Partial<NamerConfig> }
  | { type: 'EXPORT_IMAGE'; nodeIds: string[]; scale: number }
  | { type: 'APPLY_NAMES'; results: NamingResult[] }
  | { type: 'APPLY_SINGLE'; nodeId: string; newName: string }
  | { type: 'CANCEL_OPERATION' }
  | { type: 'UPDATE_CONFIG'; config: Partial<NamerConfig> }
  | { type: 'REVERT_NAMES'; results: NamingResult[] };

// ---- Messages from UI -> Backend API ----

export interface APIRequest {
  action: 'generate_names';
  imageBase64: string;
  nodeTextSupplements: Array<{
    markId: number;
    textContent: string | null;
    boundVariables: string[];
    componentProperties: Record<string, string>;
  }>;
  globalContext: string;
  platform: string;
  vlmProvider: 'claude' | 'openai';
}

export interface APIResponse {
  success: boolean;
  data?: {
    namings: Array<{
      markId: number;
      name: string;
      confidence: number;
    }>;
    model: string;
    usage: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  };
  error?: string;
}
