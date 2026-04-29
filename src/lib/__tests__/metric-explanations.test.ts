/**
 * Validates `src/lib/metric-explanations.json` against
 * `specs/001-app-improvements-apr2026/contracts/metric-explanations.schema.json`.
 *
 * `ajv` is not in the dependency tree, so this test performs a hand-rolled
 * draft-2020-12 subset validation: it asserts the required top-level fields,
 * the shape of every entry under `explanations`, and that string lengths
 * stay within the schema's bounds.
 */
import { describe, it, expect } from 'vitest';
import explanations from '../metric-explanations.json';

type MetricExplanation = {
  label: string;
  description: string;
  formula?: string;
  denominator?: string;
};

const ALLOWED_KEYS_RE = /^[a-zA-Z][a-zA-Z0-9]*$/;
const REQUIRED_FIELDS = ['fullNetworkNetChange', 'edgesAffected', 'newBottlenecks'];

describe('metric-explanations.json', () => {
  it('has the required top-level fields', () => {
    expect(explanations).toMatchObject({
      version: expect.any(Number),
      explanations: expect.any(Object),
    });
    expect(explanations.version).toBeGreaterThanOrEqual(1);
    expect(Object.keys(explanations.explanations).length).toBeGreaterThan(0);
  });

  it('contains entries for every metric called out in data-model.md', () => {
    for (const key of REQUIRED_FIELDS) {
      expect(explanations.explanations).toHaveProperty(key);
    }
  });

  it('every key matches the schema pattern and every entry is well-formed', () => {
    const entries = Object.entries(explanations.explanations) as Array<[string, MetricExplanation]>;
    for (const [key, entry] of entries) {
      expect(ALLOWED_KEYS_RE.test(key), `key "${key}" must match ${ALLOWED_KEYS_RE}`).toBe(true);

      // Required string fields.
      expect(typeof entry.label).toBe('string');
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.label.length).toBeLessThanOrEqual(80);

      expect(typeof entry.description).toBe('string');
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeLessThanOrEqual(500);

      // Optional fields, when present.
      if (entry.formula !== undefined) {
        expect(typeof entry.formula).toBe('string');
        expect(entry.formula.length).toBeLessThanOrEqual(200);
      }
      if (entry.denominator !== undefined) {
        expect(typeof entry.denominator).toBe('string');
        expect(entry.denominator.length).toBeLessThanOrEqual(200);
      }

      // additionalProperties: false → only these four keys are allowed.
      const extraKeys = Object.keys(entry).filter(
        (k) => !['label', 'description', 'formula', 'denominator'].includes(k)
      );
      expect(extraKeys, `entry "${key}" has unexpected keys`).toEqual([]);
    }
  });

  it('does not contain any user-identifying or secret-looking fields', () => {
    const serialized = JSON.stringify(explanations);
    // Per constitution III: no secrets in JSON config.
    expect(serialized).not.toMatch(/password|api[_-]?key|token|secret/i);
  });
});
