// ============================================================
// Figma Namer - BatchProgress Component
// Shows progress during traversal, SoM rendering, and VLM calls
// ============================================================

import React, { useMemo } from 'react';
import type { SessionStatus } from '../../shared/types';

interface BatchProgressProps {
  status: SessionStatus;
  statusMessage: string;
  currentBatch: number;
  totalBatches: number;
  traversalProgress: { processed: number; total: number };
  currentBatchImage: string | null;
  startedAt: number;
  onCancel: () => void;
}

export const BatchProgress: React.FC<BatchProgressProps> = ({
  status,
  statusMessage,
  currentBatch,
  totalBatches,
  traversalProgress,
  currentBatchImage,
  startedAt,
  onCancel,
}) => {
  const elapsed = useMemo(() => {
    if (!startedAt) return '0s';
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  }, [startedAt, status]);

  // Compute overall progress percentage
  const progressPercent = useMemo(() => {
    switch (status) {
      case 'traversing': {
        const { processed, total } = traversalProgress;
        if (total === 0) return 5;
        // traversal is first 20% of the pipeline
        return Math.round((processed / total) * 20);
      }
      case 'rendering_som':
        // rendering is 20-30%
        return 25;
      case 'calling_vlm': {
        if (totalBatches === 0) return 35;
        // VLM is 30-90%
        const batchProgress = currentBatch / totalBatches;
        return 30 + Math.round(batchProgress * 60);
      }
      default:
        return 0;
    }
  }, [status, traversalProgress, currentBatch, totalBatches]);

  const stageLabel = useMemo(() => {
    switch (status) {
      case 'traversing':
        return 'Traversing Layers';
      case 'rendering_som':
        return 'Rendering SoM Marks';
      case 'calling_vlm':
        return 'AI Naming in Progress';
      default:
        return 'Processing';
    }
  }, [status]);

  const stageDescription = useMemo(() => {
    switch (status) {
      case 'traversing':
        return traversalProgress.total > 0
          ? `Scanning layer tree... ${traversalProgress.processed} / ${traversalProgress.total}`
          : 'Scanning selected frames for nameable layers...';
      case 'rendering_som':
        return 'Generating Set-of-Mark overlays on the canvas...';
      case 'calling_vlm':
        return totalBatches > 0
          ? `Processing batch ${currentBatch + 1} of ${totalBatches}`
          : 'Sending images to the AI model...';
      default:
        return statusMessage || 'Please wait...';
    }
  }, [status, traversalProgress, currentBatch, totalBatches, statusMessage]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>{stageLabel}</span>
        <span style={styles.elapsed}>{elapsed}</span>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressTrack}>
        <div
          style={{
            ...styles.progressFill,
            width: `${progressPercent}%`,
          }}
        />
      </div>
      <div style={styles.progressLabel}>
        <span>{stageDescription}</span>
        <span style={styles.percent}>{progressPercent}%</span>
      </div>

      {/* Batch indicator dots */}
      {status === 'calling_vlm' && totalBatches > 1 && totalBatches <= 20 && (
        <div style={styles.batchDots}>
          {Array.from({ length: totalBatches }).map((_, i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                ...(i < currentBatch
                  ? styles.dotDone
                  : i === currentBatch
                    ? styles.dotActive
                    : {}),
              }}
            />
          ))}
        </div>
      )}

      {/* SoM image preview thumbnail */}
      {currentBatchImage && (
        <div style={styles.previewSection}>
          <span style={styles.previewLabel}>Current Batch Preview</span>
          <div style={styles.previewContainer}>
            <img
              src={`data:image/png;base64,${currentBatchImage}`}
              alt="SoM marked screenshot"
              style={styles.previewImage}
            />
          </div>
        </div>
      )}

      {/* Spinner animation */}
      <div style={styles.spinnerSection}>
        <div style={styles.spinner} />
        <span style={styles.spinnerText}>
          {statusMessage || 'Working...'}
        </span>
      </div>

      {/* Cancel */}
      <div style={styles.footer}>
        <button className="btn-outline" style={styles.cancelButton} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {/* Inline keyframe animation */}
      <style>{`
        @keyframes figma-namer-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes figma-namer-progress {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
      `}</style>
    </div>
  );
};

// ---- Styles ----

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '24px 20px 20px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  elapsed: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  progressTrack: {
    width: '100%',
    height: 6,
    background: 'var(--color-bg-secondary)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #0D99FF, #6C5CE7, #0D99FF)',
    backgroundSize: '200% 100%',
    borderRadius: 3,
    transition: 'width 0.4s ease',
    animation: 'figma-namer-progress 2s linear infinite',
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    marginBottom: 16,
  },
  percent: {
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  batchDots: {
    display: 'flex',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
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
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    marginBottom: 6,
    fontWeight: 500,
  },
  previewContainer: {
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    maxHeight: 200,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8f8f8',
  },
  previewImage: {
    width: '100%',
    height: 'auto',
    objectFit: 'contain' as const,
    maxHeight: 200,
  },
  spinnerSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  spinner: {
    width: 24,
    height: 24,
    border: '2.5px solid var(--color-border)',
    borderTopColor: 'var(--color-primary)',
    borderRadius: '50%',
    animation: 'figma-namer-spin 0.8s linear infinite',
  },
  spinnerText: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    textAlign: 'center' as const,
    maxWidth: 260,
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 12,
    display: 'flex',
    justifyContent: 'center',
  },
  cancelButton: {
    minWidth: 100,
  },
};
