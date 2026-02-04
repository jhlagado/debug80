import type { VscodeApi } from './vscode';

export function appendSerialText(
  serialOutEl: HTMLElement,
  text: string,
  max: number
): void {
  if (!text) {
    return;
  }
  const next = (serialOutEl.textContent || '') + text;
  if (next.length > max) {
    serialOutEl.textContent = next.slice(next.length - max);
  } else {
    serialOutEl.textContent = next;
  }
  serialOutEl.scrollTop = serialOutEl.scrollHeight;
}

export function sendSerialInput(
  serialInputEl: HTMLInputElement,
  vscode: VscodeApi
): void {
  const text = (serialInputEl.value || '').trimEnd();
  if (!text) {
    return;
  }
  vscode.postMessage({ type: 'serialSend', text: text + '\r' });
  serialInputEl.value = '';
  serialInputEl.focus();
}
