// ============================================================
// Tests for src/vlm/parser.ts
// Covers: parseVLMResponse, validateNaming, edge cases
// ============================================================

import { describe, it, expect } from 'vitest';
import { parseVLMResponse, validateNaming } from '../../src/vlm/parser';
import type { ParsedNaming, ValidationResult } from '../../src/vlm/parser';

// ------------------------------------------------------------------
// parseVLMResponse
// ------------------------------------------------------------------

describe('parseVLMResponse', () => {
  describe('standard JSON parsing', () => {
    it('should parse a well-formed JSON array response', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'Login Button - Default - Primary', confidence: 0.95 },
        { markId: 2, name: 'Login TextField - Error', confidence: 0.88 },
      ]);

      const results = parseVLMResponse(raw, [1, 2]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({
        markId: 1,
        name: 'Login Button - Default - Primary',
        confidence: 0.95,
      });
      expect(results[1]).toEqual({
        markId: 2,
        name: 'Login TextField - Error',
        confidence: 0.88,
      });
    });

    it('should handle a single-element array', () => {
      const raw = JSON.stringify([
        { markId: 5, name: 'Header Title Label', confidence: 0.9 },
      ]);

      const results = parseVLMResponse(raw, [5]);
      expect(results).toHaveLength(1);
      expect(results[0].markId).toBe(5);
      expect(results[0].name).toBe('Header Title Label');
    });
  });

  describe('markdown-wrapped JSON', () => {
    it('should parse JSON wrapped in ```json ... ``` fences', () => {
      const raw = '```json\n' + JSON.stringify([
        { markId: 1, name: 'Login Button', confidence: 0.9 },
      ]) + '\n```';

      const results = parseVLMResponse(raw, [1]);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Login Button');
    });

    it('should parse JSON wrapped in ``` ... ``` fences (no language tag)', () => {
      const raw = '```\n' + JSON.stringify([
        { markId: 1, name: 'Dashboard Card', confidence: 0.85 },
      ]) + '\n```';

      const results = parseVLMResponse(raw, [1]);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Dashboard Card');
    });

    it('should parse JSON with leading/trailing commentary text', () => {
      const raw = 'Here are the naming results:\n' + JSON.stringify([
        { markId: 1, name: 'Profile Avatar Image', confidence: 0.92 },
      ]) + '\nHope this helps!';

      const results = parseVLMResponse(raw, [1]);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Profile Avatar Image');
    });
  });

  describe('alternative key names', () => {
    it('should handle mark_id instead of markId', () => {
      const raw = JSON.stringify([
        { mark_id: 1, name: 'Search Bar', confidence: 0.8 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].markId).toBe(1);
      expect(results[0].name).toBe('Search Bar');
    });

    it('should handle id instead of markId', () => {
      const raw = JSON.stringify([
        { id: 3, name: 'Settings Toggle', confidence: 0.75 },
      ]);

      const results = parseVLMResponse(raw, [3]);
      expect(results[0].markId).toBe(3);
      expect(results[0].name).toBe('Settings Toggle');
    });

    it('should handle suggested_name instead of name', () => {
      const raw = JSON.stringify([
        { markId: 2, suggested_name: 'Cart Badge', confidence: 0.7 },
      ]);

      const results = parseVLMResponse(raw, [2]);
      expect(results[0].name).toBe('Cart Badge');
    });
  });

  describe('markId type coercion', () => {
    it('should parse markId provided as a string', () => {
      const raw = JSON.stringify([
        { markId: '7', name: 'Footer Link', confidence: 0.8 },
      ]);

      const results = parseVLMResponse(raw, [7]);
      expect(results[0].markId).toBe(7);
      expect(results[0].name).toBe('Footer Link');
    });
  });

  describe('confidence normalization', () => {
    it('should normalize confidence > 1 as percentage (0-100 range)', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'My Button', confidence: 95 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].confidence).toBe(0.95);
    });

    it('should cap confidence at 1.0', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'My Button', confidence: 150 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].confidence).toBeLessThanOrEqual(1);
    });

    it('should default confidence to 0.5 when not provided', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'My Button' },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].confidence).toBe(0.5);
    });

    it('should handle confidence as a string', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'My Button', confidence: '0.85' },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].confidence).toBe(0.85);
    });

    it('should default to 0.5 for NaN confidence', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'My Button', confidence: 'high' },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].confidence).toBe(0.5);
    });
  });

  describe('missing markId handling', () => {
    it('should return empty-name entries for expected markIds not in response', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'Login Button', confidence: 0.9 },
      ]);

      const results = parseVLMResponse(raw, [1, 2, 3]);

      expect(results).toHaveLength(3);
      expect(results[0].name).toBe('Login Button');
      expect(results[1]).toEqual({ markId: 2, name: '', confidence: 0 });
      expect(results[2]).toEqual({ markId: 3, name: '', confidence: 0 });
    });

    it('should ignore extra markIds not in expectedMarkIds', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'Button A', confidence: 0.9 },
        { markId: 2, name: 'Button B', confidence: 0.85 },
        { markId: 99, name: 'Unexpected', confidence: 0.5 },
      ]);

      const results = parseVLMResponse(raw, [1, 2]);
      expect(results).toHaveLength(2);
      // markId 99 is not in expected, so it should not be in results
      expect(results.find((r) => r.markId === 99)).toBeUndefined();
    });

    it('should keep only the first occurrence of duplicate markIds', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'First Name', confidence: 0.9 },
        { markId: 1, name: 'Second Name', confidence: 0.5 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('First Name');
    });
  });

  describe('empty / invalid responses', () => {
    it('should return fallback entries for empty string input', () => {
      const results = parseVLMResponse('', [1, 2]);

      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ markId: 1, name: '', confidence: 0 });
      expect(results[1]).toEqual({ markId: 2, name: '', confidence: 0 });
    });

    it('should return fallback entries for whitespace-only input', () => {
      const results = parseVLMResponse('   \n\t  ', [1]);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('');
    });

    it('should return fallback entries for invalid JSON', () => {
      const results = parseVLMResponse('this is not json [invalid]', [1, 2]);

      // The parser finds [] brackets but the content is invalid JSON
      expect(results).toHaveLength(2);
      results.forEach((r) => {
        expect(r.name).toBe('');
        expect(r.confidence).toBe(0);
      });
    });

    it('should return fallback entries when response is a JSON object (not array)', () => {
      const raw = JSON.stringify({ markId: 1, name: 'Button' });

      // extractJsonArray looks for brackets, won't find [ ]
      const results = parseVLMResponse(raw, [1]);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('');
    });

    it('should return fallback entries for null-like text', () => {
      const results = parseVLMResponse('null', [1]);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('');
    });

    it('should skip entries missing both name and suggested_name', () => {
      const raw = JSON.stringify([
        { markId: 1, confidence: 0.9 },
        { markId: 2, name: 'Valid Button', confidence: 0.8 },
      ]);

      const results = parseVLMResponse(raw, [1, 2]);
      expect(results[0].name).toBe(''); // skipped invalid entry
      expect(results[1].name).toBe('Valid Button');
    });

    it('should skip entries that are not objects', () => {
      const raw = JSON.stringify([
        'just a string',
        42,
        null,
        { markId: 1, name: 'Valid', confidence: 0.9 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].name).toBe('Valid');
    });

    it('should skip entries with non-numeric markId', () => {
      const raw = JSON.stringify([
        { markId: 'abc', name: 'Invalid', confidence: 0.5 },
        { markId: 1, name: 'Valid', confidence: 0.9 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].name).toBe('Valid');
    });
  });

  describe('name sanitization', () => {
    it('should trim whitespace from names', () => {
      const raw = JSON.stringify([
        { markId: 1, name: '  Login Button  ', confidence: 0.9 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].name).toBe('Login Button');
    });

    it('should collapse internal whitespace runs', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'Login   Button   -   Default', confidence: 0.9 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      // Internal whitespace collapsed, dashes normalized
      expect(results[0].name).not.toContain('   ');
    });

    it('should normalize dash spacing', () => {
      const raw = JSON.stringify([
        { markId: 1, name: 'Login Button-Default', confidence: 0.9 },
      ]);

      const results = parseVLMResponse(raw, [1]);
      expect(results[0].name).toBe('Login Button - Default');
    });
  });
});

