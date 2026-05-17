// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

// Mock the IPC module so the banner can be exercised without a Tauri runtime.
vi.mock('../../../../native-client/src/app/ipc.js', () => ({
  ipc: {
    fsOpenSidecarExternally: vi.fn().mockResolvedValue(undefined),
  },
}));

import { ipc } from '../../../../native-client/src/app/ipc.js';
import { mountSidecarErrorBanner } from '../../../../native-client/src/components/editor/sidecar-error-banner.js';

describe('sidecar-error-banner', () => {
  it('renders title, body, and detail', () => {
    const parent = document.createElement('div');
    mountSidecarErrorBanner({
      parent,
      sidecarRelPath: 'docs/notes.md.comments.json',
      errorMessage: '/threads/0/anchor missing required property "primary"',
      onReload: () => {},
    });
    expect(parent.querySelector('.mdc-sidecar-error-title')?.textContent).toContain('cannot be parsed');
    expect(parent.querySelector('.mdc-sidecar-error-body')?.textContent).toContain(
      'docs/notes.md.comments.json'
    );
    expect(parent.querySelector('.mdc-sidecar-error-detail')?.textContent).toContain('primary');
  });

  it('clicking Reveal invokes fs_open_sidecar_externally with the rel path', async () => {
    const parent = document.createElement('div');
    mountSidecarErrorBanner({
      parent,
      sidecarRelPath: 'docs/notes.md.comments.json',
      errorMessage: 'boom',
      onReload: () => {},
    });
    const revealBtn = parent.querySelector('button[data-action="reveal"]') as HTMLButtonElement;
    revealBtn.click();
    // Await the queued microtask.
    await Promise.resolve();
    expect(ipc.fsOpenSidecarExternally).toHaveBeenCalledWith('docs/notes.md.comments.json');
  });

  it('clicking Reload invokes the supplied callback', () => {
    const parent = document.createElement('div');
    const onReload = vi.fn();
    mountSidecarErrorBanner({
      parent,
      sidecarRelPath: 'a.md.comments.json',
      errorMessage: 'x',
      onReload,
    });
    const reloadBtn = parent.querySelector('button[data-action="reload"]') as HTMLButtonElement;
    reloadBtn.click();
    expect(onReload).toHaveBeenCalled();
  });
});
