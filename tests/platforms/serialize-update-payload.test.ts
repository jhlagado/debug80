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
import { createTec1Runtime, normalizeTec1Config } from '../../src/platforms/tec1/runtime';
import { createTec1UiState } from '../../src/platforms/tec1/ui-panel-state';
import { serializeTec1gUpdateFromRuntimeState } from '../../src/platforms/tec1g/update-controller';
import {
  serializeTec1gChangedUpdateFromUiState,
  serializeTec1gClearPanelUpdateFromUiState,
  serializeTec1gUpdateFromUiState,
  tec1gUpdatePayloadFromDebugEventBody,
} from '../../src/platforms/tec1g/serialize-ui-update-payload';
import { createTec1gUiState } from '../../src/platforms/tec1g/ui-panel-state';

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

  it('parses debug80/tec1gUpdate bodies', () => {
    const payload = tec1gUpdatePayloadFromDebugEventBody({
      digits: [0, 0, 0, 0, 0, 0],
      matrix: [1],
      glcd: [2],
      lcd: [3],
      speaker: 0,
      speedMode: 'slow',
      matrixGreen: [9],
      glcdDdram: [0x20],
    });
    expect(payload).toMatchObject({
      matrixGreen: [9],
      glcdDdram: [0x20],
    });
  });

  it('exports runtime serializer used by update controller', () => {
    expect(typeof serializeTec1gUpdateFromRuntimeState).toBe('function');
  });

  it('serializes only changed TEC-1G fields for runtime updates', () => {
    const previous = createTec1gUiState();
    const next = createTec1gUiState();
    next.matrixGreen[0] = 0x12;
    next.glcd[10] = 0x34;
    next.speaker = true;

    const changed = serializeTec1gChangedUpdateFromUiState(previous, next, 880);

    expect(changed).toEqual({
      matrixGreen: next.matrixGreen,
      glcd: next.glcd,
      speaker: 1,
      speakerHz: 880,
    });
  });
});