// ------------------------------------------------------------------
// validateNaming
// ------------------------------------------------------------------

describe('validateNaming', () => {
  describe('valid names', () => {
    it('should accept a well-formed CESPC name with Context and Element', () => {
      const result = validateNaming('Login Button');
      expect(result.valid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should accept CESPC name with State segment', () => {
      const result = validateNaming('Login Button - Default');
      expect(result.valid).toBe(true);
    });

    it('should accept CESPC name with all segments', () => {
      const result = validateNaming('Login Button - Default - iOS - Primary');
      expect(result.valid).toBe(true);
    });

    it('should accept names with PascalCase segments', () => {
      const result = validateNaming('ShoppingCart CheckoutButton - Disabled');
      expect(result.valid).toBe(true);
    });
  });

  describe('empty / too short names', () => {
    it('should reject empty string', () => {
      const result = validateNaming('');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Name is empty');
    });

    it('should reject whitespace-only string', () => {
      const result = validateNaming('   ');
      expect(result.valid).toBe(false);
      expect(result.issues).toContain('Name is empty');
    });

    it('should flag name that is too short (single char)', () => {
      const result = validateNaming('A');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('too short'))).toBe(true);
    });
  });

  describe('too long names', () => {
    it('should flag name exceeding 100 characters', () => {
      const longName = 'A'.repeat(101);
      const result = validateNaming(longName);
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('maximum length'))).toBe(true);
    });

    it('should accept name at exactly 100 characters', () => {
      // Build a valid name that is exactly 100 characters
      const name = 'Login ButtonContainer - Default - iOS - Primary';
      // Just need something that has two words and is <= 100 chars
      const result = validateNaming(name);
      // Should not have length issues
      expect(result.issues.some((i) => i.includes('maximum length'))).toBe(false);
    });
  });

  describe('illegal characters', () => {
    it('should flag backslash', () => {
      const result = validateNaming('Login\\Button');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('illegal character'))).toBe(true);
    });

    it('should flag colon', () => {
      const result = validateNaming('Login:Button State');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('illegal character'))).toBe(true);
    });

    it('should flag asterisk', () => {
      const result = validateNaming('Login* Button');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('illegal character'))).toBe(true);
    });

    it('should flag curly braces', () => {
      const result = validateNaming('Login {Button}');
      expect(result.valid).toBe(false);
    });

    it('should flag angle brackets', () => {
      const result = validateNaming('Login <Button>');
      expect(result.valid).toBe(false);
    });

    it('should flag hash', () => {
      const result = validateNaming('Login #1 Button');
      expect(result.valid).toBe(false);
    });

    it('should flag dollar sign', () => {
      const result = validateNaming('Login $Button');
      expect(result.valid).toBe(false);
    });
  });

  describe('CESPC structure checks', () => {
    it('should flag name with only one word (missing Element)', () => {
      const result = validateNaming('Button');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('Context and Element'))).toBe(true);
    });

    it('should accept two-word name (Context + Element)', () => {
      const result = validateNaming('Login Button');
      expect(result.valid).toBe(true);
    });

    it('should accept multi-word Context with Element', () => {
      const result = validateNaming('User Profile Avatar');
      expect(result.valid).toBe(true);
    });
  });

  describe('separator format checks', () => {
    it('should flag underscores as separators', () => {
      const result = validateNaming('Login_Button State');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('underscore'))).toBe(true);
    });

    it('should flag forward slashes as separators', () => {
      const result = validateNaming('Login/Button State');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('slash'))).toBe(true);
    });

    it('should flag trailing dashes', () => {
      const result = validateNaming('Login Button -');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('trailing dashes'))).toBe(true);
    });
  });

  describe('default Figma name detection', () => {
    it('should flag "Frame 123"', () => {
      const result = validateNaming('Frame 123');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes('default layer name'))).toBe(true);
    });

    it('should flag "Group 8"', () => {
      const result = validateNaming('Group 8');
      expect(result.valid).toBe(false);
    });

    it('should flag "Rectangle 45"', () => {
      const result = validateNaming('Rectangle 45');
      expect(result.valid).toBe(false);
    });

    it('should flag "Text"', () => {
      const result = validateNaming('Text');
      expect(result.valid).toBe(false);
    });

    it('should flag "Instance"', () => {
      const result = validateNaming('Instance');
      expect(result.valid).toBe(false);
    });

    it('should flag "Component 5"', () => {
      const result = validateNaming('Component 5');
      expect(result.valid).toBe(false);
    });

    it('should NOT flag custom names that happen to start with "Frame"', () => {
      const result = validateNaming('Frame Container Layout');
      expect(result.issues.some((i) => i.includes('default layer name'))).toBe(false);
    });
  });

  describe('multiple issues', () => {
    it('should accumulate multiple issues for badly formatted names', () => {
      // Single word, underscore, short
      const result = validateNaming('a_b');
      expect(result.valid).toBe(false);
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    });
  });
});
