import { describe, expect, it } from 'vitest';
import {
  getMementoForTarget,
  mergeTec1gPanelVisibility,
} from '../../src/extension/tec1g-ui-visibility-memento';
import { TEC1G_DEFAULT_PANEL_VISIBILITY } from '../../src/tec1g/visibility-defaults';

describe('tec1g ui visibility memento', () => {
  it('merges defaults, then adapter, then memento (last wins per key)', () => {
    const m = mergeTec1gPanelVisibility({ glcd: false, matrix: true }, { glcd: true, serial: true });
    expect(m.glcd).toBe(true);
    expect(m.matrix).toBe(true);
    expect(m.serial).toBe(true);
    expect(m.lcd).toBe(TEC1G_DEFAULT_PANEL_VISIBILITY.lcd);
  });

  it('returns memento for a target or undefined if missing', () => {
    expect(getMementoForTarget({ main: { glcd: false } }, 'main')).toEqual({ glcd: false });
    expect(getMementoForTarget({ main: { glcd: false } }, 'other')).toBeUndefined();
  });
});
