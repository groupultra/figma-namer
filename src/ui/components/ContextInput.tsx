// ============================================================
// Figma Namer - ContextInput Component
// Idle screen: global context input, platform picker, start button
// ============================================================

import React, { useState } from 'react';
import type { NamerConfig } from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/types';

interface ContextInputProps {
  onStart: (globalContext: string, platform: string, configOverrides?: Partial<NamerConfig>) => void;
}

const PLATFORMS = ['Auto', 'iOS', 'Android', 'Web'] as const;

export const ContextInput: React.FC<ContextInputProps> = ({ onStart }) => {
  const [globalContext, setGlobalContext] = useState('');
  const [platform, setPlatform] = useState<string>('Auto');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [batchSize, setBatchSize] = useState(DEFAULT_CONFIG.batchSize);
  const [exportScale, setExportScale] = useState(DEFAULT_CONFIG.exportScale);
  const [includeLocked, setIncludeLocked] = useState(DEFAULT_CONFIG.includeLocked);
  const [includeInvisible, setIncludeInvisible] = useState(DEFAULT_CONFIG.includeInvisible);

  const handleStart = () => {
    const overrides: Partial<NamerConfig> = {};
    if (batchSize !== DEFAULT_CONFIG.batchSize) overrides.batchSize = batchSize;
    if (exportScale !== DEFAULT_CONFIG.exportScale) overrides.exportScale = exportScale;
    if (includeLocked !== DEFAULT_CONFIG.includeLocked) overrides.includeLocked = includeLocked;
    if (includeInvisible !== DEFAULT_CONFIG.includeInvisible) overrides.includeInvisible = includeInvisible;

    onStart(globalContext.trim(), platform, Object.keys(overrides).length > 0 ? overrides : undefined);
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.logo}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginRight: 8 }}>
            <rect width="24" height="24" rx="6" fill="#0D99FF" />
            <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">N</text>
          </svg>
          <span style={styles.title}>Figma Namer</span>
        </div>
        <span style={styles.subtitle}>AI-powered semantic layer naming</span>
      </div>

      {/* Instruction */}
      <div style={styles.section}>
        <div style={styles.instruction}>
          <div style={styles.stepBadge}>1</div>
          <span>Select frames on your canvas, then describe the context below.</span>
        </div>
      </div>

      {/* Global Context */}
      <div style={styles.section}>
        <label style={styles.label}>Global Context</label>
        <textarea
          style={styles.textarea}
          placeholder='e.g. "Medical SaaS system - iPad outpatient dashboard"'
          value={globalContext}
          onChange={(e) => setGlobalContext(e.target.value)}
          rows={3}
        />
        <span style={styles.hint}>
          Helps the AI understand your design system for better naming.
        </span>
      </div>

      {/* Platform Select */}
      <div style={styles.section}>
        <label style={styles.label}>Platform</label>
        <div style={styles.platformRow}>
          {PLATFORMS.map((p) => (
            <button
              key={p}
              style={{
                ...styles.platformChip,
                ...(platform === p ? styles.platformChipActive : {}),
              }}
              onClick={() => setPlatform(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Config Toggle */}
      <div style={styles.section}>
        <button
          style={styles.advancedToggle}
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span style={styles.advancedChevron}>{showAdvanced ? '\u25BC' : '\u25B6'}</span>
          Advanced Settings
        </button>

        {showAdvanced && (
          <div style={styles.advancedPanel}>
            <div style={styles.configRow}>
              <label style={styles.configLabel}>Batch Size</label>
              <input
                type="number"
                min={1}
                max={30}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Math.min(30, Number(e.target.value))))}
                style={styles.configInput}
              />
            </div>
            <div style={styles.configRow}>
              <label style={styles.configLabel}>Export Scale</label>
              <select
                value={exportScale}
                onChange={(e) => setExportScale(Number(e.target.value))}
                style={styles.configSelect}
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={3}>3x</option>
              </select>
            </div>
            <div style={styles.configRow}>
              <label style={styles.configLabel}>Include Locked Layers</label>
              <input
                type="checkbox"
                checked={includeLocked}
                onChange={(e) => setIncludeLocked(e.target.checked)}
                style={styles.checkbox}
              />
            </div>
            <div style={styles.configRow}>
              <label style={styles.configLabel}>Include Hidden Layers</label>
              <input
                type="checkbox"
                checked={includeInvisible}
                onChange={(e) => setIncludeInvisible(e.target.checked)}
                style={styles.checkbox}
              />
            </div>
          </div>
        )}
      </div>

      {/* Start Button */}
      <div style={styles.footer}>
        <button
          className="btn-primary"
          style={styles.startButton}
          onClick={handleStart}
        >
          Start Naming
        </button>
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
    padding: '0 20px',
  },
  header: {
    textAlign: 'center',
    padding: '24px 0 16px',
    borderBottom: '1px solid var(--color-border)',
    marginBottom: 16,
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    color: 'var(--color-text)',
  },
  subtitle: {
    fontSize: 11,
    color: 'var(--color-text-secondary)',
  },
  section: {
    marginBottom: 16,
  },
  instruction: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius)',
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    lineHeight: '1.4',
  },
  stepBadge: {
    flexShrink: 0,
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: 'var(--color-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 700,
  },
  label: {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: 6,
  },
  textarea: {
    resize: 'vertical' as const,
    minHeight: 60,
    maxHeight: 120,
    lineHeight: '1.4',
  },
  hint: {
    display: 'block',
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    marginTop: 4,
  },
  platformRow: {
    display: 'flex',
    gap: 6,
  },
  platformChip: {
    flex: 1,
    padding: '6px 0',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    fontSize: 11,
    fontWeight: 500,
    color: 'var(--color-text)',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  platformChipActive: {
    background: 'var(--color-primary)',
    borderColor: 'var(--color-primary)',
    color: '#fff',
  },
  advancedToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    background: 'none',
    border: 'none',
    padding: '4px 0',
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  advancedChevron: {
    fontSize: 8,
  },
  advancedPanel: {
    marginTop: 10,
    padding: 12,
    background: 'var(--color-bg-secondary)',
    borderRadius: 'var(--radius)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  configRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  configLabel: {
    fontSize: 11,
    color: 'var(--color-text)',
  },
  configInput: {
    width: 60,
    textAlign: 'center' as const,
    padding: '4px 6px',
    fontSize: 11,
  },
  configSelect: {
    width: 60,
    padding: '4px 6px',
    fontSize: 11,
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--color-bg)',
  },
  checkbox: {
    width: 14,
    height: 14,
    cursor: 'pointer',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: 16,
    paddingBottom: 20,
  },
  startButton: {
    width: '100%',
    padding: '10px 0',
    fontSize: 13,
    fontWeight: 600,
  },
};
