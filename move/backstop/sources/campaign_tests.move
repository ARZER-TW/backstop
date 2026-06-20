#[test_only]
module backstop::campaign_tests;

use sui::test_scenario::{Self as ts};
use sui::clock;
use sui::coin::{Self, Coin};
use backstop::campaign::{Self, Campaign, Pledge};

/// Stand-in coin type for tests (the deployed package is generic over `T`).
public struct TEST_USDC has drop {}

const CREATOR: address = @0xC0FFEE;
const ALICE: address = @0xA11CE;
const BOB: address = @0xB0B;
const RANDO: address = @0x8AD; // an unrelated, unprivileged resolver

const T0: u64 = 1_000; // "now" at creation
const DEADLINE: u64 = 10_000;
const AFTER: u64 = 10_001; // strictly past the deadline

fun mint(amount: u64, ctx: &mut TxContext): Coin<TEST_USDC> {
    coin::mint_for_testing<TEST_USDC>(amount, ctx)
}

// === Happy path: target met -> creator takes pledges + bonus ===

#[test]
fun test_success_path() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    // creator opens: target 500, bonus 100
    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(500, DEADLINE, bonus, &clk, ctx);
    };

    // alice pledges 600 (>= target)
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(600, ctx);
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx);
        assert!(campaign::total_pledged(&camp) == 600, 0);
        assert!(campaign::is_funding(&camp), 1);
        ts::return_shared(camp);
    };

    // deadline passes; an unrelated address resolves (permissionless)
    clock::set_for_testing(&mut clk, AFTER);
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk);
        assert!(campaign::is_succeeded(&camp), 2);
        ts::return_shared(camp);
    };

    // creator withdraws 600 + 100 = 700; escrow drains to zero
    ts::next_tx(&mut sc, CREATOR);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::creator_withdraw<TEST_USDC>(&mut camp, ctx);
        assert!(campaign::pledged_value(&camp) == 0, 3);
        assert!(campaign::bonus_value(&camp) == 0, 4);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, CREATOR);
    {
        let payout = ts::take_from_sender<Coin<TEST_USDC>>(&sc);
        assert!(coin::value(&payout) == 700, 5);
        coin::burn_for_testing(payout);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Failure path + pro-rata math + conservation ===
// target 1000, bonus 100; alice 200, bob 400 -> total 600 < 1000 -> FAILED.
// alice (not last)  = 200 + floor(100*200/600=33) = 233
// bob   (last)      = 400 + (100-33 = 67, incl. 1 dust) = 467
// out total 700 == 600 pledged + 100 bonus  (exact conservation)

#[test]
fun test_failure_pro_rata_and_conservation() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };

    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(200, ctx);
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, BOB);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(400, ctx);
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx);
        ts::return_shared(camp);
    };

    clock::set_for_testing(&mut clk, AFTER);
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk);
        assert!(campaign::is_failed(&camp), 0);
        ts::return_shared(camp);
    };

    // alice claims first (not the last claimer)
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let mut receipt = ts::take_from_sender<Pledge>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::claim_refund<TEST_USDC>(&mut camp, &mut receipt, ctx);
        assert!(campaign::pledge_claimed(&receipt), 1);
        ts::return_to_sender(&sc, receipt);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let refund = ts::take_from_sender<Coin<TEST_USDC>>(&sc);
        assert!(coin::value(&refund) == 233, 2);
        coin::burn_for_testing(refund);
    };

    // bob claims last -> sweeps dust; escrow must be exactly empty afterwards
    ts::next_tx(&mut sc, BOB);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let mut receipt = ts::take_from_sender<Pledge>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::claim_refund<TEST_USDC>(&mut camp, &mut receipt, ctx);
        assert!(campaign::pledged_value(&camp) == 0, 3);
        assert!(campaign::bonus_value(&camp) == 0, 4);
        ts::return_to_sender(&sc, receipt);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, BOB);
    {
        let refund = ts::take_from_sender<Coin<TEST_USDC>>(&sc);
        assert!(coin::value(&refund) == 467, 5);
        coin::burn_for_testing(refund);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Zero-backer failure: creator reclaims the full bonus via the independent path ===

#[test]
fun test_zero_backer_failure() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };

    clock::set_for_testing(&mut clk, AFTER);
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk);
        assert!(campaign::is_failed(&camp), 0);
        assert!(campaign::backer_count(&camp) == 0, 1);
        ts::return_shared(camp);
    };

    ts::next_tx(&mut sc, CREATOR);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::creator_reclaim<TEST_USDC>(&mut camp, ctx);
        assert!(campaign::bonus_value(&camp) == 0, 2);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, CREATOR);
    {
        let reclaimed = ts::take_from_sender<Coin<TEST_USDC>>(&sc);
        assert!(coin::value(&reclaimed) == 100, 3);
        coin::burn_for_testing(reclaimed);
    };

    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: cannot claim before the campaign is resolved (still FUNDING) ===

