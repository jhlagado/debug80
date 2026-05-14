/**
 * @file Platform view reveal helper tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { revealPlatformView } from '../../src/extension/platform-view-reveal';

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('platform-view-reveal', () => {
  it('focuses the platform view command and shows without preserving focus', () => {
    const executeCommand = vi.fn(() => resolvedThenable());
    const show = vi.fn();

    revealPlatformView({
      focusCommand: 'debug80.platformView.focus',
      fallbackCommand: 'workbench.view.debug',
      focus: true,
      target: () => ({ show }),
      commands: { executeCommand },
    });

    expect(executeCommand).toHaveBeenCalledWith('debug80.platformView.focus');
    expect(show).toHaveBeenCalledWith(false);
  });

  it('uses the fallback command when focus is not requested', () => {
    const executeCommand = vi.fn(() => resolvedThenable());
    const show = vi.fn();

    revealPlatformView({
      focusCommand: 'debug80.platformView.focus',
      fallbackCommand: 'workbench.view.debug',
      focus: false,
      target: () => ({ show }),
      commands: { executeCommand },
    });

    expect(executeCommand).toHaveBeenCalledWith('workbench.view.debug');
    expect(show).toHaveBeenCalledWith(true);
  });

  it('falls back to the debug view when direct focus fails', () => {
    const executeCommand = vi
      .fn()
      .mockReturnValueOnce(rejectedThenable())
      .mockReturnValueOnce(resolvedThenable());
    const show = vi.fn();

    revealPlatformView({
      focusCommand: 'debug80.platformView.focus',
      fallbackCommand: 'workbench.view.debug',
      focus: true,
      target: () => ({ show }),
      commands: { executeCommand },
    });

    expect(executeCommand).toHaveBeenNthCalledWith(1, 'debug80.platformView.focus');
    expect(executeCommand).toHaveBeenNthCalledWith(2, 'workbench.view.debug');
    expect(show).toHaveBeenCalledWith(false);
  });

  it('still shows the view when both commands fail', () => {
    const executeCommand = vi.fn(() => rejectedThenable());
    const show = vi.fn();

    revealPlatformView({
      focusCommand: 'debug80.platformView.focus',
      fallbackCommand: 'workbench.view.debug',
      focus: true,
      target: () => ({ show }),
      commands: { executeCommand },
    });
    expect(show).toHaveBeenCalledWith(false);
  });

  it('looks up the target after the command resolves', () => {
    const show = vi.fn();
    let target: { show: typeof show } | undefined;
    const executeCommand = vi.fn(() => {
      target = { show };
      return resolvedThenable();
    });

    revealPlatformView({
      focusCommand: 'debug80.platformView.focus',
      fallbackCommand: 'workbench.view.debug',
      focus: true,
      target: () => target,
      commands: { executeCommand },
    });

    expect(show).toHaveBeenCalledWith(false);
  });
});

function resolvedThenable(): Thenable<unknown> {
  return {
    then: (onFulfilled) => {
      onFulfilled(undefined);
      return resolvedThenable();
    },
  };
}

function rejectedThenable(): Thenable<unknown> {
  return {
    then: (_onFulfilled, onRejected) => {
      onRejected?.(new Error('command failed'));
      return resolvedThenable();
    },
  };
}
