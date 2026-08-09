import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('registers an account without creating commercial records', async () => {
    const user = {
      id: 'f2a9942f-3a03-41ae-a819-4c7bf7e64e55',
      email: 'reader@example.com',
      name: null,
      createdAt: new Date('2026-08-09T00:00:00Z'),
    };
    const prisma = {
      user: { create: vi.fn().mockResolvedValue(user) },
      authSession: { create: vi.fn().mockResolvedValue({}) },
    };
    const jwt = { signAsync: vi.fn().mockResolvedValueOnce('access').mockResolvedValueOnce('refresh') };
    const config = { getOrThrow: vi.fn((key: string) => key.repeat(4)) };
    const service = new AuthService(prisma as never, jwt as never, config as never);

    const result = await service.register({ email: user.email, password: 'StrongPassword1' });

    expect(result.user).toMatchObject({ email: user.email, accountType: 'REGISTERED' });
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ email: user.email, passwordHash: expect.any(String) }),
    }));
    expect(prisma.authSession.create).toHaveBeenCalledOnce();
  });
});
