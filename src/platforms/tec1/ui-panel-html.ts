/**
 * @file TEC-1 panel HTML builder.
 */

import * as vscode from 'vscode';
import { buildPanelHtml, type PanelTab } from '../panel-html';

/**
 * Builds the Tec1 panel webview HTML.
 */
export function getTec1Html(
  activeTab: Tec1PanelTab,
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  return buildPanelHtml(activeTab, webview, extensionUri, 'tec1');
}

export type Tec1PanelTab = PanelTab;
