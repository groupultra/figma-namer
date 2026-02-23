// ============================================================
// Figma Namer - BatchProgress Component (Web Dashboard)
// Real-time progress with page-level + batch-level tracking
// 3-view image comparison:
//   Annotated (SoM) | Original (clean) | Full Frame (context)
// ============================================================

import React, { useMemo, useState } from 'react';
import type { NamingResult } from '@shared/types';
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
  /** Page-level progress */
  currentPage?: number;
  totalPages?: number;
  currentPageName?: string;
  /** Partial naming results accumulated so far */
  partialResults?: NamingResult[];
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
  currentPage = 0,
  totalPages = 0,
  currentPageName = '',
  partialResults = [],
}) => {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<PreviewTab>('annotated');
  const [showResults, setShowResults] = useState(true);

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

  const hasPages = totalPages > 0;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>{t('progress.title')}</h2>

        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>{error}</span>
          </div>
        )}

        {/* Page progress (if available) */}
        {hasPages && (
          <div style={styles.pageProgressSection}>
            <div style={styles.pageProgressHeader}>
              <span style={styles.pageProgressLabel}>
                {t('progress.page')} {currentPage + 1} / {totalPages}
              </span>
              {currentPageName && (
                <span style={styles.pageProgressName}>{currentPageName}</span>
              )}
            </div>
            <div style={styles.pageProgressTrack}>
              <div
                style={{
                  ...styles.pageProgressFill,
                  width: `${Math.round(((currentPage + 1) / totalPages) * 100)}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Batch progress bar */}
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

        {/* Partial results list */}
        {partialResults.length > 0 && (
          <div style={styles.resultsSection}>
            <button
              style={styles.resultsToggle}
              onClick={() => setShowResults(!showResults)}
            >
              <span>{t('progress.results')} ({partialResults.length})</span>
              <span style={styles.toggleArrow}>{showResults ? '\u25B2' : '\u25BC'}</span>
            </button>
            {showResults && (
              <div style={styles.resultsList}>
                {partialResults.slice(-50).reverse().map((r, i) => (
                  <div
                    key={`${r.nodeId}-${r.markId}`}
                    style={{
                      ...styles.resultRow,
                      ...(i === 0 ? styles.resultRowNew : {}),
                    }}
                  >
                    {r.imageBase64 && (
                      <img
                        src={`data:image/png;base64,${r.imageBase64}`}
                        alt=""
                        style={styles.resultThumb}
                      />
                    )}
                    <span style={styles.resultMark}>#{r.markId}</span>
                    <span style={styles.resultOriginal} title={r.originalName}>{r.originalName}</span>
                    <span style={styles.resultArrow}>{'\u2192'}</span>
                    <span style={styles.resultSuggested} title={r.suggestedName}>{r.suggestedName}</span>
                    <span style={{
                      ...styles.resultConfidence,
                      color: r.confidence >= 0.8 ? 'var(--color-success)' : r.confidence >= 0.5 ? 'var(--color-warning)' : 'var(--color-danger)',
                    }}>
                      {Math.round(r.confidence * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
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
  // Page progress
  pageProgressSection: {
    marginBottom: 16,
    padding: '12px 14px',
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius)',
  },
  pageProgressHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pageProgressLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  pageProgressName: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontStyle: 'italic' as const,
    maxWidth: 200,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  pageProgressTrack: {
    width: '100%',
    height: 6,
    background: 'rgba(0,0,0,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  pageProgressFill: {
    height: '100%',
    background: '#6C5CE7',
    borderRadius: 3,
    transition: 'width 0.4s ease',
  },
  // Batch progress
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
  // --- Partial results ---
  resultsSection: {
    marginBottom: 16,
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius)',
    overflow: 'hidden',
  },
  resultsToggle: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 14px',
    background: 'var(--color-bg-secondary)',
    border: 'none',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  toggleArrow: {
    fontSize: 10,
    color: 'var(--color-text-secondary)',
  },
  resultsList: {
    maxHeight: 240,
    overflowY: 'auto' as const,
  },
  resultRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 14px',
    fontSize: 12,
    borderTop: '1px solid #f0f0f0',
    transition: 'background 0.3s ease',
  },
  resultRowNew: {
    background: 'rgba(13,153,255,0.06)',
  },
  resultThumb: {
    width: 28,
    height: 28,
    objectFit: 'contain' as const,
    borderRadius: 3,
    border: '1px solid #eee',
    flexShrink: 0,
  },
  resultMark: {
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: '#FF0040',
    borderRadius: 3,
    padding: '1px 4px',
    flexShrink: 0,
  },
  resultOriginal: {
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: 120,
    flexShrink: 0,
  },
  resultArrow: {
    color: 'var(--color-text-secondary)',
    flexShrink: 0,
  },
  resultSuggested: {
    fontWeight: 600,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    minWidth: 0,
  },
  resultConfidence: {
    fontSize: 10,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    flexShrink: 0,
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
