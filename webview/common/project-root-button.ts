/**
 * @file Shared project-root button controller for the Debug80 webviews.
 */

export type ProjectRootOption = {
  name: string;
  path: string;
  hasProject: boolean;
};

type ProjectRootButtonState = {
  roots: ProjectRootOption[];
  rootPath?: string;
  targetCount: number;
};

type VsCodeLike = {
  postMessage: (message: Record<string, unknown>) => void;
};

export type ProjectRootButtonController = {
  applyProjectStatus: (status: {
    rootPath?: string;
    roots: ProjectRootOption[];
    targetCount: number;
  }) => void;
  dispose: () => void;
};

function selectedRoot(
  roots: ProjectRootOption[],
  rootPath: string | undefined
): ProjectRootOption | undefined {
  if (rootPath !== undefined && rootPath !== '') {
    return roots.find((root) => root.path === rootPath);
  }
  return roots[0];
}

export function createProjectRootButtonController(
  vscode: VsCodeLike,
  rootButton: HTMLButtonElement | null,
  createButton: HTMLButtonElement | null
): ProjectRootButtonController {
  let state: ProjectRootButtonState = {
    roots: [],
    rootPath: undefined,
    targetCount: 0,
  };

  const syncButtons = (): void => {
    if (!rootButton) {
      return;
    }

    const selected = selectedRoot(state.roots, state.rootPath);
    const rootConfigured = selected?.hasProject === true;
    const hasRoots = state.roots.length > 0;
    const hasSelectedRoot = selected !== undefined;
    if (!hasRoots) {
      rootButton.disabled = false;
      rootButton.textContent = 'Open Folder';
      rootButton.title = 'Open a folder to create or find a Debug80 project.';
      rootButton.dataset.action = 'create';
      delete rootButton.dataset.rootPath;
    } else if (hasSelectedRoot && !rootConfigured) {
      rootButton.disabled = false;
      rootButton.textContent = selected.name;
      rootButton.title = `${selected.name} — ${selected.path} (no Debug80 project config)`;
      rootButton.dataset.action = 'select';
      rootButton.dataset.rootPath = selected.path;
    } else if (hasSelectedRoot) {
      rootButton.disabled = false;
      rootButton.textContent = selected.name;
      rootButton.title =
        state.targetCount === 0
          ? `${selected.name} — ${selected.path} (no Debug80 targets available)`
          : `${selected.name} — ${selected.path}`;
      rootButton.dataset.action = 'select';
      rootButton.dataset.rootPath = selected.path;
    } else {
      rootButton.disabled = false;
      rootButton.textContent = 'Select workspace root';
      rootButton.title = 'Select workspace root';
      rootButton.dataset.action = 'select';
      delete rootButton.dataset.rootPath;
    }

    if (createButton) {
      // The setup card already provides the primary empty-state action; keep the
      // header focused on root selection to avoid duplicate "Create Project" CTAs.
      createButton.hidden = true;
      createButton.disabled = true;
      createButton.textContent = 'Create Project';
      createButton.title = 'Create a Debug80 project in this workspace root.';
      createButton.dataset.rootPath = '';
    }
  };

  const handleRootClick = (): void => {
    if (!rootButton) {
      return;
    }

    if (rootButton.dataset.action === 'create') {
      vscode.postMessage({
        type: 'createProject',
        ...(rootButton.dataset.rootPath ? { rootPath: rootButton.dataset.rootPath } : {}),
      });
      return;
    }

    vscode.postMessage({ type: 'selectProject' });
  };

  const handleCreateClick = (): void => {
    if (!createButton || createButton.hidden) {
      return;
    }
    vscode.postMessage({
      type: 'createProject',
      ...(createButton.dataset.rootPath ? { rootPath: createButton.dataset.rootPath } : {}),
    });
  };

  rootButton?.addEventListener('click', handleRootClick);
  createButton?.addEventListener('click', handleCreateClick);

  return {
    applyProjectStatus(status) {
      state = {
        roots: status.roots,
        rootPath: status.rootPath,
        targetCount: status.targetCount,
      };
      syncButtons();
    },
    dispose() {
      rootButton?.removeEventListener('click', handleRootClick);
      createButton?.removeEventListener('click', handleCreateClick);
    },
  };
}
