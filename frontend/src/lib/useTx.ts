import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Transaction } from '@mysten/sui/transactions';
import { readClient } from './backstop';

/**
 * Sign + execute a Transaction, wait for it to land, then refresh all chain reads.
 * Returns true on success; surfaces a human-readable error otherwise.
 */
export function useTx() {
  const { mutateAsync } = useSignAndExecuteTransaction();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(tx: Transaction): Promise<boolean> {
    setError(null);
    setPending(true);
    try {
      const res = await mutateAsync({ transaction: tx });
      await readClient.waitForTransaction({ digest: res.digest });
      await qc.invalidateQueries();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setPending(false);
    }
  }

  return { run, pending, error, clearError: () => setError(null) };
}
