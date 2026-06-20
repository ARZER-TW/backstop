import { useState } from 'react';
import { COIN_SYMBOL } from '../config';
import { createCampaignTx, toBaseUnits } from '../lib/backstop';
import { useTx } from '../lib/useTx';

export function CreateCampaign() {
  const { run, pending, error } = useTx();
  const [target, setTarget] = useState('10');
  const [bonus, setBonus] = useState('2');
  const [minutes, setMinutes] = useState('3');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const deadlineMs = BigInt(Date.now() + Math.round(Number(minutes) * 60_000));
    await run(
      createCampaignTx({
        target: toBaseUnits(target),
        deadlineMs,
        bonusAmount: toBaseUnits(bonus),
      }),
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <h3>Launch a campaign</h3>
      <p className="card-intro">
        Lock a refund bonus up front. If the campaign fails, backers split it &mdash; which makes pledging the rational
        move.
      </p>

      <label className="field">
        <span>Funding target ({COIN_SYMBOL})</span>
        <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" />
      </label>

      <label className="field">
        <span>
          Refund bonus ({COIN_SYMBOL}) <span className="hint">— locked now, paid to backers only on failure</span>
        </span>
        <input value={bonus} onChange={(e) => setBonus(e.target.value)} inputMode="decimal" />
      </label>

      <label className="field">
        <span>Deadline (minutes from now)</span>
        <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric" />
      </label>

      <button type="submit" disabled={pending}>
        {pending ? 'Locking bonus…' : 'Launch & lock bonus'}
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
