type User = {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  role: string;
  passwordMustChange?: boolean;
  isActivated: boolean;
  totpVerified: boolean;
  hasPassword: boolean;
  shareSizeLimit?: string;
};

export type CreateUser = {
  username: string;
  email: string;
  password?: string;
  isAdmin?: boolean;
  role?: string;
  generatePassword?: boolean;
};

export type UpdateUser = {
  username?: string;
  email?: string;
  password?: string;
  isAdmin?: boolean;
  role?: string;
  isActivated?: boolean;
};

export type CreateUserResponse = {
  id: string;
  username: string;
  email: string;
  isAdmin: boolean;
  role: string;
  isActivated: boolean;
  totpVerified: boolean;
  hasPassword: boolean;
  shareSizeLimit?: string;
  temporaryPassword?: string;
};

export type UpdateCurrentUser = {
  username?: string;
  email?: string;
};

export type CurrentUser = User & {};

export type UserHook = {
  user: CurrentUser | null;
  refreshUser: () => Promise<CurrentUser | null>;
};

export default User;
