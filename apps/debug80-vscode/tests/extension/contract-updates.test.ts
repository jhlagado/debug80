/**
 * @file Tests for applying AZM register-contract updates.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const showInformationMessage = vi.fn();
const applyEdit = vi.fn();
const openTextDocument = vi.fn();
const executeCommand = vi.fn();
const registerTextDocumentContentProvider = vi.fn(() => ({ dispose: vi.fn() }));

class FakeRange {
  constructor(
    public start: unknown,
    public end: unknown
  ) {}
}

class FakeWorkspaceEdit {
  public readonly replacements: { path: string; text: string }[] = [];
  public replace(uri: { fsPath: string }, _range: unknown, text: string): void {
    this.replacements.push({ path: uri.fsPath, text });
  }
}

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath, with: () => ({ fsPath }) }) },
  Range: FakeRange,
  WorkspaceEdit: FakeWorkspaceEdit,
  commands: { executeCommand },
  window: { showInformationMessage },
  workspace: { applyEdit, openTextDocument, registerTextDocumentContentProvider },
}));

const { applyContractUpdates, contractUpdateAzmOptions } = await import(
  '../../src/extension/contract-updates'
);

/** A stand-in document whose text drives the "did anything change" check. */
function fakeDocument(text: string) {
  return {
    getText: () => text,
    positionAt: (offset: number) => ({ offset }),
  };
}

describe('contractUpdateAzmOptions', () => {
  it('requests nothing when the control is set to never', () => {
    expect(contractUpdateAzmOptions('never')).toEqual({});
  });

  it('asks AZM for annotations and fixes otherwise', () => {
    for (const mode of ['ask', 'auto'] as const) {
      expect(contractUpdateAzmOptions(mode)).toEqual({
        emitRegisterAnnotations: true,
        fixRegisterContracts: true,
      });
    }
  });
});

describe('applyContractUpdates', () => {
  const output = { appendLine: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    applyEdit.mockResolvedValue(true);
  });

  const run = (files: { path: string; text: string }[], mode: 'ask' | 'auto' | 'never') =>
    applyContractUpdates({ files, mode, baseDir: '/proj', output: output as never });

  it('does nothing when the control is set to never', async () => {
    await expect(run([{ path: '/proj/a.asm', text: 'new' }], 'never')).resolves.toBe('none');
    expect(applyEdit).not.toHaveBeenCalled();
  });

  it('skips files whose proposed text already matches the document', async () => {
    openTextDocument.mockResolvedValue(fakeDocument('same'));
    await expect(run([{ path: '/proj/a.asm', text: 'same' }], 'auto')).resolves.toBe('none');
    expect(applyEdit).not.toHaveBeenCalled();
    expect(showInformationMessage).not.toHaveBeenCalled();
  });

  it('applies changed files without prompting in auto mode', async () => {
    openTextDocument.mockResolvedValue(fakeDocument('old'));
    await expect(run([{ path: '/proj/a.asm', text: 'new' }], 'auto')).resolves.toBe('applied');
    expect(showInformationMessage).not.toHaveBeenCalled();
    const edit = applyEdit.mock.calls[0]?.[0] as FakeWorkspaceEdit;
    expect(edit.replacements).toEqual([{ path: '/proj/a.asm', text: 'new' }]);
  });

  it('prompts before applying in ask mode', async () => {
    openTextDocument.mockResolvedValue(fakeDocument('old'));
    showInformationMessage.mockResolvedValue('Apply');
    await expect(run([{ path: '/proj/a.asm', text: 'new' }], 'ask')).resolves.toBe('applied');
    expect(showInformationMessage).toHaveBeenCalledTimes(1);
    expect(applyEdit).toHaveBeenCalledTimes(1);
  });

  it('leaves the source alone when the prompt is dismissed', async () => {
    openTextDocument.mockResolvedValue(fakeDocument('old'));
    showInformationMessage.mockResolvedValue(undefined);
    await expect(run([{ path: '/proj/a.asm', text: 'new' }], 'ask')).resolves.toBe('declined');
    expect(applyEdit).not.toHaveBeenCalled();
  });

  it('re-asks after showing the diff rather than giving up', async () => {
    openTextDocument.mockResolvedValue(fakeDocument('old'));
    showInformationMessage.mockResolvedValueOnce('Show diff').mockResolvedValueOnce('Apply');
    await expect(run([{ path: '/proj/a.asm', text: 'new' }], 'ask')).resolves.toBe('applied');
    expect(executeCommand).toHaveBeenCalledWith(
      'vscode.diff',
      expect.anything(),
      expect.anything(),
      expect.stringContaining('contract updates')
    );
    expect(showInformationMessage).toHaveBeenCalledTimes(2);
    expect(applyEdit).toHaveBeenCalledTimes(1);
  });

  it('reports a refused edit instead of claiming success', async () => {
    openTextDocument.mockResolvedValue(fakeDocument('old'));
    applyEdit.mockResolvedValue(false);
    await expect(run([{ path: '/proj/a.asm', text: 'new' }], 'auto')).resolves.toBe('failed');
  });
});
