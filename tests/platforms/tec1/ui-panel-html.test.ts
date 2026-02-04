/**
 * @file TEC-1 UI panel HTML tests.
 */

import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { getTec1Html } from '../../../src/platforms/tec1/ui-panel-html';

vi.mock('vscode', () => {
  return {
    Uri: {
      file: (value: string) => ({ fsPath: value }),
      joinPath: (...parts: Array<string | { fsPath: string }>) => ({
        fsPath: path.join(...parts.map((part) => (typeof part === 'string' ? part : part.fsPath))),
      }),
    },
  };
});

describe('tec1 ui-panel-html', () => {
  const extensionUri = { fsPath: process.cwd() };
  const webview = {
    cspSource: 'vscode-resource://test',
    asWebviewUri: (uri: { fsPath: string }) => ({
      toString: () => uri.fsPath,
    }),
  };

  it('includes key UI sections', () => {
    const html = getTec1Html('ui', webview, extensionUri);
    expect(html).toContain('panel-ui');
    expect(html).toContain('panel-memory');
    expect(html).toContain('LCD (HD44780 A00)');
    expect(html).toContain('8x8 LED MATRIX');
    expect(html).toContain('SERIAL (BIT 6)');
  });

  it('embeds the active tab', () => {
    const html = getTec1Html('memory', webview, extensionUri);
    expect(html).toContain('data-active-tab="memory"');
  });
});
