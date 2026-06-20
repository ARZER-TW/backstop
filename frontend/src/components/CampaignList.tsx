import { useQuery } from '@tanstack/react-query';
import { CampaignView, formatAmount, getCampaigns, shortId, statusLabel, STATUS } from '../lib/backstop';
import { formatCountdown, useNow } from '../lib/useNow';

function statusClass(status: number): string {
  return status === STATUS.SUCCEEDED ? 'ok' : status === STATUS.FAILED ? 'fail' : 'live';
}

function CampaignCard({ c, now, onSelect }: { c: CampaignView; now: number; onSelect: (id: string) => void }) {
  const pct = c.target === 0n ? 0 : Math.min(100, Number((c.totalPledged * 100n) / c.target));
  return (
    <button className="card campaign-card" onClick={() => onSelect(c.id)}>
      <div className="row between">
        <span className="mono">{shortId(c.id)}</span>
        <span className={`badge ${statusClass(c.status)}`}>{statusLabel(c.status)}</span>
      </div>
      <div className="progress">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="row between small">
        <span>
          {formatAmount(c.totalPledged)} <span className="muted">/ {formatAmount(c.target)}</span>
        </span>
        <span className="muted">{pct}%</span>
      </div>
      <div className="row between small">
        <span className="bonus-chip">+{formatAmount(c.bonusTotal)} bonus</span>
        <span className="muted">
          {c.status === STATUS.FUNDING ? formatCountdown(Number(c.deadlineMs), now) : `${c.backerCount} backers`}
        </span>
      </div>
    </button>
  );
}

export function CampaignList({ onSelect }: { onSelect: (id: string) => void }) {
  const now = useNow();
  const { data, isLoading, error } = useQuery({ queryKey: ['campaigns'], queryFn: () => getCampaigns() });

  if (isLoading) return <p className="muted">Loading campaigns…</p>;
  if (error) return <p className="error">{(error as Error).message}</p>;
  if (!data || data.length === 0) return <p className="muted">No campaigns yet. Launch the first one.</p>;

  return (
    <div className="grid">
      {data.map((c) => (
        <CampaignCard key={c.id} c={c} now={now} onSelect={onSelect} />
      ))}
    </div>
  );
}
