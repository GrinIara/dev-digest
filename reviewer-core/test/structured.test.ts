import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { extractJson, parseWithRepair } from '../src/index.js';

/**
 * llm/structured.ts — JSON-fence extraction, brace-balancing, and the
 * parse-with-repair loop's error/reprompt shape. Previously untested
 * (finding #6). Fully hermetic: no network, no LLM, just string → result.
 */

describe('extractJson — fenced blocks', () => {
  it('extracts JSON from a ```json fenced block', () => {
    const raw = 'Sure, here you go:\n```json\n{"a": 1}\n```\nHope that helps!';
    expect(extractJson(raw)).toBe('{"a": 1}');
  });

  it('extracts JSON from a plain ``` fence with no language tag', () => {
    const raw = '```\n{"a": 1}\n```';
    expect(extractJson(raw)).toBe('{"a": 1}');
  });

  it('is case-insensitive on the ```JSON language tag', () => {
    const raw = '```JSON\n{"a": 1}\n```';
    expect(extractJson(raw)).toBe('{"a": 1}');
  });
});

describe('extractJson — brace/bracket balancing (no fence)', () => {
  it('finds the first balanced {…} object amid surrounding prose', () => {
    const raw = 'Here is the result: {"a": 1, "b": 2} — done.';
    expect(extractJson(raw)).toBe('{"a": 1, "b": 2}');
  });

  it('correctly balances nested objects instead of stopping at the first `}`', () => {
    const raw = 'result -> {"a": {"nested": true}, "b": 2} trailing text';
    expect(extractJson(raw)).toBe('{"a": {"nested": true}, "b": 2}');
  });

  it('finds a balanced [...] array when no object is present', () => {
    const raw = 'items: [1, 2, {"x": 3}] end';
    expect(extractJson(raw)).toBe('[1, 2, {"x": 3}]');
  });

  it('picks whichever of `{` or `[` appears first', () => {
    const raw = 'prefix [1, 2] then {"a": 1} suffix';
    expect(extractJson(raw)).toBe('[1, 2]');
  });

  it('can be fooled by a ``` sequence embedded inside a string value (documented limitation)', () => {
    // This is exactly the case parseWithRepair's own comment warns about:
    // extractJson's fence match is non-greedy, so it stops at the FIRST ```
    // it sees — including one embedded inside a JSON string value — instead
    // of the real closing fence. `parseWithRepair` tries direct JSON.parse
    // FIRST specifically to avoid hitting this path on well-formed output;
    // this test pins that the fence-extraction fallback is genuinely
    // best-effort, not a full parser.
    const raw = '```json\n{"body": "contains a ``` fence marker"}\n```';
    const extracted = extractJson(raw);
    expect(extracted).not.toBe('{"body": "contains a ``` fence marker"}');
    expect(() => JSON.parse(extracted)).toThrow();
  });

  it('falls back to the trimmed input when there is no `{` or `[` at all', () => {
    expect(extractJson('   just plain text, no json here   ')).toBe(
      'just plain text, no json here',
    );
  });

  it('returns the unbalanced tail when a closing brace is missing', () => {
    const raw = 'prefix {"a": 1, "b": {"c": 2}';
    expect(extractJson(raw)).toBe('{"a": 1, "b": {"c": 2}');
  });
});

describe('parseWithRepair', () => {
  const schema = z.object({ name: z.string(), age: z.number() });

  it('parses clean raw JSON directly (the strict json_schema happy path)', () => {
    const result = parseWithRepair(schema, '{"name": "Ada", "age": 30}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: 'Ada', age: 30 });
  });

  it('falls back to extractJson when the raw text is not directly parseable JSON', () => {
    const raw = 'Sure!\n```json\n{"name": "Ada", "age": 30}\n```';
    const result = parseWithRepair(schema, raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ name: 'Ada', age: 30 });
  });

  it('reports a JSON-parse failure with a reprompt asking for JSON-only output', () => {
    const result = parseWithRepair(schema, 'not json at all, no braces');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/not valid JSON/);
      expect(result.repromptMessage).toMatch(/Return ONLY a single valid JSON object/);
    }
  });

  it('reports schema-validation failures with the field-level Zod issues', () => {
    // Valid JSON, but `age` is a string and `name` is missing.
    const result = parseWithRepair(schema, '{"age": "thirty"}');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('name');
      expect(result.error).toContain('age');
      expect(result.repromptMessage).toContain('did not match the required schema');
      expect(result.repromptMessage).toContain(result.error);
    }
  });
});
