// ============================================================
// Figma Namer - Dashboard Component
// Credential input, file URL, VLM provider selection
// ============================================================

import React, { useState, useEffect } from 'react';
import type { NamerConfig } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';

interface DashboardProps {
  onAnalyze: (figmaUrl: string, figmaToken: string, config?: Partial<NamerConfig>) => void;
  isAnalyzing: boolean;
  error: string | null;
}

const VLM_PROVIDERS = [
  { value: 'claude', label: 'Claude (Anthropic)', hint: 'claude-sonnet-4-6' },
  { value: 'openai', label: 'GPT-4o (OpenAI)', hint: 'gpt-4o' },
  { value: 'gemini', label: 'Gemini (Google)', hint: 'gemini-2.5-flash' },
] as const;

const PLATFORMS = ['Auto', 'iOS', 'Android', 'Web'] as const;

const LS_TOKEN_KEY = 'figma-namer-token';
const LS_VLM_PROVIDER_KEY = 'figma-namer-vlm-provider';
const LS_VLM_KEY_PREFIX = 'figma-namer-vlm-key-';

export const Dashboard: React.FC<DashboardProps> = ({ onAnalyze, isAnalyzing, error }) => {
  const [figmaToken, setFigmaToken] = useState(() => localStorage.getItem(LS_TOKEN_KEY) || '');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [vlmProvider, setVlmProvider] = useState(() => localStorage.getItem(LS_VLM_PROVIDER_KEY) || 'claude');
  const [vlmApiKey, setVlmApiKey] = useState('');
  const [globalContext, setGlobalContext] = useState('');
  const [platform, setPlatform] = useState<string>('Auto');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [batchSize, setBatchSize] = useState(DEFAULT_CONFIG.batchSize);
  const [exportScale, setExportScale] = useState(DEFAULT_CONFIG.exportScale);

  // Load stored VLM API key when provider changes
  useEffect(() => {
    const stored = localStorage.getItem(`${LS_VLM_KEY_PREFIX}${vlmProvider}`);
    if (stored) setVlmApiKey(stored);
    else setVlmApiKey('');
  }, [vlmProvider]);

  // Save tokens/keys to localStorage
  const saveCredentials = () => {
    if (figmaToken) localStorage.setItem(LS_TOKEN_KEY, figmaToken);
    if (vlmProvider) localStorage.setItem(LS_VLM_PROVIDER_KEY, vlmProvider);
    if (vlmApiKey) localStorage.setItem(`${LS_VLM_KEY_PREFIX}${vlmProvider}`, vlmApiKey);
  };

  const handleAnalyze = () => {
    saveCredentials();
    const overrides: Partial<NamerConfig> = {
      vlmProvider: vlmProvider as NamerConfig['vlmProvider'],
    };
    if (batchSize !== DEFAULT_CONFIG.batchSize) overrides.batchSize = batchSize;
    if (exportScale !== DEFAULT_CONFIG.exportScale) overrides.exportScale = exportScale;
    onAnalyze(figmaUrl, figmaToken, overrides);
  };

  const canSubmit = figmaToken.trim() && figmaUrl.trim() && vlmApiKey.trim() && !isAnalyzing;

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logoRow}>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#0D99FF" />
              <text x="16" y="21" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold">N</text>
            </svg>
            <div>
              <h1 style={styles.title}>Figma Namer</h1>
              <p style={styles.subtitle}>AI-powered semantic layer naming</p>
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={styles.errorBox}>
            <span style={styles.errorText}>{error}</span>
          </div>
        )}

        {/* Figma Token */}
        <div style={styles.field}>
          <label style={styles.label}>Figma Personal Access Token</label>
          <input
            type="password"
            placeholder="figd_xxxxxxxxxxxx"
            value={figmaToken}
            onChange={(e) => setFigmaToken(e.target.value)}
            style={styles.input}
          />
          <span style={styles.hint}>
            Get from Figma Settings &gt; Personal Access Tokens
          </span>
        </div>

        {/* Figma URL */}
        <div style={styles.field}>
          <label style={styles.label}>Figma File or Page URL</label>
          <input
            type="url"
            placeholder="https://www.figma.com/design/xxxxx/..."
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            style={styles.input}
          />
          <span style={styles.hint}>
            Paste a file URL, or add ?node-id=X-Y to target a specific frame
          </span>
        </div>

        {/* VLM Provider */}
        <div style={styles.field}>
          <label style={styles.label}>AI Model Provider</label>
          <div style={styles.providerRow}>
            {VLM_PROVIDERS.map((p) => (
              <button
                key={p.value}
                style={{
                  ...styles.providerChip,
                  ...(vlmProvider === p.value ? styles.providerChipActive : {}),
                }}
                onClick={() => setVlmProvider(p.value)}
              >
                <span style={styles.providerLabel}>{p.label}</span>
                <span style={styles.providerHint}>{p.hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* VLM API Key */}
        <div style={styles.field}>
          <label style={styles.label}>
            {vlmProvider === 'claude' ? 'Anthropic' : vlmProvider === 'openai' ? 'OpenAI' : 'Google'} API Key
          </label>
          <input
            type="password"
            placeholder={`Enter your ${vlmProvider === 'claude' ? 'Anthropic' : vlmProvider === 'openai' ? 'OpenAI' : 'Google AI'} API key`}
            value={vlmApiKey}
            onChange={(e) => setVlmApiKey(e.target.value)}
            style={styles.input}
          />
        </div>

        {/* Global Context */}
        <div style={styles.field}>
          <label style={styles.label}>Global Context <span style={styles.optional}>(optional)</span></label>
          <textarea
            placeholder='e.g. "E-commerce checkout flow - Mobile app"'
            value={globalContext}
            onChange={(e) => setGlobalContext(e.target.value)}
            rows={2}
            style={styles.textarea}
          />
        </div>

        {/* Platform */}
        <div style={styles.field}>
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

        {/* Advanced Settings */}
        <div style={styles.field}>
          <button
            style={styles.advancedToggle}
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? '\u25BC' : '\u25B6'} Advanced Settings
          </button>
          {showAdvanced && (
            <div style={styles.advancedPanel}>
              <div style={styles.configRow}>
                <label>Batch Size</label>
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.max(1, Math.min(30, Number(e.target.value))))}
                  style={{ width: 70, textAlign: 'center' }}
                />
              </div>
              <div style={styles.configRow}>
                <label>Export Scale</label>
                <select
                  value={exportScale}
                  onChange={(e) => setExportScale(Number(e.target.value))}
                  style={{ width: 70 }}
                >
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          className="btn-primary"
          style={styles.submitBtn}
          disabled={!canSubmit}
          onClick={handleAnalyze}
        >
          {isAnalyzing ? 'Analyzing...' : 'Analyze File'}
        </button>
      </div>
    </div>
  );
};

