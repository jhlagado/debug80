import { appendSerialText, sendSerialInput } from '../common/serial';
import type { VscodeApi } from '../common/vscode';

const SERIAL_MAX = 8000;

export type Tec1gSerialUiController = {
  dispose: () => void;
};

export function wireTec1gSerialUi(vscode: VscodeApi): Tec1gSerialUiController {
  const serialOutEl = document.getElementById('serialOut') as HTMLElement | null;
  const serialInputEl = document.getElementById('serialInput') as HTMLInputElement | null;
  const serialSendEl = document.getElementById('serialSend') as HTMLElement | null;
  const serialSendFileEl = document.getElementById('serialSendFile') as HTMLElement | null;
  const serialSaveEl = document.getElementById('serialSave') as HTMLElement | null;
  const serialClearEl = document.getElementById('serialClear') as HTMLElement | null;
  const appEl = document.getElementById('app') as HTMLElement | null;

  if (
    !serialOutEl ||
    !serialInputEl ||
    !serialSendEl ||
    !serialSendFileEl ||
    !serialSaveEl ||
    !serialClearEl
  ) {
    return { dispose: () => {} };
  }

  const onMessage = (event: MessageEvent) => {
    if (!event.data) return;
    if (event.data.type === 'serial') {
      appendSerialText(serialOutEl, event.data.text || '', SERIAL_MAX);
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

  serialSendEl.addEventListener('click', () => {
    sendSerialInput(serialInputEl, vscode);
  });
  serialInputEl.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      sendSerialInput(serialInputEl, vscode);
      event.preventDefault();
    }
  });

  serialSendFileEl.addEventListener('click', () => {
    vscode.postMessage({ type: 'serialSendFile' });
  });
  serialSaveEl.addEventListener('click', () => {
    const text = serialOutEl.textContent || '';
    vscode.postMessage({ type: 'serialSave', text });
  });
  serialClearEl.addEventListener('click', () => {
    serialOutEl.textContent = '';
    vscode.postMessage({ type: 'serialClear' });
  });

  if (document.activeElement !== serialInputEl) {
    appEl?.focus();
  }

  return {
    dispose: () => {
      window.removeEventListener('message', onMessage);
    },
  };
}
