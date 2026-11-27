import React, { useState, useEffect } from 'react';
import { AdminUser, AdminRole } from '@/types';
import { adminService } from '@/services/adminService';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Modal } from '@/components/ui/Modal';
import { TableSkeleton } from '@/components/ui/Skeleton';
import {
  ShieldAlert,
  UserCheck,
  UserPlus,
  Key,
  Shield,
  CheckCircle2,
  Lock
} from 'lucide-react';

export const RoleAssignmentsTable: React.FC = () => {
  const { user, hasPermission } = useAuth();
  const { addToast } = useToast();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Admin Modal
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newRole, setNewRole] = useState<AdminRole>('ops_admin');
  const [submittingAdd, setSubmittingAdd] = useState(false);

  // Role Edit State
  const [targetUser, setTargetUser] = useState<AdminUser | null>(null);
  const [updatedRole, setUpdatedRole] = useState<AdminRole>('ops_admin');
  const [submittingRole, setSubmittingRole] = useState(false);

  const canManageRbac = hasPermission('rbac.manage');

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await adminService.getAdminUsers();
      setUsers(list);
    } catch {
      addToast({ type: 'error', title: 'Failed to load admin users' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleRoleChange = async () => {
    if (!targetUser || !user) return;
    setSubmittingRole(true);
    try {
      await adminService.updateAdminRole(targetUser.id, updatedRole, {
        id: user.id,
        name: user.name,
        role: user.role
      });
      addToast({
        type: 'success',
        title: 'Role Updated',
        message: `${targetUser.name} role changed to ${updatedRole}.`
      });
      setTargetUser(null);
      loadUsers();
    } catch {
      addToast({ type: 'error', title: 'Failed to update role' });
    } finally {
      setSubmittingRole(false);
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmittingAdd(true);
    try {
      await adminService.createAdminUser(
        {
          name: newName,
          email: newEmail,
          department: newDepartment || 'Operations',
          role: newRole
        },
        { id: user.id, name: user.name, role: user.role }
      );
      addToast({
        type: 'success',
        title: 'Admin User Created',
        message: `Invited ${newEmail} as ${newRole}.`
      });
      setAddModalOpen(false);
      setNewName('');
      setNewEmail('');
      setNewDepartment('');
      loadUsers();
    } catch {
      addToast({ type: 'error', title: 'Failed to create admin user' });
    } finally {
      setSubmittingAdd(false);
    }
  };

  const roleColors: Record<AdminRole, 'purple' | 'blue' | 'emerald' | 'amber' | 'slate'> = {
    super_admin: 'purple',
    ops_admin: 'blue',
    finance_admin: 'emerald',
    support_admin: 'amber',
    readonly: 'slate'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-400" /> Enterprise Role-Based Access Control (RBAC)
          </h3>
          <p className="text-xs text-slate-400">Granular role-to-permission mapping and administrative credential provisioning</p>
        </div>

        {canManageRbac && (
          <Button variant="primary" size="sm" onClick={() => setAddModalOpen(true)}>
            <UserPlus className="w-4 h-4 mr-1" /> Add Admin User
          </Button>
        )}
      </div>

      {/* Permissions Matrix Overview Card */}
      <Card className="space-y-3 bg-navy-900 border-navy-800">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-400" /> Active System Role Capabilities
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-navy-950 border border-purple-500/30 space-y-1">
            <Badge variant="purple" size="sm">Super Admin</Badge>
            <p className="text-[11px] text-slate-300 font-medium mt-1">Full Root Governance</p>
            <p className="text-[10px] text-slate-400">All modules, circuit breaking, RBAC modification & finance override.</p>
          </div>
          <div className="p-3 rounded-lg bg-navy-950 border border-blue-500/30 space-y-1">
            <Badge variant="blue" size="sm">Ops Admin</Badge>
            <p className="text-[11px] text-slate-300 font-medium mt-1">Agency & Hotel Ops</p>
            <p className="text-[10px] text-slate-400">Onboarding, KYC review desk, property suspension & bookings.</p>
          </div>
          <div className="p-3 rounded-lg bg-navy-950 border border-emerald-500/30 space-y-1">
            <Badge variant="emerald" size="sm">Finance Admin</Badge>
            <p className="text-[11px] text-slate-300 font-medium mt-1">Treasury & Settlements</p>
            <p className="text-[10px] text-slate-400">Ledger reconciliation, gateway audits, payout batches & refunds.</p>
          </div>
          <div className="p-3 rounded-lg bg-navy-950 border border-amber-500/30 space-y-1">
            <Badge variant="amber" size="sm">Support Admin</Badge>
            <p className="text-[11px] text-slate-300 font-medium mt-1">Customer Incident Desk</p>
            <p className="text-[10px] text-slate-400">View bookings, passenger PNRs, assist refund claim filing.</p>
          </div>
          <div className="p-3 rounded-lg bg-navy-950 border border-slate-700 space-y-1">
            <Badge variant="slate" size="sm">Readonly</Badge>
            <p className="text-[11px] text-slate-300 font-medium mt-1">Compliance & Audit</p>
            <p className="text-[10px] text-slate-400">Regulatory auditors. Zero mutating action authorization.</p>
          </div>
        </div>
      </Card>

      {/* Admin Users Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-6">
            <TableSkeleton rows={4} cols={5} />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-navy-950/80 border-b border-navy-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Operator Name</th>
                  <th className="py-3 px-4">Corporate Email</th>
                  <th className="py-3 px-4">Assigned Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Last Login</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-800/80">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-navy-850/50 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-100 flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-navy-800 border border-navy-700 flex items-center justify-center font-bold text-xs text-slate-300">
                        {u.name[0]}
                      </div>
                      <span>{u.name}</span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">{u.email}</td>
                    <td className="py-3 px-4">
                      <Badge variant={roleColors[u.role] || 'slate'}>
                        {u.role.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-slate-300">{u.department}</td>
                    <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                      {u.lastLogin !== 'Never' ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                    </td>
                    <td className="py-3 px-4">
                      {canManageRbac ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setTargetUser(u);
                            setUpdatedRole(u.role);
                          }}
                        >
                          Modify Role
                        </Button>
                      ) : (
                        <span className="text-slate-400 italic">Protected</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Modify Role Modal */}
      <Modal
        isOpen={!!targetUser}
        onClose={() => setTargetUser(null)}
        title="Modify Administrator Role"
        subtitle={`Target user: ${targetUser?.name} (${targetUser?.email})`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Select New Assigned Role:
            </label>
            <Select
              value={updatedRole}
              onChange={(e) => setUpdatedRole(e.target.value as AdminRole)}
              className="text-xs"
            >
              <option value="super_admin">Super Admin (Full Root Permissions)</option>
              <option value="ops_admin">Ops Admin (Agencies, KYC, Hotels)</option>
              <option value="finance_admin">Finance Admin (Treasury, Ledger, Refunds)</option>
              <option value="support_admin">Support Admin (Customer Support Desk)</option>
              <option value="readonly">Readonly (Audit & Compliance Only)</option>
            </Select>
          </div>

          <div className="p-3 rounded-lg bg-navy-950 border border-navy-800 text-xs text-slate-300 flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>Role changes take effect instantly on the next authenticated session token check.</span>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-navy-800">
            <Button variant="outline" size="sm" onClick={() => setTargetUser(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              isLoading={submittingRole}
              onClick={handleRoleChange}
            >
              Confirm Role Update
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Admin User Modal */}
      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Provision New Admin Operator"
        subtitle="Invite administrative personnel to ShopnoJatra Control Hub"
      >
        <form onSubmit={handleAddAdmin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name:</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Mahfuzur Rahman"
              required
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Corporate Email Address:</label>
            <Input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="e.g. mahfuz.ops@shopnojatra.com"
              required
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Department / Business Unit:</label>
            <Input
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              placeholder="e.g. Flight Operations & Supplier Integrations"
              className="text-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Assign Role:</label>
            <Select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AdminRole)}
              className="text-xs"
            >
              <option value="ops_admin">Ops Admin</option>
              <option value="finance_admin">Finance Admin</option>
              <option value="support_admin">Support Admin</option>
              <option value="super_admin">Super Admin</option>
              <option value="readonly">Readonly</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-navy-800">
            <Button variant="outline" size="sm" type="button" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit" isLoading={submittingAdd}>
              Provision Operator
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
