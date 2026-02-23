// ============================================================
// Figma Namer - Lightweight i18n
// Auto-detects browser language, CN/EN toggle, localStorage persistence
// ============================================================

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export type Lang = 'zh' | 'en';

const LS_KEY = 'figma-namer-lang';

function detectLang(): Lang {
  const stored = localStorage.getItem(LS_KEY);
  if (stored === 'zh' || stored === 'en') return stored;
  return navigator.language.startsWith('zh') ? 'zh' : 'en';
}

// --------------- Translations ---------------

const translations = {
  // Dashboard
  'dashboard.title': { zh: 'Figma Namer', en: 'Figma Namer' },
  'dashboard.subtitle': { zh: 'AI 驱动的语义化图层命名', en: 'AI-powered semantic layer naming' },
  'dashboard.figmaToken': { zh: 'Figma 个人访问令牌', en: 'Figma Personal Access Token' },
  'dashboard.figmaTokenHint': { zh: '在 Figma Settings → Personal Access Tokens 获取', en: 'Get from Figma Settings → Personal Access Tokens' },
  'dashboard.figmaUrl': { zh: 'Figma 文件或页面链接', en: 'Figma File or Page URL' },
  'dashboard.figmaUrlHint': { zh: '粘贴文件链接，或加 ?node-id=X-Y 指定具体 Frame', en: 'Paste a file URL, or add ?node-id=X-Y to target a specific frame' },
  'dashboard.aiModel': { zh: 'AI 模型', en: 'AI Model' },
  'dashboard.apiKey': { zh: 'API 密钥', en: 'API Key' },
  'dashboard.apiKeyPlaceholder.anthropic': { zh: '输入你的 Anthropic API Key', en: 'Enter your Anthropic API key' },
  'dashboard.apiKeyPlaceholder.google': { zh: '输入你的 Google AI API Key', en: 'Enter your Google AI API key' },
  'dashboard.apiKeyPlaceholder.openai': { zh: '输入你的 OpenAI API Key', en: 'Enter your OpenAI API key' },
  'dashboard.globalContext': { zh: '全局上下文', en: 'Global Context' },
  'dashboard.globalContextPlaceholder': { zh: '例: "电商结账流程 - 移动端"', en: 'e.g. "E-commerce checkout flow - Mobile app"' },
  'dashboard.optional': { zh: '(可选)', en: '(optional)' },
  'dashboard.platform': { zh: '平台', en: 'Platform' },
  'dashboard.advanced': { zh: '高级设置', en: 'Advanced Settings' },
  'dashboard.batchSize': { zh: '批次大小', en: 'Batch Size' },
  'dashboard.exportScale': { zh: '导出倍率', en: 'Export Scale' },
  'dashboard.analyze': { zh: '分析文件', en: 'Analyze File' },
  'dashboard.analyzing': { zh: '分析中...', en: 'Analyzing...' },

  // NodeCounter
  'counter.title': { zh: '分析完成', en: 'Analysis Complete' },
  'counter.nameableNodes': { zh: '可命名节点', en: 'Nameable Nodes' },
  'counter.estimatedBatches': { zh: '预计批次', en: 'Estimated Batches' },
  'counter.nodeTypes': { zh: '节点类型', en: 'Node Types' },
  'counter.byType': { zh: '按类型分布', en: 'Nodes by Type' },
  'counter.back': { zh: '返回', en: 'Back' },
  'counter.start': { zh: '开始命名 {count} 个节点', en: 'Start Naming {count} Nodes' },
  'counter.starting': { zh: '启动中...', en: 'Starting...' },
  'counter.pages': { zh: '页面', en: 'Pages' },
  'counter.fileType': { zh: '文件类型', en: 'File Type' },
  'counter.auxiliary': { zh: '辅助', en: 'Auxiliary' },
  'counter.aiReasoning': { zh: 'AI 分析', en: 'AI Reasoning' },

  // BatchProgress
  'progress.title': { zh: 'AI 命名进行中', en: 'AI Naming in Progress' },
  'progress.batches': { zh: '批次', en: 'Batches' },
  'progress.nodesNamed': { zh: '已命名节点', en: 'Nodes Named' },
  'progress.processing': { zh: '处理中...', en: 'Processing...' },
  'progress.cancel': { zh: '取消', en: 'Cancel' },
  'progress.page': { zh: '页面', en: 'Page' },
  'progress.pageProgress': { zh: '页面进度', en: 'Page Progress' },
  'progress.tab.annotated': { zh: '标注图', en: 'Annotated' },
  'progress.tab.original': { zh: '原图', en: 'Original' },
  'progress.tab.frame': { zh: '全局', en: 'Full Frame' },
  'progress.caption.annotated': { zh: '编号标签标记了当前批次中正在命名的元素', en: 'Numbered labels mark elements being named in this batch' },
  'progress.caption.original': { zh: '无标注的原始截图，用于对比', en: 'Original screenshot without markup — for comparison' },
  'progress.caption.frame': { zh: '完整画面上下文 — AI 在分析时会同时参考此图', en: 'Full frame context — the AI sees this alongside the annotations' },

  // NamingPreview
  'preview.title': { zh: '命名结果', en: 'Naming Results' },
  'preview.selected': { zh: '{n} / {total} 已选', en: '{n} / {total} selected' },
  'preview.selectAll': { zh: '全选', en: 'Select All' },
  'preview.deselectAll': { zh: '取消全选', en: 'Deselect All' },
  'preview.search': { zh: '搜索名称...', en: 'Search names...' },
  'preview.filterAll': { zh: '全部', en: 'All' },
  'preview.filterSelected': { zh: '已选', en: 'Selected' },
  'preview.filterUnselected': { zh: '未选', en: 'Unselected' },
  'preview.filterEdited': { zh: '已编辑', en: 'Edited' },
  'preview.filterDefault': { zh: '默认名称', en: 'Default Names' },
  'preview.noResults': { zh: '没有匹配的结果', en: 'No results match your filter.' },
  'preview.noData': { zh: '暂无命名结果', en: 'No naming results available.' },
  'preview.edited': { zh: '已编辑', en: 'edited' },
  'preview.exportJson': { zh: '导出 JSON', en: 'Export JSON' },
  'preview.exportCsv': { zh: '导出 CSV', en: 'Export CSV' },
  'preview.copyJson': { zh: '复制 JSON', en: 'Copy JSON' },
  'preview.newAnalysis': { zh: '新建分析', en: 'New Analysis' },
  'preview.done': { zh: '完成', en: 'Done' },

  // App
  'app.complete': { zh: '命名完成！', en: 'Naming Complete!' },
  'app.completeHint': { zh: '命名结果已导出。使用配套 Figma 插件可以一键应用。', en: 'Your naming results have been exported. Use the companion Figma plugin to apply them.' },
  'app.newSession': { zh: '新建会话', en: 'Start New Session' },

  // SSE messages
  'sse.connected': { zh: '已连接到服务器', en: 'Connected to server' },
  'sse.imageExported': { zh: '图片已导出，正在渲染标注...', en: 'Image exported, rendering SoM marks...' },
  'sse.somRendered': { zh: '标注已渲染，正在调用 AI 模型...', en: 'SoM overlay rendered, calling AI model...' },
  'sse.vlmCalled': { zh: 'AI 模型已响应，正在解析结果...', en: 'AI model responded, parsing results...' },
  'sse.batchComplete': { zh: '批次 {n}/{total} 完成', en: 'Batch {n}/{total} complete' },
  'sse.allComplete': { zh: '全部批次完成！', en: 'All batches complete!' },
  'sse.structureAnalysis': { zh: '正在分析文件结构...', en: 'Analyzing file structure...' },
  'sse.structureComplete': { zh: '结构分析完成', en: 'Structure analysis complete' },
  'sse.pageStarted': { zh: '开始处理页面: {name}', en: 'Starting page: {name}' },
} as const;

