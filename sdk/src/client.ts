import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';

export type Network = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

export const CAMPAIGN_MODULE = 'campaign';

/** Campaign.status values, mirroring the Move constants. */
export const STATUS = { FUNDING: 0, SUCCEEDED: 1, FAILED: 2 } as const;
export type CampaignStatus = (typeof STATUS)[keyof typeof STATUS];

export interface BackstopConfig {
  network: Network;
  /** Published package id of the `backstop` Move package. */
  packageId: string;
  /** Fully-qualified coin type bound to `Campaign<T>`, e.g. `0x2::sui::SUI`. */
  coinType: string;
  /** Reuse an existing client (e.g. dapp-kit's) instead of constructing one. */
  client?: SuiJsonRpcClient;
}

export interface CampaignView {
  id: string;
  creator: string;
  target: bigint;
  deadlineMs: bigint;
  /** Funds currently escrowed (drains to 0 after settlement). */
  pledged: bigint;
  /** Bonus currently escrowed (drains to 0 after settlement). */
  bonus: bigint;
  /** Immutable record of the bonus locked at creation. */
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
  // Sui JSON renders u64 as string, Balance<T> sometimes as { value: "..." }.
  if (typeof v === 'object' && v !== null && 'value' in v) {
    return BigInt((v as { value: string | number }).value);
  }
  return BigInt(v as string | number);
}

function uidToId(v: unknown): string {
  if (typeof v === 'object' && v !== null && 'id' in v) {
    return (v as { id: string }).id;
  }
  return v as string;
}

export class BackstopClient {
  readonly client: SuiJsonRpcClient;
  readonly packageId: string;
  readonly coinType: string;

  constructor(opts: BackstopConfig) {
    this.client =
      opts.client ??
      new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(opts.network),
        network: opts.network,
      });
    this.packageId = opts.packageId;
    this.coinType = opts.coinType;
  }

  private target(fn: string): `${string}::${string}::${string}` {
    return `${this.packageId}::${CAMPAIGN_MODULE}::${fn}`;
  }

  /** Split `amount` off a coin (a provided object, or the gas coin for SUI). */
  private splitPayment(tx: Transaction, amount: bigint, coinId?: string) {
    const source = coinId ? tx.object(coinId) : tx.gas;
    const [coin] = tx.splitCoins(source, [tx.pure.u64(amount)]);
    return coin;
  }

  // === PTB builders ===

  buildCreateCampaign(args: {
    target: bigint;
    deadlineMs: bigint;
    bonusAmount: bigint;
    /** Coin object to fund the bonus from; omit to split from the SUI gas coin. */
    bonusCoinId?: string;
  }): Transaction {
    const tx = new Transaction();
    const bonus = this.splitPayment(tx, args.bonusAmount, args.bonusCoinId);
    tx.moveCall({
      target: this.target('create_campaign'),
      typeArguments: [this.coinType],
      arguments: [
        tx.pure.u64(args.target),
        tx.pure.u64(args.deadlineMs),
        bonus,
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  buildPledge(args: {
    campaignId: string;
    amount: bigint;
    /** Coin object to pledge from; omit to split from the SUI gas coin. */
    paymentCoinId?: string;
  }): Transaction {
    const tx = new Transaction();
    const payment = this.splitPayment(tx, args.amount, args.paymentCoinId);
    tx.moveCall({
      target: this.target('pledge'),
      typeArguments: [this.coinType],
      arguments: [tx.object(args.campaignId), payment, tx.object(SUI_CLOCK_OBJECT_ID)],
    });
    return tx;
  }

  buildResolve(campaignId: string): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target('resolve'),
      typeArguments: [this.coinType],
      arguments: [tx.object(campaignId), tx.object(SUI_CLOCK_OBJECT_ID)],
    });
    return tx;
  }

  buildCreatorWithdraw(campaignId: string): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target('creator_withdraw'),
      typeArguments: [this.coinType],
      arguments: [tx.object(campaignId)],
    });
    return tx;
  }

  buildClaimRefund(args: { campaignId: string; pledgeId: string }): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target('claim_refund'),
      typeArguments: [this.coinType],
      arguments: [tx.object(args.campaignId), tx.object(args.pledgeId)],
    });
    return tx;
  }

  buildCreatorReclaim(campaignId: string): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target('creator_reclaim'),
      typeArguments: [this.coinType],
      arguments: [tx.object(campaignId)],
    });
    return tx;
  }

  // === Reads ===

  async getCampaign(id: string): Promise<CampaignView> {
    const res = await this.client.getObject({ id, options: { showContent: true } });
    const content = res.data?.content;
    if (!content || content.dataType !== 'moveObject') {
      throw new Error(`Object ${id} is not a Move object`);
    }
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

  /** Campaign object ids, newest first, discovered from CampaignCreated events. */
  async listCampaignIds(limit = 50): Promise<string[]> {
    const page = await this.client.queryEvents({
      query: { MoveEventType: `${this.packageId}::${CAMPAIGN_MODULE}::CampaignCreated` },
      order: 'descending',
      limit,
    });
    const ids: string[] = [];
    for (const e of page.data) {
      const d = (e.parsedJson ?? {}) as Record<string, unknown>;
      if (d.campaign) ids.push(d.campaign as string);
    }
    return ids;
  }

  async getCampaigns(limit = 50): Promise<CampaignView[]> {
    const ids = await this.listCampaignIds(limit);
    return Promise.all(ids.map((id) => this.getCampaign(id)));
  }

  /** Pledge receipts owned by `owner`, optionally filtered to one campaign. */
  async getOwnedPledges(owner: string, campaignId?: string): Promise<PledgeView[]> {
    const res = await this.client.getOwnedObjects({
      owner,
      filter: { StructType: `${this.packageId}::${CAMPAIGN_MODULE}::Pledge` },
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
}
