export type WorkspaceFolder = { uri: { fsPath: string } };

export const workspace: { workspaceFolders?: WorkspaceFolder[] } = {
  workspaceFolders: undefined,
};

export const commands = {
  executeCommand: (_command: string): Promise<boolean> => Promise.resolve(false),
};

export class DebugAdapterInlineImplementation {
  constructor(_session: unknown) {
    // no-op stub for tests
  }
}

export type ProviderResult<T> = T | undefined | null | Promise<T | undefined | null>;

export type DebugSession = unknown;
