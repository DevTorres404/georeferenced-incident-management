import { describe, it, expect, vi } from 'vitest';

const { mockRequest } = vi.hoisted(() => ({
  mockRequest: vi.fn(),
}));

vi.mock('../app/js/infrastructure/backend-client.js', () => ({
  request: mockRequest,
}));

import { fetchAuditLogs } from '../app/js/modules/audit/infrastructure/audit-repository.js';

describe('fetchAuditLogs', () => {
  it('calls request with base path when no filters', async () => {
    mockRequest.mockResolvedValue({ data: [] });
    await fetchAuditLogs({});
    expect(mockRequest).toHaveBeenCalledWith('/audit/logs', { noCache: true });
  });

  it('passes table filter as query param', async () => {
    mockRequest.mockResolvedValue({ data: [] });
    await fetchAuditLogs({ table: 'incidents' });
    expect(mockRequest).toHaveBeenCalledWith(
      '/audit/logs?tabla=incidents',
      { noCache: true },
    );
  });

  it('passes multiple filters as query params', async () => {
    mockRequest.mockResolvedValue({ data: [] });
    await fetchAuditLogs({ table: 'incidents', event: 'update', page: '2' });
    expect(mockRequest).toHaveBeenCalledWith(
      '/audit/logs?tabla=incidents&accion=update&page=2',
      { noCache: true },
    );
  });

  it('passes user_id filter', async () => {
    mockRequest.mockResolvedValue({ data: [] });
    await fetchAuditLogs({ userId: '42' });
    expect(mockRequest).toHaveBeenCalledWith(
      '/audit/logs?user_id=42',
      { noCache: true },
    );
  });

  it('passes per_page filter', async () => {
    mockRequest.mockResolvedValue({ data: [] });
    await fetchAuditLogs({ perPage: '50' });
    expect(mockRequest).toHaveBeenCalledWith(
      '/audit/logs?per_page=50',
      { noCache: true },
    );
  });

  it('omits query string when no filters', async () => {
    mockRequest.mockResolvedValue({ data: [] });
    await fetchAuditLogs();
    expect(mockRequest).toHaveBeenCalledWith('/audit/logs', { noCache: true });
  });

  it('returns data from request', async () => {
    const expected = { data: [{ id: 1 }] };
    mockRequest.mockResolvedValue(expected);
    const result = await fetchAuditLogs({ table: 'users' });
    expect(result).toBe(expected);
  });
});
