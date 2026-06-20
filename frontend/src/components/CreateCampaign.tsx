import { useState } from 'react';
import { COIN_SYMBOL } from '../config';
import { createCampaignTx, toBaseUnits } from '../lib/backstop';
import { useTx } from '../lib/useTx';
import { ErrorBlock } from './CampaignDetail';

const DAY_PRESETS = [7, 14, 30];

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
function isPos(s: string): boolean {
  const n = Number(s);
  return isFinite(n) && n > 0;
}

export function CreateCampaign() {
  const { run, pending, error } = useTx();
  const [target, setTarget] = useState('1000');
  const [bonus, setBonus] = useState('150');
  const [days, setDays] = useState(14);
  const [customDate, setCustomDate] = useState('');
  const [demo, setDemo] = useState(false);
  const [minutes, setMinutes] = useState('5');
  const [done, setDone] = useState(false);

  // resolve the chosen deadline into ms + a human label, with validity
  const deadline = (() => {
    if (demo) {
      const n = Number(minutes);
      if (!isFinite(n) || n <= 0) return { ms: 0n, label: '', valid: false };
      const ms = Date.now() + Math.round(n * 60_000);
      return { ms: BigInt(ms), label: `${n} min from now`, valid: true };
    }
    if (customDate) {
      const t = new Date(`${customDate}T23:59:59`).getTime();
      if (!isFinite(t) || t <= Date.now()) return { ms: 0n, label: '', valid: false };
      return { ms: BigInt(t), label: fmtDate(t), valid: true };
    }
    const t = Date.now() + days * 86_400_000;
    return { ms: BigInt(t), label: fmtDate(t), valid: true };
  })();

  const targetOk = isPos(target);
  const bonusOk = isPos(bonus);
  const reason: string | null = !targetOk
    ? 'Set a funding target above 0.'
    : !bonusOk
      ? 'Lock a bonus above 0 — it’s what makes pledging the rational move.'
      : !deadline.valid
        ? demo
          ? 'Enter a duration in minutes above 0.'
          : 'Pick a deadline in the future.'
        : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason) return;
    try {
      const ok = await run(
        createCampaignTx({
          target: toBaseUnits(target),
          deadlineMs: deadline.ms,
          bonusAmount: toBaseUnits(bonus),
        }),
      );
      if (ok) setDone(true);
    } catch {
      /* surfaced via useTx error */
    }
  }

  if (done) {
    return (
      <div className="detail enter">
        <div className="card card--primary">
          <div className="receipt-head" style={{ marginBottom: 'var(--sp-3)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 12.5l4.2 4.2L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Campaign launched
          </div>
          <h3>Your bonus is locked in escrow</h3>
          <p className="helper">
            Backers can now pledge until <b>{deadline.label}</b>. Share the campaign so being early pays off — if it misses{' '}
            {target} {COIN_SYMBOL}, your {bonus} {COIN_SYMBOL} bonus is split among them.
          </p>
          <a className="btn btn--primary btn--block btn--lg" href="#/">Browse campaigns</a>
        </div>
      </div>
    );
  }

  return (
    <div className="detail">
      <a className="back" href="#/">&larr; All campaigns</a>

      <form className="card card--primary" onSubmit={submit}>
        <h3>Launch a campaign</h3>
        <p className="card-intro">
          Lock a refund bonus up front. If the campaign misses its target, backers split that bonus — which is what makes
          pledging early the rational move, not a leap of faith.
        </p>

        <label className="field">
          <div className="field-label">
            <span className="lbl">Funding target</span>
          </div>
          <div className="input-wrap">
            <input
              className={`input has-suffix${target !== '' && !targetOk ? ' invalid' : ''}`}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
            />
            <span className="input-suffix">{COIN_SYMBOL}</span>
          </div>
          <div className="field-hint">The amount backers must collectively reach by the deadline.</div>
        </label>

        <label className="field">
          <div className="field-label">
            <span className="lbl">Refund bonus</span>
            <span className="aux">leaves your wallet now</span>
          </div>
          <div className="input-wrap">
            <input
              className={`input has-suffix${bonus !== '' && !bonusOk ? ' invalid' : ''}`}
              value={bonus}
              onChange={(e) => setBonus(e.target.value)}
              inputMode="decimal"
            />
            <span className="input-suffix">{COIN_SYMBOL}</span>
          </div>
          <div className="field-hint">Escrowed at launch. Paid to backers only if the campaign fails; returned to you if it succeeds.</div>
        </label>

        <div className="field">
          <div className="field-label">
            <span className="lbl">Deadline</span>
            {deadline.valid && <span className="aux">Ends {deadline.label}</span>}
          </div>
          {!demo && (
            <>
              <div className="presets">
                {DAY_PRESETS.map((d) => (
                  <button
                    type="button"
                    key={d}
                    className={`preset${!customDate && days === d ? ' active' : ''}`}
                    onClick={() => {
                      setDays(d);
                      setCustomDate('');
                    }}
                  >
                    {d} days
                  </button>
                ))}
              </div>
              <div className="input-wrap">
                <input
                  className="input"
                  type="date"
                  value={customDate}
                  min={new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)}
                  onChange={(e) => setCustomDate(e.target.value)}
                />
              </div>
              {customDate && !deadline.valid && <div className="field-error">Pick a date in the future.</div>}
            </>
          )}
          {demo && (
            <div className="input-wrap">
              <input
                className={`input has-suffix${minutes !== '' && !(Number(minutes) > 0) ? ' invalid' : ''}`}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                inputMode="numeric"
              />
              <span className="input-suffix">min</span>
            </div>
          )}
          <label className="check">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            Use a short demo timer (minutes) instead of a date
          </label>
        </div>

        <div className="terms">
          <h4>Terms preview</h4>
          <p>
            <span className="neg">&minus;{bonusOk ? bonus : '0'} {COIN_SYMBOL}</span> plus gas leaves your wallet now and is
            locked in escrow as the bonus.
          </p>
          <p>
            Backers have until <b>{deadline.valid ? deadline.label : '—'}</b> to reach <b>{targetOk ? target : '—'} {COIN_SYMBOL}</b>.
          </p>
          <p>
            If they <b>miss</b> it, your {bonusOk ? bonus : '0'} {COIN_SYMBOL} is split among backers pro-rata — your downside is
            their reward for going first.
          </p>
          <p>
            If they <b>hit</b> it, you receive the raised {targetOk ? target : '—'} {COIN_SYMBOL} and your bonus returns to you.
          </p>
        </div>

        <button type="submit" className="btn btn--primary btn--block btn--lg" disabled={pending || !!reason}>
          {pending ? 'Locking bonus…' : 'Launch & lock bonus'}
        </button>
        {!pending && reason && <p className="submit-reason">{reason}</p>}
        {error && <ErrorBlock raw={error} />}
      </form>
    </div>
  );
}
