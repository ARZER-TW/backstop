import { createContext, useContext, useState, type ReactNode } from 'react';

export type Lang = 'en' | 'zh';

export type TFunc = (en: string, vars?: Record<string, string | number>) => string;

const STORAGE_KEY = 'backstop-lang';

/* ---------------------------------------------------------------------------
   Traditional Chinese (繁體中文) translations, keyed by the EXACT English
   source string passed to t(). Punctuation and {placeholders} match verbatim.
   A few values are intentionally empty strings: their meaning is folded into
   the adjacent translated fragment (English keeps the word, Chinese drops it).
   ------------------------------------------------------------------------- */
const ZH: Record<string, string> = {
  // ---- Nav / topbar ----
  Browse: '瀏覽',
  Launch: '發起',
  Portfolio: '我的支持',
  'Connect Wallet': '連接錢包',

  // ---- Hero ----
  'Back a campaign. If it ': '支持一個募資案。就算',
  fails: '失敗',
  ', you come out ahead.': '，你也賺。',
  'Backstop is a dominant assurance contract on Sui. A creator locks a refund bonus before anyone pledges; miss the target and every backer reclaims their pledge ':
    'Backstop 是 Sui 上的優勢保證合約。發起人在任何人贊助之前，就先鎖定一筆退款獎金；只要沒達到目標，每位支持者都能取回自己的贊助，',
  plus: '外加',
  ' a share of that bonus. A platform can only promise that — an on-chain escrow proves it.':
    '分得那筆獎金的一份。平台只能空口承諾，而鏈上託管能證明這一切。',

  // ---- CTAs ----
  'Browse campaigns': '瀏覽募資案',
  'Launch a campaign': '發起一個募資案',
  'Browse freely — a wallet is only needed to pledge or launch.': '自由瀏覽 — 只有在贊助或發起時才需要錢包。',

  // ---- How it works ----
  'The creator locks a bonus': '發起人鎖定一筆獎金',
  'Before any pledge, the creator escrows a refund bonus they forfeit to backers if the target is missed.':
    '在任何贊助之前，發起人先把一筆退款獎金鎖入託管；若沒達標，這筆獎金就讓給支持者。',
  'Backers pledge into escrow': '支持者把贊助存入託管',
  'Funds sit in the contract, not the creator’s wallet. Backer count and momentum stay visible to everyone.':
    '資金存在合約裡，而不是發起人的錢包。支持人數與募資動能所有人都看得到。',
  'The deadline settles it': '截止時間決定結果',
  'Hit the target and the creator is funded. Miss it and every backer reclaims their pledge plus a bonus share.':
    '達到目標，發起人就獲得撥款。沒達到，每位支持者都能取回自己的贊助，外加一份獎金。',

  // ---- Back link ----
  'All campaigns': '所有募資案',

  // ---- LaunchGate ----
  'Connect a wallet to lock a bonus and open your campaign for pledges.':
    '連接錢包以鎖定獎金，並開放你的募資案接受贊助。',

  // ---- Portfolio state labels ----
  Unknown: '未知',
  Claimed: '已領取',
  'Claim now': '立即領取',
  Funded: '已撥款',
  Funding: '募資中',

  // ---- Portfolio ----
  'Your portfolio': '我的支持',
  'Connect a wallet to see the campaigns you’ve backed and any funds you can claim.':
    '連接錢包，查看你支持過的募資案，以及任何可領取的資金。',
  'Pledges you hold and funds you can claim back.': '你持有的贊助，以及可以取回的資金。',
  'Claimable now': '目前可領取',
  '{count} {pledgeWord} across {campaignCount} {campaignWord}': '{count} {pledgeWord}，分布於 {campaignCount} {campaignWord}',
  pledge: '筆贊助',
  pledges: '筆贊助',
  campaign: '個募資案',
  campaigns: '個募資案',
  'No pledges yet': '還沒有任何贊助',
  'Back a campaign and it shows up here. If one you backed misses its target, your claimable refund and bonus appear at the top.':
    '支持一個募資案，它就會出現在這裡。如果你支持的募資案沒達標，可領取的退款與獎金會顯示在最上方。',
  'Pledged {amount} · {id}': '已贊助 {amount} · {id}',

  // ---- Dev banner ----
  'No package id configured. Set ': '尚未設定 package id。請設定 ',
  ' in ': '，位置在 ',
  ' and restart the dev server.': '，然後重啟開發伺服器。',

  // ---- Footer ----
  'Backstop — dominant assurance crowdfunding, settled on-chain.': 'Backstop — 優勢保證群眾募資，鏈上結算。',
  Contract: '合約',

  // ---- Campaign list ----
  Campaigns: '募資案',
  'Back one before its deadline. If it misses, you reclaim your pledge plus a cut of the bonus.':
    '在截止前支持一個。如果沒達標，你能取回贊助，外加一份獎金。',
  'No campaigns yet': '還沒有任何募資案',
  'Every campaign locks a refund bonus before the first pledge. Hit the target and the creator gets funded; miss it and backers split the bonus — so being early is rewarded either way.':
    '每個募資案都會在第一筆贊助之前先鎖定退款獎金。達到目標，發起人就獲得撥款；沒達到，支持者就瓜分獎金 — 所以越早參與，怎樣都有回報。',
  'Launch the first campaign': '發起第一個募資案',
  '{amount} refund bonus locked in escrow.': '已將 {amount} 退款獎金鎖入鏈上託管。',
  'Implied return if the campaign fails — a current estimate that dilutes as more is pledged':
    '募資案失敗時的隱含回報 — 目前的估計值，隨著更多人贊助而稀釋',
  'First backer': '第一個支持者',
  '{pct}% of {target}': '目標 {target} 的 {pct}%',
  backer: '位支持者',
  backers: '位支持者',

  // ---- Countdown (formatCountdown) ----
  'deadline passed': '已截止',
  '{d}d {h}h left': '剩 {d} 天 {h} 小時',
  '{h}h {m}m left': '剩 {h} 小時 {m} 分',
  '{m}m {sec}s left': '剩 {m} 分 {sec} 秒',
  '{sec}s left': '剩 {sec} 秒',

  // ---- Status labels (statusLabel) ----
  Succeeded: '已成功',
  Failed: '已失敗',

  // ---- Create campaign: done ----
  'Campaign launched': '募資案已發起',
  'Your bonus is locked in escrow': '你的獎金已鎖入鏈上託管',
  'Backers can now pledge until ': '支持者現在可以贊助，直到 ',
  '. Share the campaign so being early pays off — if it misses {target}, your {bonus} bonus is split among them.':
    '。把募資案分享出去，越早參與越划算 — 如果沒達到 {target}，你的 {bonus} 獎金就會分給他們。',

  // ---- Create campaign: form ----
  'Lock a refund bonus up front. If the campaign misses its target, backers split that bonus — which is what makes pledging early the rational move, not a leap of faith.':
    '先鎖定一筆退款獎金。如果募資案沒達標，支持者就瓜分這筆獎金 — 這正是讓「早點贊助」變成理性選擇、而非盲目信任的關鍵。',
  'Funding target': '募資目標',
  'The amount backers must collectively reach by the deadline.': '支持者必須在截止前共同達到的金額。',
  'Refund bonus': '退款獎金',
  'leaves your wallet now': '現在就從你的錢包扣除',
  'Escrowed at launch. Paid to backers only if the campaign fails; returned to you if it succeeds.':
    '在發起時鎖入託管。只有在募資失敗時才付給支持者；成功則退還給你。',
  Deadline: '截止時間',
  'Ends {date}': '結束於 {date}',
  '{d} days': '{d} 天',
  'Pick a date in the future.': '請選擇未來的日期。',
  min: '分鐘',
  'Use a short demo timer (minutes) instead of a date': '改用短時間的展示計時器（分鐘），而非日期',
  'Terms preview': '條款預覽',
  'plus gas leaves your wallet now and is locked in escrow as the bonus.':
    '加上 gas 會立即從你的錢包扣除，並鎖入鏈上託管作為獎金。',
  'Backers have until ': '支持者必須在 ',
  ' to reach ': ' 之前達到 ',
  '.': '。',
  'If they ': '如果他們',
  miss: '沒達標',
  ' it, your {bonus} is split among backers pro-rata — your downside is their reward for going first.':
    '，你的 {bonus} 就會按比例分給支持者 — 你的損失就是他們率先參與的回報。',
  hit: '達標',
  ' it, you receive the raised {target} and your bonus returns to you.':
    '，你就會收到募得的 {target}，你的獎金也會退還給你。',
  'Locking bonus…': '鎖定獎金中…',
  'Launch & lock bonus': '發起並鎖定獎金',
  'Set a funding target above 0.': '請設定大於 0 的募資目標。',
  'Lock a bonus above 0 — it’s what makes pledging the rational move.':
    '請鎖定大於 0 的獎金 — 這正是讓贊助變成理性選擇的關鍵。',
  'Enter a duration in minutes above 0.': '請輸入大於 0 的分鐘數。',
  'Pick a deadline in the future.': '請選擇未來的截止時間。',

  // ---- Campaign detail ----
  'Couldn’t load this campaign': '無法載入這個募資案',
  'No object found at this id.': '在此 ID 找不到任何物件。',
  '{amount} refund bonus locked in escrow — released to backers if the target is missed.':
    '已將 {amount} 退款獎金鎖入鏈上託管 — 若未達標，將釋出給支持者。',
  raised: '已募集',
  'of ': '目標 ',
  ' target': '',
  'Locked bonus': '已鎖定獎金',
  Backers: '支持者',
  'Time left': '剩餘時間',
  Outcome: '結果',
  'If this campaign fails, you profit': '如果這個募資案失敗，你反而獲利',
  'full bonus': '全額獎金',
  'Backers split the ': '支持者會按比例瓜分這筆 ',
  ' bonus pro-rata, on top of a full refund. That is the return on ': ' 獎金，外加全額退款。這是以',
  'today’s': '今天',
  ' pool — a current estimate that ': '的資金池計算的回報 — 目前的估計值，會隨著更多人贊助而',
  dilutes: '稀釋',
  ' as more is pledged.': '',
  'Be the first backer and the entire ': '當第一個支持者，整筆 ',
  ' bonus is yours if it fails. Your implied return falls as others join.':
    ' 獎金在失敗時都歸你。隨著其他人加入，你的隱含回報會下降。',
  'Back this campaign': '支持這個募資案',
  'Your pledge': '你的贊助',
  'Balance {amount}': '餘額 {amount}',
  Max: '最大',
  'Enter an amount greater than 0.': '請輸入大於 0 的金額。',
  'That’s more than your balance after gas.': '這超過了你扣除 gas 後的餘額。',
  'Your refund if it fails': '失敗時你的退款',
  'Estimated bonus share': '預估獎金分潤',
  'You reclaim on failure': '失敗時你能取回',
  'If it succeeds your pledge funds the project — there is no refund, that’s the point. Your pledge and gas leave your wallet now and are held in escrow until the deadline.':
    '如果成功，你的贊助會用來資助這個專案 — 不會退款，這正是重點所在。你的贊助與 gas 現在就會離開錢包，鎖在託管裡直到截止時間。',
  'Confirming…': '確認中…',
  'Pledge {amount}': '贊助 {amount}',
  'Connect a wallet to pledge.': '連接錢包以進行贊助。',
  'Enter an amount to pledge.': '請輸入要贊助的金額。',
  'Pledge confirmed': '贊助已確認',
  'Your pledge is held in escrow. If the campaign misses its target you can claim it back here, plus your bonus share.':
    '你的贊助已鎖入託管。如果募資案沒達標，你可以在這裡取回，外加你的獎金分潤。',
  'Campaign resolved': '募資案已結算',
  'Settled as succeeded. The creator can now withdraw.': '結算為成功。發起人現在可以提領。',
  'Settled as failed. Backers can now claim their refund plus bonus.': '結算為失敗。支持者現在可以領取退款外加獎金。',
  'Funds withdrawn': '資金已提領',
  'Pledges and your returned bonus are now in your wallet.': '所有贊助與退還給你的獎金現在都在你的錢包裡。',
  'Refund claimed': '退款已領取',
  'Your pledge and bonus share are back in your wallet.': '你的贊助與獎金分潤已回到你的錢包。',
  'Bonus reclaimed': '獎金已取回',
  'No one backed this campaign, so your locked bonus returned to you.':
    '沒有人支持這個募資案，所以你鎖定的獎金已退還給你。',
  'Deadline reached': '已到截止時間',
  'Target met.': '已達標。',
  'Resolving funds the creator and returns their bonus. Backers’ pledges become the project’s funding.':
    '結算後將資金撥給發起人，並退還其獎金。支持者的贊助就成為這個專案的資金。',
  'Target missed.': '未達標。',
  'Resolving lets every backer reclaim their pledge plus a share of the {amount} bonus.':
    '結算後，每位支持者都能取回自己的贊助，外加分得 {amount} 獎金的一份。',
  'Settlement is permissionless — anyone can trigger it, and it cannot change the outcome.':
    '結算是無需許可的 — 任何人都能觸發，而且無法改變結果。',
  'Resolving…': '結算中…',
  'Resolve campaign': '結算募資案',
  'Connect a wallet to resolve.': '連接錢包以進行結算。',
  'Campaign succeeded': '募資案成功',
  'Withdraw every pledge plus your returned bonus in one transaction.': '一筆交易提領所有贊助，外加退還給你的獎金。',
  'Already withdrawn': '已提領',
  'Withdrawing…': '提領中…',
  'Withdraw {amount}': '提領 {amount}',
  'Campaign funded': '募資案已成功撥款',
  'This campaign hit its target, so pledges funded {title} and the bonus returned to the creator. A successful campaign has nothing to claim — that’s the intended outcome.':
    '這個募資案達到了目標，所以贊助資助了 {title}，獎金也退還給發起人。成功的募資案沒有東西可領 — 這正是預期的結果。',
  'Campaign failed — claim your refund + bonus': '募資失敗 — 領取你的退款 + 獎金',
  'Connect the wallet you pledged with to claim.': '連接你當初贊助時使用的錢包以領取。',
  'No pledge receipts found in this wallet for this campaign.': '在這個錢包裡找不到這個募資案的贊助憑證。',
  '{refund} refund + {bonus} bonus · ': '{refund} 退款 + {bonus} 獎金 · ',
  'Claiming…': '領取中…',
  Claim: '領取',
  'Reclaiming…': '取回中…',
  'Reclaim your {amount} bonus': '取回你的 {amount} 獎金',
  'View campaign on explorer': '在區塊鏈瀏覽器查看募資案',

  // ---- Trust block ----
  'How your money is protected': '你的資金如何受到保護',
  'Pledges sit in on-chain escrow': '贊助存放在鏈上託管',
  'Held by the contract, not the creator. They can’t be touched unless the target is met by the deadline.':
    '由合約持有，而非發起人。除非在截止前達到目標，否則這些資金動不了。',
  'The bonus was locked at launch': '獎金在發起時就已鎖定',
  'was escrowed when this campaign was created, and can only pay out to backers on failure.':
    '在募資案建立時就已鎖入託管，只有在失敗時才會撥付給支持者。',
  'Settlement is permissionless': '結算無需許可',
  'Anyone can resolve after the deadline. The outcome is fixed by the numbers — the creator can’t stall or override it.':
    '截止後任何人都能結算。結果由數字決定 — 發起人無法拖延或推翻。',
  'Campaign object': '募資案物件',
  'Locked bonus (verifiable)': '已鎖定獎金（可驗證）',
  Creator: '發起人',
  ' · you': ' · 你',
  Package: '套件',

  // ---- aria-labels / copy ----
  'View on explorer': '在區塊鏈瀏覽器查看',
  'View campaign object on explorer': '在區塊鏈瀏覽器查看募資案物件',
  'View creator on explorer': '在區塊鏈瀏覽器查看發起人',
  'View package on explorer': '在區塊鏈瀏覽器查看套件',
  'Copy {label}': '複製 {label}',
  'campaign id': '募資案 ID',

  // ---- Transaction errors (mapTxError) ----
  'You declined the transaction.': '你拒絕了這筆交易。',
  'Nothing moved. Approve it in your wallet when you’re ready.': '沒有任何變動。準備好後在錢包中批准即可。',
  'Not enough SUI to cover this plus gas.': 'SUI 不足以支付這筆金額加上 gas。',
  'Top up your wallet or lower the amount, then retry.': '請為錢包儲值或降低金額，然後重試。',
  'The escrow contract rejected this action.': '託管合約拒絕了這個操作。',
  'The campaign state likely changed — refresh and re-check the deadline and status.':
    '募資案的狀態可能已改變 — 請重新整理並重新確認截止時間與狀態。',
  'This campaign changed on-chain while you were acting.': '在你操作時，這個募資案的鏈上狀態已改變。',
  'Refresh to load the latest state, then try again.': '請重新整理載入最新狀態，然後再試一次。',
  'Transaction failed.': '交易失敗。',
};

function detectInitialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'zh') return stored;
  } catch {
    /* localStorage unavailable (privacy mode / non-browser) */
  }
  try {
    if (navigator.language && navigator.language.toLowerCase().startsWith('zh')) return 'zh';
  } catch {
    /* navigator unavailable */
  }
  return 'en';
}

/** Replace every `{name}` occurrence with its var value (string-coerced). */
function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(String(value));
  }
  return out;
}

interface I18nValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFunc;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => detectInitialLang());

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* persistence is best-effort */
    }
  };

  const t: TFunc = (en, vars) => {
    const base = lang === 'zh' ? ZH[en] ?? en : en;
    return interpolate(base, vars);
  };

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): { lang: Lang; setLang: (l: Lang) => void; t: TFunc } {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
