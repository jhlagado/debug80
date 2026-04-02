import type { VscodeApi } from '../common/vscode';

const DEFAULT_VISIBILITY = {
  lcd: true,
  display: true,
  keypad: true,
  matrixKeyboard: true,
  matrix: false,
  glcd: false,
  serial: true,
};

type UiVisibility = Record<string, boolean>;

export interface VisibilityController {
  applyOverride(visibility: UiVisibility, persist: boolean): void;
  wire(): void;
}

const applyVisibility = (
  nodes: HTMLElement[],
  controls: HTMLElement | null,
  visibility: UiVisibility,
) => {
  nodes.forEach((node) => {
    const key = node.dataset.section;
    if (!key) return;
    node.classList.toggle('ui-hidden', visibility[key] === false);
  });
  controls?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-section]').forEach((input) => {
    const key = input.dataset.section;
    if (!key) return;
    input.checked = visibility[key] !== false;
  });
};

export function createVisibilityController(vscode: VscodeApi): VisibilityController {
  const controls = document.getElementById('uiControls') as HTMLElement | null;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('.ui-section'));
  let visibility = { ...DEFAULT_VISIBILITY };

  const save = () => {
    const stored = vscode.getState();
    const state = stored && typeof stored === 'object' ? stored : {};
    vscode.setState({ ...state, uiVisibility: visibility });
  };

  const sync = () => applyVisibility(nodes, controls, visibility);

  return {
    applyOverride(next, persist) {
      if (!next || typeof next !== 'object') return;
      visibility = { ...DEFAULT_VISIBILITY, ...next };
      sync();
      if (persist) save();
    },
    wire() {
      const stored = vscode.getState();
      const state = stored && typeof stored === 'object' ? stored : null;
      const savedVisibility =
        state &&
        'uiVisibility' in state &&
        state.uiVisibility &&
        typeof state.uiVisibility === 'object'
          ? (state.uiVisibility as UiVisibility)
          : {};
      visibility = { ...DEFAULT_VISIBILITY, ...savedVisibility };
      sync();
      controls?.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const key = target.dataset.section;
        if (!key) return;
        visibility = { ...visibility, [key]: target.checked };
        sync();
        save();
      });
    },
  };
}
