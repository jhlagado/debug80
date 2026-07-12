import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const MESSAGE_TYPES_PATH = path.join(REPO_ROOT, 'src/debug/session/message-types.ts');
const ADAPTER_PATH = path.join(REPO_ROOT, 'src/debug/adapter.ts');
const EXTENSION_COMMANDS_PATH = path.join(REPO_ROOT, 'src/extension/commands.ts');
const EXTENSION_ROM_SOURCES_PATH = path.join(REPO_ROOT, 'src/extension/rom-sources.ts');
const EXTENSION_AUTO_REBUILD_PATH = path.join(REPO_ROOT, 'src/extension/auto-rebuild.ts');
const TEC1_MESSAGES_PATH = path.join(REPO_ROOT, 'src/platforms/tec1/ui-panel-messages.ts');
const TEC1G_MESSAGES_PATH = path.join(REPO_ROOT, 'src/platforms/tec1g/ui-panel-messages.ts');

function extractDebug80Literals(source: string, pattern: RegExp): Set<string> {
  const values = new Set<string>();
  for (const match of source.matchAll(pattern)) {
    const literal = match[1];
    if (typeof literal === 'string' && literal.length > 0) {
      values.add(literal);
    }
  }
  return values;
}

describe('cross-layer request contracts', () => {
  it('keeps CustomRequestType aligned with registered adapter commands', () => {
    const messageTypesSource = fs.readFileSync(MESSAGE_TYPES_PATH, 'utf8');
    const adapterSource = fs.readFileSync(ADAPTER_PATH, 'utf8');

    const customRequestTypes = extractDebug80Literals(
      messageTypesSource,
      /'((?:debug80\/)[^']+)'/g
    );
    const registeredCommands = extractDebug80Literals(
      adapterSource,
      /commandRouter\.register\('((?:debug80\/)[^']+)'/g
    );

    for (const command of registeredCommands) {
      expect(
        customRequestTypes.has(command),
        `CustomRequestType missing adapter command: ${command}`
      ).toBe(true);
    }
  });

  it('keeps extension/webview customRequest usage in CustomRequestType', () => {
    const messageTypesSource = fs.readFileSync(MESSAGE_TYPES_PATH, 'utf8');
    const customRequestTypes = extractDebug80Literals(
      messageTypesSource,
      /'((?:debug80\/)[^']+)'/g
    );

    const callSites = [
      EXTENSION_COMMANDS_PATH,
      EXTENSION_ROM_SOURCES_PATH,
      EXTENSION_AUTO_REBUILD_PATH,
      TEC1_MESSAGES_PATH,
      TEC1G_MESSAGES_PATH,
    ];
    const requestNames = new Set<string>();
    for (const filePath of callSites) {
      const src = fs.readFileSync(filePath, 'utf8');
      const names = extractDebug80Literals(src, /customRequest\('((?:debug80\/)[^']+)'/g);
      for (const name of names) {
        requestNames.add(name);
      }
    }

    for (const requestName of requestNames) {
      expect(
        customRequestTypes.has(requestName),
        `CustomRequestType missing extension/webview callsite request: ${requestName}`
      ).toBe(true);
    }
  });
});
