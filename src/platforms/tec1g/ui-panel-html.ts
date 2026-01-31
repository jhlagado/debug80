/**
 * @file Tec1g panel HTML builder.
 */

import { getTec1gStyle } from './ui-panel-html-style';
import { getTec1gMarkup } from './ui-panel-html-markup';
import { getTec1gScript } from './ui-panel-html-script';

export type Tec1gPanelTab = 'ui' | 'memory';

/**
 * Builds the Tec1g panel webview HTML.
 */
export function getTec1gHtml(activeTab: Tec1gPanelTab): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getTec1gStyle()}
</head>
<body>
  ${getTec1gMarkup()}
  ${getTec1gScript(activeTab)}
</body>
</html>`;
}
