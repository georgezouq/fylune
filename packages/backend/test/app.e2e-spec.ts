import { ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Fylune API', () => {
  let app: import('@nestjs/common').INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    await prisma.authSession.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => app.close());

  it('reports database-backed health', async () => {
    await request(app.getHttpServer()).get('/health').expect(200).expect({ status: 'ok', database: 'reachable' });
  });

  it('registers, authenticates and rotates refresh tokens once', async () => {
    const email = `e2e-${randomUUID()}@example.com`;
    const registration = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'VerySecure123!' })
      .expect(201);

    expect(registration.body.user).toMatchObject({ email, accountType: 'REGISTERED' });
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${registration.body.accessToken}`)
      .expect(200)
      .expect(({ body }) => expect(body.user.email).toBe(email));

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: registration.body.refreshToken })
      .expect(201);
    expect(rotated.body.refreshToken).not.toBe(registration.body.refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: registration.body.refreshToken })
      .expect(401);
  });
});
