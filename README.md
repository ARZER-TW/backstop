# Backstop

**Crowdfunding where backing a failed campaign pays you back — with a bonus.**

Backstop is a [Dominant Assurance Contract](https://en.wikipedia.org/wiki/Assurance_contract#Dominant_assurance_contracts) (DAC) on Sui. Submission for **Sui Overflow 2026 · DeFi & Payments**.

**[Live demo →](https://arzer-tw.github.io/backstop/)** · runs against the testnet deployment below (connect a Sui wallet on testnet).

## The idea

Traditional all-or-nothing crowdfunding dies on the first-mover problem: no rational person wants to be early on a campaign that might not reach its goal. A DAC fixes this. The creator locks a **refund bonus** up front, and:

- **Target met** → the creator receives every pledge (the bonus, unused, returns to them).
- **Target missed** → every backer gets a **full refund _plus_ a pro-rata share of the bonus**.

So supporting a campaign becomes a *dominant strategy*: if it succeeds you get the thing you wanted; if it fails you walk away with **more money than you put in**. Because everyone now dares to pledge, campaigns actually succeed — and the bonus is almost never paid out. (Tabarrok, 1998.)

## Why it must be on-chain

A centralized platform saying *"I'll pay you a bonus if I fail"* is naked moral hazard — nobody believes it, which is exactly why DACs never shipped as a consumer product in web2. Only an on-chain escrow can make the promise **credible**:

- the bonus is locked **before** anyone pledges,
- settlement is **atomic** at the deadline based purely on on-chain amounts,
- **anyone** can trigger settlement — the creator can't stall,
- nobody can divert the funds.

Credible commitment is the one ingredient the mechanism needs, and it's the one thing only a blockchain provides.

What it does **not** promise: that the creator actually delivers the funded product. That's an off-chain fact left to reputation, like all crowdfunding — we're honest about that boundary.

## What's in here

| Path | What |
|------|------|
| `move/backstop/` | The `backstop::campaign` Move package — `Campaign<T>` shared escrow + `Pledge` receipt, six entry functions, 12 tests. |
| `sdk/` | TypeScript SDK (`@mysten/sui` v2): PTB builders + on-chain reads, generic over the coin type. |
| `frontend/` | React + `@mysten/dapp-kit` dApp: launch, browse, pledge, resolve, withdraw, claim. |

### Mechanism (Move)

- `create_campaign(target, deadline_ms, bonus, clock)` — locks the bonus, shares the campaign.
- `pledge(campaign, payment, clock)` — escrows funds, mints a `Pledge` receipt.
- `resolve(campaign, clock)` — permissionless; sets `SUCCEEDED` / `FAILED` on `total_pledged` vs `target`.
- `creator_withdraw(campaign)` — on success, creator takes pledges + returned bonus.
- `claim_refund(campaign, pledge)` — on failure, backer takes principal + pro-rata bonus (last claimer sweeps the rounding dust, so escrow drains to exactly zero).
- `creator_reclaim(campaign)` — failed campaign with zero backers: creator reclaims the bonus.

Verified invariants: conservation (`pledged + bonus` fully distributed), no double-pay, deadline-correct timing, permissionless resolution, overflow-safe pro-rata. Covered by 12 Move tests plus an adversarial fund-safety review.

## Live deployment (testnet)

- **Package:** [`0x4f47075009cf926686511631f03102e7c65b09c3a0477c36d1406a1034a7f024`](https://suiscan.xyz/testnet/object/0x4f47075009cf926686511631f03102e7c65b09c3a0477c36d1406a1034a7f024)
- Module `campaign`. The frontend ships pointing at this deployment by default.

## Run it

```bash
# Move tests
cd move/backstop && sui move test

# Frontend (talks to the live testnet deployment out of the box)
cd frontend && pnpm install && pnpm dev
```

Connect a Sui wallet on testnet, then launch a campaign or back an existing one. To run the demo end-to-end, set a short deadline (a couple of minutes), pledge, wait for it to pass, and hit **Resolve** — refunds and bonus land in the backers' wallets instantly.

## Roadmap

- zkLogin (Google sign-in) + Enoki sponsored gas, so backers need neither a wallet nor SUI for gas.
- USDC denomination (the package is already generic over the coin type).
- Mainnet deployment.
