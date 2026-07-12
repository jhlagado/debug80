/**
 * @file Platform view reveal helper tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { revealPlatformView } from '../../src/extension/platform-view-reveal';

type RevealTarget = { show: ReturnType<typeof vi.fn> };

vi.mock('vscode', () => ({
  commands: {
    executeCommand: vi.fn(),
  },
}));

describe('platform-view-reveal', () => {
  it('focuses the platform view command and shows without preserving focus', () => {
    const harness = createRevealHarness();

    harness.reveal({ focus: true });

    expect(harness.executeCommand).toHaveBeenCalledWith('debug80.platformView.focus');
    expect(harness.show).toHaveBeenCalledWith(false);
  });

  it('uses the fallback command when focus is not requested', () => {
    const harness = createRevealHarness();

    harness.reveal({ focus: false });

    expect(harness.executeCommand).toHaveBeenCalledWith('workbench.view.debug');
    expect(harness.show).toHaveBeenCalledWith(true);
  });

  it('falls back to the debug view when direct focus fails', () => {
    const harness = createRevealHarness({
      executeCommand: vi
        .fn()
        .mockReturnValueOnce(rejectedThenable())
        .mockReturnValueOnce(resolvedThenable()),
    });

    harness.reveal({ focus: true });

    expect(harness.executeCommand).toHaveBeenNthCalledWith(1, 'debug80.platformView.focus');
    expect(harness.executeCommand).toHaveBeenNthCalledWith(2, 'workbench.view.debug');
    expect(harness.show).toHaveBeenCalledWith(false);
  });

  it('still shows the view when both commands fail', () => {
    const harness = createRevealHarness({ executeCommand: vi.fn(() => rejectedThenable()) });

    harness.reveal({ focus: true });

    expect(harness.show).toHaveBeenCalledWith(false);
  });

  it('looks up the target after the command resolves', () => {
    let target: RevealTarget | undefined;
    const harness = createRevealHarness({
      target: () => target,
      executeCommand: vi.fn(() => {
        target = { show: harness.show };
        return resolvedThenable();
      }),
    });

    harness.reveal({ focus: true });

    expect(harness.show).toHaveBeenCalledWith(false);
  });
});

function createRevealHarness(options: {
  executeCommand?: ReturnType<typeof vi.fn>;
  target?: () => RevealTarget | undefined;
} = {}) {
  const show = vi.fn();
  const executeCommand = options.executeCommand ?? vi.fn(() => resolvedThenable());

  return {
    executeCommand,
    show,
    reveal({ focus }: { focus: boolean }) {
      revealPlatformView({
        focusCommand: 'debug80.platformView.focus',
        fallbackCommand: 'workbench.view.debug',
        focus,
        target: options.target ?? (() => ({ show })),
        commands: { executeCommand },
      });
    },
  };
}

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
