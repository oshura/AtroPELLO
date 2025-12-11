export interface UserIdentity {
  userId: string;
  displayName: string | null;
  nickname: string | null;
  preferredUsername: string | null;
  email: string | null;
}

export const UNKNOWN_IDENTITY: UserIdentity = {
  userId: 'anonymous',
  displayName: null,
  nickname: null,
  preferredUsername: null,
  email: null
};
