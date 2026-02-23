// ============================================================
// Figma Namer - BatchProgress Component (Web Dashboard)
// Real-time progress display driven by SSE events
// ============================================================

import React, { useMemo } from 'react';

interface BatchProgressProps {
  currentBatch: number;
  totalBatches: number;
  completedNodes: number;
  totalNodes: number;
  message: string;
  somPreviewImage: string | null;
  error: string | null;
  onCancel: () => void;
}

export const BatchProgress: React.FC<BatchProgressProps> = ({
  currentBatch,
  totalBatches,
  completedNodes,
  totalNodes,
  message,
  somPreviewImage,
  error,
  onCancel,
}) => {
  const progressPercent = useMemo(() => {
    if (totalBatches === 0) return 5;
    return Math.round(((currentBatch + 1) / totalBatches) * 100);
  }, [currentBatch, totalBatches]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>AI Naming in Progress</h2>

        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>{error}</span>
          </div>
        )}

        {/* Progress bar */}
        <div style={styles.progressSection}>
          <div style={styles.progressTrack}>
            <div
              style={{
                ...styles.progressFill,
                width: `${progressPercent}%`,
              }}
            />
          </div>
          <div style={styles.progressLabel}>
            <span>{message}</span>
            <span style={styles.percent}>{progressPercent}%</span>
          </div>
        </div>

        {/* Stats */}
        <div style={styles.statsRow}>
          <div style={styles.stat}>
            <span style={styles.statNumber}>
              {currentBatch + 1} / {totalBatches || '?'}
            </span>
            <span style={styles.statLabel}>Batches</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statNumber}>
              {completedNodes} / {totalNodes || '?'}
            </span>
            <span style={styles.statLabel}>Nodes Named</span>
          </div>
        </div>

        {/* Batch dots */}
        {totalBatches > 1 && totalBatches <= 20 && (
          <div style={styles.batchDots}>
            {Array.from({ length: totalBatches }).map((_, i) => (
              <div
                key={i}
                style={{
                  ...styles.dot,
                  ...(i <= currentBatch ? styles.dotDone : {}),
                  ...(i === currentBatch ? styles.dotActive : {}),
                }}
              />
            ))}
          </div>
        )}

        {/* SoM preview */}
        {somPreviewImage && (
          <div style={styles.previewSection}>
            <span style={styles.previewLabel}>Current Batch Preview</span>
            <div style={styles.previewContainer}>
              <img
                src={`data:image/png;base64,${somPreviewImage}`}
                alt="SoM marked screenshot"
                style={styles.previewImage}
              />
            </div>
          </div>
        )}

        {/* Spinner + message */}
        <div style={styles.spinnerSection}>
          <div style={styles.spinner} />
          <span style={styles.spinnerText}>Processing...</span>
        </div>

        {/* Cancel */}
        <div style={styles.footer}>
          <button className="btn-outline" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 20px',
  },
  card: {
    width: '100%',
    maxWidth: 560,
    background: 'var(--color-bg)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    padding: '32px',
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: '0 0 20px 0',
  },
  errorBox: {
    background: 'rgba(255,64,64,0.06)',
    border: '1px solid rgba(255,64,64,0.2)',
    borderRadius: 'var(--radius)',
    padding: '10px 14px',
    marginBottom: 16,
  },
  errorText: {
    fontSize: 13,
    color: 'var(--color-danger)',
    lineHeight: '1.5',
  },
  progressSection: {
    marginBottom: 20,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    background: 'var(--color-bg-secondary)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #0D99FF, #6C5CE7, #0D99FF)',
    backgroundSize: '200% 100%',
    borderRadius: 4,
    transition: 'width 0.4s ease',
    animation: 'progress-stripe 2s linear infinite',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
  },
  percent: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  statsRow: {
    display: 'flex',
    gap: 16,
    marginBottom: 16,
  },
  stat: {
    flex: 1,
    padding: '12px',
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius)',
    textAlign: 'center' as const,
  },
  statNumber: {
    display: 'block',
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--color-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    display: 'block',
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    marginTop: 2,
  },
  batchDots: {
    display: 'flex',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'var(--color-border)',
    transition: 'all 0.3s ease',
  },
  dotDone: {
    background: 'var(--color-success)',
  },
  dotActive: {
    background: 'var(--color-primary)',
    boxShadow: '0 0 0 3px rgba(13,153,255,0.25)',
  },
  previewSection: {
    marginBottom: 16,
  },
  previewLabel: {
    display: 'block',
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    marginBottom: 8,
    fontWeight: 500,
  },
  previewContainer: {
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    maxHeight: 240,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8f8f8',
  },
  previewImage: {
    width: '100%',
    height: 'auto',
    objectFit: 'contain' as const,
    maxHeight: 240,
  },
  spinnerSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '16px 0',
    gap: 10,
  },
  spinner: {
    width: 28,
    height: 28,
    border: '3px solid var(--color-border)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  spinnerText: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: 8,
  },
};
