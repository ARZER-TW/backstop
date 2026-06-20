# backstop

> 此檔由 `/sui-init-project` 產生。專案層守則優先於 `~/.claude/rules/sui-stack.md`。

## Project type

Hybrid (Move package + TS SDK + React dApp). Backstop is a Dominant Assurance
Contract (DAC) crowdfunding protocol — Sui Overflow 2026 DeFi & Payments entry.

## Deployment (testnet)

| Item | Value |
|------|-------|
| Package ID | `0x4f47075009cf926686511631f03102e7c65b09c3a0477c36d1406a1034a7f024` |
| Module | `campaign` |
| UpgradeCap | `0x67d2a63298948adb6da36be08a50e9b97fe68b501e25c103a57a15d97c5363b8` |
| Publish digest | `AUzo6Wn5CF1jgxBtWM3Wq2PQZ4G1gk5YiPVvZ7ozNduu` |
| Deployer | `0x10d607a8db16ad791595e1010a5c97f5eb8578852599ff5b8c22f37a40ebc61b` |

Frontend reads `VITE_PACKAGE_ID` from `frontend/.env`. Default coin type `0x2::sui::SUI`.

## Sui stack used

打勾本專案實際依賴的模組（影響 Claude 該 grep 哪些 vendor）：

- [x] sui-framework            (Move standard library)
- [ ] sui-rust-sdk             (`sui-sdk` Rust crate)
- [x] sui-ts-sdk               (`@mysten/sui` npm package)
- [ ] sui-cryptography         (bls12381 / ed25519 / ristretto255 / etc.)
- [ ] deepbook-v3              (DEX / order book)
- [ ] walrus                   (decentralized blob storage)
- [ ] seal                     (threshold IBE)
- [ ] nautilus                 (TEE / Nitro enclave)
- [ ] zk (groth16/bulletproofs)

## Pinned versions

<!-- SUI-PINNED-VERSIONS:BEGIN -->
**Pinned versions** (as of 2026-06-20, network: `testnet`)

| Component | Track | Ref | Commit |
|-----------|-------|-----|--------|
| Sui Framework | testnet | `tags/testnet-v1.71.0` | `a3cc4467c9de` |
| Sui CLI       | testnet | `suiup default set sui@testnet` | `sui 1.71.0-a3cc4467c9de` |

Vendor 路徑（透過 `vendor/` symlink 連到 `~/sui-stack-vendor/`）：
- `vendor/sui` → `~/sui-stack-vendor/sui-testnet`

_由 `/sui-pin-versions` 維護，請勿手改此區塊。_
<!-- SUI-PINNED-VERSIONS:END -->

額外手動鎖定的 deps（如 walrus contract version、specific seal commit）放在這之後。

## Vendor symlinks

本專案在 `vendor/` 下軟連結到 `~/sui-stack-vendor/` 對應軌：

```
vendor/sui      → ~/sui-stack-vendor/sui-testnet
vendor/seal     → ~/sui-stack-vendor/seal       (if used)
vendor/walrus   → ~/sui-stack-vendor/walrus     (if used)
vendor/deepbook → ~/sui-stack-vendor/deepbookv3 (if used)
vendor/nautilus → ~/sui-stack-vendor/nautilus   (if used)
```

切版本：`/sui-pin-versions` 會更新本檔的 commit hash 並重建 symlink。

## Build commands

```bash
# Move
cd move/backstop && sui move build
cd move/backstop && sui move test          # 12 tests, all green

# SDK
cd sdk && ./node_modules/.bin/tsc -p tsconfig.json --noEmit

# Frontend
cd frontend && ./node_modules/.bin/vite build   # or `pnpm dev`
```

> 注意：`pnpm run <script>` 在此環境會被前置 deps-check（esbuild ignored build）擋下，
> 直接呼叫 `./node_modules/.bin/<tool>` 繞過。

## Domain knowledge / project invariants

合約 `backstop::campaign`（`Campaign<phantom T>` shared escrow + `Pledge` 收據）。
動任何合約/SDK/前端前，必守以下 money-safety 不變量（已被 12 個 Move 測試 + 對抗審查驗證）：

- **守恆**：`pledged + bonus` 最終全數分配；pledged 退完歸零、bonus 由最後 claimer 掃 dust 歸零。
- **無雙重支付**：每個 Pledge 靠 `claimed` flag 只領一次；creator_withdraw / creator_reclaim 有 `EAlreadyWithdrawn` idempotency guard。
- **時序**：deadline 後不能 pledge、deadline 前不能 resolve、resolve 前不能 claim（靠 status + clock）。
- **權限**：resolve 是 permissionless；withdraw/reclaim 限 creator。
- **pro-rata**：`floor(bonus_total * amount / total_pledged)`，u128 計算防溢位。

兩個刻意的實作選擇（偏離原 spec 字面，勿「修正」）：
1. 泛型 `Campaign<phantom T>` 而非寫死 USDC（前端用 type arg 指定 coin）。
2. `claim_refund` 收 `&mut Pledge` + 翻 `claimed` flag，不 by-value 消耗（為了 `claimed` 欄位語意 + 重複-claim 測試）。

已知 cosmetic：`sui client publish`（無 lint 模式）會對 `#[allow(lint(self_transfer))]` 報 W10007，不影響 bytecode。

## Hook behavior

PostToolUse hook (`~/.claude/hooks/sui/post-edit-move.sh`) 在編輯本專案 .move 檔時自動跑 `sui move build`。
- 暫時關閉本次編輯：`export CLAUDE_SUI_HOOK_BUILD=0`
- 永久關閉本專案：`touch .claude/sui-hooks-off`

## References (project-internal)

{{INTERNAL_DOCS}}
<!-- e.g. links to docs/SPEC.md, docs/ARCHITECTURE.md -->

## References (external)

- 全域 Sui 守則：`~/.claude/rules/sui-stack.md`
- 操作手冊：`~/.claude/skills/sui-stack-meta/SKILL.md`
- Vendor 索引：`~/sui-stack-vendor/STATUS.md`
