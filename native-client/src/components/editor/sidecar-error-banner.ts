// Read-only sidecar parse-error banner.
//
// When `parseSidecar` throws SCHEMA_INVALID, this banner replaces the
// thread-decoration overlay. It offers two actions:
//   - "Reveal sidecar in editor" — invokes `fs_open_sidecar_externally`,
//     which validates the path is a `.comments.json` under the workspace
//     root before invoking `tauri-plugin-opener`'s `open_path()`. The user
//     repairs the file in their default `.json` handler and saves.
//   - "Reload sidecar" — re-invokes the read+parse path.

import { ipc } from '../../app/ipc.js';

export interface SidecarErrorBannerOptions {
  parent: HTMLElement;
  sidecarRelPath: string;
  errorMessage: string;
  onReload: () => void;
}

export interface SidecarErrorBannerHandle {
  destroy(): void;
}

export function mountSidecarErrorBanner(
  options: SidecarErrorBannerOptions
): SidecarErrorBannerHandle {
  const { parent, sidecarRelPath, errorMessage, onReload } = options;

  const root = document.createElement('div');
  root.className = 'mdc-sidecar-error-banner';
  root.setAttribute('role', 'alert');

  const title = document.createElement('div');
  title.className = 'mdc-sidecar-error-title';
  title.textContent = 'This sidecar cannot be parsed.';
  root.appendChild(title);

  const body = document.createElement('div');
  body.className = 'mdc-sidecar-error-body';
  body.textContent = `Comments are unavailable until ${sidecarRelPath} is repaired.`;
  root.appendChild(body);

  const detail = document.createElement('div');
  detail.className = 'mdc-sidecar-error-detail';
  detail.textContent = truncate(errorMessage, 200);
  detail.title = errorMessage;
  root.appendChild(detail);

  const actions = document.createElement('div');
  actions.className = 'mdc-sidecar-error-actions';
  root.appendChild(actions);

  const revealBtn = document.createElement('button');
  revealBtn.type = 'button';
  revealBtn.textContent = 'Reveal sidecar in editor';
  revealBtn.dataset.action = 'reveal';
  revealBtn.addEventListener('click', async () => {
    revealBtn.disabled = true;
    try {
      await ipc.fsOpenSidecarExternally(sidecarRelPath);
    } catch (err) {
      console.error('failed to open sidecar externally', err);
    } finally {
      revealBtn.disabled = false;
    }
  });
  actions.appendChild(revealBtn);

  const reloadBtn = document.createElement('button');
  reloadBtn.type = 'button';
  reloadBtn.textContent = 'Reload sidecar';
  reloadBtn.dataset.action = 'reload';
  reloadBtn.addEventListener('click', () => onReload());
  actions.appendChild(reloadBtn);

  parent.appendChild(root);

  return {
    destroy() {
      root.remove();
    },
  };
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n) + '…';
}
