import { validateEnvironment } from './environment.validation';

const secureEnvironment = {
  JWT_SECRET: '7A42vJqqVoEzRNO3rjtMmVRkPMI9P1VLqW-lB6ZJ9f4atJ6v',
  REDIS_ENABLED: 'true',
  AUTH_RATE_LIMIT_ENABLED: 'true',
};

describe('validateEnvironment', () => {
  it('normalizes security-relevant configuration to the expected types', () => {
    expect(validateEnvironment(secureEnvironment)).toMatchObject({
      JWT_ACCESS_TOKEN_TTL: 900,
      JWT_REFRESH_TOKEN_TTL_DAYS: 30,
      AUTH_MAX_ACTIVE_SESSIONS: 5,
      AUTH_RATE_LIMIT_ENABLED: true,
      REDIS_ENABLED: true,
      TRUST_PROXY_HOPS: 0,
    });
  });

  it('rejects weak signing configuration and production rate-limit fail-open', () => {
    expect(() =>
      validateEnvironment({
        ...secureEnvironment,
        JWT_SECRET: 'replace-this-with-a-secret',
      }),
    ).toThrow('JWT_SECRET');

    expect(() =>
      validateEnvironment({
        ...secureEnvironment,
        REDIS_ENABLED: 'false',
      }),
    ).toThrow('REDIS_ENABLED');
  });
});
