// ============================================================
// Figma Namer - Web Dashboard App
// State machine: IDLE -> ANALYZING -> COUNTED -> NAMING -> PREVIEWING -> DONE
// ============================================================

import React, { useState, useRef } from 'react';
import { Dashboard, getStoredCredentials } from './components/Dashboard';
import { NodeCounter } from './components/NodeCounter';
import { BatchProgress } from './components/BatchProgress';
import { NamingPreview } from './components/NamingPreview';
import { useNamingFlow } from './hooks/useNamingFlow';
import { useI18n } from './i18n';
import type { NamerConfig, PageInfo } from '@shared/types';

export const App: React.FC = () => {
  const { t } = useI18n();
  const flow = useNamingFlow();

  // Store credentials for passing between steps
  const credentialsRef = useRef<{
    figmaToken: string;
    figmaUrl: string;
    vlmProvider: string;
    vlmApiKey: string;
    globalContext: string;
    platform: string;
    config?: Partial<NamerConfig>;
  }>({
    figmaToken: '',
    figmaUrl: '',
    vlmProvider: 'claude',
    vlmApiKey: '',
    globalContext: '',
    platform: 'Auto',
  });

  const handleAnalyze = (figmaUrl: string, figmaToken: string, vlmApiKey?: string, globalContext?: string, config?: Partial<NamerConfig>) => {
    // Save for later
    credentialsRef.current.figmaUrl = figmaUrl;
    credentialsRef.current.figmaToken = figmaToken;
    credentialsRef.current.config = config;
    if (config?.vlmProvider) {
      credentialsRef.current.vlmProvider = config.vlmProvider;
    }
    // Get stored VLM API key
    const stored = getStoredCredentials();
    credentialsRef.current.vlmApiKey = vlmApiKey || stored.vlmApiKey;
    credentialsRef.current.vlmProvider = stored.vlmProvider;
    if (globalContext) credentialsRef.current.globalContext = globalContext;

    // Pass vlmApiKey for structure analysis
    flow.analyze(figmaUrl, figmaToken, credentialsRef.current.vlmApiKey, credentialsRef.current.globalContext, config);
  };

  const handleStartNaming = (selectedPages?: PageInfo[]) => {
    const creds = credentialsRef.current;
    flow.startNaming({
      figmaToken: creds.figmaToken,
      vlmProvider: creds.vlmProvider,
      vlmApiKey: creds.vlmApiKey,
      globalContext: creds.globalContext,
      platform: creds.platform,
      config: creds.config,
      pages: selectedPages,
    });
  };

  // IDLE: show dashboard
  if (flow.status === 'idle') {
    return (
      <Dashboard
        onAnalyze={handleAnalyze}
        isAnalyzing={false}
        error={flow.error}
      />
    );
  }

  // ANALYZING: show dashboard with loading
  if (flow.status === 'analyzing') {
    return (
      <Dashboard
        onAnalyze={handleAnalyze}
        isAnalyzing={true}
        error={flow.error}
      />
    );
  }

  // COUNTED: show node counter
  if (flow.status === 'counted' && flow.analyzeResult) {
    return (
      <NodeCounter
        result={flow.analyzeResult}
        onStartNaming={handleStartNaming}
        onBack={flow.reset}
        isNaming={false}
      />
    );
  }

  // NAMING: show batch progress
  if (flow.status === 'naming') {
    return (
      <BatchProgress
        currentBatch={flow.currentBatch}
        totalBatches={flow.totalBatches}
        completedNodes={flow.completedNodes}
        totalNodes={flow.totalNodes}
        message={flow.progressMessage}
        somPreviewImage={flow.somPreviewImage}
        cleanPreviewImage={flow.cleanPreviewImage}
        framePreviewImage={flow.framePreviewImage}
        error={flow.error}
        onCancel={flow.reset}
        currentPage={flow.currentPage}
        totalPages={flow.totalPages}
        currentPageName={flow.currentPageName}
        partialResults={flow.partialResults}
      />
    );
  }

  // PREVIEWING: show naming results
  if (flow.status === 'previewing') {
    return (
      <NamingPreview
        results={flow.results}
        sessionId={flow.sessionId}
        onDone={flow.reset}
        onBack={flow.reset}
      />
    );
  }

  // DONE: show success and reset
  if (flow.status === 'done') {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.successIcon}>
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <circle cx="24" cy="24" r="23" fill="#14AE5C" />
            <path d="M15 24L21 30L33 18" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h2 style={styles.centerTitle}>{t('app.complete')}</h2>
        <p style={styles.centerSubtext}>
          {t('app.completeHint')}
        </p>
        <button className="btn-primary" onClick={flow.reset} style={{ marginTop: 16 }}>
          {t('app.newSession')}
        </button>
      </div>
    );
  }

  // Fallback
  return (
    <div style={styles.centerContainer}>
      <p style={styles.centerSubtext}>Unknown state: {flow.status}</p>
      <button className="btn-outline" onClick={flow.reset}>Reset</button>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  centerContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    padding: '40px 24px',
    textAlign: 'center',
  },
  successIcon: {
    marginBottom: 20,
  },
  centerTitle: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--color-text)',
    marginBottom: 8,
  },
  centerSubtext: {
    fontSize: 14,
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
    maxWidth: 400,
  },
};
