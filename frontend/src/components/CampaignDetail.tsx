import { useCurrentAccount } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { COIN_SYMBOL } from '../config';
import {
  claimRefundTx,
  creatorReclaimTx,
  creatorWithdrawTx,
  formatAmount,
  getCampaign,
  getOwnedPledges,
  pledgeTx,
  resolveTx,
  shortId,
  statusLabel,
  STATUS,
  toBaseUnits,
} from '../lib/backstop';
import { formatCountdown, useNow } from '../lib/useNow';
import { useTx } from '../lib/useTx';

export function CampaignDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const account = useCurrentAccount();
  const now = useNow();
  const { run, pending, error } = useTx();
  const [amount, setAmount] = useState('1');

  const campaignQ = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id) });
  const pledgesQ = useQuery({
    queryKey: ['pledges', account?.address, id],
    queryFn: () => getOwnedPledges(account!.address, id),
    enabled: !!account,
  });

  if (campaignQ.isLoading) return <p className="muted">Loading…</p>;
  if (campaignQ.error || !campaignQ.data) return <p className="error">{(campaignQ.error as Error)?.message ?? 'Not found'}</p>;

  const c = campaignQ.data;
  const isCreator = account?.address === c.creator;
  const deadlinePassed = now >= Number(c.deadlineMs);
  const pct = c.target === 0n ? 0 : Math.min(100, Number((c.totalPledged * 100n) / c.target));
  const pledges = pledgesQ.data ?? [];

  const amt = (() => {
    try {
      return toBaseUnits(amount);
    } catch {
      return 0n;
    }
  })();
  const projected = c.totalPledged + amt === 0n ? 0n : (c.bonusTotal * amt) / (c.totalPledged + amt);

  return (
    <div className="detail">
      <button className="link" onClick={onBack}>
        &larr; All campaigns
      </button>

      <div className="card">
        <div className="row between">
          <h2 className="mono">{shortId(c.id)}</h2>
          <span className={`badge ${c.status === STATUS.SUCCEEDED ? 'ok' : c.status === STATUS.FAILED ? 'fail' : 'live'}`}>
            {statusLabel(c.status)}
          </span>
        </div>

        <div className="progress big">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <div className="row between">
          <strong>
            {formatAmount(c.totalPledged)} <span className="muted">raised of {formatAmount(c.target)}</span>
          </strong>
          <span className="bonus-chip">+{formatAmount(c.bonusTotal)} bonus locked</span>
        </div>

        <dl className="facts">
          <div>
            <dt>Backers</dt>
            <dd>{c.backerCount.toString()}</dd>
          </div>
          <div>
            <dt>{c.status === STATUS.FUNDING ? 'Deadline' : 'Outcome'}</dt>
            <dd>{c.status === STATUS.FUNDING ? formatCountdown(Number(c.deadlineMs), now) : statusLabel(c.status)}</dd>
          </div>
          <div>
            <dt>Creator</dt>
            <dd className="mono">{shortId(c.creator)}{isCreator ? ' (you)' : ''}</dd>
          </div>
        </dl>
      </div>

      {/* Pledge while funding and before the deadline */}
      {c.status === STATUS.FUNDING && !deadlinePassed && (
        <div className="card">
          <h3>Back this campaign</h3>
          <label>
            Amount ({COIN_SYMBOL})
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </label>
          <p className="muted small">
            If it <strong>fails</strong>, you get your {formatAmount(amt)} back{' '}
            <strong>plus ~{formatAmount(projected)} bonus</strong>. Backing a failed campaign pays you.
          </p>
          <button disabled={pending || amt === 0n} onClick={() => run(pledgeTx({ campaignId: c.id, amount: amt }))}>
            {pending ? 'Pledging…' : `Pledge ${formatAmount(amt)}`}
          </button>
        </div>
      )}

      {/* Anyone may settle once the deadline passes */}
      {c.status === STATUS.FUNDING && deadlinePassed && (
        <div className="card">
          <h3>Deadline reached</h3>
          <p className="muted small">Settlement is permissionless &mdash; anyone can trigger it.</p>
          <button disabled={pending} onClick={() => run(resolveTx(c.id))}>
            {pending ? 'Resolving…' : 'Resolve campaign'}
          </button>
        </div>
      )}

      {/* Creator withdraws on success */}
      {c.status === STATUS.SUCCEEDED && isCreator && (
        <div className="card">
          <h3>Campaign succeeded</h3>
          <p className="muted small">Withdraw all pledges plus your returned bonus.</p>
          <button disabled={pending || c.pledged === 0n} onClick={() => run(creatorWithdrawTx(c.id))}>
            {c.pledged === 0n ? 'Already withdrawn' : pending ? 'Withdrawing…' : `Withdraw ${formatAmount(c.pledged + c.bonus)}`}
          </button>
        </div>
      )}

      {/* Backers claim refund + bonus on failure */}
      {c.status === STATUS.FAILED && (
        <div className="card">
          <h3>Campaign failed &mdash; claim your refund + bonus</h3>
          {!account && <p className="muted">Connect a wallet to claim.</p>}
          {account && pledges.length === 0 && <p className="muted small">You have no pledge receipts for this campaign.</p>}
          {pledges.map((p) => (
            <div key={p.id} className="row between pledge-row">
              <span>
                Pledged {formatAmount(p.amount)} <span className="muted mono">{shortId(p.id)}</span>
              </span>
              {p.claimed ? (
                <span className="badge ok">Claimed</span>
              ) : (
                <button disabled={pending} onClick={() => run(claimRefundTx({ campaignId: c.id, pledgeId: p.id }))}>
                  {pending ? 'Claiming…' : 'Claim'}
                </button>
              )}
            </div>
          ))}
          {isCreator && c.backerCount === 0n && (
            <button disabled={pending || c.bonus === 0n} onClick={() => run(creatorReclaimTx(c.id))}>
              {c.bonus === 0n ? 'Bonus reclaimed' : pending ? 'Reclaiming…' : `Reclaim bonus ${formatAmount(c.bonus)}`}
            </button>
          )}
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
