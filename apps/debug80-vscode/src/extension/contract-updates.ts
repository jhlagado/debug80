/**
 * @file Applying AZM register-contract updates back into source.
 *
 * AZM's contract analysis can rewrite `.routine` directives from what it
 * inferred, and insert `.expectout` at call sites where the fix is
 * unambiguous. It returns the revised text as an artifact and never touches
 * the filesystem, which leaves the write decision here.
 *
 * Updates are applied as a workspace edit rather than written to disk. That
 * puts them in the editor as ordinary unsaved changes: visible in the diff
 * gutter, revertable with undo, and never a surprise to a file the user has
 * open with their own edits in it.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type { ContractUpdateFile } from '../debug/launch/assembler';
import type { AzmPanelContractUpdateMode } from '../contracts/platform-view';

/**
 * The AZM options that make a build produce contract updates.
 *
 * `emitRegisterAnnotations` forces the contract analysis to run even when the
 * Register Contracts dropdown is off, so the two panel controls are
 * independent of one another.
 */
export function contractUpdateAzmOptions(mode: AzmPanelContractUpdateMode): {
  emitRegisterAnnotations?: boolean;
  fixRegisterContracts?: boolean;
} {
  if (mode === 'never') {
    return {};
  }
  return { emitRegisterAnnotations: true, fixRegisterContracts: true };
}

/**
 * Backs the diff view. The right-hand side of the diff is the proposed text,
 * which exists only in memory, so it is served through a virtual scheme.
 */
const PREVIEW_SCHEME = 'debug80-contract-update';
const previewTexts = new Map<string, string>();
let previewRegistration: vscode.Disposable | undefined;

function ensurePreviewProvider(): void {
  if (previewRegistration !== undefined) {
    return;
  }
  previewRegistration = vscode.workspace.registerTextDocumentContentProvider(PREVIEW_SCHEME, {
    provideTextDocumentContent(uri) {
      return previewTexts.get(uri.fsPath) ?? '';
    },
  });
}

/** Releases the diff provider. Called from the extension's deactivate path. */
export function disposeContractUpdatePreview(): void {
  previewRegistration?.dispose();
  previewRegistration = undefined;
  previewTexts.clear();
}

/** Drops files whose proposed text matches what is already in the document. */
async function changedFiles(files: ContractUpdateFile[]): Promise<
  { uri: vscode.Uri; document: vscode.TextDocument; text: string }[]
> {
  const changed = [];
  for (const file of files) {
    const uri = vscode.Uri.file(file.path);
    let document: vscode.TextDocument;
    try {
      document = await vscode.workspace.openTextDocument(uri);
    } catch {
      continue;
    }
    if (document.getText() !== file.text) {
      changed.push({ uri, document, text: file.text });
    }
  }
  return changed;
}

function describe(count: number, baseDir: string, first: string): string {
  const name = path.relative(baseDir, first);
  return count === 1
    ? `Debug80 can update the register contracts in ${name}.`
    : `Debug80 can update the register contracts in ${name} and ${count - 1} other file${
        count === 2 ? '' : 's'
      }.`;
}

export type ContractUpdateOutcome = 'none' | 'applied' | 'declined' | 'failed';

/**
 * Offers or applies the updates according to the panel's mode.
 *
 * Returns what happened so the caller can report it; nothing here throws, on
 * the grounds that a failed contract update must not fail an otherwise good
 * build.
 */
export async function applyContractUpdates(options: {
  files: ContractUpdateFile[];
  mode: AzmPanelContractUpdateMode;
  baseDir: string;
  output: vscode.OutputChannel;
}): Promise<ContractUpdateOutcome> {
  const { files, mode, baseDir, output } = options;
  if (mode === 'never' || files.length === 0) {
    return 'none';
  }

  const changed = await changedFiles(files);
  if (changed.length === 0) {
    return 'none';
  }

  const first = changed[0];
  if (first === undefined) {
    return 'none';
  }

  if (mode === 'ask') {
    const summary = describe(changed.length, baseDir, first.uri.fsPath);
    // Showing the diff should not end the exchange, so the prompt comes back
    // once the user has looked at it.
    for (;;) {
      const choice = await vscode.window.showInformationMessage(
        summary,
        { modal: true, detail: 'Applied as editor edits, so you can undo them.' },
        'Apply',
        'Show diff'
      );
      if (choice === 'Apply') {
        break;
      }
      if (choice !== 'Show diff') {
        return 'declined';
      }
      ensurePreviewProvider();
      previewTexts.set(first.uri.fsPath, first.text);
      await vscode.commands.executeCommand(
        'vscode.diff',
        first.uri,
        first.uri.with({ scheme: PREVIEW_SCHEME }),
        `${path.basename(first.uri.fsPath)} — contract updates`
      );
    }
  }

  const edit = new vscode.WorkspaceEdit();
  for (const file of changed) {
    const whole = new vscode.Range(
      file.document.positionAt(0),
      file.document.positionAt(file.document.getText().length)
    );
    edit.replace(file.uri, whole, file.text);
  }

  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    output.appendLine('Debug80: Could not apply register contract updates.');
    return 'failed';
  }

  for (const file of changed) {
    output.appendLine(
      `Debug80: Updated register contracts in ${path.relative(baseDir, file.uri.fsPath)}`
    );
  }
  return 'applied';
}