type TranslationKey = keyof typeof translations;

// --------------- Context ---------------

interface I18nContextType {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LS_KEY, l);
  }, []);

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>): string => {
      const entry = translations[key];
      if (!entry) return key;
      let text: string = entry[lang] || entry['en'] || key;
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          text = text.replace(`{${k}}`, String(v));
        }
      }
      return text;
    },
    [lang],
  );

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

// --------------- Language Toggle Component ---------------

export const LangToggle: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const { lang, setLang } = useI18n();
  return (
    <div style={{ ...toggleStyles.container, ...style }}>
      <button
        style={{
          ...toggleStyles.btn,
          ...(lang === 'zh' ? toggleStyles.btnActive : {}),
        }}
        onClick={() => setLang('zh')}
      >
        中文
      </button>
      <button
        style={{
          ...toggleStyles.btn,
          ...(lang === 'en' ? toggleStyles.btnActive : {}),
        }}
        onClick={() => setLang('en')}
      >
        EN
      </button>
    </div>
  );
};

const toggleStyles: Record<string, React.CSSProperties> = {
  container: {
    display: 'inline-flex',
    background: 'var(--color-bg-secondary)',
    borderRadius: 6,
    padding: 2,
    gap: 2,
  },
  btn: {
    padding: '3px 10px',
    fontSize: 12,
    fontWeight: 500,
    border: 'none',
    borderRadius: 4,
    background: 'transparent',
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  },
  btnActive: {
    background: 'var(--color-bg)',
    color: 'var(--color-text)',
    fontWeight: 600,
    boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
  },
};
