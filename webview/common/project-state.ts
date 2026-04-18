import type { ProjectStatusPayload } from '../../src/contracts/platform-view';

export type ProjectViewState = 'noWorkspace' | 'uninitialized' | 'initialized';

export function resolveProjectViewState(payload: {
  projectState?: ProjectStatusPayload['projectState'];
  rootPath?: ProjectStatusPayload['rootPath'];
  hasProject?: ProjectStatusPayload['hasProject'];
}): ProjectViewState {
  if (payload.projectState === 'noWorkspace' || payload.projectState === 'uninitialized' || payload.projectState === 'initialized') {
    return payload.projectState;
  }
  if (payload.hasProject === true) {
    return 'initialized';
  }
  if (typeof payload.rootPath === 'string' && payload.rootPath.length > 0) {
    return 'uninitialized';
  }
  return 'noWorkspace';
}
