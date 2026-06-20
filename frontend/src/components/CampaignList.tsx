import { useQuery } from '@tanstack/react-query';
import { COIN_SYMBOL } from '../config';
import { CampaignView, formatNum, getCampaigns, statusLabel, STATUS } from '../lib/backstop';
import { formatCountdown, useNow } from '../lib/useNow';
import { useI18n } from '../lib/i18n';

/* ---------------------------------------------------------------------------
   Off-chain human identity, derived deterministically from the on-chain object
   id. The `campaign` Move struct carries no name fields, so a backer would
   otherwise pledge to a bare hash. We render a stable label while keeping the
   verifiable hex id visible. Generator kept identical across List / Detail /
   Portfolio so a campaign reads the same everywhere.
   ------------------------------------------------------------------------- */
const CODENAMES = [
  'Aperture', 'Meridian', 'Halcyon', 'Lattice', 'Cobalt', 'Vesper', 'Foundry', 'Beacon',
  'Cinder', 'Ridgeline', 'Northwind', 'Slate', 'Marlin', 'Tessera', 'Onyx', 'Cadence', 'Quill', 'Harbor',
];
// Neutral handle suffixes. We never fabricate a product/description — only a
// stable, obviously-generated codename, paired with the verifiable on-chain id.
const SUFFIXES = ['Reserve', 'Works', 'Collective', 'Initiative', 'Commons', 'Syndicate', 'Assembly', 'Guild', 'Cooperative', 'Atelier'];
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function identity(id: string): { title: string } {
  const h = hash32(id);
  const name = CODENAMES[h % CODENAMES.length];
  const suffix = SUFFIXES[(h >>> 5) % SUFFIXES.length];
  return { title: `${name} ${suffix}` };
}
export function midId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 6)}…${id.slice(-4)}` : id;
}

/** Marginal implied return if the campaign fails: bonus pool / amount pledged. */
export function impliedReturnPct(c: CampaignView): number | null {
  if (c.totalPledged === 0n) return null;
  return Number((c.bonusTotal * 10000n) / c.totalPledged) / 100;
}

function statusClass(status: number): string {
  return status === STATUS.SUCCEEDED ? 'ok' : status === STATUS.FAILED ? 'fail' : 'live';
}
export function fillClass(status: number): string {
  return status === STATUS.SUCCEEDED ? 'done' : status === STATUS.FAILED ? 'dead' : '';
}

export function StatusBadge({ status }: { status: number }) {
  const { t } = useI18n();
  return (
    <span className={`badge badge--${statusClass(status)}`}>
      <span className="dot" aria-hidden="true" />
      {statusLabel(status, t)}
    </span>
  );
}

function CampaignCard({ c, now }: { c: CampaignView; now: number }) {
  const { t } = useI18n();
  const { title } = identity(c.id);
  const pct = c.target === 0n ? 0 : Math.min(100, Number((c.totalPledged * 100n) / c.target));
  const funding = c.status === STATUS.FUNDING;
  const ret = impliedReturnPct(c);

  return (
    <a className="ccard" href={`#/campaign/${c.id}`} aria-label={title}>
      <div className="ccard-head">
        <div>
          <div className="hash">{midId(c.id)}</div>
          <div className="ccard-title">{title}</div>
        </div>
        <StatusBadge status={c.status} />
      </div>

      <p className="ccard-sum">{t('{amount} refund bonus locked in escrow.', { amount: `${formatNum(c.bonusTotal)} ${COIN_SYMBOL}` })}</p>

      <div className="ccard-body">
        <div className="raise-line">
          <span className="money">
            <span className="fig">{formatNum(c.totalPledged)}</span>
            <span className="unit">{COIN_SYMBOL}</span>
          </span>
          {funding && ret !== null && (
            <span className="ret" title={t('Implied return if the campaign fails — a current estimate that dilutes as more is pledged')}>
              +{ret.toFixed(1)}
              <span className="pct-unit">%</span>
            </span>
          )}
          {funding && ret === null && <span className="ret muted">{t('First backer')}</span>}
        </div>

        <div className="progress">
          <div className={`progress-fill ${fillClass(c.status)}`} style={{ width: `${pct}%` }} />
        </div>

        <div className="ccard-foot">
          <span className="foot-meta">
            <span>{t('{pct}% of {target}', { pct, target: formatNum(c.target) })}</span>
            <span className="sep" aria-hidden="true" />
            <span>{t('{count} {backerWord}', { count: c.backerCount.toString(), backerWord: t(c.backerCount === 1n ? 'backer' : 'backers') })}</span>
          </span>
          {funding ? (
            <span className="countdown">{formatCountdown(Number(c.deadlineMs), now, t)}</span>
          ) : (
            <span className="hash">{midId(c.id)}</span>
          )}
        </div>
      </div>
    </a>
  );
}

export function CampaignList() {
  const now = useNow();
  const { t } = useI18n();
  const { data, isLoading, error } = useQuery({ queryKey: ['campaigns'], queryFn: () => getCampaigns() });

  return (
    <section>
      <div className="section-head">
        <div>
          <h2>{t('Campaigns')}</h2>
          <p className="section-sub">{t('Back one before its deadline. If it misses, you reclaim your pledge plus a cut of the bonus.')}</p>
        </div>
        {data && <span className="count">{data.length}</span>}
      </div>

      {isLoading ? (
        <div className="skel-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="skel-card">
              <div className="skel skel-line lg" />
              <div className="skel skel-line sm" />
              <div className="skel skel-line fig" />
              <div className="skel skel-line bar" />
              <div className="skel-foot">
                <div className="skel skel-line chip" />
                <div className="skel skel-line chip" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <p className="error">{(error as Error).message}</p>
      ) : !data || data.length === 0 ? (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            </svg>
          </div>
          <div className="empty-title">{t('No campaigns yet')}</div>
          <p className="empty-body">
            {t('Every campaign locks a refund bonus before the first pledge. Hit the target and the creator gets funded; miss it and backers split the bonus — so being early is rewarded either way.')}
          </p>
          <a className="btn btn--secondary" href="#/launch">{t('Launch the first campaign')}</a>
        </div>
      ) : (
        <div className="grid">
          {data.map((c) => (
            <CampaignCard key={c.id} c={c} now={now} />
          ))}
        </div>
      )}
    </section>
  );
}
