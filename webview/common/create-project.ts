import type { VscodeApi } from './vscode';

export function sendCreateProject(vscode: VscodeApi, platform: string, rootPath?: string): void {
  vscode.postMessage({
    type: 'createProject',
    platform,
    ...(rootPath !== undefined ? { rootPath } : {}),
  });
}
