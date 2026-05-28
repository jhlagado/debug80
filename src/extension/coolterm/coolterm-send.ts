import * as path from 'path';
import * as vscode from 'vscode';

import { CoolTermRemoteClient } from './coolterm-remote-client';
import { resolveCoolTermHexArtifact } from './coolterm-hex-artifact';

export type CoolTermSendHexOptions = {
  rootPath: string;
  targetName?: string;
  status?: (message: string) => void;
};

export async function isCoolTermRemoteAvailable(timeoutMs = 500): Promise<boolean> {
  const client = new CoolTermRemoteClient({ timeoutMs });
  try {
    await client.ping();
    return true;
  } catch {
    return false;
  } finally {
    client.dispose();
  }
}

export async function sendHexViaCoolTerm(options: CoolTermSendHexOptions): Promise<boolean> {
  const artifact = resolveCoolTermHexArtifact(options.rootPath, options.targetName);
  if (artifact.kind === 'unresolved') {
    options.status?.(artifact.reason);
    void vscode.window.showErrorMessage(`Debug80: ${artifact.reason}`);
    return false;
  }
  if (artifact.kind === 'missing') {
    options.status?.(`HEX file not found at ${artifact.path}. Build the selected target first.`);
    void vscode.window.showWarningMessage(
      `Debug80: HEX file not found at ${artifact.path}. Build the selected target first.`
    );
    return false;
  }

  const fileName = path.basename(artifact.path);
  const client = new CoolTermRemoteClient({ timeoutMs: 3000 });
  options.status?.('Checking CoolTerm remote socket...');
  try {
    await client.ping();
  } catch {
    options.status?.('CoolTerm is not available. Start CoolTerm and enable Remote Control Socket.');
    void vscode.window.showErrorMessage(
      'Debug80: CoolTerm is not available. Start CoolTerm and enable Preferences > Scripting > Remote Control Socket on port 51413.'
    );
    client.dispose();
    return false;
  }

  return vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Sending ${fileName} to board...`,
      cancellable: false,
    },
    async () => {
      try {
        options.status?.('Opening CoolTerm serial connection...');
        const connected = await client.connectSerialPort();
        if (!connected) {
          options.status?.('CoolTerm could not open the serial port. Check the selected port in CoolTerm.');
          void vscode.window.showErrorMessage(
            'Debug80: CoolTerm could not open the serial port. Check the selected port and TEC-1 settings.'
          );
          return false;
        }

        options.status?.(`Sending ${artifact.path} to the serial port...`);
        const sent = await client.sendTextFile(artifact.path);
        if (!sent) {
          options.status?.('CoolTerm failed to send the HEX file.');
          void vscode.window.showErrorMessage('Debug80: CoolTerm failed to send the HEX file.');
          return false;
        }

        options.status?.(`Sent ${fileName}. Check the board display for PASS or ERROR.`);
        void vscode.window.showInformationMessage(
          `Debug80: ${fileName} sent. Check the board display for PASS or ERROR.`
        );
        return true;
      } finally {
        client.dispose();
      }
    }
  );
}
