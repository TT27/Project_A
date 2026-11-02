import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { app } from 'electron';
import { RecentProjectListSchema, type RecentProject } from '@shared/contracts';

const MAX_RECENT = 10;

function recentFilePath(): string {
  return join(app.getPath('userData'), 'recent-projects.json');
}

export async function readRecentProjects(): Promise<RecentProject[]> {
  try {
    const raw = await fs.readFile(recentFilePath(), 'utf8');
    const parsed = RecentProjectListSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    // Drop entries whose file no longer exists.
    const existing: RecentProject[] = [];
    for (const entry of parsed.data) {
      try {
        await fs.access(entry.path);
        existing.push(entry);
      } catch {
        /* removed or moved */
      }
    }
    return existing;
  } catch {
    return [];
  }
}

export async function addRecentProject(path: string): Promise<void> {
  const current = (await readRecentProjects()).filter((p) => p.path !== path);
  const next: RecentProject[] = [
    { path, name: basename(path).replace(/\.statementdesk$/i, ''), lastOpenedAt: new Date().toISOString() },
    ...current
  ].slice(0, MAX_RECENT);
  await fs.mkdir(app.getPath('userData'), { recursive: true });
  await fs.writeFile(recentFilePath(), JSON.stringify(next, null, 2), 'utf8');
  app.addRecentDocument(path);
}
