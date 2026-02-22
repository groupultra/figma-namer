// ============================================================
// Figma Namer - Test Setup
// Global test configuration for Vitest
// ============================================================

import { vi } from 'vitest';

// Mock the figma global that's available in the plugin sandbox
const mockFigma = {
  currentPage: {
    selection: [],
    findAll: vi.fn(() => []),
  },
  getNodeById: vi.fn(),
  ui: {
    postMessage: vi.fn(),
    show: vi.fn(),
    resize: vi.fn(),
    on: vi.fn(),
  },
  showUI: vi.fn(),
  notify: vi.fn(),
  closePlugin: vi.fn(),
};

// Make figma available globally in tests
(globalThis as any).figma = mockFigma;

// Mock console methods to reduce noise in tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'warn').mockImplementation(() => {});
