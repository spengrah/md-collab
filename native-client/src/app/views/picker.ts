// Workspace picker. Wraps the Tauri 2 dialog plugin's `open()` so the rest of
// the app can stay type-safe without depending on plugin internals.
//
// We import from `@tauri-apps/plugin-dialog` (NOT `@tauri-apps/api/dialog`,
// which no longer exists in Tauri 2).

import { open as openDialog } from '@tauri-apps/plugin-dialog';

export async function pickWorkspaceDirectory(): Promise<string | null> {
  const result = await openDialog({
    directory: true,
    multiple: false,
    title: 'Open md-collab workspace',
  });
  if (result === null) return null;
  if (Array.isArray(result)) return result[0] ?? null;
  return result;
}
