import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('describeForeignHolder', () => {
  const originalPlatform = process.platform;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true });
    vi.doUnmock('node:child_process');
    vi.restoreAllMocks();
  });

  it('Darwin/Linux path uses lsof and returns PID+name', async () => {
    const execSyncMock = vi.fn().mockReturnValue(
      'COMMAND  PID     USER   FD   TYPE\nnode     12345   user   12u  IPv4 ... LISTEN\n'
    );
    vi.doMock('node:child_process', () => ({ execSync: execSyncMock }));
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const { describeForeignHolder } = await import('@changedown/mcp/transport/os-shim');
    const result = describeForeignHolder(39990);

    expect(execSyncMock).toHaveBeenCalledWith(expect.stringContaining('lsof'), expect.any(Object));
    expect(result).toContain('12345');
  });

  it('Windows path uses netstat+tasklist and returns PID+name', async () => {
    const execSyncMock = vi.fn()
      .mockReturnValueOnce('  TCP    127.0.0.1:39990   0.0.0.0:0   LISTENING   99888\r\n')
      .mockReturnValueOnce(
        'Image Name         PID  Session Name   Session#  Mem Usage\r\n' +
        'node.exe         99888 Console              1     45,000 K\r\n'
      );
    vi.doMock('node:child_process', () => ({ execSync: execSyncMock }));
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });

    const { describeForeignHolder } = await import('@changedown/mcp/transport/os-shim');
    const result = describeForeignHolder(39990);

    expect(execSyncMock).toHaveBeenNthCalledWith(1, expect.stringContaining('netstat'), expect.any(Object));
    expect(execSyncMock).toHaveBeenNthCalledWith(2, expect.stringContaining('tasklist'), expect.any(Object));
    expect(result).toContain('99888');
    expect(result).toContain('node.exe');
  });

  it('returns undefined when execSync throws', async () => {
    vi.doMock('node:child_process', () => ({
      execSync: vi.fn().mockImplementation(() => { throw new Error('lsof not found'); }),
    }));
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    const { describeForeignHolder } = await import('@changedown/mcp/transport/os-shim');
    expect(describeForeignHolder(39990)).toBeUndefined();
  });

  it('returns undefined on unknown platform', async () => {
    vi.doMock('node:child_process', () => ({ execSync: vi.fn() }));
    Object.defineProperty(process, 'platform', { value: 'aix', configurable: true });

    const { describeForeignHolder } = await import('@changedown/mcp/transport/os-shim');
    expect(describeForeignHolder(39990)).toBeUndefined();
  });
});
