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

function Mark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" fill="#fff" fillOpacity="0.95" />
        <path
          d="M9 12l2 2 4-4"
          stroke="#5b5bd6"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Inner() {
  const account = useCurrentAccount();
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <div>
            <h1>Backstop</h1>
            <p className="tag">Crowdfunding where backing a failed campaign pays you back.</p>
          </div>
        </div>
        <div className="connect-slot">
          <ConnectButton />
        </div>
      </header>

      {!IS_DEPLOYED && (
        <div className="banner">
          No package id configured. Set <code>VITE_PACKAGE_ID</code> in <code>frontend/.env</code> and restart the dev
          server.
        </div>
      )}

      {selected ? (
        <CampaignDetail id={selected} onBack={() => setSelected(null)} />
      ) : account ? (
        <main className="main-grid">
          <CreateCampaign />
          <CampaignList onSelect={setSelected} />
        </main>
      ) : (
        <>
          <section className="hero">
            <span className="eyebrow">Dominant assurance contract · on Sui</span>
            <h2>Back a campaign. If it fails, you come out ahead.</h2>
            <p>
              The creator locks a refund bonus before anyone pledges. Hit the target and they get funded; miss it and
              every backer reclaims their pledge plus a share of the bonus. A centralized platform can&rsquo;t credibly
              promise that &mdash; an on-chain escrow can.
            </p>
            <div className="connect-cta">
              <ConnectButton />
            </div>
          </section>
          <CampaignList onSelect={setSelected} />
        </>
      )}

      <footer className="foot">Sui Overflow 2026 · DeFi &amp; Payments · {NETWORK}</footer>
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
