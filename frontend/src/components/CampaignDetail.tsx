import { ConnectButton, useCurrentAccount, useSuiClientQuery } from '@mysten/dapp-kit';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { COIN_DECIMALS, COIN_SYMBOL, NETWORK, PACKAGE_ID } from '../config';
import {
  claimRefundTx,
  creatorReclaimTx,
  creatorWithdrawTx,
  formatNum,
  getCampaign,
  getOwnedPledges,
  pledgeTx,
  projectedBonus,
  resolveTx,
  statusLabel,
  STATUS,
  toBaseUnits,
} from '../lib/backstop';
import { formatCountdown, useNow } from '../lib/useNow';
import { useTx } from '../lib/useTx';
import { fillClass, identity, impliedReturnPct, midId, StatusBadge } from './CampaignList';

const GAS_BUFFER = 50_000_000n; // ~0.05 SUI held back for gas on Max
const EXPLORER = `https://suiscan.xyz/${NETWORK}`;
const objUrl = (id: string) => `${EXPLORER}/object/${id}`;
const acctUrl = (a: string) => `${EXPLORER}/account/${a}`;
const QUICK = ['1', '5', '10', '25'];

/** Plain decimal string (no grouping) so it round-trips through toBaseUnits. */
function human(base: bigint): string {
  const b = 10n ** BigInt(COIN_DECIMALS);
  const w = base / b;
  const f = base % b;
  if (f === 0n) return w.toString();
  const fs = f.toString().padStart(COIN_DECIMALS, '0').replace(/0+$/, '').slice(0, 4);
  return fs ? `${w}.${fs}` : w.toString();
}

/** Map raw MoveAbort / gas / wallet errors to calm, recoverable language. */
function mapTxError(raw: string): { msg: string; hint: string } {
  const m = raw.toLowerCase();
  if (m.includes('reject') || m.includes('cancel') || m.includes('denied') || m.includes('user refused'))
    return { msg: 'You declined the transaction.', hint: 'Nothing moved. Approve it in your wallet when you’re ready.' };
  if (m.includes('insufficient') || m.includes('gas') || m.includes('balance') || m.includes('budget'))
    return { msg: 'Not enough SUI to cover this plus gas.', hint: 'Top up your wallet or lower the amount, then retry.' };
  if (m.includes('moveabort') || m.includes('abort'))
    return { msg: 'The escrow contract rejected this action.', hint: 'The campaign state likely changed — refresh and re-check the deadline and status.' };
  if (m.includes('version') || m.includes('equivocat') || m.includes('not available') || m.includes('object'))
    return { msg: 'This campaign changed on-chain while you were acting.', hint: 'Refresh to load the latest state, then try again.' };
  return { msg: 'Transaction failed.', hint: raw.length > 160 ? `${raw.slice(0, 160)}…` : raw };
}

/* ---- tiny inline icons (optically sized, currentColor) ---- */
const IconExt = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconCopy = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5 15V6a2 2 0 0 1 2-2h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconLock = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
    <path d="M8 10V8a4 4 0 0 1 8 0v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
);
const IconCoins = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <ellipse cx="12" cy="7" rx="7" ry="3" stroke="currentColor" strokeWidth="1.7" />
    <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" stroke="currentColor" strokeWidth="1.7" />
  </svg>
);
const IconGavel = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 5l5 5-3 3-5-5 3-3zM11 8l-6 6M16 13l4 4M4 21h8" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const IconShield = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`copy-btn${copied ? ' copied' : ''}`}
      aria-label={`Copy ${label}`}
      onClick={() => {
        navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
    >
      {copied ? <IconCheck /> : <IconCopy />}
    </button>
  );
}

function Money({ raw, gain, suffix }: { raw: bigint; gain?: boolean; suffix?: string }) {
  return (
    <span className={`money${gain ? ' gain' : ''}`}>
      <span className="fig">{formatNum(raw)}</span>
      <span className="unit">{suffix ?? COIN_SYMBOL}</span>
    </span>
  );
}

