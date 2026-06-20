import {
  ConnectButton,
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
  useCurrentAccount,
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import '@mysten/dapp-kit/dist/index.css';
import './styles.css';
import { IS_DEPLOYED, NETWORK, PACKAGE_ID } from './config';
import {
  CampaignView,
  PledgeView,
  formatNum,
  getCampaigns,
  getOwnedPledges,
  projectedBonus,
  STATUS,
} from './lib/backstop';
import { COIN_SYMBOL } from './config';
import { CreateCampaign } from './components/CreateCampaign';
import { CampaignList, identity, midId } from './components/CampaignList';
import { CampaignDetail } from './components/CampaignDetail';

const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' },
});

const EXPLORER = `https://suiscan.xyz/${NETWORK}`;
const objUrl = (id: string) => `${EXPLORER}/object/${id}`;

/* ----------------------------- hash routing -----------------------------
   Lightweight, dependency-free. Campaigns become shareable / refreshable /
   deep-linkable, and the browser Back button works. */
type Route = { name: 'home' } | { name: 'launch' } | { name: 'portfolio' } | { name: 'detail'; id: string };

function parseHash(): Route {
  const path = window.location.hash.replace(/^#/, '').replace(/^\//, '');
  if (path.startsWith('campaign/')) {
    const id = path.slice('campaign/'.length);
    if (id) return { name: 'detail', id };
  }
  if (path === 'launch') return { name: 'launch' };
  if (path === 'portfolio') return { name: 'portfolio' };
  return { name: 'home' };
}

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  useEffect(() => {
    if (route.name !== 'home') window.scrollTo({ top: 0 });
  }, [route]);
  return route;
}

function Mark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l7 3v5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z" stroke="rgba(255,255,255,0.85)" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M9 12l2 2 4-4" stroke="rgba(255,255,255,0.85)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function Home({ connected }: { connected: boolean }) {
  return (
    <>
      <section className="hero">
        <h1>
          Back a campaign. If it <span className="em">fails</span>, you come out ahead.
        </h1>
        <p className="hero-lede">
          Backstop is a dominant assurance contract on Sui. A creator locks a refund bonus before anyone pledges; miss the
          target and every backer reclaims their pledge <em>plus</em> a share of that bonus. A platform can only promise
          that — an on-chain escrow proves it.
        </p>
        <div className="cta-row">
          <a className="btn btn--primary btn--lg" href="#campaigns">Browse campaigns</a>
          <a className="btn btn--secondary btn--lg" href="#/launch">Launch a campaign</a>
        </div>
        {!connected && <p className="hero-note">Browse freely — a wallet is only needed to pledge or launch.</p>}
      </section>

      <div className="how">
        <div className="how-step">
          <span className="how-num">1</span>
          <h4>The creator locks a bonus</h4>
          <p>Before any pledge, the creator escrows a refund bonus they forfeit to backers if the target is missed.</p>
        </div>
        <div className="how-step">
          <span className="how-num">2</span>
          <h4>Backers pledge into escrow</h4>
          <p>Funds sit in the contract, not the creator’s wallet. Backer count and momentum stay visible to everyone.</p>
        </div>
        <div className="how-step">
          <span className="how-num">3</span>
          <h4>The deadline settles it</h4>
          <p>Hit the target and the creator is funded. Miss it and every backer reclaims their pledge plus a bonus share.</p>
        </div>
      </div>

      <div id="campaigns">
        <CampaignList />
      </div>
    </>
  );
}

function LaunchGate() {
  return (
    <div className="detail">
      <a className="back" href="#/">&larr; All campaigns</a>
      <div className="card card--primary">
        <h3>Launch a campaign</h3>
        <p className="helper">Connect a wallet to lock a bonus and open your campaign for pledges.</p>
        <div className="gate">
          <div className="connect-cta"><ConnectButton /></div>
        </div>
      </div>
    </div>
  );
}

function pfState(c: CampaignView | undefined, p: PledgeView): { label: string; tone: 'ok' | 'live' | 'neutral'; amount: bigint; gain: boolean } {
  if (!c) return { label: 'Unknown', tone: 'neutral', amount: p.amount, gain: false };
  if (c.status === STATUS.FAILED) {
    if (p.claimed) return { label: 'Claimed', tone: 'ok', amount: p.amount, gain: false };
    return { label: 'Claim now', tone: 'ok', amount: p.amount + projectedBonus(c, p.amount), gain: true };
  }
  if (c.status === STATUS.SUCCEEDED) return { label: 'Funded', tone: 'neutral', amount: p.amount, gain: false };
  return { label: 'Funding', tone: 'live', amount: p.amount, gain: false };
}

