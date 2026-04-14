/**
 * @file Simple platform panel HTML builder.
 */

import * as vscode from 'vscode';
import { buildPanelHtml, type PanelTab } from '../panel-html';

export function getSimpleHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  activeTab: PanelTab = 'ui'
): string {
  return buildPanelHtml(activeTab, webview, extensionUri, 'simple');
}
