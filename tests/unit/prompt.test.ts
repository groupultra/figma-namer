// ============================================================
// Tests for src/vlm/prompt.ts
// Covers: buildSystemPrompt, buildUserPrompt, edge cases
// ============================================================

import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, buildUserPrompt } from '../../src/vlm/prompt';
import type { NodeSupplement } from '../../src/vlm/prompt';

// ------------------------------------------------------------------
// buildSystemPrompt
// ------------------------------------------------------------------

describe('buildSystemPrompt', () => {
  it('should contain CESPC framework definition', () => {
    const prompt = buildSystemPrompt('', '');

    expect(prompt).toContain('CESPC Naming Framework');
    expect(prompt).toContain('Context');
    expect(prompt).toContain('Element');
    expect(prompt).toContain('State');
    expect(prompt).toContain('Platform');
    expect(prompt).toContain('Modifier');
  });

  it('should contain role definition', () => {
    const prompt = buildSystemPrompt('', '');
    expect(prompt).toContain('<role_definition>');
    expect(prompt).toContain('</role_definition>');
  });

  it('should contain naming rules section', () => {
    const prompt = buildSystemPrompt('', '');
    expect(prompt).toContain('<naming_rules>');
    expect(prompt).toContain('</naming_rules>');
  });

  it('should contain few-shot examples', () => {
    const prompt = buildSystemPrompt('', '');
    expect(prompt).toContain('<few_shot_examples>');
    expect(prompt).toContain('GOOD Examples');
    expect(prompt).toContain('BAD Examples');
  });

  it('should contain anti-hallucination notice', () => {
    const prompt = buildSystemPrompt('', '');
    expect(prompt).toContain('<anti_hallucination_notice>');
    expect(prompt).toContain('textContent');
  });

  it('should contain output instruction for JSON array', () => {
    const prompt = buildSystemPrompt('', '');
    expect(prompt).toContain('<output_instruction>');
    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('markId');
    expect(prompt).toContain('confidence');
  });

  describe('globalContext injection', () => {
    it('should inject user-provided globalContext into the prompt', () => {
      const context = 'This is the checkout flow for a food-delivery mobile app';
      const prompt = buildSystemPrompt(context, '');

      expect(prompt).toContain(context);
    });

    it('should show default message when globalContext is empty', () => {
      const prompt = buildSystemPrompt('', '');
      expect(prompt).toContain('No additional context was provided by the designer');
    });

    it('should show default message when globalContext is not provided', () => {
      const prompt = buildSystemPrompt('', '');
      expect(prompt).toContain('Infer the UI context from the visual content');
    });
  });

  describe('platform handling', () => {
    it('should include iOS platform clause when platform is iOS', () => {
      const prompt = buildSystemPrompt('', 'iOS');
      expect(prompt).toContain('**iOS**');
      expect(prompt).toContain('platform-specific conventions');
    });

    it('should include Android platform clause when platform is Android', () => {
      const prompt = buildSystemPrompt('', 'Android');
      expect(prompt).toContain('**Android**');
    });

    it('should include Web platform clause when platform is Web', () => {
      const prompt = buildSystemPrompt('', 'Web');
      expect(prompt).toContain('**Web**');
    });

    it('should omit platform segment instruction when platform is empty', () => {
      const prompt = buildSystemPrompt('', '');
      expect(prompt).toContain('No specific platform has been specified');
      expect(prompt).toContain('Omit the Platform segment');
    });

    it('should omit platform segment instruction when platform is "Auto"', () => {
      const prompt = buildSystemPrompt('', 'Auto');
      expect(prompt).toContain('No specific platform has been specified');
    });
  });

  describe('both globalContext and platform', () => {
    it('should include both globalContext and platform when provided', () => {
      const context = 'E-commerce checkout flow';
      const prompt = buildSystemPrompt(context, 'iOS');

      expect(prompt).toContain(context);
      expect(prompt).toContain('**iOS**');
    });
  });
});

// ------------------------------------------------------------------
// buildUserPrompt
// ------------------------------------------------------------------

describe('buildUserPrompt', () => {
  it('should include the count of marked elements', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: 'Login', boundVariables: [], componentProperties: {} },
      { markId: 2, textContent: null, boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('2 marked UI elements');
  });

  it('should include markId list at the end', () => {
    const supplements: NodeSupplement[] = [
      { markId: 3, textContent: null, boundVariables: [], componentProperties: {} },
      { markId: 7, textContent: null, boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('[3, 7]');
  });

  it('should include textContent in XML tags for nodes with text', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: 'Sign In', boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('<textContent>Sign In</textContent>');
  });

  it('should show null for textContent when text is absent', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: null, boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('<textContent>null</textContent>');
  });

  it('should show null for textContent when text is empty string', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: '', boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('<textContent>null</textContent>');
  });

  it('should include boundVariables when present', () => {
    const supplements: NodeSupplement[] = [
      {
        markId: 1,
        textContent: null,
        boundVariables: ['Colors/Primary/Default', 'Spacing/md'],
        componentProperties: {},
      },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('<boundVariables>Colors/Primary/Default, Spacing/md</boundVariables>');
  });

  it('should omit boundVariables tag when no variables are bound', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: null, boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).not.toContain('<boundVariables>');
  });

  it('should include componentProperties when present', () => {
    const supplements: NodeSupplement[] = [
      {
        markId: 1,
        textContent: null,
        boundVariables: [],
        componentProperties: { Variant: 'Primary', Size: 'Large' },
      },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('<componentProperties>');
    expect(prompt).toContain('Variant=Primary');
    expect(prompt).toContain('Size=Large');
  });

  it('should omit componentProperties tag when no properties exist', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: null, boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).not.toContain('<componentProperties>');
  });

  it('should escape XML special characters in textContent', () => {
    const supplements: NodeSupplement[] = [
      {
        markId: 1,
        textContent: 'Price < $10 & "free" shipping',
        boundVariables: [],
        componentProperties: {},
      },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('&lt;');
    expect(prompt).toContain('&amp;');
    expect(prompt).toContain('&quot;');
    expect(prompt).not.toContain('Price < $10');
  });

  it('should wrap each node in XML node tags with markId attribute', () => {
    const supplements: NodeSupplement[] = [
      { markId: 42, textContent: 'Test', boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('<node markId="42">');
    expect(prompt).toContain('</node>');
  });

  it('should include node_supplements wrapper', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: null, boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('<node_supplements>');
    expect(prompt).toContain('</node_supplements>');
  });

  it('should include CESPC reminder in the prompt', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: null, boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('CESPC');
  });

  it('should handle empty supplements array', () => {
    const prompt = buildUserPrompt([]);
    expect(prompt).toContain('0 marked UI elements');
    expect(prompt).toContain('[]');
  });

  it('should handle multiple supplements correctly', () => {
    const supplements: NodeSupplement[] = [
      { markId: 1, textContent: 'Login', boundVariables: ['Colors/Primary'], componentProperties: { Size: 'L' } },
      { markId: 2, textContent: null, boundVariables: [], componentProperties: {} },
      { markId: 3, textContent: 'Submit', boundVariables: [], componentProperties: {} },
    ];

    const prompt = buildUserPrompt(supplements);
    expect(prompt).toContain('3 marked UI elements');
    expect(prompt).toContain('<node markId="1">');
    expect(prompt).toContain('<node markId="2">');
    expect(prompt).toContain('<node markId="3">');
    expect(prompt).toContain('[1, 2, 3]');
  });
});
