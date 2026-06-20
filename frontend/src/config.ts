export type Network = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

export const NETWORK: Network = (import.meta.env.VITE_NETWORK as Network) ?? 'testnet';

/**
 * Published `backstop` package id. Defaults to the live testnet deployment so a fresh
 * clone works out of the box; override with `VITE_PACKAGE_ID` to point at your own.
 */
export const PACKAGE_ID: string =
  import.meta.env.VITE_PACKAGE_ID ?? '0x4f47075009cf926686511631f03102e7c65b09c3a0477c36d1406a1034a7f024';

/**
 * The coin type bound to `Campaign<T>`. Defaults to SUI so the live demo needs only
 * the faucet (no USDC acquisition). Swap to the testnet USDC type for the USDC story:
 *   VITE_COIN_TYPE=0x...::usdc::USDC  VITE_COIN_SYMBOL=USDC  VITE_COIN_DECIMALS=6
 */
export const COIN_TYPE: string = import.meta.env.VITE_COIN_TYPE ?? '0x2::sui::SUI';
export const COIN_SYMBOL: string = import.meta.env.VITE_COIN_SYMBOL ?? 'SUI';
export const COIN_DECIMALS: number = Number(import.meta.env.VITE_COIN_DECIMALS ?? 9);

export const IS_DEPLOYED = PACKAGE_ID !== '0x0' && PACKAGE_ID.length > 3;
