/**
 * Authorisation guard for file writes initiated by the renderer.
 *
 * The renderer can only ask the main process to WRITE to a path that the USER has
 * just chosen through a native save dialog. Every path returned by a save dialog is
 * recorded here; `export:write` / `feedback:save` refuse any destination that is not
 * on this list. This stops a compromised renderer from writing to arbitrary files
 * (path traversal, overwriting unrelated files) by fabricating an IPC request.
 */
import { resolve } from 'node:path';

const authorised = new Set<string>();

/** Record a path the user picked in a native save dialog as a legal write target. */
export function authorisePath(path: string): void {
  authorised.add(resolve(path));
}

/** True when `path` was handed to the user by a native save dialog in this session. */
export function isAuthorisedPath(path: string): boolean {
  return authorised.has(resolve(path));
}

/** Test helper. */
export function clearAuthorisedPaths(): void {
  authorised.clear();
}
