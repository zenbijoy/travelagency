import React from 'react';
import { AdminSidebar } from './AdminSidebar';
import { AdminHeader } from './AdminHeader';
import { AdminLoginForm } from '@/components/auth/AdminLoginForm';
import { useAuth } from '@/context/AuthContext';

interface AdminShellProps {
  currentPath: string;
  onNavigate: (path: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  children: React.ReactNode;
}

export const AdminShell: React.FC<AdminShellProps> = ({
  currentPath,
  onNavigate,
  onRefresh,
  isRefreshing,
  children
}) => {
  const { user } = useAuth();

  if (!user) {
    return <AdminLoginForm />;
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-navy-950 text-slate-100">
      <AdminSidebar currentPath={currentPath} onNavigate={onNavigate} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <AdminHeader
          currentPath={currentPath}
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
        />
        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
};
