import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { AgencyRole } from '../../types';

interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (member: { name: string; email: string; role: AgencyRole }) => void;
}

export const InviteMemberModal: React.FC<InviteMemberModalProps> = ({
  isOpen,
  onClose,
  onInvite,
}) => {
  const schema = z.object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Please enter a valid email address'),
    role: z.enum(['AGENCY_OWNER', 'AGENCY_MANAGER', 'AGENCY_AGENT', 'AGENCY_FINANCE']),
  });

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      name: '',
      email: '',
      role: 'AGENCY_AGENT',
    },
  });

  const onSubmit = (data: FormValues) => {
    onInvite(data);
    reset();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite Staff Member"
      description="Grant portal access to travel agents, operational supervisors, or finance managers."
      maxWidth="md"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Full Legal Name"
          placeholder="e.g. Shakib Al Hasan"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Corporate Work Email"
          type="email"
          placeholder="shakib@agency.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Portal Role Persona
          </label>
          <select
            {...register('role')}
            className="w-full bg-slate-950/70 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="AGENCY_AGENT">Travel Agent (Booking creation & ticketing)</option>
            <option value="AGENCY_MANAGER">Agency Manager (Operational supervisor & team lead)</option>
            <option value="AGENCY_FINANCE">Finance Officer (Settlement ledger & invoices)</option>
            <option value="AGENCY_OWNER">Agency Owner (Full governance & banking)</option>
          </select>
          {errors.role && <p className="mt-1 text-xs text-rose-400">{errors.role.message}</p>}
        </div>

        <div className="pt-3 flex justify-end gap-2">
          <Button variant="ghost" size="sm" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" type="submit" isLoading={isSubmitting}>
            Send Invitation Link
          </Button>
        </div>
      </form>
    </Modal>
  );
};
