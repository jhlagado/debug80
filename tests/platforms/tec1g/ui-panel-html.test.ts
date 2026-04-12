/**
 * @file TEC-1G UI panel HTML tests.
 */

import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { getTec1gHtml } from '../../../src/platforms/tec1g/ui-panel-html';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: (filePath: string) => !filePath.includes(`${path.sep}out${path.sep}webview${path.sep}`),
  };
});

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

describe('tec1g ui-panel-html', () => {
  const extensionUri = { fsPath: process.cwd() } as never;
  const webview = {
    cspSource: 'vscode-resource://test',
    asWebviewUri: (uri: { fsPath: string }) => ({
      toString: () => uri.fsPath,
    }),
  } as never;

  it('includes key UI sections', () => {
    const html = getTec1gHtml('home', webview, extensionUri);
    expect(html).toContain('Home');
    expect(html).toContain('panel-home');
    expect(html).toContain('homeRootSelect');
    expect(html).toContain('homeTargetSelect');
    expect(html).toContain('Quick Pick');
    expect(html).toContain('Set Entry Source');
    expect(html).toContain('panel-ui');
    expect(html).toContain('panel-memory');
    expect(html).toContain('LCD (HD44780 A00)');
    expect(html).toContain('GLCD (128x64)');
    expect(html).toContain('SERIAL (BIT 6)');
  });

  it('embeds the active tab', () => {
    const html = getTec1gHtml('home', webview, extensionUri);
    expect(html).toContain('data-active-tab="home"');
  });
});
