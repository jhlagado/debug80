import type { VscodeApi } from '../common/vscode';
import { TEC1G_DEFAULT_PANEL_VISIBILITY } from '../../src/tec1g/visibility-defaults';

type UiVisibility = Record<string, boolean>;

export interface VisibilityController {
  applyOverride(visibility: UiVisibility, persist: boolean): void;
  wire(): void;
  setProjectTargetName(name: string | undefined): void;
}

const applyVisibility = (
  nodes: HTMLElement[],
  controls: HTMLElement | null,
  visibility: UiVisibility
) => {
  nodes.forEach((node) => {
    const key = node.dataset.section;
    if (!key) {
      return;
    }
    node.classList.toggle('ui-hidden', visibility[key] === false);
  });
  controls
    ?.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-section]')
    .forEach((input) => {
      const key = input.dataset.section;
      if (!key) {
        return;
      }
      input.checked = visibility[key] !== false;
    });
};

export function createVisibilityController(vscode: VscodeApi): VisibilityController {
  const controls = document.getElementById('uiControls') as HTMLElement | null;
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('.ui-section'));
  let visibility: UiVisibility = { ...TEC1G_DEFAULT_PANEL_VISIBILITY };
  let projectTargetName: string | undefined;

  const save = () => {
    const stored = vscode.getState();
    const state = stored && typeof stored === 'object' ? stored : {};
    vscode.setState({ ...state, uiVisibility: visibility });
    vscode.postMessage({
      type: 'saveTec1gPanelVisibility',
      ...(projectTargetName !== undefined && projectTargetName.length > 0
        ? { targetName: projectTargetName }
        : {}),
      visibility: { ...visibility },
    });
  };

  const sync = () => applyVisibility(nodes, controls, visibility);

  return {
    setProjectTargetName(name) {
      projectTargetName = name;
    },
    applyOverride(next, persist) {
      if (!next || typeof next !== 'object') {
        return;
      }
      visibility = { ...TEC1G_DEFAULT_PANEL_VISIBILITY, ...next };
      sync();
      if (persist) {
        save();
      }
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
      visibility = { ...TEC1G_DEFAULT_PANEL_VISIBILITY, ...savedVisibility };
      sync();
      controls?.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) {
          return;
        }
        const key = target.dataset.section;
        if (!key) {
          return;
        }
        visibility = { ...visibility, [key]: target.checked };
        sync();
        save();
      });
    },
  };
}
