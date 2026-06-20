import { useQuery } from '@tanstack/react-query';
import { COIN_SYMBOL } from '../config';
import { CampaignView, formatAmount, formatNum, getCampaigns, shortId, statusLabel, STATUS } from '../lib/backstop';
import { formatCountdown, useNow } from '../lib/useNow';

function statusClass(status: number): string {
  return status === STATUS.SUCCEEDED ? 'ok' : status === STATUS.FAILED ? 'fail' : 'live';
}
function fillClass(status: number): string {
  return status === STATUS.SUCCEEDED ? 'done' : status === STATUS.FAILED ? 'dead' : '';
}

function CampaignCard({ c, now, onSelect }: { c: CampaignView; now: number; onSelect: (id: string) => void }) {
  const pct = c.target === 0n ? 0 : Math.min(100, Number((c.totalPledged * 100n) / c.target));
  return (
    <button className="campaign-card" onClick={() => onSelect(c.id)}>
      <div className="row between">
        <span className="mono">{shortId(c.id)}</span>
        <span className={`badge ${statusClass(c.status)}`}>{statusLabel(c.status)}</span>
      </div>
      <div className="progress">
        <div className={`progress-fill ${fillClass(c.status)}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="progress-meta">
        <span className="raised">
          {formatNum(c.totalPledged)} <span className="muted">/ {formatNum(c.target)} {COIN_SYMBOL}</span>
        </span>
        <span className="muted">{pct}%</span>
      </div>
      <div className="row between small">
        <span className="bonus">+{formatAmount(c.bonusTotal)} bonus</span>
        <span className="muted">
          {c.status === STATUS.FUNDING
            ? formatCountdown(Number(c.deadlineMs), now)
            : `${c.backerCount} ${c.backerCount === 1n ? 'backer' : 'backers'}`}
        </span>
      </div>
    </button>
  );
}

export function CampaignList({ onSelect }: { onSelect: (id: string) => void }) {
  const now = useNow();
  const { data, isLoading, error } = useQuery({ queryKey: ['campaigns'], queryFn: () => getCampaigns() });

  return (
    <section>
      <div className="section-head">
        <h2>Campaigns</h2>
        {data && <span className="count">{data.length}</span>}
      </div>

      {isLoading ? (
        <div className="skeleton-grid">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      ) : error ? (
        <p className="error">{(error as Error).message}</p>
      ) : !data || data.length === 0 ? (
        <div className="empty">
          <strong>No campaigns yet</strong>
          Launch the first one — set a target, lock a bonus, and share the link.
        </div>
      ) : (
        <div className="grid">
          {data.map((c) => (
            <CampaignCard key={c.id} c={c} now={now} onSelect={onSelect} />
          ))}
        </div>
      )}
    </section>
  );
}
