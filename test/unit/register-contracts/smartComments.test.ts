import { describe, expect, it } from 'vitest';

import {
  parseInterfaceContracts,
  parseInterfaceContractsDetailed,
} from '../../../src/register-contracts/interfaceContracts.js';

describe('register-contracts interface parsing', () => {
  it('rejects malformed interface lines and comments in contract files', () => {
    expect(() =>
      parseInterfaceContracts(['extern MON', 'clobbers Q', 'end'].join('\n'), 'mon3.asmi'),
    ).toThrow('mon3.asmi:2: invalid register contracts interface line "clobbers Q"');
    expect(() =>
      parseInterfaceContracts(['; no comments', 'extern MON', 'end'].join('\n'), 'mon3.asmi'),
    ).toThrow('mon3.asmi:1: .asmi files do not permit comments');
  });

  it('parses register-contracts interface contracts', () => {
    const contracts = parseInterfaceContracts(
      [
        'extern MON3_API_16_SCAN_KEYS',
        'in C',
        'out A,carry,zero',
        'clobbers DE',
        'preserves IX,IY',
        'end',
        '',
      ].join('\n'),
    );

    expect(contracts.get('MON3_API_16_SCAN_KEYS')).toEqual({
      name: 'MON3_API_16_SCAN_KEYS',
      in: ['C'],
      out: ['A', 'carry', 'zero'],
      clobbers: ['D', 'E'],
      preserves: ['IXH', 'IXL', 'IYH', 'IYL'],
    });
  });

  it('parses RST selector service interface contracts', () => {
    const contracts = parseInterfaceContracts(
      [
        'service rst $10 C 16 SCAN_KEYS',
        'in C',
        'out A,carry,zero',
        'clobbers DE',
        'end',
      ].join('\n'),
    );

    expect(contracts.get('RST_$10:16')).toEqual({
      name: 'RST_$10:16',
      in: ['C'],
      out: ['A', 'carry', 'zero'],
      clobbers: ['D', 'E'],
      preserves: [],
    });
    expect(contracts.get('RST_$10:SCANKEYS')).toEqual({
      name: 'RST_$10:SCANKEYS',
      in: ['C'],
      out: ['A', 'carry', 'zero'],
      clobbers: ['D', 'E'],
      preserves: [],
    });
  });

  it('parses RST selector range service interface contracts', () => {
    const parsed = parseInterfaceContractsDetailed(
      [
        'service rst $10 C >= $60 TECMATE_EXPANSION_SERVICE',
        'in C',
        'out A,carry',
        'clobbers B,C,D,E,H,L,zero,sign,parity,halfCarry',
        'end',
      ].join('\n'),
    );

    expect(parsed.contracts.get('RST_$10:C>=$60')).toEqual({
      name: 'RST_$10:C>=$60',
      in: ['C'],
      out: ['A', 'carry'],
      clobbers: ['B', 'C', 'D', 'E', 'H', 'L', 'zero', 'sign', 'parity', 'halfCarry'],
      preserves: [],
    });
    expect(parsed.contracts.get('TECMATE_EXPANSION_SERVICE')).toEqual({
      name: 'TECMATE_EXPANSION_SERVICE',
      in: ['C'],
      out: ['A', 'carry'],
      clobbers: ['B', 'C', 'D', 'E', 'H', 'L', 'zero', 'sign', 'parity', 'halfCarry'],
      preserves: [],
    });
    expect(parsed.serviceRanges).toEqual([
      {
        vector: 0x10,
        selector: 'C',
        min: 0x60,
        target: 'TECMATE_EXPANSION_SERVICE',
      },
    ]);
  });

});
