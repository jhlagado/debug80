/**
 * @fileoverview Source-map diagnostic command support.
 */

import * as path from 'path';
import * as vscode from 'vscode';

type SourceMapStatus = {
  targetMap?: { path?: string; exists?: boolean };
  auxiliaryMaps?: Array<{ path?: string; exists?: boolean }>;
  counts?: {
    sourceFiles?: number;
    symbols?: number;
    segments?: number;
    anchors?: number;
  };
  currentPc?: {
    address?: number;
    mapsToSource?: boolean;
    source?: { path?: string; line?: number };
  };
};

export async function showSourceMapStatus(): Promise<boolean> {
  const session = vscode.debug.activeDebugSession;
  if (session?.type !== 'z80') {
    void vscode.window.showErrorMessage('Debug80: No active z80 debug session.');
    return false;
  }

  const status = (await session.customRequest('debug80/sourceMapStatus')) as SourceMapStatus;
  void vscode.window.showInformationMessage(formatSourceMapStatus(status));
  return true;
}

function formatSourceMapStatus(status: SourceMapStatus): string {
  const target = status.targetMap;
  const targetLabel =
    target?.path !== undefined
      ? `${path.basename(target.path)} ${target.exists === true ? 'present' : 'missing'}`
      : 'no target map';
  const auxiliaryMaps = status.auxiliaryMaps ?? [];
  const presentAuxiliary = auxiliaryMaps.filter((entry) => entry.exists === true).length;
  const counts = status.counts ?? {};
  const pc = formatPc(status.currentPc);
  const ok =
    target?.exists === true &&
    (status.currentPc === undefined || status.currentPc.mapsToSource === true);

  return [
    `Debug80: Source map ${ok ? 'OK' : 'needs attention'}.`,
    `Target: ${targetLabel}.`,
    `Auxiliary: ${presentAuxiliary}/${auxiliaryMaps.length}.`,
    `Files ${counts.sourceFiles ?? 0}, symbols ${counts.symbols ?? 0}, segments ${counts.segments ?? 0}.`,
    pc,
  ].join(' ');
}

function formatPc(pc: SourceMapStatus['currentPc']): string {
  if (pc === undefined) {
    return 'PC: unavailable.';
  }
  const address =
    typeof pc.address === 'number' ? `$${pc.address.toString(16).padStart(4, '0')}` : 'unknown';
  if (pc.mapsToSource !== true || pc.source?.path === undefined || pc.source.line === undefined) {
    return `PC ${address}: unmapped.`;
  }
  return `PC ${address}: ${path.basename(pc.source.path)}:${pc.source.line}.`;
}
