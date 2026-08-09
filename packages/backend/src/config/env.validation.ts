type Environment = Record<string, string | undefined>;

function required(env: Environment, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

function secret(env: Environment, key: string): string {
  const value = required(env, key);
  if (value.length < 32) throw new Error(`${key} must contain at least 32 characters`);
  return value;
}

export function validateEnvironment(env: Environment): Environment {
  const databaseUrl = required(env, 'DATABASE_URL');
  if (!/^postgres(?:ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }
  const port = Number(env.PORT ?? '4318');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a valid TCP port');
  }
  const host = env.HOST?.trim() || '127.0.0.1';
  const appOrigin = new URL(required(env, 'APP_ORIGIN')).origin;
  return {
    ...env,
    DATABASE_URL: databaseUrl,
    PORT: String(port),
    HOST: host,
    APP_ORIGIN: appOrigin,
    JWT_ACCESS_SECRET: secret(env, 'JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: secret(env, 'JWT_REFRESH_SECRET'),
  };
}
