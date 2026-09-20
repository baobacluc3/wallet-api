export interface SessionMaterial {
  sessionId: string;
  rawRefreshToken: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}