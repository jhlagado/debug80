/**
 * @file Tests for centralized TEC-1 / TEC-1G update payload serialization.
 */

import { describe, expect, it } from 'vitest';
import {
  serializeTec1ClearFromUiState,
  serializeTec1UpdateFromRuntimeState,
  serializeTec1UpdateFromUiState,
  tec1UpdatePayloadFromDebugEventBody,
} from '../../src/platforms/tec1/serialize-update-payload';
import {
  createTec1Runtime,
  normalizeTec1Config,
} from '@jhlagado/debug80-runtime/platforms/tec1/runtime';
import { createTec1UiState } from '../../src/platforms/tec1/ui-panel-state';
import { serializeTec1gUpdateFromRuntimeState } from '@jhlagado/debug80-runtime/platforms/tec1g/update-controller';
import {
  serializeTec1gClearPanelUpdateFromUiState,
  serializeTec1gUpdateFromUiState,
  tec1gUpdatePayloadFromDebugEventBody,
} from '../../src/platforms/tec1g/serialize-ui-update-payload';
import { applyTec1gUpdate, createTec1gUiState } from '../../src/platforms/tec1g/ui-panel-state';

describe('TEC-1 update payload serialization', () => {
  it('matches runtime snapshot shape', () => {
    const rt = createTec1Runtime(normalizeTec1Config({}), () => undefined);
    rt.state.digits[0] = 3;
    rt.state.matrix[1] = 5;
    rt.state.speaker = true;
    rt.state.speakerHz = 123;
    const fromRt = serializeTec1UpdateFromRuntimeState(rt.state);
    expect(fromRt.speaker).toBe(1);
    expect(fromRt.speakerHz).toBe(123);
  });

  it('maps UI state to payload with optional speaker Hz', () => {
    const ui = createTec1UiState();
    ui.speaker = true;
    const a = serializeTec1UpdateFromUiState(ui);
    expect(a.speakerHz).toBeUndefined();
    const b = serializeTec1UpdateFromUiState(ui, 999);
    expect(b.speakerHz).toBe(999);
  });

  it('parses debug event bodies', () => {
    expect(tec1UpdatePayloadFromDebugEventBody(null)).toBeUndefined();
    expect(
      tec1UpdatePayloadFromDebugEventBody({
        digits: [1],
        matrix: [2],
        lcd: [3],
        speaker: 1,
        speedMode: 'fast',
        speakerHz: 440,
      })
    ).toMatchObject({
      speaker: 1,
      speedMode: 'fast',
      speakerHz: 440,
    });
  });

  it('clear panel snapshot forces speaker off', () => {
    const ui = createTec1UiState();
    ui.speaker = true;
    const cleared = serializeTec1ClearFromUiState(ui);
    expect(cleared.speaker).toBe(0);
  });
});

describe('TEC-1G update payload serialization', () => {
  it('maps UI state to payload (matrix, sysCtrl, speaker Hz) and clear panel snapshot', () => {
    const ui = createTec1gUiState();
    ui.matrixMode = true;
    ui.sysCtrlValue = 0x42;
    const fromUi = serializeTec1gUpdateFromUiState(ui, 1000);
    expect(fromUi.matrixMode).toBe(true);
    expect(fromUi.sysCtrl).toBe(0x42);
    expect(fromUi.speakerHz).toBe(1000);

    const cleared = serializeTec1gClearPanelUpdateFromUiState(ui);
    expect(cleared.speaker).toBe(0);
    expect(cleared.matrixGreen).toBeDefined();
  });

  it('serializes TEC-1G matrix display state from row planes only', () => {
    const ui = createTec1gUiState();
    applyTec1gUpdate(ui, {
      digits: [0, 0, 0, 0, 0, 0],
      matrix: [0x80, 0, 0, 0, 0, 0, 0, 0],
      matrixGreen: [0, 0, 0, 0, 0, 0, 0, 0],
      matrixBlue: [0, 0, 0, 0, 0, 0, 0, 0],
      glcd: [],
      lcd: [],
      speaker: 0,
      speedMode: 'fast',
    });

    expect(serializeTec1gUpdateFromUiState(ui)).toMatchObject({
      matrix: [0x80, 0, 0, 0, 0, 0, 0, 0],
    });
  });

  it('preserves TEC-1G TMS9918 frames through extension UI state serialization', () => {
    const ui = createTec1gUiState();
    applyTec1gUpdate(ui, {
      digits: [0, 0, 0, 0, 0, 0],
      matrix: [],
      glcd: [],
      lcd: [],
      speaker: 0,
      speedMode: 'fast',
      tms9918: {
        active: true,
        videoStandard: 'pal',
        status: 0x80,
        registers: [0, 0xc0, 2, 0x80, 0, 0x36, 7, 4],
        framebuffer: [0x5455ed, 0xffffff],
      },
    });

    expect(serializeTec1gUpdateFromUiState(ui).tms9918).toEqual({
      active: true,
      videoStandard: 'pal',
      status: 0x80,
      registers: [0, 0xc0, 2, 0x80, 0, 0x36, 7, 4],
      framebuffer: [0x5455ed, 0xffffff],
    });
  });

  it('parses debug80/tec1gUpdate bodies', () => {
    const scanCycle = {
      id: 1,
      startCycle: 10,
      endCycle: 90,
      rows: Array.from({ length: 8 }, (_, row) => ({
        row,
        red: row === 0 ? 0xff : 0,
        green: row === 1 ? 0xff : 0,
        blue: row === 2 ? 0xff : 0,
        dwellCycles: 10,
      })),
    };
    const payload = tec1gUpdatePayloadFromDebugEventBody({
      digits: [0, 0, 0, 0, 0, 0],
      matrix: [1],
      glcd: [2],
      lcd: [3],
      speaker: 0,
      speedMode: 'slow',
      matrixGreen: [9],
      matrixScanCycles: [scanCycle],
      matrixDroppedScanCycles: 2,
      matrixClockHz: 4_000_000,
      glcdDdram: [0x20],
    });
    expect(payload).toMatchObject({
      matrixGreen: [9],
      matrixScanCycles: [scanCycle],
      matrixDroppedScanCycles: 2,
      matrixClockHz: 4_000_000,
      glcdDdram: [0x20],
    });
  });

  it('exports runtime serializer used by update controller', () => {
    expect(typeof serializeTec1gUpdateFromRuntimeState).toBe('function');
  });
});