function Portfolio() {
  const account = useCurrentAccount();
  const campaignsQ = useQuery({ queryKey: ['campaigns'], queryFn: () => getCampaigns() });
  const pledgesQ = useQuery({
    queryKey: ['pledges', 'all', account?.address],
    queryFn: () => getOwnedPledges(account!.address),
    enabled: !!account,
  });

  if (!account) {
    return (
      <section className="detail">
        <div className="card card--primary">
          <h3>Your portfolio</h3>
          <p className="helper">Connect a wallet to see the campaigns you’ve backed and any funds you can claim.</p>
          <div className="gate"><div className="connect-cta"><ConnectButton /></div></div>
        </div>
      </section>
    );
  }

  const loading = campaignsQ.isLoading || pledgesQ.isLoading;
  const byId = new Map((campaignsQ.data ?? []).map((c) => [c.id, c]));
  const pledges = pledgesQ.data ?? [];
  const rows = pledges.map((p) => ({ p, c: byId.get(p.campaign), s: pfState(byId.get(p.campaign), p) }));
  const claimable = rows.reduce((sum, r) => (r.s.label === 'Claim now' ? sum + r.s.amount : sum), 0n);
  const campaignCount = new Set(pledges.map((p) => p.campaign)).size;

  return (
    <section className="detail">
      <div className="section-head">
        <div>
          <h2>Your portfolio</h2>
          <p className="section-sub">Pledges you hold and funds you can claim back.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
        <div className="pf-summary">
          <div className={`pf-claim${claimable === 0n ? ' none' : ''}`}>
            <div className="cap">Claimable now</div>
            <span className="money">
              <span className="fig">{formatNum(claimable)}</span>
              <span className="unit">{COIN_SYMBOL}</span>
            </span>
          </div>
          <div className="muted small" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {pledges.length} {pledges.length === 1 ? 'pledge' : 'pledges'} across {campaignCount}{' '}
            {campaignCount === 1 ? 'campaign' : 'campaigns'}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="pf-list">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="pf-item">
              <div className="pf-item-main" style={{ flex: 1 }}>
                <div className="skel skel-line" style={{ width: '40%', marginBottom: '8px' }} />
                <div className="skel skel-line sm" style={{ width: '60%' }} />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="empty">
          <div className="empty-title">No pledges yet</div>
          <p className="empty-body">Back a campaign and it shows up here. If one you backed misses its target, your claimable refund and bonus appear at the top.</p>
          <a className="btn btn--secondary" href="#/">Browse campaigns</a>
        </div>
      ) : (
        <div className="pf-list">
          {rows.map(({ p, s }) => (
            <a key={p.id} className="pf-item" href={`#/campaign/${p.campaign}`}>
              <div className="pf-item-main">
                <div className="ttl">{identity(p.campaign).title}</div>
                <div className="sub">Pledged {formatNum(p.amount)} {COIN_SYMBOL} · {midId(p.campaign)}</div>
              </div>
              <div className="pf-item-right">
                <span className={`money${s.gain ? ' gain' : ''}`}>
                  <span className="fig">{formatNum(s.amount)}</span>
                  <span className="unit">{COIN_SYMBOL}</span>
                </span>
                {s.tone === 'neutral' ? (
                  <span className="ret muted">{s.label}</span>
                ) : (
                  <span className={`badge badge--${s.tone}`}>
                    <span className="dot" aria-hidden="true" />
                    {s.label}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

function Inner() {
  const account = useCurrentAccount();
  const route = useRoute();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <Mark />
          <span className="brand-name">Backstop</span>
        </div>
        <nav className="nav">
          <a className={`nav-link${route.name === 'home' ? ' active' : ''}`} href="#/">Browse</a>
          <a className={`nav-link is-secondary${route.name === 'launch' ? ' active' : ''}`} href="#/launch">Launch</a>
          {account && (
            <a className={`nav-link${route.name === 'portfolio' ? ' active' : ''}`} href="#/portfolio">Portfolio</a>
          )}
        </nav>
        <span className="spacer" />
        <div className="connect-slot">
          <ConnectButton />
        </div>
      </header>

      {!IS_DEPLOYED && (
        <div className="banner">
          No package id configured. Set <code>VITE_PACKAGE_ID</code> in <code>frontend/.env</code> and restart the dev server.
        </div>
      )}

      <main>
        {route.name === 'detail' ? (
          <CampaignDetail id={route.id} />
        ) : route.name === 'launch' ? (
          account ? <CreateCampaign /> : <LaunchGate />
        ) : route.name === 'portfolio' ? (
          <Portfolio />
        ) : (
          <Home connected={!!account} />
        )}
      </main>

      <footer className="foot">
        <span>Backstop — dominant assurance crowdfunding, settled on-chain.</span>
        <span className="row" style={{ gap: 'var(--sp-3)' }}>
          <a href={objUrl(PACKAGE_ID)} target="_blank" rel="noreferrer">Contract</a>
          <span className="net-pill"><span className="dot" />{NETWORK}</span>
        </span>
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
