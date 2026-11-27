import React, { createContext, useContext } from 'react';
import { AdminRole, AdminUser, AdminPermission } from '@/types';

interface AuthContextType {
  user: AdminUser | null;
  role: AdminRole;
  switchRole: (newRole: AdminRole) => void;
  hasPermission: (permission: AdminPermission) => boolean;
  canAccessModule: (module: string) => boolean;
  logout: () => void;
  loginAs: (email: string, role: AdminRole) => void;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** No admin session is trusted until Supabase identity and server RBAC resolve through /auth/me. */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AuthContext.Provider value={{
    user: null,
    role: 'readonly',
    switchRole: () => undefined,
    hasPermission: () => false,
    canAccessModule: () => false,
    logout: () => undefined,
    loginAs: () => undefined,
    login: async () => ({ success: false, error: 'Admin sign-in is unavailable: the portal is not connected to verified Supabase authentication and server-resolved admin permissions.' }),
  }}>
    {children}
  </AuthContext.Provider>
);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
