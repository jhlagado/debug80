/**
 * @file Regression tests for platform view idle HTML.
 */

import { describe, expect, it } from 'vitest';

import {
  createPlatformViewNonce,
  getPlatformViewIdleHtml,
} from '../../src/extension/platform-view-idle-html';

describe('platform-view idle html', () => {
  it('renders the no-project placeholder with a nonce', () => {
    const html = getPlatformViewIdleHtml({
      hasProject: false,
      nonce: 'abc123',
      multiRoot: false,
    });

    expect(html).toContain('Create a Debug80 project to get started.');
    expect(html).toContain('Create Project');
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).not.toContain('Start Debugging');
  });

  it('renders the project-detected view and workspace hint', () => {
    const html = getPlatformViewIdleHtml({
      hasProject: true,
      multiRoot: true,
      nonce: 'xyz789',
      projectName: 'caverns80',
      targetName: 'app',
      entrySource: 'src/main.asm',
    });

    expect(html).toContain('Project detected (Workspace).');
    expect(html).toContain('Project: caverns80');
    expect(html).toContain('Target: app');
    expect(html).toContain('Entry: src/main.asm');
    expect(html).toContain('Start Debugging');
    expect(html).toContain('Select Open Project');
    expect(html).toContain('Select Target');
    expect(html).toContain('Set Entry Source');
    expect(html).toContain("script-src 'nonce-xyz789'");
    expect(html).toContain('Select a workspace folder with');
  });

  it('creates a 32-character nonce', () => {
    expect(createPlatformViewNonce()).toHaveLength(32);
  });
});
