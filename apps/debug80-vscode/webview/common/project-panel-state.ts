import type { ProjectStatusPayload } from '../../src/contracts/platform-view';

export type ProjectRootOption = {
  name: string;
  path: string;
  hasProject: boolean;
};

export type ProjectPanelTarget = NonNullable<ProjectStatusPayload['targets']>[number];

export type ProjectPanelPayload = {
  rootPath?: ProjectStatusPayload['rootPath'];
  roots?: ProjectStatusPayload['roots'];
  targets?: ProjectStatusPayload['targets'];
  targetName?: ProjectStatusPayload['targetName'];
  projectState?: ProjectStatusPayload['projectState'];
  hasProject?: ProjectStatusPayload['hasProject'];
  platform?: ProjectStatusPayload['platform'];
  coolTermHexPath?: ProjectStatusPayload['coolTermHexPath'];
  hardwareStatusText?: ProjectStatusPayload['hardwareStatusText'];
  hardwareStatusState?: ProjectStatusPayload['hardwareStatusState'];
  sourceMapStatusText?: ProjectStatusPayload['sourceMapStatusText'];
  sourceMapStatusState?: ProjectStatusPayload['sourceMapStatusState'];
};

export type ProjectPanelState =
  | {
      kind: 'noWorkspace';
      roots: ProjectRootOption[];
      selectedRoot: undefined;
      targets: [];
      targetName: undefined;
      platform: ProjectStatusPayload['platform'] | undefined;
      coolTermHexPath: ProjectStatusPayload['coolTermHexPath'] | undefined;
      hardwareStatusText: string;
      hardwareStatusState: string;
      sourceMapStatusText: string;
      sourceMapStatusState: string;
    }
  | {
      kind: 'uninitialized';
      roots: ProjectRootOption[];
      selectedRoot: ProjectRootOption | undefined;
      targets: [];
      targetName: undefined;
      platform: ProjectStatusPayload['platform'] | undefined;
      coolTermHexPath: ProjectStatusPayload['coolTermHexPath'] | undefined;
      hardwareStatusText: string;
      hardwareStatusState: string;
      sourceMapStatusText: string;
      sourceMapStatusState: string;
    }
  | {
      kind: 'initialized';
      roots: ProjectRootOption[];
      selectedRoot: ProjectRootOption;
      targets: ProjectPanelTarget[];
      targetName: ProjectStatusPayload['targetName'] | undefined;
      platform: ProjectStatusPayload['platform'] | undefined;
      coolTermHexPath: ProjectStatusPayload['coolTermHexPath'] | undefined;
      hardwareStatusText: string;
      hardwareStatusState: string;
      sourceMapStatusText: string;
      sourceMapStatusState: string;
    };

export type ProjectPanelAction =
  | { type: 'openWorkspaceFolder'; platform?: string }
  | { type: 'selectProject'; platform?: string }
  | { type: 'createProject'; rootPath?: string; platform: string }
  | { type: 'selectTarget'; rootPath: string; targetName: string }
  | { type: 'sendHexViaCoolTerm'; rootPath: string; targetName?: string }
  | { type: 'testCoolTermConnection' };

export type SetupCardModel = {
  text: string;
  primaryLabel: string;
  primaryAction: 'openWorkspaceFolder' | 'selectProject' | 'createProject';
};

function explicitKind(payload: ProjectPanelPayload): ProjectPanelState['kind'] | undefined {
  if (payload.projectState === 'noWorkspace') {
    return 'noWorkspace';
  }
  if (payload.projectState === 'uninitialized') {
    return 'uninitialized';
  }
  if (payload.projectState === 'initialized') {
    return 'initialized';
  }
  return undefined;
}

function resolveKind(payload: ProjectPanelPayload, selectedRoot: ProjectRootOption | undefined) {
  const explicit = explicitKind(payload);
  if (explicit !== undefined) {
    return explicit;
  }
  if (payload.hasProject === true) {
    return 'initialized';
  }
  if (selectedRoot !== undefined) {
    return 'uninitialized';
  }
  return 'noWorkspace';
}

