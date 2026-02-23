// ============================================================
// Figma Namer - App Component
// Root component that orchestrates the naming session flow
// ============================================================

import React from 'react';
import { useNamingFlow } from './hooks/useNamingFlow';
import { ContextInput } from './components/ContextInput';
import { BatchProgress } from './components/BatchProgress';
import { NamingPreview } from './components/NamingPreview';

export const App: React.FC = () => {
  const {
    session,
    status,
    error,
    statusMessage,
    traversalProgress,
    currentBatchImage,
    applyStats,
    startNaming,
    applyNames,
    cancelOperation,
    reset,
  } = useNamingFlow();

  // ---- Render based on SessionStatus ----

  // Idle: show start screen
  if (status === 'idle') {
    return <ContextInput onStart={startNaming} />;
  }

  // Processing: traversal, rendering SoM, calling VLM
  if (status === 'traversing' || status === 'rendering_som' || status === 'calling_vlm') {
    return (
      <BatchProgress
        status={status}
        statusMessage={statusMessage}
        currentBatch={session.currentBatch}
        totalBatches={session.totalBatches}
        traversalProgress={traversalProgress}
        currentBatchImage={currentBatchImage}
        startedAt={session.startedAt}
        onCancel={cancelOperation}
      />
    );
  }

  // Preview: show naming results for review
  if (status === 'previewing') {
    return (
      <NamingPreview
        results={session.results}
        onApply={applyNames}
        onCancel={cancelOperation}
      />
    );
  }

  // Applying: show progress
  if (status === 'applying') {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.spinner} />
        <p style={styles.centerTitle}>Applying Names...</p>
        <p style={styles.centerSubtext}>
          Renaming {session.results.length} layers in your Figma file.
        </p>
        <style>{`
          @keyframes figma-namer-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Completed: show summary
  if (status === 'completed') {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.successIcon}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" fill="#14AE5C" />
            <path
              d="M10 16.5L14 20.5L22 12.5"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <p style={styles.centerTitle}>Naming Complete!</p>
        {applyStats && (
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <span style={styles.statNumber}>{applyStats.applied}</span>
              <span style={styles.statLabel}>Applied</span>
            </div>
            {applyStats.failed > 0 && (
              <div style={{ ...styles.statCard, borderColor: 'var(--color-danger)' }}>
                <span style={{ ...styles.statNumber, color: 'var(--color-danger)' }}>
                  {applyStats.failed}
                </span>
                <span style={styles.statLabel}>Failed</span>
              </div>
            )}
          </div>
        )}
        <p style={styles.centerSubtext}>
          Your layers have been renamed with semantic names.
        </p>
        <div style={styles.completedActions}>
          <button className="btn-primary" style={styles.actionButton} onClick={reset}>
            Start New Session
          </button>
        </div>
      </div>
    );
  }

  // Error: show error message
  if (status === 'error') {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.errorIcon}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" fill="#FF4040" />
            <path
              d="M12 12L20 20M20 12L12 20"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p style={styles.centerTitle}>Something Went Wrong</p>
        <div style={styles.errorBox}>
          <p style={styles.errorText}>{error || 'An unknown error occurred.'}</p>
        </div>
        <div style={styles.completedActions}>
          <button className="btn-outline" style={styles.actionButton} onClick={reset}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div style={styles.centerContainer}>
      <p style={styles.centerSubtext}>Unknown state: {status}</p>
      <button className="btn-outline" onClick={reset}>
        Reset
      </button>
    </div>
  );
};

// ---- Styles ----

const styles: Record<string, React.CSSProperties> = {
  centerContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    padding: '40px 24px',
    textAlign: 'center',
  },
  spinner: {
    width: 32,
    height: 32,
    border: '3px solid var(--color-border)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'figma-namer-spin 0.8s linear infinite',
    marginBottom: 16,
  },
  centerTitle: {
    fontSize: 16,
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: 8,
  },
  centerSubtext: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    lineHeight: '1.5',
    maxWidth: 300,
    marginBottom: 16,
  },
  successIcon: {
    marginBottom: 16,
  },
  errorIcon: {
    marginBottom: 16,
  },
  statsGrid: {
    display: 'flex',
    gap: 16,
    marginBottom: 16,
  },
  statCard: {
    padding: '12px 24px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--color-success)',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  errorBox: {
    background: 'rgba(255,64,64,0.06)',
    border: '1px solid rgba(255,64,64,0.2)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    marginBottom: 16,
    maxWidth: 360,
    width: '100%',
  },
  errorText: {
    fontSize: 11,
    color: 'var(--color-danger)',
    lineHeight: '1.5',
    wordBreak: 'break-word',
  },
  completedActions: {
    display: 'flex',
    gap: 8,
  },
  actionButton: {
    minWidth: 140,
  },
};
