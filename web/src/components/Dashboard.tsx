// ============================================================
// Figma Namer - Dashboard Component
// Credential input, file URL, VLM provider selection
// ============================================================

import React, { useState, useEffect } from 'react';
import type { NamerConfig } from '@shared/types';
import { DEFAULT_CONFIG } from '@shared/types';
import { useI18n, LangToggle } from '../i18n';

interface DashboardProps {
  onAnalyze: (figmaUrl: string, figmaToken: string, vlmApiKey?: string, globalContext?: string, config?: Partial<NamerConfig>) => void;
  isAnalyzing: boolean;
  error: string | null;
}

const VLM_PROVIDERS = [
  { value: 'gemini-flash', label: 'Gemini 3 Flash', hint: 'Fast & cheap', group: 'Google' },
  { value: 'gemini-pro', label: 'Gemini 3 Pro', hint: 'Best reasoning', group: 'Google' },
  { value: 'claude-sonnet', label: 'Claude Sonnet', hint: 'Balanced', group: 'Anthropic' },
  { value: 'claude-opus', label: 'Claude Opus', hint: 'Most capable', group: 'Anthropic' },
  { value: 'gpt-5', label: 'GPT-5.2', hint: 'Best vision', group: 'OpenAI' },
] as const;

const PLATFORMS = ['Auto', 'iOS', 'Android', 'Web'] as const;

const LS_TOKEN_KEY = 'figma-namer-token';
const LS_VLM_PROVIDER_KEY = 'figma-namer-vlm-provider';
const LS_VLM_KEY_PREFIX = 'figma-namer-vlm-key-';

