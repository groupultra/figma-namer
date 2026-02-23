// ============================================================
// Figma Namer - NodeCounter Component
// Shows analysis results: node count, type breakdown
// ============================================================

import React from 'react';
import type { AnalyzeResult } from '@shared/types';

interface NodeCounterProps {
  result: AnalyzeResult;
  onStartNaming: () => void;
  onBack: () => void;
  isNaming: boolean;
}

export const NodeCounter: React.FC<NodeCounterProps> = ({
  result,
  onStartNaming,
  onBack,
  isNaming,
}) => {
  const sortedTypes = Object.entries(result.nodesByType).sort((a, b) => b[1] - a[1]);

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Analysis Complete</h2>
          <p style={styles.fileName}>{result.rootName}</p>
        </div>

        {/* Stats */}
        <div style={styles.statsGrid}>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{result.totalNodes}</span>
            <span style={styles.statLabel}>Nameable Nodes</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{result.estimatedBatches}</span>
            <span style={styles.statLabel}>Estimated Batches</span>
          </div>
          <div style={styles.statCard}>
            <span style={styles.statNumber}>{sortedTypes.length}</span>
            <span style={styles.statLabel}>Node Types</span>
          </div>
        </div>

        {/* Type Breakdown */}
        <div style={styles.breakdownSection}>
          <h3 style={styles.sectionTitle}>Nodes by Type</h3>
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

        {/* Actions */}
        <div style={styles.actions}>
          <button className="btn-outline" onClick={onBack}>
            Back
          </button>
          <button
            className="btn-primary"
            style={styles.startBtn}
            onClick={onStartNaming}
            disabled={result.totalNodes === 0 || isNaming}
          >
            {isNaming ? 'Starting...' : `Start Naming ${result.totalNodes} Nodes`}
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
  breakdownSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: 12,
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
