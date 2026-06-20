import {
  ConnectButton,
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
  useCurrentAccount,
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import '@mysten/dapp-kit/dist/index.css';
import './styles.css';
import { IS_DEPLOYED, NETWORK } from './config';
import { CreateCampaign } from './components/CreateCampaign';
import { CampaignList } from './components/CampaignList';
import { CampaignDetail } from './components/CampaignDetail';

// Provider tree 順序：Query -> SuiClient -> Wallet（不可顛倒）
const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' },
});

function Inner() {
  const account = useCurrentAccount();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo">◢◣</span>
          <div>
            <h1>Backstop</h1>
            <p className="tag">Crowdfunding where backing a failed campaign pays you back &mdash; with a bonus.</p>
          </div>
        </div>
        <ConnectButton />
      </header>

      {!IS_DEPLOYED && (
        <div className="banner warn">
          No package id configured. Publish the Move package and set <code>VITE_PACKAGE_ID</code> in{' '}
          <code>frontend/.env</code>, then restart the dev server.
        </div>
      )}

      {!account ? (
        <section className="hero">
          <h2>The dominant assurance contract, on Sui.</h2>
          <p className="muted">
            A centralized platform can't credibly promise &ldquo;I'll pay you if I fail.&rdquo; An on-chain escrow can:
            the bonus is locked before anyone pledges, settlement is atomic, and anyone can trigger it.
          </p>
          <ConnectButton />
        </section>
      ) : selected ? (
        <CampaignDetail id={selected} onBack={() => setSelected(null)} />
      ) : (
        <main className="main-grid">
          <CreateCampaign />
          <section>
            <h2>Live campaigns</h2>
            <CampaignList onSelect={setSelected} />
          </section>
        </main>
      )}

      <footer className="foot muted">
        Sui Overflow 2026 &middot; DeFi &amp; Payments &middot; network: {NETWORK}
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <Inner />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
