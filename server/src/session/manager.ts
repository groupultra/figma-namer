// ============================================================
// Figma Namer - Session Manager
// Tracks naming sessions and their progress for SSE streaming
// ============================================================

import type { NamingResult, ProgressEvent } from '@shared/types';

export interface NamingSession {
  id: string;
  status: 'pending' | 'analyzing' | 'naming' | 'complete' | 'error';
  totalNodes: number;
  totalBatches: number;
  completedBatches: number;
  completedNodes: number;
  results: NamingResult[];
  error?: string;
  /** Page-level tracking */
  totalPages: number;
  completedPages: number;
  currentPageName: string;
  /** SSE listeners for this session */
  listeners: Set<(event: ProgressEvent) => void>;
  createdAt: number;
}

const sessions = new Map<string, NamingSession>();

// Cleanup old sessions after 1 hour
const SESSION_TTL = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > SESSION_TTL) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

export function createSession(): NamingSession {
  const id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const session: NamingSession = {
    id,
    status: 'pending',
    totalNodes: 0,
    totalBatches: 0,
    completedBatches: 0,
    completedNodes: 0,
    results: [],
    totalPages: 0,
    completedPages: 0,
    currentPageName: '',
    listeners: new Set(),
    createdAt: Date.now(),
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): NamingSession | undefined {
  return sessions.get(id);
}

export function emitProgress(sessionId: string, event: ProgressEvent): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  for (const listener of session.listeners) {
    try {
      listener(event);
    } catch {
      // Remove broken listeners
      session.listeners.delete(listener);
    }
  }
}

export function addListener(
  sessionId: string,
  listener: (event: ProgressEvent) => void,
): () => void {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  session.listeners.add(listener);
  return () => {
    session.listeners.delete(listener);
  };
}
