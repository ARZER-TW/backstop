/// Backstop -- a Dominant Assurance Contract (DAC) for crowdfunding.
///
/// A creator opens a campaign and locks a refund `bonus` up front. Backers pledge
/// toward a `target` before a `deadline`. After the deadline anyone can `resolve`:
///   - target met    -> SUCCEEDED: the creator withdraws every pledge plus the
///                                 (unused) bonus.
///   - target missed  -> FAILED:   each backer reclaims their full principal PLUS a
///                                 pro-rata share of the bonus. Supporting a failed
///                                 campaign is therefore net profitable, which makes
///                                 pledging a dominant strategy (Tabarrok, 1998).
///
/// What the contract guarantees: escrow custody no one can divert, deadline-based
/// settlement on on-chain amounts, atomic refunds plus bonus, and permissionless
/// resolution. What it does NOT guarantee: that the creator delivers the funded
/// product -- that is an off-chain fact left to reputation, as with all crowdfunding.
///
/// Generic over the coin type `T`, so the same published package works with testnet
/// USDC (the intended deployment) or any other coin. The frontend/SDK instantiate the
/// concrete type, e.g. `Campaign<USDC>`.
module backstop::campaign;

use sui::balance::{Self, Balance};
use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::event;

// === Status ===
const FUNDING: u8 = 0;
const SUCCEEDED: u8 = 1;
const FAILED: u8 = 2;

// === Errors ===
const ETargetZero: u64 = 0;
const EBonusZero: u64 = 1;
const EDeadlineInPast: u64 = 2;
const ENotFunding: u64 = 3;
const EDeadlinePassed: u64 = 4;
const EPledgeZero: u64 = 5;
const EDeadlineNotReached: u64 = 6;
const ENotSucceeded: u64 = 7;
const ENotCreator: u64 = 8;
const EAlreadyWithdrawn: u64 = 9;
const ENotFailed: u64 = 10;
const EWrongCampaign: u64 = 11;
const ENotBacker: u64 = 12;
const EAlreadyClaimed: u64 = 13;
const EHasBackers: u64 = 14;

// === Objects ===

/// Shared escrow object holding all pledged funds and the locked bonus.
public struct Campaign<phantom T> has key {
    id: UID,
    creator: address,
    target: u64,
    deadline_ms: u64,
    /// All backer principal, accumulated here during FUNDING.
    pledged: Balance<T>,
    /// The creator's up-front bonus, locked at creation, paid out only after resolve.
    bonus: Balance<T>,
    /// Immutable record of the initial bonus; pro-rata math uses this as `bonus` drains.
    bonus_total: u64,
    total_pledged: u64,
    /// One per `pledge` call -- the denominator for "all receipts claimed?".
    backer_count: u64,
    /// Receipts that have already claimed a refund.
    claimed_count: u64,
    status: u8,
}

/// Owned receipt for a single pledge. Kept after claiming (marked `claimed`) so it
/// doubles as proof-of-support and structurally blocks a second refund.
public struct Pledge has key, store {
    id: UID,
    campaign: ID,
    backer: address,
    amount: u64,
    claimed: bool,
}

// === Events ===

public struct CampaignCreated has copy, drop {
    campaign: ID,
    creator: address,
    target: u64,
    deadline_ms: u64,
    bonus: u64,
}

public struct Pledged has copy, drop {
    campaign: ID,
    backer: address,
    amount: u64,
    total_pledged: u64,
}

public struct Resolved has copy, drop {
    campaign: ID,
    status: u8,
    total_pledged: u64,
    target: u64,
}

public struct CreatorWithdrew has copy, drop {
    campaign: ID,
    amount: u64,
}

public struct RefundClaimed has copy, drop {
    campaign: ID,
    backer: address,
    principal: u64,
    bonus_share: u64,
}

public struct BonusReclaimed has copy, drop {
    campaign: ID,
    amount: u64,
}

