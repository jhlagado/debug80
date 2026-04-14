/**
 * @file Simple platform panel HTML builder.
 */

import * as vscode from 'vscode';
import { buildPanelHtml } from '../panel-html';

export function getSimpleHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  return buildPanelHtml('memory', webview, extensionUri, 'simple');
}
