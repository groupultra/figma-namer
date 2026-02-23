// ============================================================
// Figma Namer - Shared Type Definitions
// Core types used across plugin main thread, UI, and backend
// ============================================================

/** Bounding box for a Figma node (absolute coordinates) */
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Metadata extracted from a single Figma node during traversal */
export interface NodeMetadata {
  /** Figma internal node ID */
  id: string;
  /** Original layer name in Figma */
  originalName: string;
  /** Node type (FRAME, GROUP, COMPONENT, INSTANCE, TEXT, etc.) */
  nodeType: string;
  /** Absolute bounding box on the canvas */
  boundingBox: BoundingBox;
  /** Depth level in the node tree (0 = root selection) */
  depth: number;
  /** Parent node ID */
  parentId: string | null;
  /** Inner text content (for TextNode or nodes containing text) */
  textContent: string | null;
  /** Bound design variables/tokens (e.g., "Surface/Danger/Hover") */
  boundVariables: string[];
  /** Component properties if it's an instance (e.g., "Variant=Primary, State=Disabled") */
  componentProperties: Record<string, string>;
  /** Whether the node has children */
  hasChildren: boolean;
  /** Number of direct children */
  childCount: number;
  /** Auto-layout direction if applicable */
  layoutMode: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
}

/** SoM (Set-of-Mark) label for a single marked node */
export interface SoMLabel {
  /** Auto-incremented numeric ID displayed on the image */
  markId: number;
  /** Reference to the Figma node ID */
  nodeId: string;
  /** Position of the label on the canvas image */
  labelPosition: { x: number; y: number };
  /** Bounding box of the highlight overlay */
  highlightBox: BoundingBox;
  /** Original node name for reference */
  originalName: string;
}

/** A batch of nodes to be processed by VLM in one API call */
export interface NamingBatch {
  /** Batch index (0-based) */
  batchIndex: number;
  /** Total number of batches */
  totalBatches: number;
  /** Nodes in this batch */
  nodes: NodeMetadata[];
  /** SoM labels for this batch */
  labels: SoMLabel[];
  /** Base64-encoded PNG image with SoM markings */
  markedImageBase64: string;
}

/** Single naming result from VLM */
export interface NamingResult {
  /** SoM mark ID */
  markId: number;
  /** Figma node ID */
  nodeId: string;
  /** Original name before renaming */
  originalName: string;
  /** AI-generated semantic name following CESPC framework */
  suggestedName: string;
  /** Confidence score (0-1) if provided by VLM */
  confidence: number;
}

/** Full naming session state */
export interface NamingSession {
  /** Unique session ID */
  sessionId: string;
  /** User-provided global context hint */
  globalContext: string;
  /** Target platform if specified */
  platform: 'iOS' | 'Android' | 'Web' | 'Auto' | '';
  /** All extracted node metadata */
  allNodes: NodeMetadata[];
  /** Naming results from VLM */
  results: NamingResult[];
  /** Current processing status */
  status: SessionStatus;
  /** Current batch being processed */
  currentBatch: number;
  /** Total batches */
  totalBatches: number;
  /** Timestamp */
  startedAt: number;
}

export type SessionStatus =
  | 'idle'
  | 'traversing'
  | 'rendering_som'
  | 'calling_vlm'
  | 'previewing'
  | 'applying'
  | 'completed'
  | 'error';

/** VLM API request payload */
export interface VLMRequest {
  /** Base64 image with SoM marks */
  imageBase64: string;
  /** Text metadata supplement for nodes in this batch */
  nodeTextSupplements: Array<{
    markId: number;
    textContent: string | null;
    boundVariables: string[];
    componentProperties: Record<string, string>;
  }>;
  /** Global context from the user */
  globalContext: string;
  /** Target platform */
  platform: string;
  /** Max nodes in this batch */
  batchSize: number;
}

