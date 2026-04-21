/**
 * @file Language association helpers for Debug80 source documents.
 */

import * as vscode from 'vscode';

const ASM_LANGUAGE_ID = 'z80-asm';
const ZAX_LANGUAGE_ID = 'zax';

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

  const ensureAsmLanguage = async (doc: vscode.TextDocument): Promise<void> =>
    ensureLanguage(doc, '.asm', ASM_LANGUAGE_ID);

  /** Same extensions as package.json `languages` / `files.associations` for z80-asm. */
  const ensureZ80AsmExtensionLanguages = async (doc: vscode.TextDocument): Promise<void> => {
    for (const ext of ['.z80', '.a80', '.s'] as const) {
      await ensureLanguage(doc, ext, ASM_LANGUAGE_ID);
    }
  };

  const ensureZaxLanguage = async (doc: vscode.TextDocument): Promise<void> =>
    ensureLanguage(doc, '.zax', ZAX_LANGUAGE_ID);

  void vscode.languages.getLanguages().then((languages) => {
    const hasAsmLang = languages.includes(ASM_LANGUAGE_ID);
    const hasZaxLang = languages.includes(ZAX_LANGUAGE_ID);
    if (hasAsmLang || hasZaxLang) {
      for (const doc of vscode.workspace.textDocuments) {
        if (hasAsmLang) {
          void ensureAsmLanguage(doc);
          void ensureZ80AsmExtensionLanguages(doc);
        }
        if (hasZaxLang) {
          void ensureZaxLanguage(doc);
        }
      }
    }
  });

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      void ensureAsmLanguage(doc);
      void ensureZ80AsmExtensionLanguages(doc);
      void ensureZaxLanguage(doc);
    })
  );
}