// We store vlmProvider and related state in a way that parent can access
// The parent component will need these values for the naming step
Dashboard.displayName = 'Dashboard';

// Export a helper to get stored credentials
export function getStoredCredentials(): {
  figmaToken: string;
  vlmProvider: string;
  vlmApiKey: string;
} {
  const figmaToken = localStorage.getItem(LS_TOKEN_KEY) || '';
  const vlmProvider = localStorage.getItem(LS_VLM_PROVIDER_KEY) || 'claude';
  const vlmApiKey = localStorage.getItem(`${LS_VLM_KEY_PREFIX}${vlmProvider}`) || '';
  return { figmaToken, vlmProvider, vlmApiKey };
}

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
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--color-text)',
    margin: 0,
  },
  subtitle: {
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    margin: 0,
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
    wordBreak: 'break-word' as const,
  },
  field: {
    marginBottom: 18,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
    marginBottom: 6,
  },
  optional: {
    fontWeight: 400,
    color: 'var(--color-text-secondary)',
  },
  input: {
    width: '100%',
  },
  textarea: {
    width: '100%',
    resize: 'vertical' as const,
    minHeight: 48,
  },
  hint: {
    display: 'block',
    fontSize: 11,
    color: 'var(--color-text-secondary)',
    marginTop: 4,
  },
  providerRow: {
    display: 'flex',
    gap: 8,
  },
  providerChip: {
    flex: 1,
    padding: '8px 4px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.15s ease',
  },
  providerChipActive: {
    borderColor: 'var(--color-primary)',
    background: 'rgba(13,153,255,0.06)',
  },
  providerLabel: {
    display: 'block',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  providerHint: {
    display: 'block',
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    marginTop: 2,
  },
  platformRow: {
    display: 'flex',
    gap: 8,
  },
  platformChip: {
    flex: 1,
    padding: '8px 0',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    fontSize: 13,
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
    background: 'none',
    border: 'none',
    padding: '4px 0',
    fontSize: 13,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  advancedPanel: {
    marginTop: 10,
    padding: 14,
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
    fontSize: 13,
  },
  submitBtn: {
    width: '100%',
    padding: '12px 0',
    fontSize: 15,
    fontWeight: 600,
    marginTop: 8,
  },
};