// === Lifecycle ===

/// Open a campaign and lock `bonus` into escrow. `deadline_ms` must be in the future
/// and both `target` and `bonus` must be non-zero. Shares the campaign object.
public fun create_campaign<T>(
    target: u64,
    deadline_ms: u64,
    bonus: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(target > 0, ETargetZero);
    assert!(deadline_ms > clock.timestamp_ms(), EDeadlineInPast);

    let bonus_bal = coin::into_balance(bonus);
    let bonus_total = bonus_bal.value();
    assert!(bonus_total > 0, EBonusZero);

    let campaign = Campaign<T> {
        id: object::new(ctx),
        creator: ctx.sender(),
        target,
        deadline_ms,
        pledged: balance::zero<T>(),
        bonus: bonus_bal,
        bonus_total,
        total_pledged: 0,
        backer_count: 0,
        claimed_count: 0,
        status: FUNDING,
    };

    event::emit(CampaignCreated {
        campaign: object::id(&campaign),
        creator: campaign.creator,
        target,
        deadline_ms,
        bonus: bonus_total,
    });

    transfer::share_object(campaign);
}

/// Pledge `payment` toward the campaign before the deadline. Mints a Pledge receipt
/// to the backer. The receipt is intentionally sent to the pledging sender.
#[allow(lint(self_transfer))]
public fun pledge<T>(
    campaign: &mut Campaign<T>,
    payment: Coin<T>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(campaign.status == FUNDING, ENotFunding);
    assert!(clock.timestamp_ms() < campaign.deadline_ms, EDeadlinePassed);

    let amount = payment.value();
    assert!(amount > 0, EPledgeZero);

    campaign.pledged.join(coin::into_balance(payment));
    campaign.total_pledged = campaign.total_pledged + amount;
    campaign.backer_count = campaign.backer_count + 1;

    let backer = ctx.sender();
    let cid = object::id(campaign);
    let receipt = Pledge {
        id: object::new(ctx),
        campaign: cid,
        backer,
        amount,
        claimed: false,
    };

    event::emit(Pledged { campaign: cid, backer, amount, total_pledged: campaign.total_pledged });
    transfer::public_transfer(receipt, backer);
}

/// Permissionless settlement after the deadline. Outcome depends solely on the
/// on-chain `total_pledged` vs `target` -- no privileged caller, no off-chain input.
public fun resolve<T>(campaign: &mut Campaign<T>, clock: &Clock) {
    assert!(campaign.status == FUNDING, ENotFunding);
    assert!(clock.timestamp_ms() >= campaign.deadline_ms, EDeadlineNotReached);

    campaign.status = if (campaign.total_pledged >= campaign.target) { SUCCEEDED } else { FAILED };

    event::emit(Resolved {
        campaign: object::id(campaign),
        status: campaign.status,
        total_pledged: campaign.total_pledged,
        target: campaign.target,
    });
}

/// On success the creator withdraws all pledged funds plus the unused bonus.
public fun creator_withdraw<T>(campaign: &mut Campaign<T>, ctx: &mut TxContext) {
    assert!(campaign.status == SUCCEEDED, ENotSucceeded);
    assert!(ctx.sender() == campaign.creator, ENotCreator);
    assert!(campaign.pledged.value() > 0, EAlreadyWithdrawn);

    let mut out = campaign.pledged.withdraw_all();
    out.join(campaign.bonus.withdraw_all());

    let amount = out.value();
    event::emit(CreatorWithdrew { campaign: object::id(campaign), amount });
    transfer::public_transfer(coin::from_balance(out, ctx), campaign.creator);
}

