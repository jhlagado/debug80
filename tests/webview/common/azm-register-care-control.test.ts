/**
 * @file AZM register-care project-control tests.
 */

import { describe, expect, it } from 'vitest';
import { wireAzmRegisterCareControl } from '../../../webview/common/azm-register-care-control';
import type { VscodeApi } from '../../../webview/common/vscode';

describe('azm register-care controls', () => {
  it('reflects project status and posts changed launch options', () => {
    const messages: unknown[] = [];
    const vscode = {
      postMessage: (message: unknown) => messages.push(message),
      getState: () => null,
      setState: () => undefined,
    } satisfies VscodeApi;
    const audit = document.createElement('input');
    audit.type = 'checkbox';
    const enforce = document.createElement('input');
    enforce.type = 'checkbox';

    const control = wireAzmRegisterCareControl(vscode, audit, enforce);
    control.applyProjectStatus({
      hasProject: true,
      azmRegisterCareAudit: true,
      azmRegisterCareEnforce: false,
    });

    expect(audit.disabled).toBe(false);
    expect(enforce.disabled).toBe(false);
    expect(audit.checked).toBe(true);
    expect(enforce.checked).toBe(false);
    expect(messages).toEqual([]);

    enforce.checked = true;
    enforce.dispatchEvent(new Event('change'));

    expect(messages).toEqual([{ type: 'setAzmRegisterCare', audit: true, enforce: true }]);
    control.dispose();
  });

  it('disables controls when the selected folder is not an initialized project', () => {
    const vscode = {
      postMessage: () => undefined,
      getState: () => null,
      setState: () => undefined,
    } satisfies VscodeApi;
    const audit = document.createElement('input');
    audit.type = 'checkbox';
    const enforce = document.createElement('input');
    enforce.type = 'checkbox';

    const control = wireAzmRegisterCareControl(vscode, audit, enforce);
    control.applyProjectStatus({ hasProject: false });

    expect(audit.disabled).toBe(true);
    expect(enforce.disabled).toBe(true);
  });
});