export function ErrorBlock({ raw }: { raw: string }) {
  const { msg, hint } = mapTxError(raw);
  return (
    <div className="error" role="alert">
      <b>{msg}</b>
      <span className="hint">{hint}</span>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="detail">
      <div className="skel skel-line sm" style={{ width: '96px', marginBottom: '20px' }} />
      <div className="skel skel-line" style={{ width: '120px', marginBottom: '12px' }} />
      <div className="skel skel-line lg" style={{ width: '60%', height: '28px', marginBottom: '20px' }} />
      <div className="card">
        <div className="skel skel-line fig" style={{ marginBottom: '16px' }} />
        <div className="skel skel-line bar" style={{ marginBottom: '20px' }} />
        <div className="stat-row">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i}>
              <div className="skel skel-line sm" style={{ width: '60%', marginBottom: '8px' }} />
              <div className="skel skel-line" style={{ width: '80%', height: '18px' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type Receipt = { title: string; amount?: bigint; body: string };

export function CampaignDetail({ id }: { id: string }) {
  const account = useCurrentAccount();
  const now = useNow();
  const { run, pending, error } = useTx();
  const [amount, setAmount] = useState('5');
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const campaignQ = useQuery({ queryKey: ['campaign', id], queryFn: () => getCampaign(id) });
  const pledgesQ = useQuery({
    queryKey: ['pledges', account?.address, id],
    queryFn: () => getOwnedPledges(account!.address, id),
    enabled: !!account,
  });
  const balanceQ = useSuiClientQuery(
    'getBalance',
    { owner: account?.address ?? '' },
    { enabled: !!account },
  );

  // new-pledge settle flash over the raised figure
  const prevPledged = useRef<bigint | null>(null);
  const [flash, setFlash] = useState(0);
  useEffect(() => {
    const total = campaignQ.data?.totalPledged ?? null;
    if (total !== null) {
      if (prevPledged.current !== null && total > prevPledged.current) setFlash((k) => k + 1);
      prevPledged.current = total;
    }
  }, [campaignQ.data?.totalPledged]);

  if (campaignQ.isLoading) return <DetailSkeleton />;
  if (campaignQ.error || !campaignQ.data)
    return (
      <div className="detail">
        <a className="back" href="#/">&larr; All campaigns</a>
        <div className="error">
          <b>Couldn’t load this campaign</b>
          <span className="hint">{(campaignQ.error as Error)?.message ?? 'No object found at this id.'}</span>
        </div>
      </div>
    );

  const c = campaignQ.data;
  const { title } = identity(c.id);
  const isCreator = account?.address === c.creator;
  const funding = c.status === STATUS.FUNDING;
  const deadlinePassed = now >= Number(c.deadlineMs);
  const pct = c.target === 0n ? 0 : Math.min(100, Number((c.totalPledged * 100n) / c.target));
  const targetMet = c.totalPledged >= c.target;
  const ret = impliedReturnPct(c);
  const pledges = pledgesQ.data ?? [];
  const balance = balanceQ.data ? BigInt(balanceQ.data.totalBalance) : null;

  const amt = (() => {
    try {
      return toBaseUnits(amount);
    } catch {
      return 0n;
    }
  })();
  const projBonus = c.totalPledged + amt === 0n ? 0n : (c.bonusTotal * amt) / (c.totalPledged + amt);

  const amtError: string | null = (() => {
    if (amt === 0n) return null;
    const n = Number(amount);
    if (!isFinite(n) || n <= 0) return 'Enter an amount greater than 0.';
    if (balance !== null && amt > (balance > GAS_BUFFER ? balance - GAS_BUFFER : 0n))
      return 'That’s more than your balance after gas.';
    return null;
  })();
  const canPledge = amt > 0n && !amtError;
  const setMax = () => {
    if (balance !== null && balance > GAS_BUFFER) setAmount(human(balance - GAS_BUFFER));
  };

  return (
    <div className="detail detail--wide enter">
      <a className="back" href="#/">&larr; All campaigns</a>

      <header className="detail-head">
        <div className="detail-id-row">
          <span className="hash">{midId(c.id)}</span>
          <CopyButton text={c.id} label="campaign id" />
          <a className="ext-link" href={objUrl(c.id)} target="_blank" rel="noreferrer" aria-label="View on explorer">
            <IconExt />
          </a>
        </div>
        <div className="detail-top">
          <h1 className="detail-title">{title}</h1>
          <StatusBadge status={c.status} />
        </div>
        <p className="detail-sum">
          {formatNum(c.bonusTotal)} {COIN_SYMBOL} refund bonus locked in escrow — released to backers if the target is missed.
        </p>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
      {/* Overview — flat metadata panel */}
      <div className="card">
        <div className="raise-block">
          <span className="money">
            <span className="fig flash" key={flash}>{formatNum(c.totalPledged)}</span>
            <span className="unit">{COIN_SYMBOL} raised</span>
          </span>
          <div className="raise-sub">
            of <strong>{formatNum(c.target)} {COIN_SYMBOL}</strong> target · {pct}% ·{' '}
            {c.backerCount.toString()} {c.backerCount === 1n ? 'backer' : 'backers'}
            {funding ? ` · ${formatCountdown(Number(c.deadlineMs), now)}` : ''}
          </div>
        </div>

        <div className="progress big">
          <div className={`progress-fill ${fillClass(c.status)}`} style={{ width: `${pct}%` }} />
        </div>

        <div className="stat-row">
          <div>
            <span className="stat-label">Locked bonus</span>
            <span className="stat-value">
              <Money raw={c.bonusTotal} gain />
            </span>
          </div>
          <div>
            <span className="stat-label">Backers</span>
            <span className="stat-value">{c.backerCount.toString()}</span>
          </div>
          <div>
            <span className="stat-label">{funding ? 'Time left' : 'Outcome'}</span>
            <span className="stat-value sm">{funding ? formatCountdown(Number(c.deadlineMs), now) : statusLabel(c.status)}</span>
          </div>
        </div>
      </div>

      {/* The signature mechanic — reserved green payoff, the loudest legible idea */}
      {funding && (
        <div className="payoff">
          <div className="payoff-top">
            <span className="payoff-label">If this campaign fails, you profit</span>
            {ret !== null ? (
              <span className="payoff-pct">
                +{ret.toFixed(1)}
                <span className="pct-unit">%</span>
              </span>
            ) : (
              <span className="payoff-pct" style={{ fontSize: '1.4rem' }}>full bonus</span>
            )}
          </div>
          <p className="payoff-cap">
            {ret !== null ? (
              <>
                Backers split the <b>{formatNum(c.bonusTotal)} {COIN_SYMBOL}</b> bonus pro-rata, on top of a full refund. That
                is the return on <b>today’s</b> pool — a current estimate that <b>dilutes</b> as more is pledged.
              </>
            ) : (
              <>
                Be the first backer and the entire <b>{formatNum(c.bonusTotal)} {COIN_SYMBOL}</b> bonus is yours if it fails. Your
                implied return falls as others join.
              </>
            )}
          </p>
        </div>
      )}

      {/* Pledge — the single elevated focal action */}
      {funding && !deadlinePassed && (
        <div className="card card--primary">
          <h3>Back this campaign</h3>
          <label className="field">
            <div className="field-label">
              <span className="lbl">Your pledge</span>
              <span className="aux">
                Balance {balance !== null ? human(balance) : '—'} {COIN_SYMBOL}
                {balance !== null && balance > GAS_BUFFER && (
                  <button type="button" className="max" onClick={setMax}>Max</button>
                )}
              </span>
            </div>
            <div className="input-wrap">
              <input
                className={`input has-suffix${amtError ? ' invalid' : ''}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                aria-invalid={!!amtError}
              />
              <span className="input-suffix">{COIN_SYMBOL}</span>
            </div>
            {amtError && <div className="field-error">{amtError}</div>}
          </label>

          <div className="presets">
            {QUICK.map((q) => (
              <button type="button" key={q} className={`preset${amount === q ? ' active' : ''}`} onClick={() => setAmount(q)}>
                {q} {COIN_SYMBOL}
              </button>
            ))}
          </div>

          <div className="proj" aria-live="polite">
            <div className="proj-row">
              <span>Your refund if it fails</span>
              <span className="v">{formatNum(amt)} {COIN_SYMBOL}</span>
            </div>
            <div className="proj-row">
              <span>Estimated bonus share</span>
              <span className="gain">+{formatNum(projBonus)} {COIN_SYMBOL}</span>
            </div>
            <div className="proj-row total">
              <span className="label">You reclaim on failure</span>
              <Money raw={amt + projBonus} gain />
            </div>
          </div>

          <p className="field-hint">
            If it succeeds your pledge funds the project — there is no refund, that’s the point. Your pledge and gas leave your
            wallet now and are held in escrow until the deadline.
          </p>

          {account ? (
            <button className="btn btn--primary btn--block btn--lg" disabled={pending || !canPledge} onClick={async () => {
              const ok = await run(pledgeTx({ campaignId: c.id, amount: amt }));
              if (ok) setReceipt({ title: 'Pledge confirmed', amount: amt, body: 'Your pledge is held in escrow. If the campaign misses its target you can claim it back here, plus your bonus share.' });
            }}>
              {pending ? 'Confirming…' : `Pledge ${formatNum(amt)} ${COIN_SYMBOL}`}
            </button>
          ) : (
            <div className="gate">
              <p>Connect a wallet to pledge.</p>
              <div className="connect-cta"><ConnectButton /></div>
            </div>
          )}
          {!pending && account && !canPledge && (
            <p className="submit-reason">{amt === 0n ? 'Enter an amount to pledge.' : amtError}</p>
          )}
        </div>
      )}

      {/* Resolve — permissionless settlement, outcome shown before the button */}
      {funding && deadlinePassed && (
        <div className="card card--primary">
          <h3>Deadline reached</h3>
          <div className={`outcome ${targetMet ? 'win' : 'lose'}`}>
            {targetMet ? (
              <span><b>Target met.</b> Resolving funds the creator and returns their bonus. Backers’ pledges become the project’s funding.</span>
            ) : (
              <span><b>Target missed.</b> Resolving lets every backer reclaim their pledge plus a share of the {formatNum(c.bonusTotal)} {COIN_SYMBOL} bonus.</span>
            )}
          </div>
          <p className="helper">Settlement is permissionless — anyone can trigger it, and it cannot change the outcome.</p>
          {account ? (
            <button className="btn btn--primary btn--block" disabled={pending} onClick={async () => {
              const ok = await run(resolveTx(c.id));
              if (ok) setReceipt({ title: 'Campaign resolved', body: targetMet ? 'Settled as succeeded. The creator can now withdraw.' : 'Settled as failed. Backers can now claim their refund plus bonus.' });
            }}>
              {pending ? 'Resolving…' : 'Resolve campaign'}
            </button>
          ) : (
            <div className="gate">
              <p>Connect a wallet to resolve.</p>
              <div className="connect-cta"><ConnectButton /></div>
            </div>
          )}
        </div>
      )}

      {/* Creator withdraw — success */}
      {c.status === STATUS.SUCCEEDED && isCreator && (
        <div className="card card--primary">
          <h3>Campaign succeeded</h3>
          <p className="helper">Withdraw every pledge plus your returned bonus in one transaction.</p>
          <button className="btn btn--primary btn--block" disabled={pending || c.pledged === 0n} onClick={async () => {
            const ok = await run(creatorWithdrawTx(c.id));
            if (ok) setReceipt({ title: 'Funds withdrawn', amount: c.pledged + c.bonus, body: 'Pledges and your returned bonus are now in your wallet.' });
          }}>
            {c.pledged === 0n ? 'Already withdrawn' : pending ? 'Withdrawing…' : `Withdraw ${formatNum(c.pledged + c.bonus)} ${COIN_SYMBOL}`}
          </button>
        </div>
      )}

      {/* Success — backer view (nothing to claim, by design) */}
      {c.status === STATUS.SUCCEEDED && !isCreator && (
        <div className="card">
          <h3>Campaign funded</h3>
          <p className="helper">
            This campaign hit its target, so pledges funded {title} and the bonus returned to the creator. A successful campaign
            has nothing to claim — that’s the intended outcome.
          </p>
        </div>
      )}

      {/* Failure — claim refund + bonus */}
      {c.status === STATUS.FAILED && (
        <div className="card card--primary">
          <h3>Campaign failed — claim your refund + bonus</h3>
          {!account && (
            <div className="gate">
              <p>Connect the wallet you pledged with to claim.</p>
              <div className="connect-cta"><ConnectButton /></div>
            </div>
          )}
          {account && pledges.length === 0 && !(isCreator && c.backerCount === 0n) && (
            <p className="helper">No pledge receipts found in this wallet for this campaign.</p>
          )}
          {pledges.map((p) => {
            const bonusShare = projectedBonus(c, p.amount);
            return (
              <div key={p.id} className="pledge-row">
                <div className="pledge-amt">
                  <Money raw={p.amount + bonusShare} gain />
                  <span className="sub">{formatNum(p.amount)} refund + {formatNum(bonusShare)} bonus · <span className="mono">{midId(p.id)}</span></span>
                </div>
                {p.claimed ? (
                  <span className="badge badge--ok"><span className="dot" aria-hidden="true" />Claimed</span>
                ) : (
                  <button className="btn-row" disabled={pending} onClick={async () => {
                    const ok = await run(claimRefundTx({ campaignId: c.id, pledgeId: p.id }));
                    if (ok) setReceipt({ title: 'Refund claimed', amount: p.amount + bonusShare, body: 'Your pledge and bonus share are back in your wallet.' });
                  }}>
                    {pending ? 'Claiming…' : 'Claim'}
                  </button>
                )}
              </div>
            );
          })}
          {isCreator && c.backerCount === 0n && (
            <button className="btn btn--secondary btn--block" disabled={pending || c.bonus === 0n} onClick={async () => {
              const ok = await run(creatorReclaimTx(c.id));
              if (ok) setReceipt({ title: 'Bonus reclaimed', amount: c.bonus, body: 'No one backed this campaign, so your locked bonus returned to you.' });
            }}>
              {c.bonus === 0n ? 'Bonus reclaimed' : pending ? 'Reclaiming…' : `Reclaim your ${formatNum(c.bonus)} ${COIN_SYMBOL} bonus`}
            </button>
          )}
        </div>
      )}

      {error && <ErrorBlock raw={error} />}

      {receipt && (
        <div className="receipt" role="status">
          <div className="receipt-head">
            <IconCheck /> {receipt.title}
          </div>
          {receipt.amount !== undefined && (
            <div className="receipt-amt"><Money raw={receipt.amount} /></div>
          )}
          <p className="receipt-body">
            {receipt.body}{' '}
            <a className="link-ext" href={objUrl(c.id)} target="_blank" rel="noreferrer">
              View campaign on explorer <IconExt />
            </a>
          </p>
        </div>
      )}

        </div>
        <aside className="detail-aside">
      {/* Trust / escrow legibility — the thesis made verifiable */}
      <div className="card trust">
        <div className="trust-title"><IconShield /> How your money is protected</div>
        <div className="trust-list">
          <div className="trust-item">
            <span className="trust-ico"><IconLock /></span>
            <div>
              <h4>Pledges sit in on-chain escrow</h4>
              <p>Held by the contract, not the creator. They can’t be touched unless the target is met by the deadline.</p>
            </div>
          </div>
          <div className="trust-item">
            <span className="trust-ico"><IconCoins /></span>
            <div>
              <h4>The bonus was locked at launch</h4>
              <p><span className="mono">{formatNum(c.bonusTotal)} {COIN_SYMBOL}</span> was escrowed when this campaign was created, and can only pay out to backers on failure.</p>
            </div>
          </div>
          <div className="trust-item">
            <span className="trust-ico"><IconGavel /></span>
            <div>
              <h4>Settlement is permissionless</h4>
              <p>Anyone can resolve after the deadline. The outcome is fixed by the numbers — the creator can’t stall or override it.</p>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'var(--sp-5)' }}>
          <div className="kv">
            <span className="k">Campaign object</span>
            <span className="v">
              <span className="mono">{midId(c.id)}</span>
              <CopyButton text={c.id} label="campaign id" />
              <a className="link-ext" href={objUrl(c.id)} target="_blank" rel="noreferrer" aria-label="View campaign object on explorer"><IconExt /></a>
            </span>
          </div>
          <div className="kv">
            <span className="k">Locked bonus (verifiable)</span>
            <span className="v"><Money raw={c.bonusTotal} gain /></span>
          </div>
          <div className="kv">
            <span className="k">Creator</span>
            <span className="v">
              <span className="mono">{midId(c.creator)}{isCreator ? ' · you' : ''}</span>
              <a className="link-ext" href={acctUrl(c.creator)} target="_blank" rel="noreferrer" aria-label="View creator on explorer"><IconExt /></a>
            </span>
          </div>
          <div className="kv">
            <span className="k">Package</span>
            <span className="v">
              <span className="mono">{midId(PACKAGE_ID)}</span>
              <a className="link-ext" href={objUrl(PACKAGE_ID)} target="_blank" rel="noreferrer" aria-label="View package on explorer"><IconExt /></a>
            </span>
          </div>
        </div>
      </div>
        </aside>
      </div>
    </div>
  );
}
