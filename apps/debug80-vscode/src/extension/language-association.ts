/**
 * @file Language association helpers for Debug80 source documents.
 */

import * as vscode from 'vscode';
import { AZM_LANGUAGE_EXTENSIONS } from './debug80-source-extensions';

const ASM_LANGUAGE_ID = 'z80-asm';

export function registerLanguageAssociations(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel
): void {
  const ensureLanguage = async (
    doc: vscode.TextDocument,
    extension: string,
    languageId: string
  ): Promise<void> => {
    if (!doc.uri.path.toLowerCase().endsWith(extension)) {
      return;
    }
    if (doc.languageId === languageId) {
      return;
    }
    const scheme = doc.uri.scheme;
    if (scheme !== 'file' && scheme !== 'untitled') {
      return;
    }
    try {
      await vscode.languages.setTextDocumentLanguage(doc, languageId);
    } catch (err) {
      output.appendLine(`Failed to set language for ${doc.uri.fsPath}: ${String(err)}`);
    }
  };

  /** Same extensions as package.json `languages` / `files.associations` for z80-asm. */
  const ensureZ80AsmExtensionLanguages = async (doc: vscode.TextDocument): Promise<void> => {
    for (const ext of AZM_LANGUAGE_EXTENSIONS) {
      await ensureLanguage(doc, ext, ASM_LANGUAGE_ID);
    }
  };

  void vscode.languages.getLanguages().then((languages) => {
    const hasAsmLang = languages.includes(ASM_LANGUAGE_ID);
    if (hasAsmLang) {
      for (const doc of vscode.workspace.textDocuments) {
        void ensureZ80AsmExtensionLanguages(doc);
      }
    }
  });

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      void ensureZ80AsmExtensionLanguages(doc);
    })
  );
}
