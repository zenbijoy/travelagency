import { supabase } from '../../utils/supabase';

export type ContractType =
  | 'booking_agreement'
  | 'maintenance_agreement'
  | 'agency_commission';

export type ContractStatus = 'draft' | 'sent' | 'signed' | 'expired';

export interface ContractParty {
  name: string;
  phone: string;
  email: string;
}

export interface ContractData {
  type: ContractType;
  party: ContractParty;
  terms: string;
  ownerId: string;
  title: string;
}

export interface Contract {
  id: string;
  type: ContractType;
  party: ContractParty;
  terms: string;
  ownerId: string;
  title: string;
  status: ContractStatus;
  signatureBase64?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ContractService {
  createContract(data: ContractData): Promise<Contract>;
  updateContract(id: string, data: Partial<ContractData>): Promise<Contract>;
  signContract(id: string, signatureBase64: string): Promise<Contract>;
  listContracts(ownerId: string): Promise<Contract[]>;
}

interface ContractRow {
  id: string;
  type: ContractType;
  party: ContractParty;
  terms: string;
  owner_id: string;
  title: string;
  status: ContractStatus;
  signature_base64?: string;
  created_at: string;
  updated_at: string;
}

function rowToContract(row: ContractRow): Contract {
  return {
    id: row.id,
    type: row.type,
    party: row.party,
    terms: row.terms,
    ownerId: row.owner_id,
    title: row.title,
    status: row.status,
    signatureBase64: row.signature_base64,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const contractServiceImpl: ContractService = {
  async createContract(data: ContractData): Promise<Contract> {
    const { data: row, error } = await supabase
      .from('contracts')
      .insert({
        type: data.type,
        party: data.party,
        terms: data.terms,
        owner_id: data.ownerId,
        title: data.title,
        status: 'draft' as ContractStatus,
      })
      .select()
      .single<ContractRow>();

    if (error) throw new Error(error.message);
    return rowToContract(row);
  },

  async updateContract(id: string, data: Partial<ContractData>): Promise<Contract> {
    const updatePayload: Partial<{
      type: ContractType;
      party: ContractParty;
      terms: string;
      owner_id: string;
      title: string;
    }> = {};

    if (data.type !== undefined) updatePayload.type = data.type;
    if (data.party !== undefined) updatePayload.party = data.party;
    if (data.terms !== undefined) updatePayload.terms = data.terms;
    if (data.ownerId !== undefined) updatePayload.owner_id = data.ownerId;
    if (data.title !== undefined) updatePayload.title = data.title;

    const { data: row, error } = await supabase
      .from('contracts')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single<ContractRow>();

    if (error) throw new Error(error.message);
    return rowToContract(row);
  },

  async signContract(id: string, signatureBase64: string): Promise<Contract> {
    const { data: row, error } = await supabase
      .from('contracts')
      .update({ status: 'signed' as ContractStatus, signature_base64: signatureBase64 })
      .eq('id', id)
      .select()
      .single<ContractRow>();

    if (error) throw new Error(error.message);
    return rowToContract(row);
  },

  async listContracts(ownerId: string): Promise<Contract[]> {
    const { data: rows, error } = await supabase
      .from('contracts')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false })
      .returns<ContractRow[]>();

    if (error) throw new Error(error.message);
    return (rows ?? []).map(rowToContract);
  },
};

export const contractService: ContractService = contractServiceImpl;
