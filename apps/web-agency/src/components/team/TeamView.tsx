import React, { useState } from 'react';
import {
  UserCheck,
  UserPlus,
  Shield,
  Mail,
  CheckCircle,
  MoreVertical,
  AlertCircle,
} from 'lucide-react';
import { useAgency } from '../../context/AgencyContext';
import { DEMO_TEAM_MEMBERS } from '../../services/agencyApi';
import { TeamMember, AgencyRole } from '../../types';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { InviteMemberModal } from './InviteMemberModal';

export const TeamView: React.FC = () => {
  const { hasPermission, showToast } = useAgency();
  const canManageTeam = hasPermission('team.manage');

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(DEMO_TEAM_MEMBERS);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  const handleRoleChange = (memberId: string, newRole: AgencyRole) => {
    if (!canManageTeam) {
      showToast({
        type: 'error',
        title: 'Action Denied',
        message: 'Your active persona does not hold permission to modify staff roles.',
      });
      return;
    }

    setTeamMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
    showToast({
      type: 'success',
      title: 'Role Updated',
      message: `Staff member role updated to ${newRole.replace('AGENCY_', '')}`,
    });
  };

  const handleInvite = (newMember: { name: string; email: string; role: AgencyRole }) => {
    const member: TeamMember = {
      id: `usr-${Date.now()}`,
      name: newMember.name,
      email: newMember.email,
      role: newMember.role,
      status: 'pending_invite',
      joinedDate: new Date().toISOString().split('T')[0],
      bookingsHandledCount: 0,
      salesVolumeBDT: 0,
    };
    setTeamMembers((prev) => [...prev, member]);
    showToast({
      type: 'success',
      title: 'Invitation Sent',
      message: `Invitation email dispatched to ${newMember.email}.`,
    });
  };

  const roleMeta: Record<
    AgencyRole,
    { label: string; badge: 'purple' | 'blue' | 'emerald' | 'amber' }
  > = {
    AGENCY_OWNER: { label: 'Owner', badge: 'purple' },
    AGENCY_MANAGER: { label: 'Manager', badge: 'blue' },
    AGENCY_AGENT: { label: 'Agent', badge: 'emerald' },
    AGENCY_FINANCE: { label: 'Finance', badge: 'amber' },
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Staff & Workforce Governance</h1>
          <p className="text-sm text-slate-400 mt-1">
            Delegate ticketing desks, assign RBAC personas, and audit agent ticketing volumes
          </p>
        </div>
        <Button
          variant="primary"
          leftIcon={<UserPlus className="w-4 h-4" />}
          onClick={() => {
            if (!canManageTeam) {
              showToast({
                type: 'error',
                title: 'Restricted',
                message: 'Only Agency Owner or Manager can invite staff.',
              });
              return;
            }
            setIsInviteModalOpen(true);
          }}
        >
          Invite Staff
        </Button>
      </div>

      {/* Team Roster Grid */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 overflow-hidden shadow-2xl backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-5 font-semibold">Staff Member</th>
                <th className="py-3 px-4 font-semibold">Assigned Persona Role</th>
                <th className="py-3 px-4 font-semibold text-center">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Orders Processed</th>
                <th className="py-3 px-4 font-semibold text-right">Volume Handled</th>
                <th className="py-3 px-5 font-semibold text-right">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {teamMembers.map((member) => (
                <tr key={member.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-3">
                      {member.avatarUrl ? (
                        <img
                          src={member.avatarUrl}
                          alt={member.name}
                          className="w-9 h-9 rounded-lg object-cover ring-1 ring-emerald-500/30"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300">
                          {member.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <span className="font-semibold text-white block">{member.name}</span>
                        <span className="text-[11px] text-slate-400">{member.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4">
                    {canManageTeam && member.role !== 'AGENCY_OWNER' ? (
                      <select
                        value={member.role}
                        onChange={(e) =>
                          handleRoleChange(member.id, e.target.value as AgencyRole)
                        }
                        className="bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      >
                        <option value="AGENCY_MANAGER">Manager</option>
                        <option value="AGENCY_AGENT">Agent</option>
                        <option value="AGENCY_FINANCE">Finance</option>
                      </select>
                    ) : (
                      <Badge variant={roleMeta[member.role].badge} size="sm">
                        {roleMeta[member.role].label}
                      </Badge>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-center">
                    <Badge
                      variant={
                        member.status === 'active'
                          ? 'emerald'
                          : member.status === 'pending_invite'
                          ? 'amber'
                          : 'slate'
                      }
                      size="sm"
                    >
                      {member.status === 'pending_invite' ? 'Pending Invite' : member.status}
                    </Badge>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-slate-200">
                    {member.bookingsHandledCount > 0
                      ? `${member.bookingsHandledCount} orders`
                      : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono font-semibold text-emerald-400">
                    {member.salesVolumeBDT > 0
                      ? `৳${(member.salesVolumeBDT / 100000).toFixed(1)}L`
                      : '—'}
                  </td>
                  <td className="py-3.5 px-5 text-right text-slate-400 font-mono text-[11px]">
                    {member.joinedDate}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      <InviteMemberModal
        isOpen={isInviteModalOpen}
        onClose={() => setIsInviteModalOpen(false)}
        onInvite={handleInvite}
      />
    </div>
  );
};