/// On failure a backer reclaims principal + a pro-rata share of the bonus. The final
/// claimer also sweeps the integer-division dust, so escrow drains to exactly zero.
public fun claim_refund<T>(
    campaign: &mut Campaign<T>,
    receipt: &mut Pledge,
    ctx: &mut TxContext,
) {
    assert!(campaign.status == FAILED, ENotFailed);
    assert!(receipt.campaign == object::id(campaign), EWrongCampaign);
    assert!(receipt.backer == ctx.sender(), ENotBacker);
    assert!(!receipt.claimed, EAlreadyClaimed);

    receipt.claimed = true;
    campaign.claimed_count = campaign.claimed_count + 1;

    let mut refund = campaign.pledged.split(receipt.amount);
    let bonus_share = if (campaign.claimed_count == campaign.backer_count) {
        // last claimer takes their share plus any remaining rounding dust
        campaign.bonus.withdraw_all()
    } else {
        let share = pro_rata(campaign.bonus_total, receipt.amount, campaign.total_pledged);
        campaign.bonus.split(share)
    };
    let bonus_amount = bonus_share.value();
    refund.join(bonus_share);

    event::emit(RefundClaimed {
        campaign: object::id(campaign),
        backer: receipt.backer,
        principal: receipt.amount,
        bonus_share: bonus_amount,
    });
    transfer::public_transfer(coin::from_balance(refund, ctx), receipt.backer);
}

/// Edge case: a failed campaign that attracted zero backers. The bonus would otherwise
/// be stranded, so the creator reclaims it in full via this independent path.
public fun creator_reclaim<T>(campaign: &mut Campaign<T>, ctx: &mut TxContext) {
    assert!(campaign.status == FAILED, ENotFailed);
    assert!(ctx.sender() == campaign.creator, ENotCreator);
    assert!(campaign.backer_count == 0, EHasBackers);
    // Idempotency: once reclaimed the bonus is empty, mirroring creator_withdraw's guard.
    assert!(campaign.bonus.value() > 0, EAlreadyWithdrawn);

    let out = campaign.bonus.withdraw_all();
    let amount = out.value();
    event::emit(BonusReclaimed { campaign: object::id(campaign), amount });
    transfer::public_transfer(coin::from_balance(out, ctx), campaign.creator);
}

// === Internal ===

/// floor(bonus_total * amount / total_pledged), computed in u128 to avoid overflow.
/// The caller guarantees `total_pledged > 0` (a Pledge for this campaign exists).
fun pro_rata(bonus_total: u64, amount: u64, total_pledged: u64): u64 {
    (((bonus_total as u128) * (amount as u128)) / (total_pledged as u128)) as u64
}

// === Views (tests / SDK / frontend) ===

public fun status<T>(c: &Campaign<T>): u8 { c.status }
public fun is_funding<T>(c: &Campaign<T>): bool { c.status == FUNDING }
public fun is_succeeded<T>(c: &Campaign<T>): bool { c.status == SUCCEEDED }
public fun is_failed<T>(c: &Campaign<T>): bool { c.status == FAILED }
public fun creator<T>(c: &Campaign<T>): address { c.creator }
public fun target<T>(c: &Campaign<T>): u64 { c.target }
public fun deadline_ms<T>(c: &Campaign<T>): u64 { c.deadline_ms }
public fun total_pledged<T>(c: &Campaign<T>): u64 { c.total_pledged }
public fun bonus_total<T>(c: &Campaign<T>): u64 { c.bonus_total }
public fun backer_count<T>(c: &Campaign<T>): u64 { c.backer_count }
public fun claimed_count<T>(c: &Campaign<T>): u64 { c.claimed_count }
public fun pledged_value<T>(c: &Campaign<T>): u64 { c.pledged.value() }
public fun bonus_value<T>(c: &Campaign<T>): u64 { c.bonus.value() }

public fun pledge_amount(p: &Pledge): u64 { p.amount }
public fun pledge_backer(p: &Pledge): address { p.backer }
public fun pledge_claimed(p: &Pledge): bool { p.claimed }
public fun pledge_campaign(p: &Pledge): ID { p.campaign }
