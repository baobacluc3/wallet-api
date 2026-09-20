type Environment = Record<string, unknown>;

const DEFAULT_ISSUER = 'wallet-api';
const DEFAULT_AUDIENCE = 'wallet-api-clients';

function stringValue(
  environment: Environment,
  name: string,
  fallback?: string,
): string {
  const value = environment[name] ?? fallback;
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be set`);
  }

  return value.trim();
}

function booleanValue(
  environment: Environment,
  name: string,
  fallback: boolean,
): boolean {
  const value = environment[name];
  if (value === undefined || value === '') return fallback;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  throw new Error(`${name} must be either true or false`);
}

function integerValue(
  environment: Environment,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = environment[name] ?? fallback;
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }

  return parsed;
}

/**
 * Validates only the configuration that changes authentication security
 * semantics. Database deployment validation stays with the deployment layer.
 */
export function validateEnvironment(environment: Environment): Environment {
  const secret = stringValue(environment, 'JWT_SECRET');
  if (
    secret.length < 32 ||
    /^(replace|change[-_ ]?me|secret$|password$)/i.test(secret)
  ) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters of high-entropy secret material',
    );
  }

  const nodeEnv = stringValue(environment, 'NODE_ENV', 'development');
  const redisEnabled = booleanValue(environment, 'REDIS_ENABLED', false);
  const dbSsl = booleanValue(environment, 'DB_SSL', false);
  const rateLimitEnabled = booleanValue(
    environment,
    'AUTH_RATE_LIMIT_ENABLED',
    nodeEnv === 'production',
  );

  if (rateLimitEnabled && !redisEnabled) {
    throw new Error(
      'REDIS_ENABLED must be true when AUTH_RATE_LIMIT_ENABLED is true',
    );
  }

  return {
    ...environment,
    NODE_ENV: nodeEnv,
    JWT_SECRET: secret,
    JWT_ISSUER: stringValue(environment, 'JWT_ISSUER', DEFAULT_ISSUER),
    JWT_AUDIENCE: stringValue(
      environment,
      'JWT_AUDIENCE',
      DEFAULT_AUDIENCE,
    ),
    JWT_ACCESS_TOKEN_TTL: integerValue(
      environment,
      'JWT_ACCESS_TOKEN_TTL',
      900,
      60,
      3600,
    ),
    JWT_REFRESH_TOKEN_TTL_DAYS: integerValue(
      environment,
      'JWT_REFRESH_TOKEN_TTL_DAYS',
      30,
      1,
      90,
    ),
    AUTH_MAX_FAILED_ATTEMPTS: integerValue(
      environment,
      'AUTH_MAX_FAILED_ATTEMPTS',
      5,
      3,
      20,
    ),
    AUTH_LOCKOUT_MINUTES: integerValue(
      environment,
      'AUTH_LOCKOUT_MINUTES',
      15,
      1,
      1440,
    ),
    AUTH_MAX_ACTIVE_SESSIONS: integerValue(
      environment,
      'AUTH_MAX_ACTIVE_SESSIONS',
      5,
      1,
      20,
    ),
    AUTH_RATE_LIMIT_ENABLED: rateLimitEnabled,
    AUTH_RATE_LIMIT_WINDOW_SECONDS: integerValue(
      environment,
      'AUTH_RATE_LIMIT_WINDOW_SECONDS',
      60,
      1,
      3600,
    ),
    AUTH_LOGIN_IP_LIMIT: integerValue(
      environment,
      'AUTH_LOGIN_IP_LIMIT',
      10,
      1,
      1000,
    ),
    AUTH_LOGIN_IDENTIFIER_LIMIT: integerValue(
      environment,
      'AUTH_LOGIN_IDENTIFIER_LIMIT',
      5,
      1,
      1000,
    ),
    AUTH_REGISTER_IP_LIMIT: integerValue(
      environment,
      'AUTH_REGISTER_IP_LIMIT',
      5,
      1,
      1000,
    ),
    AUTH_REFRESH_IP_LIMIT: integerValue(
      environment,
      'AUTH_REFRESH_IP_LIMIT',
      30,
      1,
      1000,
    ),
    TRUST_PROXY_HOPS: integerValue(
      environment,
      'TRUST_PROXY_HOPS',
      0,
      0,
      10,
    ),
    REDIS_ENABLED: redisEnabled,
    DB_SSL: dbSsl,
    DB_SSL_REJECT_UNAUTHORIZED: booleanValue(
      environment,
      'DB_SSL_REJECT_UNAUTHORIZED',
      true,
    ),
  };
}