/** VLM API response */
export interface VLMResponse {
  /** Array of naming suggestions keyed by mark ID */
  namings: Array<{
    markId: number;
    name: string;
    confidence: number;
  }>;
  /** Model used */
  model: string;
  /** Token usage */
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** Configuration for the naming tool */
export interface NamerConfig {
  /** VLM model selection */
  vlmProvider: 'gemini-flash' | 'gemini-pro' | 'claude-sonnet' | 'claude-opus' | 'gpt-5';
  /** Backend API endpoint */
  apiEndpoint: string;
  /** Max nodes per VLM batch */
  batchSize: number;
  /** Image export scale factor */
  exportScale: number;
  /** SoM highlight color (hex) */
  highlightColor: string;
  /** Label font size in pixels */
  labelFontSize: number;
  /** Whether to include locked layers */
  includeLocked: boolean;
  /** Whether to include invisible layers */
  includeInvisible: boolean;
  /** Minimum node area to include (px^2) - filters tiny decorative elements */
  minNodeArea: number;
  /** Node types to include in traversal */
  includeNodeTypes: string[];
}

// ============================================================
// Web Dashboard Types (Figma REST API)
// ============================================================

/** A Figma node from the REST API JSON response */
export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  visible?: boolean;
  locked?: boolean;
  children?: FigmaNode[];
  absoluteBoundingBox?: BoundingBox;
  absoluteRenderBounds?: BoundingBox;
  characters?: string;
  componentProperties?: Record<string, { type: string; value: string }>;
  boundVariables?: Record<string, unknown>;
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
}

/** File classification based on structure analysis */
export type FileClassification =
  | 'app-screens'
  | 'component-library'
  | 'icon-library'
  | 'mixed'
  | 'landing-page'
  | 'unknown';

/** A page (top-level frame/screen) identified by structure analysis */
export interface PageInfo {
  /** Figma node ID of the page/screen */
  nodeId: string;
  /** Display name of the page */
  name: string;
  /** Role identified by AI */
  pageRole: string;
  /** Whether this is an auxiliary element (notes, annotations, dividers) */
  isAuxiliary: boolean;
  /** Node IDs within this page that need naming */
  nodeIdsToName: string[];
  /** Extracted node metadata for nodes to name */
  nodes: NodeMetadata[];
}

/** Result of AI structure analysis (Round 1) */
export interface StructureAnalysis {
  /** Detected file type */
  fileType: FileClassification;
  /** AI reasoning about the file structure */
  reasoning: string;
  /** Identified pages/screens with their roles */
  pages: PageInfo[];
  /** Model used for analysis */
  analysisModel: string;
}

/** Analysis result from POST /api/analyze */
export interface AnalyzeResult {
  totalNodes: number;
  nodesByType: Record<string, number>;
  nodes: NodeMetadata[];
  estimatedBatches: number;
  rootName: string;
  /** The root node ID (for frame context export) */
  rootNodeId: string | null;
  /** Structure analysis result (when AI analysis is used) */
  structureAnalysis?: StructureAnalysis;
  /** Identified pages for page-based naming */
  pages?: PageInfo[];
  /** Total number of identified pages */
  totalPages?: number;
}

/** SSE progress event types */
export type ProgressEventType =
  | 'structure_analysis_started'
  | 'structure_analysis_complete'
  | 'page_started'
  | 'page_complete'
  | 'batch_started'
  | 'image_exported'
  | 'som_rendered'
  | 'vlm_called'
  | 'batch_complete'
  | 'all_complete'
  | 'error';

/** SSE progress event data */
export interface ProgressEvent {
  type: ProgressEventType;
  sessionId: string;
  batchIndex?: number;
  totalBatches?: number;
  completedNodes?: number;
  totalNodes?: number;
  message?: string;
  results?: NamingResult[];
  /** SoM annotated image (numbered labels) */
  somImageBase64?: string;
  /** Clean base image (no SoM overlay) for comparison */
  cleanImageBase64?: string;
  /** Full frame context image (exported once) */
  frameImageBase64?: string;
  /** Current page index (0-based) */
  pageIndex?: number;
  /** Total pages */
  totalPages?: number;
  /** Current page name */
  pageName?: string;
  /** Structure analysis result */
  structureAnalysis?: StructureAnalysis;
}

/** Default configuration */
export const DEFAULT_CONFIG: NamerConfig = {
  vlmProvider: 'gemini-flash',
  apiEndpoint: 'https://figma-namer-api.vercel.app/api/naming',
  batchSize: 8,
  exportScale: 2,
  highlightColor: '#FF0040',
  labelFontSize: 14,
  includeLocked: false,
  includeInvisible: false,
  minNodeArea: 400,
  includeNodeTypes: [
    'FRAME',
    'GROUP',
    'COMPONENT',
    'COMPONENT_SET',
    'INSTANCE',
    'TEXT',
    'SECTION',
  ],
};
