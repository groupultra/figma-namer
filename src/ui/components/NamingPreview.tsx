// ============================================================
// Figma Namer - NamingPreview Component
// The main interaction panel for reviewing / editing AI names
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import type { NamingResult } from '../../shared/types';
import { DEFAULT_NAME_PATTERNS } from '../../shared/constants';

interface NamingPreviewProps {
  results: NamingResult[];
  onApply: (accepted: NamingResult[]) => void;
  onCancel: () => void;
}

/** Check whether a name matches a Figma default pattern */
function isDefaultName(name: string): boolean {
  return DEFAULT_NAME_PATTERNS.some((re) => re.test(name));
}

/** Confidence level thresholds */
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
  onApply,
  onCancel,
}) => {
  // Track which items are selected (accepted)
  const [selected, setSelected] = useState<Set<string>>(() => {
    return new Set(results.map((r) => r.nodeId));
  });
  // Track per-item edited names (nodeId -> edited name)
  const [editedNames, setEditedNames] = useState<Record<string, string>>({});
  // Currently editing nodeId
  const [editingId, setEditingId] = useState<string | null>(null);
  // Edit input value
  const [editValue, setEditValue] = useState('');
  // Search query
  const [searchQuery, setSearchQuery] = useState('');
  // Filter mode
  const [filterMode, setFilterMode] = useState<FilterMode>('all');

  // Final name for a result: edited override or original suggestion
  const getFinalName = useCallback(
    (r: NamingResult) => editedNames[r.nodeId] ?? r.suggestedName,
    [editedNames],
  );

  // Filtered and searched results
  const filteredResults = useMemo(() => {
    let items = results;

    // Filter by mode
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

    // Filter by search
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

  // ---- Actions ----

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

  const handleApply = () => {
    const accepted = results
      .filter((r) => selected.has(r.nodeId))
      .map((r) => ({
        ...r,
        suggestedName: getFinalName(r),
      }));
    onApply(accepted);
  };

  return (
    <div style={styles.container}>
      {/* Top Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolbarLeft}>
          <span style={styles.toolbarTitle}>Naming Preview</span>
          <span style={styles.count}>
            {selectedCount} / {totalCount} selected
          </span>
        </div>
        <div style={styles.toolbarRight}>
          <button style={styles.linkBtn} onClick={selectAll}>
            Select All
          </button>
          <span style={styles.divider}>|</span>
          <button style={styles.linkBtn} onClick={deselectAll}>
            Deselect All
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div style={styles.filterRow}>
        <div style={styles.searchWrapper}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={styles.searchIcon}>
            <circle cx="6.5" cy="6.5" r="5.5" stroke="#888" strokeWidth="1.5" />
            <line x1="10.5" y1="10.5" x2="14.5" y2="14.5" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
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
          <option value="edited">
            Edited ({Object.keys(editedNames).length})
          </option>
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
              {/* Left: checkbox + mark badge */}
              <div style={styles.rowLeft}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(r.nodeId)}
                  style={styles.checkbox}
                />
                <span style={styles.markBadge}>#{r.markId}</span>
              </div>

              {/* Center: name mapping */}
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

                {/* Confidence bar */}
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
                  <span
                    style={{
                      ...styles.confidenceText,
                      color: CONFIDENCE_COLORS[confLevel],
                    }}
                  >
                    {Math.round(r.confidence * 100)}%
                  </span>
                  {isEdited && <span style={styles.editedBadge}>edited</span>}
                </div>
              </div>

              {/* Right: edit button */}
              <div style={styles.rowRight}>
                {!isEditing && (
                  <button
                    style={styles.editBtn}
                    onClick={() => startEditing(r)}
                    title="Edit name"
                  >
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
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
        <div style={styles.actionInfo}>
          {selectedCount > 0
            ? `Apply ${selectedCount} name${selectedCount > 1 ? 's' : ''}`
            : 'No items selected'}
        </div>
        <div style={styles.actionButtons}>
          <button className="btn-outline" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn-primary"
            style={styles.applyButton}
            disabled={selectedCount === 0}
            onClick={handleApply}
          >
            Apply Selected
          </button>
        </div>
      </div>
    </div>
  );
};

// ---- Styles ----

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },

  // Toolbar
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px 8px',
    borderBottom: '1px solid var(--color-border)',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
  },
  toolbarTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  count: {
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    padding: 0,
    fontSize: 10,
    color: 'var(--color-primary)',
    cursor: 'pointer',
    textDecoration: 'none',
    fontWeight: 500,
  },
  divider: {
    color: 'var(--color-border)',
    fontSize: 10,
  },

  // Filter row
  filterRow: {
    display: 'flex',
    gap: 6,
    padding: '8px 16px',
    borderBottom: '1px solid var(--color-border)',
  },
  searchWrapper: {
    flex: 1,
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  searchIcon: {
    position: 'absolute',
    left: 8,
    pointerEvents: 'none',
  },
  searchInput: {
    width: '100%',
    paddingLeft: 26,
    paddingRight: 22,
    fontSize: 11,
    height: 28,
  },
  clearBtn: {
    position: 'absolute',
    right: 4,
    background: 'none',
    border: 'none',
    padding: '0 4px',
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    lineHeight: '28px',
  },
  filterSelect: {
    width: 130,
    height: 28,
    fontSize: 10,
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg)',
    padding: '0 6px',
    color: 'var(--color-text)',
    cursor: 'pointer',
  },

  // List
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 0',
  },
  emptyState: {
    padding: '40px 16px',
    textAlign: 'center',
    color: 'var(--color-text-secondary)',
    fontSize: 11,
  },

  // Row
  row: {
    display: 'flex',
    alignItems: 'center',
    padding: '6px 16px',
    gap: 8,
    borderBottom: '1px solid #f0f0f0',
    transition: 'background 0.1s ease',
  },
  rowSelected: {
    background: 'rgba(13,153,255,0.04)',
  },
  rowLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  checkbox: {
    width: 13,
    height: 13,
    cursor: 'pointer',
    margin: 0,
  },
  markBadge: {
    fontSize: 9,
    fontWeight: 700,
    color: '#fff',
    background: '#FF0040',
    borderRadius: 3,
    padding: '1px 4px',
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
    gap: 6,
    marginBottom: 2,
  },
  originalName: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 120,
    flexShrink: 0,
  },
  originalNameDefault: {
    color: 'var(--color-danger)',
    fontStyle: 'italic',
  },
  arrow: {
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    flexShrink: 0,
  },
  suggestedName: {
    fontSize: 11,
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
    fontSize: 11,
    fontWeight: 600,
    padding: '2px 6px',
    height: 22,
    border: '1px solid var(--color-primary)',
    borderRadius: 3,
    outline: 'none',
  },
  confidenceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  confidenceBar: {
    width: 40,
    height: 3,
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
    fontSize: 9,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  editedBadge: {
    fontSize: 8,
    fontWeight: 600,
    color: 'var(--color-primary)',
    background: 'rgba(13,153,255,0.1)',
    borderRadius: 2,
    padding: '0 3px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  rowRight: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
  },
  editBtn: {
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    padding: 0,
    transition: 'all 0.1s ease',
  },

  // Action Bar
  actionBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 16px',
    borderTop: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
  },
  actionInfo: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
  },
  actionButtons: {
    display: 'flex',
    gap: 8,
  },
  applyButton: {
    background: 'var(--color-success)',
    fontWeight: 600,
  },
};
