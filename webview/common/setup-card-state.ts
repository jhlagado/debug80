export type SetupRootOption = {
  name: string;
  path: string;
  hasProject: boolean;
};

export type SetupPrimaryAction = 'openWorkspaceFolder' | 'createProject' | 'configureProject' | 'startDebug';

export type SetupCardState = {
  text: string;
  primaryLabel: string;
  primaryAction: SetupPrimaryAction;
  showSecondaryConfigure: boolean;
};

export function resolveSetupCardState(
  selectedRoot: SetupRootOption | undefined,
  targetCount: number
): SetupCardState {
  if (selectedRoot === undefined) {
    return {
      text: 'No workspace folder is open. Open a folder to start with Debug80.',
      primaryLabel: 'Open Folder',
      primaryAction: 'openWorkspaceFolder',
      showSecondaryConfigure: false,
    };
  }
  if (!selectedRoot.hasProject) {
    return {
      text: `No Debug80 project found in ${selectedRoot.name}.`,
      primaryLabel: 'Create Project',
      primaryAction: 'createProject',
      showSecondaryConfigure: false,
    };
  }
  if (targetCount === 0) {
    return {
      text: 'Project has no targets configured yet.',
      primaryLabel: 'Configure Project',
      primaryAction: 'configureProject',
      showSecondaryConfigure: false,
    };
  }
  return {
    text: 'Project is configured. Start debugging or adjust settings.',
    primaryLabel: 'Start Debugging',
    primaryAction: 'startDebug',
    showSecondaryConfigure: true,
  };
}
