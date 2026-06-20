import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import { COIN_DECIMALS, COIN_SYMBOL, COIN_TYPE, NETWORK, PACKAGE_ID } from '../config';

const MODULE = 'campaign';

export const STATUS = { FUNDING: 0, SUCCEEDED: 1, FAILED: 2 } as const;

export const readClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl(NETWORK),
  network: NETWORK,
});

export interface CampaignView {
  id: string;
  creator: string;
  target: bigint;
  deadlineMs: bigint;
  pledged: bigint;
  bonus: bigint;
  bonusTotal: bigint;
  totalPledged: bigint;
  backerCount: bigint;
  claimedCount: bigint;
  status: number;
}

export interface PledgeView {
  id: string;
  campaign: string;
  backer: string;
  amount: bigint;
  claimed: boolean;
}

function asBigInt(v: unknown): bigint {
  if (typeof v === 'object' && v !== null && 'value' in v) {
    return BigInt((v as { value: string | number }).value);
  }
  return BigInt(v as string | number);
}

function uidToId(v: unknown): string {
  if (typeof v === 'object' && v !== null && 'id' in v) return (v as { id: string }).id;
  return v as string;
}

const fq = (fn: string) => `${PACKAGE_ID}::${MODULE}::${fn}` as `${string}::${string}::${string}`;

// === PTB builders (pure; return a Transaction for the wallet to sign) ===

function splitPayment(tx: Transaction, amount: bigint, coinId?: string) {
  const source = coinId ? tx.object(coinId) : tx.gas;
  const [coin] = tx.splitCoins(source, [tx.pure.u64(amount)]);
  return coin;
}

export function createCampaignTx(args: {
  target: bigint;
  deadlineMs: bigint;
  bonusAmount: bigint;
  bonusCoinId?: string;
}): Transaction {
  const tx = new Transaction();
  const bonus = splitPayment(tx, args.bonusAmount, args.bonusCoinId);
  tx.moveCall({
    target: fq('create_campaign'),
    typeArguments: [COIN_TYPE],
    arguments: [
      tx.pure.u64(args.target),
      tx.pure.u64(args.deadlineMs),
      bonus,
      tx.object(SUI_CLOCK_OBJECT_ID),
    ],
  });
  return tx;
}

export function pledgeTx(args: { campaignId: string; amount: bigint; paymentCoinId?: string }): Transaction {
  const tx = new Transaction();
  const payment = splitPayment(tx, args.amount, args.paymentCoinId);
  tx.moveCall({
    target: fq('pledge'),
    typeArguments: [COIN_TYPE],
    arguments: [tx.object(args.campaignId), payment, tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  return tx;
}

export function resolveTx(campaignId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: fq('resolve'),
    typeArguments: [COIN_TYPE],
    arguments: [tx.object(campaignId), tx.object(SUI_CLOCK_OBJECT_ID)],
  });
  return tx;
}

export function creatorWithdrawTx(campaignId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: fq('creator_withdraw'), typeArguments: [COIN_TYPE], arguments: [tx.object(campaignId)] });
  return tx;
}

export function claimRefundTx(args: { campaignId: string; pledgeId: string }): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: fq('claim_refund'),
    typeArguments: [COIN_TYPE],
    arguments: [tx.object(args.campaignId), tx.object(args.pledgeId)],
  });
  return tx;
}

export function creatorReclaimTx(campaignId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: fq('creator_reclaim'), typeArguments: [COIN_TYPE], arguments: [tx.object(campaignId)] });
  return tx;
}

// === Reads ===

export async function getCampaign(id: string): Promise<CampaignView> {
  const res = await readClient.getObject({ id, options: { showContent: true } });
  const content = res.data?.content;
  if (!content || content.dataType !== 'moveObject') throw new Error(`Object ${id} is not a Move object`);
  const f = content.fields as Record<string, unknown>;
  return {
    id,
    creator: f.creator as string,
    target: asBigInt(f.target),
    deadlineMs: asBigInt(f.deadline_ms),
    pledged: asBigInt(f.pledged),
    bonus: asBigInt(f.bonus),
    bonusTotal: asBigInt(f.bonus_total),
    totalPledged: asBigInt(f.total_pledged),
    backerCount: asBigInt(f.backer_count),
    claimedCount: asBigInt(f.claimed_count),
    status: Number(f.status),
  };
}

export async function getCampaigns(limit = 50): Promise<CampaignView[]> {
  const page = await readClient.queryEvents({
    query: { MoveEventType: fq('CampaignCreated') },
    order: 'descending',
    limit,
  });
  const ids: string[] = [];
  for (const e of page.data) {
    const d = (e.parsedJson ?? {}) as Record<string, unknown>;
    if (d.campaign) ids.push(d.campaign as string);
  }
  const settled = await Promise.allSettled(ids.map((id) => getCampaign(id)));
  return settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
}

export async function getOwnedPledges(owner: string, campaignId?: string): Promise<PledgeView[]> {
  const res = await readClient.getOwnedObjects({
    owner,
    filter: { StructType: fq('Pledge') },
    options: { showContent: true },
  });
  const out: PledgeView[] = [];
  for (const o of res.data) {
    const content = o.data?.content;
    if (!content || content.dataType !== 'moveObject') continue;
    const f = content.fields as Record<string, unknown>;
    const view: PledgeView = {
      id: uidToId(f.id),
      campaign: f.campaign as string,
      backer: f.backer as string,
      amount: asBigInt(f.amount),
      claimed: Boolean(f.claimed),
    };
    if (!campaignId || view.campaign === campaignId) out.push(view);
  }
  return out;
}

// === Formatting / domain helpers ===

/** Numeric amount without the coin symbol, grouped (e.g. "1,250.5"). */
export function formatNum(raw: bigint): string {
  const base = 10n ** BigInt(COIN_DECIMALS);
  const whole = (raw / base).toLocaleString('en-US');
  const frac = raw % base;
  if (frac === 0n) return whole;
  const fracStr = frac.toString().padStart(COIN_DECIMALS, '0').replace(/0+$/, '').slice(0, 4);
  return `${whole}.${fracStr}`;
}

export function formatAmount(raw: bigint): string {
  return `${formatNum(raw)} ${COIN_SYMBOL}`;
}

export { COIN_SYMBOL };

/** Parse a human amount (e.g. "1.5") into base units, given COIN_DECIMALS. */
export function toBaseUnits(human: string): bigint {
  const [whole, frac = ''] = human.trim().split('.');
  const fracPadded = (frac + '0'.repeat(COIN_DECIMALS)).slice(0, COIN_DECIMALS);
  return BigInt(whole || '0') * 10n ** BigInt(COIN_DECIMALS) + BigInt(fracPadded || '0');
}

export function statusLabel(status: number): string {
  return status === STATUS.SUCCEEDED ? 'Succeeded' : status === STATUS.FAILED ? 'Failed' : 'Funding';
}

/** Pro-rata bonus a backer would receive if the campaign fails, per the Move formula. */
export function projectedBonus(c: CampaignView, pledgeAmount: bigint): bigint {
  if (c.totalPledged === 0n) return 0n;
  return (c.bonusTotal * pledgeAmount) / c.totalPledged;
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id;
}
