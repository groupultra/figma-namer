// ============================================================
// Figma Namer - NamingPreview Component (Web Dashboard)
// Adapted from src/ui/components/NamingPreview.tsx
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import type { NamingResult } from '@shared/types';
import { DEFAULT_NAME_PATTERNS } from '@shared/constants';

interface NamingPreviewProps {
  results: NamingResult[];
  sessionId: string | null;
  onDone: () => void;
  onBack: () => void;
}

function isDefaultName(name: string): boolean {
  return DEFAULT_NAME_PATTERNS.some((re) => re.test(name));
}

function confidenceLevel(c: number): 'high' | 'medium' | 'low' {
  if (c >= 0.8) return 'high';
  if (c >= 0.5) return 'medium';
  return 'low';
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'var(--color-success)',
  medium: 'var(--color-warning)',
  low: 'var(--color-danger)',
};

type FilterMode = 'all' | 'selected' | 'unselected' | 'edited' | 'default-names';

export const NamingPreview: React.FC<NamingPreviewProps> = ({
  results,
  sessionId,
  onDone,
  onBack,
}) => {
  const [selected, setSelected] = useState<Set<string>>(() =>
    new Set(results.map((r) => r.nodeId)),
  );
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  const getFinalName = useCallback(
    (r: NamingResult) => editedNames[r.nodeId] ?? r.suggestedName,
    [editedNames],
  );

  const filteredResults = useMemo(() => {
    let items = results;
    switch (filterMode) {
      case 'selected':
        items = items.filter((r) => selected.has(r.nodeId));
        break;
      case 'unselected':
        items = items.filter((r) => !selected.has(r.nodeId));
        break;
      case 'edited':
        items = items.filter((r) => editedNames[r.nodeId] != null);
        break;
      case 'default-names':
        items = items.filter((r) => isDefaultName(r.originalName));
        break;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (r) =>
          r.originalName.toLowerCase().includes(q) ||
          getFinalName(r).toLowerCase().includes(q) ||
          String(r.markId).includes(q),
      );
    }
    return items;
  }, [results, filterMode, searchQuery, selected, editedNames, getFinalName]);

  const selectedCount = selected.size;
  const totalCount = results.length;

  const toggleSelect = (nodeId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(results.map((r) => r.nodeId)));
  const deselectAll = () => setSelected(new Set());

  const startEditing = (r: NamingResult) => {
    setEditingId(r.nodeId);
    setEditValue(getFinalName(r));
  };

  const confirmEdit = () => {
    if (editingId && editValue.trim()) {
      setEditedNames((prev) => ({ ...prev, [editingId]: editValue.trim() }));
    }
    setEditingId(null);
    setEditValue('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') confirmEdit();
    if (e.key === 'Escape') cancelEdit();
  };

  const handleExportJson = () => {
    if (!sessionId) return;
    window.open(`/api/export/${sessionId}?format=json`, '_blank');
  };

  const handleExportCsv = () => {
    if (!sessionId) return;
    window.open(`/api/export/${sessionId}?format=csv`, '_blank');
  };

  const handleCopyJson = () => {
    const data = results
      .filter((r) => selected.has(r.nodeId))
      .map((r) => ({
        nodeId: r.nodeId,
        originalName: r.originalName,
        suggestedName: getFinalName(r),
      }));
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Top Toolbar */}
        <div style={styles.toolbar}>
          <div style={styles.toolbarLeft}>
            <h2 style={styles.toolbarTitle}>Naming Results</h2>
            <span style={styles.count}>
              {selectedCount} / {totalCount} selected
            </span>
          </div>
          <div style={styles.toolbarRight}>
            <button style={styles.linkBtn} onClick={selectAll}>Select All</button>
            <span style={styles.divider}>|</span>
            <button style={styles.linkBtn} onClick={deselectAll}>Deselect All</button>
          </div>
        </div>

        {/* Search & Filter */}
        <div style={styles.filterRow}>
          <div style={styles.searchWrapper}>
            <input
              style={styles.searchInput}
              type="text"
              placeholder="Search names..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button style={styles.clearBtn} onClick={() => setSearchQuery('')}>
                x
              </button>
            )}
          </div>
          <select
            style={styles.filterSelect}
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as FilterMode)}
          >
            <option value="all">All ({totalCount})</option>
            <option value="selected">Selected ({selectedCount})</option>
            <option value="unselected">Unselected ({totalCount - selectedCount})</option>
            <option value="edited">Edited ({Object.keys(editedNames).length})</option>
            <option value="default-names">
              Default Names ({results.filter((r) => isDefaultName(r.originalName)).length})
            </option>
          </select>
        </div>

        {/* Results List */}
        <div style={styles.list}>
          {filteredResults.length === 0 && (
            <div style={styles.emptyState}>
              {searchQuery || filterMode !== 'all'
                ? 'No results match your filter.'
                : 'No naming results available.'}
            </div>
          )}

          {filteredResults.map((r) => {
            const isSelected = selected.has(r.nodeId);
            const isEditing = editingId === r.nodeId;
            const isEdited = editedNames[r.nodeId] != null;
            const isDefault = isDefaultName(r.originalName);
            const finalName = getFinalName(r);
            const confLevel = confidenceLevel(r.confidence);

            return (
              <div
                key={r.nodeId}
                style={{
                  ...styles.row,
                  ...(isSelected ? styles.rowSelected : {}),
                }}
              >
                <div style={styles.rowLeft}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(r.nodeId)}
                    style={styles.checkbox}
                  />
                  <span style={styles.markBadge}>#{r.markId}</span>
                </div>

                <div style={styles.rowCenter}>
                  <div style={styles.nameRow}>
                    <span
                      style={{
                        ...styles.originalName,
                        ...(isDefault ? styles.originalNameDefault : {}),
                      }}
                      title={r.originalName}
                    >
                      {r.originalName}
                    </span>
                    <span style={styles.arrow}>{'\u2192'}</span>
                    {isEditing ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={confirmEdit}
                        autoFocus
                        style={styles.editInput}
                      />
                    ) : (
                      <span
                        style={{
                          ...styles.suggestedName,
                          ...(isEdited ? styles.suggestedNameEdited : {}),
                        }}
                        title={finalName}
                      >
                        {finalName}
                      </span>
                    )}
                  </div>

                  <div style={styles.confidenceRow}>
                    <div style={styles.confidenceBar}>
                      <div
                        style={{
                          ...styles.confidenceFill,
                          width: `${Math.round(r.confidence * 100)}%`,
                          background: CONFIDENCE_COLORS[confLevel],
                        }}
                      />
                    </div>
                    <span style={{ ...styles.confidenceText, color: CONFIDENCE_COLORS[confLevel] }}>
                      {Math.round(r.confidence * 100)}%
                    </span>
                    {isEdited && <span style={styles.editedBadge}>edited</span>}
                  </div>
                </div>

                <div style={styles.rowRight}>
                  {!isEditing && (
                    <button style={styles.editBtn} onClick={() => startEditing(r)} title="Edit name">
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path
                          d="M11.5 1.5L14.5 4.5L5 14H2V11L11.5 1.5Z"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Action Bar */}
        <div style={styles.actionBar}>
          <div style={styles.exportBtns}>
            <button className="btn-outline" onClick={handleExportJson} style={{ fontSize: 12 }}>
              Export JSON
            </button>
            <button className="btn-outline" onClick={handleExportCsv} style={{ fontSize: 12 }}>
              Export CSV
            </button>
            <button className="btn-outline" onClick={handleCopyJson} style={{ fontSize: 12 }}>
              Copy JSON
            </button>
          </div>
          <div style={styles.actionButtons}>
            <button className="btn-outline" onClick={onBack}>
              New Analysis
            </button>
            <button className="btn-success" onClick={onDone}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 20px',
  },
  card: {
    width: '100%',
    maxWidth: 720,
    background: 'var(--color-bg)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: 'var(--shadow-md)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'calc(100vh - 48px)',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 24px 12px',
    borderBottom: '1px solid var(--color-border)',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 10,
  },
  toolbarTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: 0,
  },
  count: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 12,
    color: 'var(--color-primary)',
    cursor: 'pointer',
    fontWeight: 500,
  },
  divider: {
    color: 'var(--color-border)',
    fontSize: 12,
  },
  filterRow: {
    display: 'flex',
    gap: 8,
    padding: '10px 24px',
    borderBottom: '1px solid var(--color-border)',
  },
  searchWrapper: {
    flex: 1,
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    paddingRight: 28,
    fontSize: 13,
    height: 34,
  },
  clearBtn: {
    position: 'absolute',
    right: 6,
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    padding: '0 4px',
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  filterSelect: {
    width: 160,
    height: 34,
    fontSize: 12,
    cursor: 'pointer',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
    minHeight: 200,
    maxHeight: 400,
  },
  emptyState: {
    padding: '40px 24px',
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
    fontSize: 13,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 24px',
    gap: 10,
    borderBottom: '1px solid #f0f0f0',
    transition: 'background 0.1s ease',
  },
  rowSelected: {
    background: 'rgba(13,153,255,0.04)',
  },
  rowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  checkbox: {
    width: 15,
    height: 15,
    cursor: 'pointer',
    margin: 0,
  },
  markBadge: {
    fontSize: 10,
    fontWeight: 700,
    color: '#fff',
    background: '#FF0040',
    borderRadius: 3,
    padding: '2px 5px',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
  rowCenter: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  originalName: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 160,
    flexShrink: 0,
  },
  originalNameDefault: {
    color: 'var(--color-danger)',
    fontStyle: 'italic',
  },
  arrow: {
    fontSize: 12,
    color: 'var(--color-text-secondary)',
    flexShrink: 0,
  },
  suggestedName: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    flex: 1,
    minWidth: 0,
  },
  suggestedNameEdited: {
    color: 'var(--color-primary)',
  },
  editInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: 600,
    padding: '3px 8px',
    height: 26,
    border: '1px solid var(--color-primary)',
    borderRadius: 4,
    outline: 'none',
  },
  confidenceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  confidenceBar: {
    width: 48,
    height: 4,
    borderRadius: 2,
    background: 'var(--color-bg-secondary)',
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.2s ease',
  },
  confidenceText: {
    fontSize: 10,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  editedBadge: {
    fontSize: 9,
    fontWeight: 600,
    color: 'var(--color-primary)',
    background: 'rgba(13,153,255,0.1)',
    borderRadius: 3,
    padding: '1px 4px',
    textTransform: 'uppercase' as const,
  },
  rowRight: {
    flexShrink: 0,
  },
  editBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: 0,
  },
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
  },
  exportBtns: {
    display: 'flex',
    gap: 6,
  },
  actionButtons: {
    display: 'flex',
    gap: 8,
  },
};