#[test]
#[expected_failure(abort_code = backstop::campaign::ENotFailed)]
fun test_cannot_claim_before_resolve() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(200, ctx);
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let mut receipt = ts::take_from_sender<Pledge>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::claim_refund<TEST_USDC>(&mut camp, &mut receipt, ctx); // aborts ENotFailed
        ts::return_to_sender(&sc, receipt);
        ts::return_shared(camp);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: cannot resolve before the deadline ===

#[test]
#[expected_failure(abort_code = backstop::campaign::EDeadlineNotReached)]
fun test_cannot_resolve_before_deadline() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };
    // still at T0 < DEADLINE
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk); // aborts EDeadlineNotReached
        ts::return_shared(camp);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: a Pledge can only be claimed once ===

#[test]
#[expected_failure(abort_code = backstop::campaign::EAlreadyClaimed)]
fun test_cannot_claim_twice() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(500, ctx);
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx);
        ts::return_shared(camp);
    };
    clock::set_for_testing(&mut clk, AFTER);
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let mut receipt = ts::take_from_sender<Pledge>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::claim_refund<TEST_USDC>(&mut camp, &mut receipt, ctx); // ok
        campaign::claim_refund<TEST_USDC>(&mut camp, &mut receipt, ctx); // aborts EAlreadyClaimed
        ts::return_to_sender(&sc, receipt);
        ts::return_shared(camp);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: cannot pledge after the deadline ===

#[test]
#[expected_failure(abort_code = backstop::campaign::EDeadlinePassed)]
fun test_cannot_pledge_after_deadline() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };
    clock::set_for_testing(&mut clk, AFTER); // past deadline
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(200, ctx);
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx); // aborts EDeadlinePassed
        ts::return_shared(camp);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: pledging after resolution is rejected (status no longer FUNDING) ===

#[test]
#[expected_failure(abort_code = backstop::campaign::ENotFunding)]
fun test_cannot_pledge_after_resolved() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };
    clock::set_for_testing(&mut clk, AFTER);
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(200, ctx);
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx); // aborts ENotFunding
        ts::return_shared(camp);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: only the creator can withdraw on success ===

#[test]
#[expected_failure(abort_code = backstop::campaign::ENotCreator)]
fun test_only_creator_withdraws() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(500, DEADLINE, bonus, &clk, ctx);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(600, ctx);
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx);
        ts::return_shared(camp);
    };
    clock::set_for_testing(&mut clk, AFTER);
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk);
        ts::return_shared(camp);
    };
    // ALICE (a backer, not the creator) attempts to withdraw
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::creator_withdraw<TEST_USDC>(&mut camp, ctx); // aborts ENotCreator
        ts::return_shared(camp);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: creator cannot withdraw on a failed campaign ===

#[test]
#[expected_failure(abort_code = backstop::campaign::ENotSucceeded)]
fun test_cannot_withdraw_on_failure() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };
    ts::next_tx(&mut sc, ALICE);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        let pay = mint(200, ctx); // under target
        campaign::pledge<TEST_USDC>(&mut camp, pay, &clk, ctx);
        ts::return_shared(camp);
    };
    clock::set_for_testing(&mut clk, AFTER);
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, CREATOR);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::creator_withdraw<TEST_USDC>(&mut camp, ctx); // aborts ENotSucceeded
        ts::return_shared(camp);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: zero-backer reclaim is idempotent (cannot reclaim twice) ===

#[test]
#[expected_failure(abort_code = backstop::campaign::EAlreadyWithdrawn)]
fun test_cannot_reclaim_twice() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);

    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        campaign::create_campaign<TEST_USDC>(1000, DEADLINE, bonus, &clk, ctx);
    };
    clock::set_for_testing(&mut clk, AFTER);
    ts::next_tx(&mut sc, RANDO);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        campaign::resolve<TEST_USDC>(&mut camp, &clk);
        ts::return_shared(camp);
    };
    ts::next_tx(&mut sc, CREATOR);
    {
        let mut camp = ts::take_shared<Campaign<TEST_USDC>>(&sc);
        let ctx = ts::ctx(&mut sc);
        campaign::creator_reclaim<TEST_USDC>(&mut camp, ctx); // ok
        campaign::creator_reclaim<TEST_USDC>(&mut camp, ctx); // aborts EAlreadyWithdrawn
        ts::return_shared(camp);
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}

// === Guard: creation rejects a deadline that is already in the past ===

#[test]
#[expected_failure(abort_code = backstop::campaign::EDeadlineInPast)]
fun test_create_rejects_past_deadline() {
    let mut sc = ts::begin(CREATOR);
    let mut clk = clock::create_for_testing(ts::ctx(&mut sc));
    clock::set_for_testing(&mut clk, T0);
    {
        let ctx = ts::ctx(&mut sc);
        let bonus = mint(100, ctx);
        // deadline 500 < now 1000
        campaign::create_campaign<TEST_USDC>(1000, 500, bonus, &clk, ctx); // aborts EDeadlineInPast
    };
    clock::destroy_for_testing(clk);
    ts::end(sc);
}
