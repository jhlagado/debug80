export type SetupRootOption = {
  name: string;
  path: string;
  hasProject: boolean;
};

export type SetupProjectState = 'noWorkspace' | 'uninitialized' | 'initialized';

export type SetupPrimaryAction = 'openWorkspaceFolder' | 'createProject';

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
  targetCount: number
): SetupCardState | null {
  if (projectState === 'noWorkspace' || selectedRoot === undefined) {
    return {
      text: 'No workspace folder is open. Open a folder to start with Debug80.',
      primaryLabel: 'Open Folder',
      primaryAction: 'openWorkspaceFolder',
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
