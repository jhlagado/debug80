/**
 * @file TEC-1G panel HTML builder.
 */

import * as vscode from 'vscode';
import { buildPanelHtml, type PanelTab } from '../panel-html';

/**
 * Builds the Tec1g panel webview HTML.
 */
export function getTec1gHtml(
  activeTab: Tec1gPanelTab,
  webview: vscode.Webview,
  extensionUri: vscode.Uri
): string {
  return buildPanelHtml(activeTab, webview, extensionUri, 'tec1g');
}

export type Tec1gPanelTab = PanelTab;
