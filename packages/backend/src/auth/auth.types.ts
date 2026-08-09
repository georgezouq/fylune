export interface AccessTokenPayload {
  sub: string;
  type: 'access';
}

export interface RefreshTokenPayload {
  sub: string;
  sid: string;
  type: 'refresh';
  exp: number;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  accountType: 'REGISTERED';
}
