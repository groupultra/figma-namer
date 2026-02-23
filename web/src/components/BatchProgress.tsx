// ============================================================
// Figma Namer - BatchProgress Component (Web Dashboard)
// Real-time progress with 3-view image comparison:
//   Annotated (SoM) | Original (clean) | Full Frame (context)
// ============================================================

import React, { useMemo, useState } from 'react';
import { useI18n } from '../i18n';

type PreviewTab = 'annotated' | 'original' | 'frame';

interface BatchProgressProps {
  currentBatch: number;
  totalBatches: number;
  completedNodes: number;
  totalNodes: number;
  message: string;
  somPreviewImage: string | null;
  cleanPreviewImage: string | null;
  framePreviewImage: string | null;
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
  cleanPreviewImage,
  framePreviewImage,
  error,
  onCancel,
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<PreviewTab>('annotated');

  const progressPercent = useMemo(() => {
    if (totalBatches === 0) return 5;
    return Math.round(((currentBatch + 1) / totalBatches) * 100);
  }, [currentBatch, totalBatches]);

  const hasAnyPreview = somPreviewImage || cleanPreviewImage || framePreviewImage;

  const activeImage = activeTab === 'annotated'
    ? somPreviewImage
    : activeTab === 'original'
      ? cleanPreviewImage
      : framePreviewImage;

  const tabs: Array<{ key: PreviewTab; label: string; available: boolean }> = [
    { key: 'annotated', label: t('progress.tab.annotated'), available: !!somPreviewImage },
    { key: 'original', label: t('progress.tab.original'), available: !!cleanPreviewImage },
    { key: 'frame', label: t('progress.tab.frame'), available: !!framePreviewImage },
  ];

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>{t('progress.title')}</h2>

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
            <span style={styles.statLabel}>{t('progress.batches')}</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statNumber}>
              {completedNodes} / {totalNodes || '?'}
            </span>
            <span style={styles.statLabel}>{t('progress.nodesNamed')}</span>
          </div>
        </div>

        {/* Image preview with tabs */}
        {hasAnyPreview && (
          <div style={styles.previewSection}>
            {/* Tab bar */}
            <div style={styles.tabBar}>
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  style={{
                    ...styles.tab,
                    ...(activeTab === tab.key ? styles.tabActive : {}),
                    ...(!tab.available ? styles.tabDisabled : {}),
                  }}
                  onClick={() => tab.available && setActiveTab(tab.key)}
                  disabled={!tab.available}
                >
                  {tab.key === 'annotated' && (
                    <span style={styles.tabDot} />
                  )}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Image */}
            <div style={styles.previewContainer}>
              {activeImage ? (
                <img
                  src={`data:image/png;base64,${activeImage}`}
                  alt={`${activeTab} preview`}
                  style={styles.previewImage}
                />
              ) : (
                <div style={styles.previewPlaceholder}>
                  {activeTab === 'frame' ? 'Frame image loading...' : 'Waiting for image...'}
                </div>
              )}
            </div>

            {/* Caption */}
            <div style={styles.caption}>
              {activeTab === 'annotated' && t('progress.caption.annotated')}
              {activeTab === 'original' && t('progress.caption.original')}
              {activeTab === 'frame' && t('progress.caption.frame')}
            </div>
          </div>
        )}

        {/* Spinner + message */}
        <div style={styles.spinnerSection}>
          <div style={styles.spinner} />
          <span style={styles.spinnerText}>{t('progress.processing')}</span>
        </div>

        {/* Cancel */}
        <div style={styles.footer}>
          <button className="btn-outline" onClick={onCancel}>
            {t('progress.cancel')}
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
    maxWidth: 620,
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
    marginBottom: 20,
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
  // --- Preview with tabs ---
  previewSection: {
    marginBottom: 20,
  },
  tabBar: {
    display: 'flex',
    gap: 4,
    marginBottom: 8,
    background: 'var(--color-bg-secondary)',
    borderRadius: 8,
    padding: 3,
  },
  tab: {
    flex: 1,
    padding: '6px 0',
    fontSize: 12,
    fontWeight: 500,
    color: 'var(--color-text-secondary)',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  tabActive: {
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontWeight: 600,
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  tabDisabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: '#FF0040',
    flexShrink: 0,
  },
  previewContainer: {
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
    maxHeight: 320,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f8f8f8',
  },
  previewImage: {
    width: '100%',
    height: 'auto',
    objectFit: 'contain' as const,
    maxHeight: 320,
  },
  previewPlaceholder: {
    padding: '40px 20px',
    fontSize: 13,
    color: 'var(--color-text-secondary)',
  },
  caption: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    marginTop: 6,
    textAlign: 'center' as const,
  },
  // --- Spinner ---
  spinnerSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: '12px 0',
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
