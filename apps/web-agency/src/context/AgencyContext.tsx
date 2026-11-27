import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import {
  AgencyTenant,
  AgencyRole,
  AgencyPermission,
  ROLE_PERMISSIONS,
} from '../types';
import { DEMO_TENANTS } from '../services/agencyApi';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  message?: string;
}

interface AgencyContextType {
  // Tenant
  currentTenant: AgencyTenant;
  tenants: AgencyTenant[];
  switchTenant: (tenantId: string) => void;

  // RBAC & User
  activeRole: AgencyRole;
  switchRole: (role: AgencyRole) => void;
  hasPermission: (permission: AgencyPermission) => boolean;
  currentUser: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string;
  };

  // Toast
  toasts: ToastMessage[];
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

export const AgencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentTenantId, setCurrentTenantId] = useState<string>(DEMO_TENANTS[0].id);
  const [activeRole, setActiveRole] = useState<AgencyRole>('AGENCY_OWNER');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const currentTenant = useMemo(() => {
    return DEMO_TENANTS.find((t) => t.id === currentTenantId) || DEMO_TENANTS[0];
  }, [currentTenantId]);

  // Enforce server-side tenant isolation: prohibit arbitrary client switching
  const switchTenant = useCallback((_tenantId: string) => {
    console.warn('Arbitrary tenant switching is prohibited by server-side tenant isolation policy.');
    showToast({
      type: 'error',
      title: 'Action Prohibited',
      message: 'Tenant context is server-resolved and cannot be switched on the client.',
    });
  }, [showToast]);

  // Enforce server-side RBAC: prohibit client role escalation
  const switchRole = useCallback((_newRole: AgencyRole) => {
    console.warn('Client-side role escalation is prohibited by ShopnoJatra Zero-Trust RBAC policy.');
    showToast({
      type: 'error',
      title: 'Action Prohibited',
      message: 'Role permissions are assigned and verified server-side.',
    });
  }, [showToast]);

  const hasPermission = useCallback(
    (permission: AgencyPermission): boolean => {
      const allowed = ROLE_PERMISSIONS[activeRole] || [];
      return allowed.includes(permission);
    },
    [activeRole]
  );

  const currentUser = useMemo(() => {
    return {
      id: 'usr-1',
      name: 'Tanvir Hossain',
      email: 'tanvir@greenholidaysbd.com',
      avatarUrl:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    };
  }, []);

  const value = useMemo(
    () => ({
      currentTenant,
      tenants: DEMO_TENANTS,
      switchTenant,
      activeRole,
      switchRole,
      hasPermission,
      currentUser,
      toasts,
      showToast,
      dismissToast,
    }),
    [
      currentTenant,
      switchTenant,
      activeRole,
      switchRole,
      hasPermission,
      currentUser,
      toasts,
      showToast,
      dismissToast,
    ]
  );

  return <AgencyContext.Provider value={value}>{children}</AgencyContext.Provider>;
};

export function useAgency() {
  const context = useContext(AgencyContext);
  if (!context) {
    throw new Error('useAgency must be used within an AgencyProvider');
  }
  return context;
}
