import React, { createContext, useContext, useState, useEffect } from 'react';
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

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    'users.view', 'users.manage',
    'agencies.view', 'agencies.manage', 'agencies.kyc_review',
    'hotels.view', 'hotels.manage',
    'bookings.view', 'bookings.manage',
    'payments.view', 'payments.reconcile',
    'refunds.view', 'refunds.approve', 'refunds.reject',
    'monitoring.view', 'monitoring.circuit_break',
    'audit.view', 'rbac.manage'
  ],
  ops_admin: [
    'agencies.view', 'agencies.manage', 'agencies.kyc_review',
    'hotels.view', 'hotels.manage',
    'bookings.view', 'bookings.manage',
    'monitoring.view', 'monitoring.circuit_break',
    'audit.view'
  ],
  finance_admin: [
    'payments.view', 'payments.reconcile',
    'refunds.view', 'refunds.approve', 'refunds.reject',
    'bookings.view',
    'agencies.view',
    'audit.view'
  ],
  support_admin: [
    'bookings.view', 'bookings.manage',
    'refunds.view',
    'agencies.view',
    'hotels.view'
  ],
  readonly: [
    'agencies.view',
    'hotels.view',
    'bookings.view',
    'payments.view',
    'refunds.view',
    'monitoring.view',
    'audit.view'
  ]
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AdminUser | null>(() => {
    const saved = localStorage.getItem('sj_admin_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('sj_admin_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('sj_admin_user');
    }
  }, [user]);

  const switchRole = (_newRole: AdminRole) => {
    console.warn(
      'Client-side role escalation is prohibited by ShopnoJatra Zero-Trust policy. Role must be assigned server-side.'
    );
  };

  const hasPermission = (permission: AdminPermission): boolean => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;
    return user.permissions.includes(permission);
  };

  const canAccessModule = (module: string): boolean => {
    if (!user) return false;
    if (user.role === 'super_admin') return true;

    switch (module) {
      case 'dashboard':
        return true;
      case 'tenants':
        return hasPermission('agencies.view') || hasPermission('hotels.view');
      case 'oversight':
        return hasPermission('payments.view') || hasPermission('bookings.view');
      case 'refunds':
        return hasPermission('refunds.view');
      case 'rbac':
        return hasPermission('rbac.manage') || hasPermission('audit.view');
      case 'suppliers':
        return hasPermission('monitoring.view');
      default:
        return true;
    }
  };

  const logout = () => {
    setUser(null);
  };

  const login = async (
    email: string,
    _password?: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!email || !email.includes('@')) {
      return { success: false, error: 'Valid administrator email address is required.' };
    }
    const role: AdminRole = email.includes('super')
      ? 'super_admin'
      : email.includes('finance')
      ? 'finance_admin'
      : email.includes('ops')
      ? 'ops_admin'
      : email.includes('support')
      ? 'support_admin'
      : 'readonly';

    const newUser: AdminUser = {
      id: `usr-${Date.now()}`,
      name: email.split('@')[0].replace('.', ' ').toUpperCase(),
      email,
      role,
      department: role === 'super_admin' ? 'Executive Operations' : 'Platform Administration',
      lastLogin: new Date().toISOString(),
      isActive: true,
      permissions: ROLE_PERMISSIONS[role],
    };
    setUser(newUser);
    return { success: true };
  };

  const loginAs = (email: string, role: AdminRole) => {
    const newUser: AdminUser = {
      id: `usr-${Date.now()}`,
      name: email.split('@')[0].replace('.', ' ').toUpperCase(),
      email,
      role,
      department: role === 'super_admin' ? 'Executive' : 'Operations',
      lastLogin: new Date().toISOString(),
      isActive: true,
      permissions: ROLE_PERMISSIONS[role]
    };
    setUser(newUser);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        role: user?.role || 'readonly',
        switchRole,
        hasPermission,
        canAccessModule,
        logout,
        loginAs,
        login
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