function selectedRoot(
  roots: ProjectRootOption[],
  rootPath: string | undefined,
  hasProject: boolean
): ProjectRootOption | undefined {
  if (rootPath !== undefined && rootPath !== '') {
    return (
      roots.find((root) => root.path === rootPath) ?? {
        name: rootPath.split(/[\\/]/).filter(Boolean).pop() ?? rootPath,
        path: rootPath,
        hasProject,
      }
    );
  }
  return undefined;
}

export function createProjectPanelState(payload: ProjectPanelPayload): ProjectPanelState {
  const roots = payload.roots ?? [];
  const selected = selectedRoot(roots, payload.rootPath, payload.hasProject === true);
  const kind = resolveKind(payload, selected);
  const common = {
    roots,
    platform: payload.platform,
    coolTermHexPath: payload.coolTermHexPath,
    hardwareStatusText: payload.hardwareStatusText ?? '',
    hardwareStatusState: payload.hardwareStatusState ?? 'neutral',
    sourceMapStatusText: payload.sourceMapStatusText ?? '',
    sourceMapStatusState: payload.sourceMapStatusState ?? '',
  };

  if (kind === 'initialized' && selected !== undefined) {
    return {
      ...common,
      kind,
      selectedRoot: selected,
      targets: payload.targets ?? [],
      targetName: payload.targetName,
    };
  }

  if (kind === 'uninitialized') {
    return {
      ...common,
      kind,
      selectedRoot: selected,
      targets: [],
      targetName: undefined,
    };
  }

  return {
    ...common,
    kind: 'noWorkspace',
    selectedRoot: undefined,
    targets: [],
    targetName: undefined,
  };
}

export function setupCardForProjectPanel(state: ProjectPanelState): SetupCardModel | null {
  if (state.kind === 'noWorkspace' && state.roots.length === 0) {
    return {
      text: 'Add projects or folders to the workspace to start with Debug80.',
      primaryLabel: 'Open Folder',
      primaryAction: 'openWorkspaceFolder',
    };
  }
  if (state.selectedRoot === undefined) {
    return {
      text: 'Workspace folders are available. Select a workspace root to create or find a Debug80 project.',
      primaryLabel: 'Select Project',
      primaryAction: 'selectProject',
    };
  }
  if (state.kind === 'uninitialized') {
    return {
      text: 'Uninitialized Debug80 project',
      primaryLabel: 'Initialize Project',
      primaryAction: 'createProject',
    };
  }
  return null;
}

export function createProjectAction(
  state: ProjectPanelState,
  platform: string
): ProjectPanelAction | undefined {
  if (state.selectedRoot === undefined) {
    return undefined;
  }
  return {
    type: 'createProject',
    platform,
    rootPath: state.selectedRoot.path,
  };
}

export function setupPrimaryAction(state: ProjectPanelState, platform: string): ProjectPanelAction {
  const setup = setupCardForProjectPanel(state);
  if (setup?.primaryAction === 'selectProject') {
    return { type: 'selectProject', platform };
  }
  if (setup?.primaryAction === 'createProject') {
    return createProjectAction(state, platform) ?? { type: 'selectProject', platform };
  }
  return { type: 'openWorkspaceFolder', platform };
}

export function selectTargetAction(
  state: ProjectPanelState,
  targetName: string
): ProjectPanelAction | undefined {
  if (state.kind !== 'initialized' || targetName === '') {
    return undefined;
  }
  return {
    type: 'selectTarget',
    rootPath: state.selectedRoot.path,
    targetName,
  };
}

export function sendHexAction(
  state: ProjectPanelState,
  targetNameOverride?: string
): ProjectPanelAction | undefined {
  if (state.kind !== 'initialized') {
    return undefined;
  }
  const targetName =
    targetNameOverride !== undefined && targetNameOverride !== ''
      ? targetNameOverride
      : state.targetName;
  return {
    type: 'sendHexViaCoolTerm',
    rootPath: state.selectedRoot.path,
    ...(targetName ? { targetName } : {}),
  };
}
