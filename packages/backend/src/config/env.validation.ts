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

function optionalUrl(env: Environment, key: string): string | undefined {
  const value = env[key]?.trim();
  if (!value) return undefined;
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    throw new Error(`${key} must be an absolute URL`);
  }
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
  const agentApiKey = env.OPENROUTER_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
  const agentBaseUrl = optionalUrl(env, 'OPENROUTER_BASE_URL');
  const agentModel = env.OPENROUTER_TEXT_MODEL?.trim();
  if (agentModel && agentModel.length > 200) {
    throw new Error('OPENROUTER_TEXT_MODEL must be 200 characters or fewer');
  }
  return {
    ...env,
    DATABASE_URL: databaseUrl,
    PORT: String(port),
    HOST: host,
    APP_ORIGIN: appOrigin,
    JWT_ACCESS_SECRET: secret(env, 'JWT_ACCESS_SECRET'),
    JWT_REFRESH_SECRET: secret(env, 'JWT_REFRESH_SECRET'),
    ...(agentApiKey ? { OPENROUTER_API_KEY: agentApiKey } : {}),
    ...(agentBaseUrl ? { OPENROUTER_BASE_URL: agentBaseUrl } : {}),
    ...(agentModel ? { OPENROUTER_TEXT_MODEL: agentModel } : {}),
  };
}
