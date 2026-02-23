// ============================================================
// Figma Namer - NodeCounter Component
// Shows analysis results: pages, node count, file type, AI reasoning
// ============================================================

import React, { useState } from 'react';
import type { AnalyzeResult, PageInfo } from '@shared/types';
import { useI18n } from '../i18n';

interface NodeCounterProps {
  result: AnalyzeResult;
  onStartNaming: (selectedPages?: PageInfo[]) => void;
  onBack: () => void;
  isNaming: boolean;
}

export const NodeCounter: React.FC<NodeCounterProps> = ({
  result,
  onStartNaming,
  onBack,
  isNaming,
}) => {
  const { t } = useI18n();
  const sortedTypes = Object.entries(result.nodesByType).sort((a, b) => b[1] - a[1]);

  const hasPages = result.pages && result.pages.length > 0;
  const analysis = result.structureAnalysis;

  // Page selection state
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(() => {
    if (!result.pages) return new Set<string>();
    return new Set(result.pages.filter(p => !p.isAuxiliary).map(p => p.nodeId));
  });

  const togglePage = (nodeId: string) => {
    setSelectedPageIds(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const selectedNodes = hasPages
    ? result.pages!.filter(p => selectedPageIds.has(p.nodeId)).reduce((sum, p) => sum + p.nodes.length, 0)
    : result.totalNodes;

  const handleStart = () => {
    if (hasPages) {
      const selectedPages = result.pages!.filter(p => selectedPageIds.has(p.nodeId));
      onStartNaming(selectedPages);
    } else {
      onStartNaming();
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>{t('counter.title')}</h2>
          <p style={styles.fileName}>{result.rootName}</p>
        </div>

        {/* File Type Badge (if structure analysis available) */}
        {analysis && (
          <div style={styles.analysisSection}>
            <div style={styles.fileTypeBadge}>
              <span style={styles.fileTypeLabel}>{t('counter.fileType')}</span>
              <span style={styles.fileTypeValue}>{analysis.fileType}</span>
            </div>
            {analysis.reasoning && (
              <div style={styles.reasoningBox}>
                <span style={styles.reasoningLabel}>{t('counter.aiReasoning')}</span>
                <p style={styles.reasoningText}>{analysis.reasoning}</p>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{selectedNodes}</span>
            <span style={styles.statLabel}>{t('counter.nameableNodes')}</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>
              {hasPages ? result.pages!.filter(p => !p.isAuxiliary).length : result.estimatedBatches}
            </span>
            <span style={styles.statLabel}>
              {hasPages ? t('counter.pages') : t('counter.estimatedBatches')}
            </span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{sortedTypes.length}</span>
            <span style={styles.statLabel}>{t('counter.nodeTypes')}</span>
          </div>
        </div>

        {/* Page List (if available) */}
        {hasPages && (
          <div style={styles.pageSection}>
            <h3 style={styles.sectionTitle}>{t('counter.pages')}</h3>
            <div style={styles.pageList}>
              {result.pages!.map((page) => {
                const isSelected = selectedPageIds.has(page.nodeId);
                const isAux = page.isAuxiliary;
                return (
                  <div
                    key={page.nodeId}
                    style={{
                      ...styles.pageRow,
                      ...(isAux ? styles.pageRowAux : {}),
                    }}
                  >
                    <label style={styles.pageLabel}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => togglePage(page.nodeId)}
                        disabled={isAux}
                        style={styles.pageCheckbox}
                      />
                      <span style={{
                        ...styles.pageName,
                        ...(isAux ? styles.pageNameAux : {}),
                      }}>
                        {page.name}
                      </span>
                      {isAux && (
                        <span style={styles.auxBadge}>{t('counter.auxiliary')}</span>
                      )}
                    </label>
                    <div style={styles.pageInfo}>
                      {!isAux && (
                        <span style={styles.pageNodeCount}>
                          {page.nodes.length} {t('counter.nameableNodes').toLowerCase()}
                        </span>
                      )}
                      <span style={styles.pageRole}>{page.pageRole}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Type Breakdown (collapsed if pages available) */}
        {!hasPages && (
          <div style={styles.breakdownSection}>
            <h3 style={styles.sectionTitle}>{t('counter.byType')}</h3>
            <div style={styles.typeList}>
              {sortedTypes.map(([type, count]) => (
                <div key={type} style={styles.typeRow}>
                  <span style={styles.typeName}>{type}</span>
                  <div style={styles.typeBarWrapper}>
                    <div
                      style={{
                        ...styles.typeBar,
                        width: `${Math.max(4, (count / result.totalNodes) * 100)}%`,
                      }}
                    />
                  </div>
                  <span style={styles.typeCount}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div style={styles.actions}>
          <button className="btn-outline" onClick={onBack}>
            {t('counter.back')}
          </button>
          <button
            className="btn-primary"
            style={styles.startBtn}
            onClick={handleStart}
            disabled={selectedNodes === 0 || isNaming}
          >
            {isNaming ? t('counter.starting') : t('counter.start', { count: String(selectedNodes) })}
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
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: '0 0 4px 0',
  },
  fileName: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    margin: 0,
  },
  // Analysis section
  analysisSection: {
    marginBottom: 20,
  },
  fileTypeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 12px',
    background: 'rgba(13,153,255,0.08)',
    borderRadius: 'var(--radius)',
    marginBottom: 8,
  },
  fileTypeLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  fileTypeValue: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-primary)',
  },
  reasoningBox: {
    padding: '10px 14px',
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius)',
    borderLeft: '3px solid var(--color-primary)',
  },
  reasoningLabel: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  reasoningText: {
    fontSize: 13,
    color: 'var(--color-text)',
    lineHeight: '1.5',
    margin: 0,
  },
  // Stats
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    padding: '16px 12px',
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius)',
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--color-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  statLabel: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  // Page list
  pageSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: 12,
  },
  pageList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    maxHeight: 300,
    overflowY: 'auto' as const,
  },
  pageRow: {
    padding: '10px 12px',
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  pageRowAux: {
    opacity: 0.5,
  },
  pageLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer',
  },
  pageCheckbox: {
    flexShrink: 0,
  },
  pageName: {
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--color-text)',
    flex: 1,
  },
  pageNameAux: {
    color: 'var(--color-text-secondary)',
    textDecoration: 'line-through' as const,
  },
  auxBadge: {
    fontSize: 10,
    padding: '2px 6px',
    borderRadius: 4,
    background: 'rgba(255,64,64,0.1)',
    color: 'var(--color-danger)',
    fontWeight: 500,
    flexShrink: 0,
  },
  pageInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 24,
  },
  pageNodeCount: {
    fontSize: 11,
    color: 'var(--color-primary)',
    fontWeight: 600,
  },
  pageRole: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    flex: 1,
  },
  // Type breakdown
  breakdownSection: {
    marginBottom: 24,
  },
  typeList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  typeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  typeName: {
    fontSize: 12,
    color: 'var(--color-text)',
    fontFamily: 'monospace',
    width: 120,
    flexShrink: 0,
  },
  typeBarWrapper: {
    flex: 1,
    height: 8,
    background: 'var(--color-bg-secondary)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  typeBar: {
    height: '100%',
    background: 'var(--color-primary)',
    borderRadius: 4,
    transition: 'width 0.3s ease',
  },
  typeCount: {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text)',
    width: 36,
    textAlign: 'right' as const,
    fontVariantNumeric: 'tabular-nums',
  },
  // Actions
  actions: {
    display: 'flex',
    gap: 12,
    justifyContent: 'flex-end',
  },
  startBtn: {
    padding: '10px 24px',
    fontSize: 14,
    fontWeight: 600,
  },
};