export const Dashboard: React.FC<DashboardProps> = ({ onAnalyze, isAnalyzing, error }) => {
  const { t } = useI18n();
  const [figmaToken, setFigmaToken] = useState(() => localStorage.getItem(LS_TOKEN_KEY) || '');
  const [figmaUrl, setFigmaUrl] = useState('');
  const [vlmProvider, setVlmProvider] = useState(() => localStorage.getItem(LS_VLM_PROVIDER_KEY) || 'gemini-flash');
  const [vlmApiKey, setVlmApiKey] = useState('');
  const [globalContext, setGlobalContext] = useState('');
  const [platform, setPlatform] = useState<string>('Auto');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [batchSize, setBatchSize] = useState(DEFAULT_CONFIG.batchSize);
  const [exportScale, setExportScale] = useState(DEFAULT_CONFIG.exportScale);

  // API key storage is grouped by vendor (same key for gemini-flash & gemini-pro, etc.)
  const getKeyGroup = (provider: string) => {
    if (provider.startsWith('claude')) return 'anthropic';
    if (provider.startsWith('gemini')) return 'google';
    return 'openai';
  };

  // Load stored VLM API key when provider changes
  useEffect(() => {
    const stored = localStorage.getItem(`${LS_VLM_KEY_PREFIX}${getKeyGroup(vlmProvider)}`);
    if (stored) setVlmApiKey(stored);
    else setVlmApiKey('');
  }, [vlmProvider]);

  // Save tokens/keys to localStorage
  const saveCredentials = () => {
    if (figmaToken) localStorage.setItem(LS_TOKEN_KEY, figmaToken);
    if (vlmProvider) localStorage.setItem(LS_VLM_PROVIDER_KEY, vlmProvider);
    if (vlmApiKey) localStorage.setItem(`${LS_VLM_KEY_PREFIX}${getKeyGroup(vlmProvider)}`, vlmApiKey);
  };

  const handleAnalyze = () => {
    saveCredentials();
    const overrides: Partial<NamerConfig> = {
      vlmProvider: vlmProvider as NamerConfig['vlmProvider'],
    };
    if (batchSize !== DEFAULT_CONFIG.batchSize) overrides.batchSize = batchSize;
    if (exportScale !== DEFAULT_CONFIG.exportScale) overrides.exportScale = exportScale;
    // Pass vlmApiKey and globalContext for structure analysis (Round 1)
    onAnalyze(figmaUrl, figmaToken, vlmApiKey, globalContext, overrides);
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
            <div style={{ flex: 1 }}>
              <h1 style={styles.title}>{t('dashboard.title')}</h1>
              <p style={styles.subtitle}>{t('dashboard.subtitle')}</p>
            </div>
            <LangToggle />
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
          <label style={styles.label}>{t('dashboard.figmaToken')}</label>
          <input
            type="password"
            placeholder="figd_xxxxxxxxxxxx"
            value={figmaToken}
            onChange={(e) => setFigmaToken(e.target.value)}
            style={styles.input}
          />
          <span style={styles.hint}>
            {t('dashboard.figmaTokenHint')}
          </span>
        </div>

        {/* Figma URL */}
        <div style={styles.field}>
          <label style={styles.label}>{t('dashboard.figmaUrl')}</label>
          <input
            type="url"
            placeholder="https://www.figma.com/design/xxxxx/..."
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            style={styles.input}
          />
          <span style={styles.hint}>
            {t('dashboard.figmaUrlHint')}
          </span>
        </div>

        {/* VLM Provider */}
        <div style={styles.field}>
          <label style={styles.label}>{t('dashboard.aiModel')}</label>
          <div style={styles.providerGrid}>
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
                <span style={styles.providerGroup}>{p.group}</span>
              </button>
            ))}
          </div>
        </div>

        {/* VLM API Key */}
        <div style={styles.field}>
          <label style={styles.label}>
            {vlmProvider.startsWith('claude') ? 'Anthropic' : vlmProvider.startsWith('gemini') ? 'Google' : 'OpenAI'} {t('dashboard.apiKey')}
          </label>
          <input
            type="password"
            placeholder={t(vlmProvider.startsWith('claude') ? 'dashboard.apiKeyPlaceholder.anthropic' : vlmProvider.startsWith('gemini') ? 'dashboard.apiKeyPlaceholder.google' : 'dashboard.apiKeyPlaceholder.openai')}
            value={vlmApiKey}
            onChange={(e) => setVlmApiKey(e.target.value)}
            style={styles.input}
          />
        </div>

        {/* Global Context */}
        <div style={styles.field}>
          <label style={styles.label}>{t('dashboard.globalContext')} <span style={styles.optional}>{t('dashboard.optional')}</span></label>
          <textarea
            placeholder={t('dashboard.globalContextPlaceholder')}
            value={globalContext}
            onChange={(e) => setGlobalContext(e.target.value)}
            rows={2}
            style={styles.textarea}
          />
        </div>

        {/* Platform */}
        <div style={styles.field}>
          <label style={styles.label}>{t('dashboard.platform')}</label>
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
            {showAdvanced ? '\u25BC' : '\u25B6'} {t('dashboard.advanced')}
          </button>
          {showAdvanced && (
            <div style={styles.advancedPanel}>
              <div style={styles.configRow}>
                <label>{t('dashboard.batchSize')}</label>
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
                <label>{t('dashboard.exportScale')}</label>
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
          {isAnalyzing ? t('dashboard.analyzing') : t('dashboard.analyze')}
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
  const vlmProvider = localStorage.getItem(LS_VLM_PROVIDER_KEY) || 'gemini-flash';
  const keyGroup = vlmProvider.startsWith('claude') ? 'anthropic'
    : vlmProvider.startsWith('gemini') ? 'google' : 'openai';
  const vlmApiKey = localStorage.getItem(`${LS_VLM_KEY_PREFIX}${keyGroup}`) || '';
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
  providerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 8,
  },
  providerChip: {
    padding: '10px 6px 8px',
    borderRadius: 'var(--radius)',
    border: '1px solid var(--color-border)',
    background: 'var(--color-bg)',
    cursor: 'pointer',
    textAlign: 'center' as const,
    transition: 'all 0.15s ease',
    position: 'relative' as const,
  },
  providerChipActive: {
    borderColor: 'var(--color-primary)',
    background: 'rgba(13,153,255,0.06)',
    boxShadow: '0 0 0 1px var(--color-primary)',
  },
  providerLabel: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--color-text)',
  },
  providerHint: {
    display: 'block',
    fontSize: 10,
    color: 'var(--color-text-secondary)',
    marginTop: 2,
  },
  providerGroup: {
    display: 'block',
    fontSize: 9,
    color: 'var(--color-text-secondary)',
    marginTop: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    opacity: 0.7,
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
