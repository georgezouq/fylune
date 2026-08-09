import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { hash, verify } from 'argon2';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { RefreshTokenPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_SECONDS = 30 * 24 * 60 * 60;

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          passwordHash: await hash(dto.password, { type: 2 }),
        },
        select: { id: true, email: true, name: true, createdAt: true },
      });
      return { user: this.safeUser(user), ...(await this.createSession(user.id)) };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account already exists for this email');
      }
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !(await verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Email or password is incorrect');
    }
    return { user: this.safeUser(user), ...(await this.createSession(user.id)) };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return { user: this.safeUser(user) };
  }

  async refresh(rawToken: string) {
    const payload = await this.verifyRefreshToken(rawToken);
    const existing = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
    if (!existing || existing.userId !== payload.sub || existing.revokedAt ||
      existing.expiresAt <= new Date() || !this.matchesHash(rawToken, existing.tokenHash)) {
      throw new UnauthorizedException('Refresh token is no longer valid');
    }
    const next = await this.prepareSession(payload.sub);
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.authSession.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedBy: next.sessionId },
      });
      if (revoked.count !== 1) throw new UnauthorizedException('Refresh token was already used');
      await tx.authSession.create({ data: next.record });
    });
    return { accessToken: next.accessToken, refreshToken: next.refreshToken };
  }

  async logout(rawToken: string) {
    const payload = await this.verifyRefreshToken(rawToken);
    const result = await this.prisma.authSession.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { revoked: result.count === 1 };
  }

  private safeUser(user: { id: string; email: string; name: string | null; createdAt: Date }) {
    return { ...user, accountType: 'REGISTERED' as const };
  }

  private async createSession(userId: string) {
    const session = await this.prepareSession(userId);
    await this.prisma.authSession.create({ data: session.record });
    return { accessToken: session.accessToken, refreshToken: session.refreshToken };
  }

  private async prepareSession(userId: string) {
    const sessionId = randomUUID();
    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(
        { sub: userId, type: 'access' },
        { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: ACCESS_TOKEN_SECONDS },
      ),
      this.jwt.signAsync(
        { sub: userId, sid: sessionId, type: 'refresh' },
        { secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'), expiresIn: REFRESH_TOKEN_SECONDS },
      ),
    ]);
    return {
      sessionId,
      accessToken,
      refreshToken,
      record: {
        id: sessionId,
        userId,
        tokenHash: this.tokenHash(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_SECONDS * 1000),
      },
    };
  }

  private async verifyRefreshToken(rawToken: string): Promise<RefreshTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<RefreshTokenPayload>(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'refresh' || !payload.sid) throw new Error('wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Refresh token is invalid or expired');
    }
  }

  private tokenHash(rawToken: string) {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private matchesHash(rawToken: string, expectedHash: string) {
    const actual = Buffer.from(this.tokenHash(rawToken), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
