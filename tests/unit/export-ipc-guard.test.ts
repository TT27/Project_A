/**
 * Phase 6: IPC argument validation + write-path authorisation for the export surface.
 * The contract schemas are validated directly (the main-process handler also re-checks
 * them via parseIpcRequest, which cannot be imported here because it pulls in Electron).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { IPC_CHANNELS, IPC_CONTRACTS } from '../../src/shared/contracts';
import { authorisePath, isAuthorisedPath, clearAuthorisedPaths } from '../../src/main/exportAuth';

describe('export:write argument validation', () => {
  const schema = IPC_CONTRACTS[IPC_CHANNELS.exportWrite].request;

  it('accepts a well-formed request', () => {
    expect(schema.safeParse({ kind: 'xlsx', destPath: '/tmp/out.xlsx' }).success).toBe(true);
  });

  it('rejects an unknown export kind', () => {
    expect(schema.safeParse({ kind: 'exe', destPath: '/tmp/out.exe' }).success).toBe(false);
  });

  it('rejects a missing destination path', () => {
    expect(schema.safeParse({ kind: 'csv' }).success).toBe(false);
  });

  it('rejects a non-object payload', () => {
    expect(schema.safeParse('not-an-object').success).toBe(false);
    expect(schema.safeParse(null).success).toBe(false);
  });
});

describe('feedback:save argument validation', () => {
  const schema = IPC_CONTRACTS[IPC_CHANNELS.feedbackSave].request;
  const validFeedback = {
    preparationMinutes: 10,
    reviewMinutes: 5,
    usefulness: 4,
    likelihood: 3,
    problems: 'none',
    includeDiagnostics: false,
    diagnostics: null
  };

  it('accepts valid feedback', () => {
    expect(schema.safeParse({ destPath: '/tmp/fb.json', feedback: validFeedback }).success).toBe(true);
  });

  it('rejects out-of-range ratings', () => {
    expect(schema.safeParse({ destPath: '/tmp/fb.json', feedback: { ...validFeedback, usefulness: 9 } }).success).toBe(false);
  });
});

describe('write-path authorisation guard', () => {
  beforeEach(() => clearAuthorisedPaths());

  it('refuses a path that was never returned by a save dialog', () => {
    expect(isAuthorisedPath('/etc/passwd')).toBe(false);
    expect(isAuthorisedPath('/tmp/../etc/shadow')).toBe(false);
  });

  it('permits a path only after it is authorised, and normalises traversal', () => {
    authorisePath('/home/ubuntu/exports/report.xlsx');
    expect(isAuthorisedPath('/home/ubuntu/exports/report.xlsx')).toBe(true);
    // A traversal that resolves to the same authorised path is accepted; anything else is not.
    expect(isAuthorisedPath('/home/ubuntu/exports/sub/../report.xlsx')).toBe(true);
    expect(isAuthorisedPath('/home/ubuntu/exports/other.xlsx')).toBe(false);
  });
});
