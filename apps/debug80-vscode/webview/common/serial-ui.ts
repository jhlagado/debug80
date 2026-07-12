import { appendSerialText, sendSerialInput } from './serial';
import type { VscodeApi } from './vscode';

const SERIAL_MAX = 8000;

export interface SerialUiController {
  dispose(): void;
}

export interface SerialUiOptions {
  outputId?: string;
  inputId?: string;
  sendId?: string;
  sendFileId?: string;
  saveId?: string;
  clearId?: string;
  maxTextLength?: number;
}

export function wireSerialUi(vscode: VscodeApi, options: SerialUiOptions = {}): SerialUiController {
  const {
    outputId = 'serialOut',
    inputId = 'serialInput',
    sendId = 'serialSend',
    sendFileId = 'serialSendFile',
    saveId = 'serialSave',
    clearId = 'serialClear',
    maxTextLength = SERIAL_MAX,
  } = options;

  const serialOutEl = document.getElementById(outputId) as HTMLElement | null;
  const serialInputEl = document.getElementById(inputId) as HTMLInputElement | null;
  const serialSendEl = document.getElementById(sendId) as HTMLElement | null;
  const serialSendFileEl = document.getElementById(sendFileId) as HTMLElement | null;
  const serialSaveEl = document.getElementById(saveId) as HTMLElement | null;
  const serialClearEl = document.getElementById(clearId) as HTMLElement | null;
  const appEl = document.getElementById('app') as HTMLElement | null;

  if (!serialOutEl) {
    return { dispose: (): void => {} };
  }

  const onMessage = (event: MessageEvent): void => {
    if (!event.data) {
      return;
    }
    if (event.data.type === 'serial') {
      appendSerialText(serialOutEl, event.data.text || '', maxTextLength);
      return;
    }
    if (event.data.type === 'serialInit') {
      serialOutEl.textContent = event.data.text || '';
      return;
    }
    if (event.data.type === 'serialClear') {
      serialOutEl.textContent = '';
    }
  };

  window.addEventListener('message', onMessage);

  serialSendEl?.addEventListener('click', () => {
    if (serialInputEl) {
      sendSerialInput(serialInputEl, vscode);
    }
  });
  serialInputEl?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      sendSerialInput(serialInputEl, vscode);
      event.preventDefault();
    }
  });
  serialSendFileEl?.addEventListener('click', () => {
    vscode.postMessage({ type: 'serialSendFile' });
  });
  serialSaveEl?.addEventListener('click', () => {
    const text = serialOutEl.textContent || '';
    vscode.postMessage({ type: 'serialSave', text });
  });
  serialClearEl?.addEventListener('click', () => {
    serialOutEl.textContent = '';
    vscode.postMessage({ type: 'serialClear' });
  });

  if (document.activeElement !== serialInputEl) {
    appEl?.focus();
  }

  return {
    dispose(): void {
      window.removeEventListener('message', onMessage);
    },
  };
}
