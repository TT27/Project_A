import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS, IPC_CONTRACTS, type ContractChannel } from '../../src/shared/contracts';

/**
 * Main-side request validation, exercised through the same Zod contracts that
 * src/main/ipc.ts applies via parseIpcRequest (which only wraps these schemas).
 */
function mainSideParse(channel: ContractChannel, args: unknown[]) {
  if (args.length > 1) return { success: false as const };
  return IPC_CONTRACTS[channel].request.safeParse(args[0]);
}

describe('IPC request schemas (main-side validation)', () => {
  it('every channel in the registry has a request and response schema', () => {
    for (const channel of Object.keys(IPC_CONTRACTS) as ContractChannel[]) {
      expect(IPC_CONTRACTS[channel].request).toBeDefined();
      expect(IPC_CONTRACTS[channel].response).toBeDefined();
    }
  });

  it('argument-less channels reject stray payloads', () => {
    expect(mainSideParse(IPC_CHANNELS.appGetInfo, []).success).toBe(true);
    expect(mainSideParse(IPC_CHANNELS.appGetInfo, [{ evil: true }]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.projectGetState, ['x']).success).toBe(false);
  });

  it('rejects wrong types, extra args and unexpected enum values', () => {
    expect(mainSideParse(IPC_CHANNELS.dialogPickInputFile, [{ side: 'ledger' }]).success).toBe(true);
    expect(mainSideParse(IPC_CHANNELS.dialogPickInputFile, [{ side: 'other' }]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.dialogPickInputFile, [{ side: 'ledger' }, 'extra']).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.dialogPickInputFile, ['ledger']).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.dialogPickInputFile, [null]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.dialogPickExportPath, [{ kind: 'exe' }]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.dialogPickExportPath, [{ kind: 'xlsx', suggestedName: 'a'.repeat(500) }]).success).toBe(false);
  });

  it('rejects malformed project paths and setup payloads', () => {
    expect(mainSideParse(IPC_CHANNELS.projectOpen, [{ path: '' }]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.projectOpen, [{ path: 'x'.repeat(5000) }]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.projectOpen, [{ path: 123 }]).success).toBe(false);
    const goodSetup = {
      projectName: 'Sept',
      supplierName: 'Acme',
      supplierId: 'SUP001',
      cutoffDate: '2026-09-30',
      currency: 'AUD',
      comparableBalancesConfirmed: true
    };
    expect(mainSideParse(IPC_CHANNELS.projectCreate, [{ path: '/p.statementdesk', setup: goodSetup }]).success).toBe(true);
    expect(mainSideParse(IPC_CHANNELS.projectCreate, [{ path: '/p.statementdesk', setup: { ...goodSetup, comparableBalancesConfirmed: false } }]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.projectCreate, [{ path: '/p.statementdesk', setup: { ...goodSetup, currency: 'NZD' } }]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.projectCreate, [{ path: '/p.statementdesk', setup: { ...goodSetup, cutoffDate: '2026-9-30' } }]).success).toBe(false);
    expect(mainSideParse(IPC_CHANNELS.projectCreate, [{ path: '/p.statementdesk', setup: { ...goodSetup, projectName: '   ' } }]).success).toBe(false);
  });
});
