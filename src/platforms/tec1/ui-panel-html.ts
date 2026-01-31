/**
 * @file Tec1 panel HTML builder.
 */

import { getTec1Style } from './ui-panel-html-style';
import { getTec1Markup } from './ui-panel-html-markup';
import { getTec1Script } from './ui-panel-html-script';

export type Tec1PanelTab = 'ui' | 'memory';

/**
 * Builds the Tec1 panel webview HTML.
 */
export function getTec1Html(activeTab: Tec1PanelTab): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${getTec1Style()}
</head>
<body>
  ${getTec1Markup()}
  ${getTec1Script(activeTab)}
</body>
</html>`;
}
