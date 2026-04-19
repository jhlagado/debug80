export type SetupRootOption = {
  name: string;
  path: string;
  hasProject: boolean;
};

export type SetupProjectState = 'noWorkspace' | 'uninitialized' | 'initialized';

export type SetupPrimaryAction = 'openWorkspaceFolder' | 'selectProject' | 'createProject';

export type SetupCardState = {
  text: string;
  primaryLabel: string;
  primaryAction: SetupPrimaryAction;
};

/**
 * Returns the setup card state for the given root/target situation, or null if
 * the setup card should be hidden (project is already configured).
 */
export function resolveSetupCardState(
  selectedRoot: SetupRootOption | undefined,
  projectState: SetupProjectState,
  targetCount: number,
  rootCount = selectedRoot ? 1 : 0
): SetupCardState | null {
  if (rootCount === 0 && projectState === 'noWorkspace') {
    return {
      text: 'Add projects or folders to the workspace to start with Debug80.',
      primaryLabel: 'Open Folder',
      primaryAction: 'openWorkspaceFolder',
    };
  }
  if (selectedRoot === undefined) {
    return {
      text: 'Workspace folders are available. Select a workspace root to create or find a Debug80 project.',
      primaryLabel: 'Select Project',
      primaryAction: 'selectProject',
    };
  }
  if (projectState === 'uninitialized') {
    return {
      text: 'Uninitialized Debug80 project',
      primaryLabel: 'Initialize Project',
      primaryAction: 'createProject',
    };
  }
  // Project exists (with or without targets) — hide the card.
  void targetCount;
  return null;
}
