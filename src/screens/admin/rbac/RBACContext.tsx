import React, { createContext, useContext, useState, useEffect } from "react";
import { AdminUser, AdminRole } from "@/types/admin";
import { adminService } from "@/services/adminService";
import { AdminTab } from "../AdminPortalShell";
import {
  AdminPermission,
  ROLE_PERMISSIONS,
  ROLE_ALLOWED_TABS,
  checkPermission,
  checkTabAllowed,
} from "./rbacTypes";

interface RBACContextType {
  admin: AdminUser | null;
  role: AdminRole | null;
  switchRole: (role: AdminRole) => void;
  hasPermission: (permission: AdminPermission) => boolean;
  isTabAllowed: (tab: AdminTab) => boolean;
  allowedTabs: AdminTab[];
  permissions: AdminPermission[];
  loading: boolean;
  isSimulationMode: boolean;
}

const RBACContext = createContext<RBACContextType>({
  admin: null,
  role: null,
  switchRole: () => {},
  hasPermission: () => false,
  isTabAllowed: () => false,
  allowedTabs: [],
  permissions: [],
  loading: true,
  isSimulationMode: false,
});

export const RBACProvider: React.FC<{
  initialAdmin?: AdminUser | null;
  children: React.ReactNode;
}> = ({ initialAdmin, children }) => {
  const [admin, setAdmin] = useState<AdminUser | null>(initialAdmin || null);
  const [loading, setLoading] = useState(!initialAdmin);
  const [simulatedRole, setSimulatedRole] = useState<AdminRole | null>(null);
  const isSimulationMode = __DEV__ && simulatedRole !== null;

  useEffect(() => {
    if (!initialAdmin) {
      adminService.getCurrentAdmin().then((data) => {
        setAdmin(data);
        setLoading(false);
      });
    }
  }, [initialAdmin]);

  const currentRole = (isSimulationMode ? simulatedRole : (admin?.role ?? null)) as AdminRole | null;

  // DEV-only role simulation — leaves real admin object untouched
  const switchRole = (newRole: AdminRole) => {
    if (!__DEV__) return;
    setSimulatedRole(newRole);
  };

  // Fail-closed: return false while loading or admin not yet resolved
  const hasPermission = (permission: AdminPermission): boolean => {
    if (loading || !admin) return false;
    return checkPermission(admin, permission);
  };

  const isTabAllowed = (tab: AdminTab): boolean => {
    if (loading || !admin || !currentRole) return false;
    return checkTabAllowed(currentRole, tab);
  };

  const allowedTabs: AdminTab[] = currentRole ? (ROLE_ALLOWED_TABS[currentRole] ?? ["dashboard"]) : ["dashboard"];
  const permissions = currentRole ? (ROLE_PERMISSIONS[currentRole] ?? []) : [];

  return (
    <RBACContext.Provider
      value={{
        admin,
        role: currentRole,
        switchRole,
        hasPermission,
        isTabAllowed,
        allowedTabs,
        permissions,
        loading,
        isSimulationMode,
      }}
    >
      {children}
    </RBACContext.Provider>
  );
};

export const useRBAC = () => useContext(RBACContext);
