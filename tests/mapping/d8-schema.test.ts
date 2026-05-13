/**
 * @file JSON Schema contract tests for D8 debug map files.
 *
 * Validates that both committed fixtures and programmatically-built D8 maps
 * conform to the canonical schema, catching format drift between producers
 * (e.g. ZAX) and the debug80 consumer.
 */

import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import Ajv from 'ajv';
import { buildD8DebugMap, parseD8DebugMap } from '../../src/mapping/d8-map';
import type { MappingParseResult } from '../../src/mapping/parser';

const schemaPath = path.join(process.cwd(), 'schemas', 'd8-debug-map.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));

function createValidator() {
  const ajv = new Ajv({ allErrors: true });
  return ajv.compile(schema);
}

describe('D8 JSON Schema contract', () => {
  const validate = createValidator();

  it('golden ZAX fixture conforms to the schema', () => {
    const d8Path = path.join(process.cwd(), 'tests', 'fixtures', 'zax', 'matrix.d8.json');
    const content = JSON.parse(fs.readFileSync(d8Path, 'utf-8'));
    const valid = validate(content);
    if (!valid) {
      const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('\n');
      expect.fail(`Schema validation failed:\n${errors}`);
    }
  });

  it('simple.d8.json e2e fixture conforms to the schema', () => {
    const d8Path = path.join(
      process.cwd(),
      'tests',
      'e2e',
      'fixtures',
      'simple',
      'build',
      'simple.d8.json'
    );
    const content = JSON.parse(fs.readFileSync(d8Path, 'utf-8'));
    const valid = validate(content);
    if (!valid) {
      const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('\n');
      expect.fail(`Schema validation failed:\n${errors}`);
    }
  });

  it('programmatically-built D8 map conforms to the schema', () => {
    const mapping: MappingParseResult = {
      segments: [
        {
          start: 0x1000,
          end: 0x1002,
          loc: { file: 'test.asm', line: 10 },
          lst: { line: 1, text: 'LD A,B' },
          confidence: 'HIGH',
        },
      ],
      anchors: [{ address: 0x1000, symbol: 'START', file: 'test.asm', line: 10 }],
    };
    const map = buildD8DebugMap(mapping, {
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      generator: { name: 'debug80' },
    });

    const valid = validate(map);
    if (!valid) {
      const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('\n');
      expect.fail(`Schema validation failed:\n${errors}`);
    }
  });

  it('round-tripped ZAX fixture still conforms to the schema', () => {
    const d8Path = path.join(process.cwd(), 'tests', 'fixtures', 'zax', 'matrix.d8.json');
    const raw = fs.readFileSync(d8Path, 'utf-8');
    const { map } = parseD8DebugMap(raw);
    expect(map).toBeDefined();

    const serialized = JSON.parse(JSON.stringify(map));
    const valid = validate(serialized);
    if (!valid) {
      const errors = validate.errors?.map((e) => `${e.instancePath} ${e.message}`).join('\n');
      expect.fail(`Schema validation failed:\n${errors}`);
    }
  });

  it('rejects a D8 map with invalid format field', () => {
    const bad = {
      format: 'wrong',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {},
    };
    expect(validate(bad)).toBe(false);
  });

  it('rejects a D8 map with missing required fields', () => {
    const bad = { format: 'd8-debug-map' };
    expect(validate(bad)).toBe(false);
  });
});
