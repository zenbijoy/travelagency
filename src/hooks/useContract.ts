import { useCallback, useState } from 'react';
import {
  Contract,
  ContractData,
  contractService,
} from '../services/contract/contractService';

interface UseContractReturn {
  contracts: Contract[];
  isLoading: boolean;
  error: string | null;
  createContract(data: ContractData): Promise<Contract | null>;
  updateContract(id: string, data: Partial<ContractData>): Promise<Contract | null>;
  signContract(id: string, signatureBase64: string): Promise<Contract | null>;
  refreshContracts(ownerId: string): Promise<void>;
}

export function useContract(): UseContractReturn {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshContracts = useCallback(async (ownerId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);
    try {
      const list = await contractService.listContracts(ownerId);
      setContracts(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load contracts');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createContract = useCallback(
    async (data: ContractData): Promise<Contract | null> => {
      setError(null);
      try {
        const contract = await contractService.createContract(data);
        setContracts((prev) => [contract, ...prev]);
        return contract;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to create contract');
        return null;
      }
    },
    [],
  );

  const updateContract = useCallback(
    async (id: string, data: Partial<ContractData>): Promise<Contract | null> => {
      setError(null);
      try {
        const updated = await contractService.updateContract(id, data);
        setContracts((prev) => prev.map((c) => (c.id === id ? updated : c)));
        return updated;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update contract');
        return null;
      }
    },
    [],
  );

  const signContract = useCallback(
    async (id: string, signatureBase64: string): Promise<Contract | null> => {
      setError(null);
      try {
        const signed = await contractService.signContract(id, signatureBase64);
        setContracts((prev) => prev.map((c) => (c.id === id ? signed : c)));
        return signed;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to sign contract');
        return null;
      }
    },
    [],
  );

  return {
    contracts,
    isLoading,
    error,
    createContract,
    updateContract,
    signContract,
    refreshContracts,
  };
}
