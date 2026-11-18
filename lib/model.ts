// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every protocol that records no token and is not a wrapped, staked or bridged
// product of one that trades: the snapshot's whole watchlist (the floor) plus every other pre-token
// protocol the same visible rule admits (the early rows the radar exists to find). Protocols whose
// token already trades are kept apart and shown at the market's own values, never ranked by a model.
//
// Implied value is a comparables model, built only from the snapshot's own figures:
//
//   multiple   the mcap/TVL multiple of the protocols that DO trade, per category: the category's
//              median multiple, shrunk toward the global median by the peer count (k = 4), then
//              clamped to [0.02, 2.5] so one wild peer cannot carry a category
//   growth     1 + clamp(change_7d, -40, 80) / 100 x 0.6     (unreported growth counts as 0)
//   age        0.75 + 0.5 x min(age_days, 1460) / 1460       (an unlisted age counts as 365 days)
//   reach      1 + 0.04 x min(chains - 1, 5)                  (more chains, wider distribution)
//   discount   0.6: a token that does not exist yet prices below the established-peer median
//   implied    = round(tvl_usd x multiple x growth x age x reach x discount), at least $1
//
// Every factor of every row is written into board.json and shown in the dashboard's detail view,
// with the category's trading peers beside it. No protocol name is ever special-cased.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  shrinkage_k: number;
  multiple_min: number;
  multiple_max: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  age_floor: number;
  age_range: number;
  age_days_cap: number;
  unknown_age_days: number;
  chain_step: number;
  chain_max_extra: number;
  launch_discount: number;
}

export const MODEL: ModelConstants = {
  shrinkage_k: 4,
  multiple_min: 0.02,
  multiple_max: 2.5,
  growth_weight: 0.6,
  growth_floor: -40,
  growth_cap: 80,
  age_floor: 0.75,
  age_range: 0.5,
  age_days_cap: 1460,
  unknown_age_days: 365,
  chain_step: 0.04,
  chain_max_extra: 5,
  launch_discount: 0.6,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'comps-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 40;

/** One trading peer of a category: the evidence a row's multiple stands on. */
export interface Peer {
  name: string;
  mcap_usd: number;
  tvl_usd: number;
  ratio: number;
}

/** A category's multiple: its peers, their median, and the shrunk multiple the model uses. */
export interface CategoryMultiple {
  category: string;
  peers: number;
  median: number;
  multiple: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  watchlist: boolean;
  age_days: number | null;
  implied_value_usd: number;
  model: {
    category_multiple: number;
    category_median: number;
    category_peers: number;
    growth_factor: number;
    age_factor: number;
    chain_factor: number;
    launch_discount: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's view of one row: the board row's figures, its peers and its farm plan. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  implied_value_usd: number;
  category_multiple: number;
  growth_factor: number;
  age_factor: number;
  chain_factor: number;
  peers: Peer[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs: the board, the live set, the multiples and the model. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  global_median: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  scanned_size: number;
  multiples: CategoryMultiple[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const bySlugAsc = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** A whole day count from `listedAt` to `asOf`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Categories that are wrapped, staked or bridged products of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
/** A whole word that marks a wrapped or staked product in a name. */
const PRODUCT_WORD = /\b(wrapped|staked|staking)\b/i;
/** Names that begin with an exchange's name are that exchange's own product. */
const EXCHANGE_HEADS = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/**
 * Whether a protocol is one the board may rank, by the snapshot's visible fields alone: pre-token,
 * not a product category, not a versioned pool, no product word, no exchange head. This is the
 * watchlist's own rule read off the fields the snapshot carries; the watchlist itself is honoured
 * as given, whatever this says.
 */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name) || PRODUCT_WORD.test(p.name)) return false;
  if (EXCHANGE_HEADS.some((e) => p.name.startsWith(e))) return false;
  return true;
}

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The trading comparables: every protocol with a market cap and a TVL to divide it by. */
function comparables(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** The global median mcap/TVL multiple across every comparable in the snapshot. */
export function globalMedian(snapshot: Snapshot): number {
  const comps = comparables(snapshot);
  if (comps.length === 0) return 0;
  return median(comps.map((p) => p.mcap_usd! / p.tvl_usd));
}

/**
 * Every category's multiple: the median mcap/TVL of its trading peers, shrunk toward the global
 * median by the peer count and clamped, so a category with two wild peers lands near the market
 * and a category with twenty stands on its own record.
 */
export function categoryMultiples(snapshot: Snapshot, model: ModelConstants = MODEL): Map<string, CategoryMultiple> {
  const global = globalMedian(snapshot);
  const groups = new Map<string, number[]>();
  for (const p of comparables(snapshot)) {
    const key = p.category ?? '';
    const list = groups.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    groups.set(key, list);
  }
  const out = new Map<string, CategoryMultiple>();
  for (const [category, ratios] of groups) {
    const med = median(ratios);
    const shrunk = (ratios.length * med + model.shrinkage_k * global) / (ratios.length + model.shrinkage_k);
    const multiple = Math.min(model.multiple_max, Math.max(model.multiple_min, shrunk));
    out.set(category, { category, peers: ratios.length, median: round4(med), multiple: round4(multiple) });
  }
  return out;
}

/** A category's top trading peers by market cap, for a row's detail view. */
export function peersOf(snapshot: Snapshot, category: string | null, limit = 4): Peer[] {
  return comparables(snapshot)
    .filter((p) => (p.category ?? '') === (category ?? ''))
    .sort((a, b) => b.mcap_usd! - a.mcap_usd! || bySlugAsc(a.slug, b.slug))
    .slice(0, limit)
    .map((p) => ({ name: p.name, mcap_usd: p.mcap_usd!, tvl_usd: p.tvl_usd, ratio: round4(p.mcap_usd! / p.tvl_usd) }));
}

/** A protocol's factors and implied value under the model. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  multiples: Map<string, CategoryMultiple>,
  global: number,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; median: number; peers: number; growthFactor: number; ageFactor: number; chainFactor: number; age: number | null } {
  const entry = multiples.get(p.category ?? '');
  const multiple = entry?.multiple ?? Math.min(model.multiple_max, Math.max(model.multiple_min, round4(global)));
  const growthRaw = p.change_7d === null ? 0 : Math.min(model.growth_cap, Math.max(model.growth_floor, p.change_7d));
  const growthFactor = 1 + (growthRaw / 100) * model.growth_weight;
  const age = ageDays(asOf, p.listed_at);
  const ageForModel = age ?? model.unknown_age_days;
  const ageFactor = model.age_floor + (Math.min(Math.max(ageForModel, 0), model.age_days_cap) / model.age_days_cap) * model.age_range;
  const chainFactor = 1 + model.chain_step * Math.min(Math.max(p.chains.length - 1, 0), model.chain_max_extra);
  const raw = p.tvl_usd * multiple * growthFactor * ageFactor * chainFactor * model.launch_discount;
  const implied = Math.max(1, Math.min(Math.round(raw), p.tvl_usd * 4));
  return {
    implied,
    multiple,
    median: entry?.median ?? round4(global),
    peers: entry?.peers ?? 0,
    growthFactor: round4(growthFactor),
    ageFactor: round4(ageFactor),
    chainFactor: round4(chainFactor),
    age,
  };
}

// ---------------------------------------------------------------- farm plans

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** What one action costs in gas on a chain, by the chain's fee class. */
interface ChainClass {
  name: string;
  action: string;
  setup: string;
}
const MAINNET: ChainClass = { name: 'Ethereum mainnet', action: '$4 to $12 of gas per action', setup: 'about $10 of ETH for gas' };
const CHEAP: ChainClass = { name: 'low-fee chain', action: 'under $0.50 of gas per action', setup: 'about $2 of the gas token' };
const MID: ChainClass = { name: 'mid-fee chain', action: 'about $1 of gas per action', setup: 'about $3 of the gas token' };
const CHEAP_CHAINS = new Set([
  'Solana', 'Base', 'Arbitrum', 'Optimism', 'Polygon', 'Avalanche', 'Binance', 'Tron', 'Sui', 'Aptos',
  'Near', 'zkSync Era', 'Linea', 'Scroll', 'Mantle', 'Blast', 'Mode', 'Fantom', 'xDai', 'Gnosis',
  'Moonbeam', 'Moonriver', 'Celo', 'Aurora', 'Hyperliquid L1', 'Monad', 'Sonic', 'Berachain', 'Sei',
  'Injective', 'Osmosis', 'Stellar', 'Algorand', 'Hedera', 'TON', 'BSC', 'opBNB', 'Cronos', 'Kava',
  'Metis', 'Boba', 'Zora', 'Taiko', 'Starknet', 'Fuel', 'Eclipse', 'Soon', 'Soneium', 'Unichain',
]);

/** The cheapest chain a protocol runs on, by fee class, and that class. */
function farmChain(p: SnapshotProtocol): { chain: string; cls: ChainClass } {
  let best: { chain: string; cls: ChainClass; rank: number } | null = null;
  for (const chain of p.chains) {
    const cls = chain === 'Ethereum' ? MAINNET : CHEAP_CHAINS.has(chain) ? CHEAP : MID;
    const rank = cls === CHEAP ? 0 : cls === MID ? 1 : 2;
    if (best === null || rank < best.rank) best = { chain, cls, rank };
  }
  return best === null ? { chain: 'its main chain', cls: MID } : { chain: best.chain, cls: best.cls };
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 1_000_000_000) return 500;
  if (p.tvl_usd >= 250_000_000) return 250;
  if (p.tvl_usd >= 50_000_000) return 150;
  if (p.tvl_usd >= 10_000_000) return 75;
  return 40;
}

/** How long to hold, from the protocol's age: younger protocols get the longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 60;
  if (age < 180) return 60;
  if (age < 730) return 45;
  return 30;
}

/**
 * The two core actions of a protocol's plan, from its category: the product's real mechanics, in the
 * words a farmer can follow, naming the protocol and its cheapest chain. `cap` is the capital.
 */
function coreActions(p: SnapshotProtocol, chain: string, cap: number): [string, string] {
  const c = p.category ?? '';
  const n = p.name;
  switch (c) {
    case 'Dexs':
      return [
        `Swap $${cap} between the chain's gas asset and USDC on ${n}'s own app on ${chain}, in both directions, so the trades settle on your wallet.`,
        `Leave $${cap} of liquidity in ${n}'s busiest stablecoin pool on ${chain} and keep the LP position open; volume plus liquidity is what a DEX can measure.`,
      ];
    case 'Lending':
      return [
        `Supply $${cap} of USDC to ${n} on ${chain} as collateral and leave it supplied.`,
        `Borrow about 40% of the supplied value in the same stablecoin, keep the health factor above 2, and repay and re-borrow once mid-season: lenders reward two-sided use.`,
      ];
    case 'CDP':
    case 'CDP Manager':
    case 'Dual-Token Stablecoin':
      return [
        `Deposit $${cap} of collateral into ${n} on ${chain} and mint its stablecoin at a conservative collateral ratio.`,
        `Provide the minted stablecoin to ${n}'s own stability or liquidity pool and keep it there, so both the mint and the pool carry your wallet.`,
      ];
    case 'Yield':
    case 'Yield Aggregator':
    case 'Farm':
    case 'Leveraged Farming':
      return [
        `Deposit $${cap} of USDC into ${n}'s flagship vault on ${chain} and keep the vault shares in the same wallet.`,
        `Put a second, smaller deposit of $${Math.max(25, Math.round(cap / 2))} into a second ${n} vault or strategy, so the wallet shows range, not one lucky click.`,
      ];
    case 'Risk Curators':
    case 'Onchain Capital Allocator':
    case 'Collateral Markets':
    case 'Collateral Management':
      return [
        `Deposit $${cap} of USDC into one curated vault on ${n} (${chain}) and keep the vault shares; curated vaults track depositors closely.`,
        `Split a second deposit of $${Math.max(25, Math.round(cap / 2))} into a vault of a different strategy on ${n}, and rebalance between the two once during the season.`,
      ];
    case 'RWA':
      return [
        `Subscribe $${cap} to ${n}'s yield asset on ${chain}, completing the onboarding the protocol itself asks for, and hold the asset in the subscribing wallet.`,
        `Claim each yield payment on ${n}'s schedule and add one smaller top-up of $${Math.max(25, Math.round(cap / 2))} mid-season, so the record shows a holder, not a passer-by.`,
      ];
    case 'Derivatives':
    case 'Interest Rate Derivatives':
      return [
        `Deposit $${cap} of USDC as margin on ${n} and open one small perpetual position, long or short, sized so a 20% move cannot liquidate it.`,
        `Trade small size on ${n} every week (a few contracts, both directions over the season) and keep the margin account funded: perps venues count consistent traders.`,
      ];
    case 'Options':
    case 'Options Vault':
      return [
        `Deposit $${cap} into ${n}'s main options vault on ${chain} and hold the vault shares for a full epoch.`,
        `Buy one small, cheap option on ${n} itself rather than only vaulting: buyers and vault depositors are different lists.`,
      ];
    case 'Synthetics':
      return [
        `Stake or deposit $${cap} of collateral in ${n} on ${chain} to back its synthetic assets, as its app directs.`,
        `Mint a small amount of ${n}'s main synthetic asset and hold it for the season, then trade it once on the protocol's own market.`,
      ];
    case 'Basis Trading':
    case 'CeDeFi':
      return [
        `Deposit $${cap} of USDC into ${n}'s basis vault on ${chain} and leave it through a full funding epoch.`,
        `Add a second deposit of $${Math.max(25, Math.round(cap / 2))} after the first epoch settles, and withdraw nothing until the season ends.`,
      ];
    case 'Cross Chain Bridge':
    case 'Bridge':
      return [
        `Bridge $${cap} of USDC from Ethereum to ${chain} through ${n}, then use the bridged funds in one app on the far side.`,
        `Bridge a smaller amount back, or bridge to a second destination chain ${n} serves, so the wallet shows two routes rather than one hop.`,
      ];
    case 'Staking Pool':
    case 'Restaking':
      return [
        `Stake $${cap} of the chain's staking asset through ${n} on ${chain} and keep the receipt token in the staking wallet.`,
        `Where ${n} offers a second product for the receipt (a restaking or vault step), put half the receipt in and keep the rest staked plain.`,
      ];
    case 'Chain':
      return [
        `Bridge $${cap} to ${n}'s chain and make it your active wallet there: a first swap, a first transfer and one native app used in week one.`,
        `Transact on ${n}'s chain every week (swaps, a mint, a small payment) across at least three native apps, so the wallet reads as a resident, not a tourist.`,
      ];
    case 'Prediction Market':
      return [
        `Fund $${cap} on ${n} and take positions in at least five different markets, sized small, including one you hold to resolution.`,
        `Add a standing order or a second position each week; prediction venues count resolved markets and repeat traders, not one big bet.`,
      ];
    case 'Insurance':
      return [
        `Buy $${cap} of cover from ${n} on a position you actually hold elsewhere, and keep the policy to its end date.`,
        `Where ${n} lets capital back its underwriting pool, supply $${Math.max(25, Math.round(cap / 2))} there too: buyers and capital sit on different lists.`,
      ];
    case 'Launchpad':
      return [
        `Hold or stake the qualifying balance ${n} asks for on ${chain} (about $${cap} of value) from the start of the season, untouched.`,
        `Take part in one ${n} sale with a small allocation and keep the bought asset in the same wallet past its listing day.`,
      ];
    case 'Privacy':
      return [
        `Make a shielded deposit of $${cap} into ${n} on ${chain} and withdraw it later to a fresh address, exactly as the protocol's own flow runs.`,
        `Use ${n}'s private transfer or relayer once more mid-season with a smaller amount, so the wallet has a history, not a single touch.`,
      ];
    case 'Payments':
    case 'Crypto Card Issuer':
      return [
        `Open the ${n} account or card, fund it with $${cap}, and make your ordinary purchases through it for the season.`,
        `Set one recurring payment (a subscription you already pay) to run through ${n}, so the account shows monthly, not one-off, use.`,
      ];
    case 'Indexes':
      return [
        `Buy $${cap} of ${n}'s index token on ${chain} and hold it in the buying wallet.`,
        `Add $${Math.max(25, Math.round(cap / 4))} to the index position each month of the season rather than once, so the record shows a saver.`,
      ];
    case 'AI Agents':
    case 'Decentralized AI':
      return [
        `Use ${n}'s product itself (run its agent or compute task) with a $${cap} budget, a little every week rather than in one burst.`,
        `Where ${n} offers a deposit, stake or credit balance, keep $${Math.max(25, Math.round(cap / 2))} in it for the whole season.`,
      ];
    case 'Uncollateralized Lending':
      return [
        `Deposit $${cap} of USDC into one of ${n}'s lending pools on ${chain} and keep it lent for the season.`,
        `Add a second pool or a second deposit of $${Math.max(25, Math.round(cap / 2))} mid-season, and never withdraw inside a pool's lock window.`,
      ];
    case 'OTC Marketplace':
      return [
        `Complete one small OTC trade of about $${cap} on ${n}, as buyer or seller, fully settled.`,
        `Complete a second trade in a later month and leave feedback where ${n} records it: repeat counterparties are the signal.`,
      ];
    case 'Anchor BTC':
    case 'Decentralized BTC':
      return [
        `Deposit $${cap} of BTC value into ${n} on ${chain} through its own deposit flow and hold the issued position.`,
        `Use the issued asset once in ${n}'s own market or vault, and keep the rest of the position untouched for the season.`,
      ];
    case 'Stablecoin Wrapper':
    case 'Stablecoin Issuer':
    case 'Algo-Stables':
      return [
        `Mint or wrap $${cap} of ${n}'s stable asset on ${chain} through the protocol's own mint, and hold the asset.`,
        `Provide $${Math.max(25, Math.round(cap / 2))} of the asset to its main liquidity pool and keep the position for the season.`,
      ];
    case 'Governance Incentives':
      return [
        `Take part in ${n}'s incentive programme exactly as its page describes, with about $${cap} of working capital on ${chain}.`,
        `Vote in every governance vote ${n} opens during the season; votes are cheap and they are counted.`,
      ];
    default:
      return [
        `Deposit $${cap} of USDC into ${n}'s main product on ${chain} and keep the position open.`,
        `Make a second, smaller deposit of $${Math.max(25, Math.round(cap / 2))} later in the season, so the wallet shows a returning user.`,
      ];
  }
}

/**
 * A protocol's farm plan: six steps from setup to the day a token issues. The plan is derived from
 * the protocol's own record (category, chains, TVL, age, growth), never from a hand-written list
 * of names: the same function writes every row's plan, in board.json and in the page alike.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const { chain, cls } = farmChain(p);
  const cap = capitalFor(p);
  const hold = holdDaysFor(age);
  const [coreA, coreB] = coreActions(p, chain, cap);
  const weeks = Math.max(4, Math.round(hold / 7));
  return [
    {
      text: `Use a fresh wallet for ${p.name} and fund it on ${chain} with ${cls.setup} plus $${cap + 50} of stablecoins; keep the seed phrase offline.`,
      cost: cls.setup,
      time: '10 minutes',
    },
    { text: coreA, cost: `$${cap} of capital, ${cls.action}`, time: '15 minutes to set up' },
    { text: coreB, cost: `$${Math.max(25, Math.round(cap / 2))} more capital at most, ${cls.action}`, time: '15 minutes' },
    {
      text: `Repeat the core action on ${p.name} once a week for ${weeks} weeks, varying the amount slightly, and keep every transaction hash in a farm log.`,
      cost: `${cls.action}, weekly`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days and check ${p.name}'s own points or rewards page and its official announcements weekly; never pay a third party to check or claim for you.`,
      cost: `the $${cap} stays in the position; checking is free`,
      time: `${hold} days, 5 minutes a week`,
    },
    {
      text: `If ${p.name} issues a token, claim only from the link in its official announcement, verify the contract address against a second official post, then decide with the log in front of you: sell half into the first week's liquidity or keep using the protocol.`,
      cost: 'one claim transaction of gas; never a fee to claim',
      time: '30 minutes on the day',
    },
  ];
}

// ---------------------------------------------------------------- the board

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const watch = new Set(snapshot.watchlist);
  const multiples = categoryMultiples(snapshot, model);
  const global = globalMedian(snapshot);
  const chosen = snapshot.protocols.filter((p) => watch.has(p.slug) || isRankable(p));
  const scored = chosen.map((p) => ({ p, v: impliedValue(p, snapshot.as_of, multiples, global, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || bySlugAsc(a.p.slug, b.p.slug));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token' as const,
    watchlist: watch.has(s.p.slug),
    age_days: s.v.age,
    implied_value_usd: s.v.implied,
    model: {
      category_multiple: s.v.multiple,
      category_median: s.v.median,
      category_peers: s.v.peers,
      growth_factor: s.v.growthFactor,
      age_factor: s.v.ageFactor,
      chain_factor: s.v.chainFactor,
      launch_discount: model.launch_discount,
      age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || bySlugAsc(a.slug, b.slug))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd !== null && p.tvl_usd > 0 ? round4(p.mcap_usd / p.tvl_usd) : null,
    }));
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const multiples = categoryMultiples(snapshot, model);
  const watch = new Set(snapshot.watchlist);
  const peersCache = new Map<string, Peer[]>();
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    global_median: round4(globalMedian(snapshot)),
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: board.filter((r) => !watch.has(r.slug)).length,
    live_size: live.length,
    scanned_size: snapshot.protocols.length,
    multiples: [...multiples.values()].sort((a, b) => bySlugAsc(a.category, b.category)),
    rows: board.map((r) => {
      const key = r.category ?? '';
      if (!peersCache.has(key)) peersCache.set(key, peersOf(snapshot, r.category));
      return {
        rank: r.rank,
        slug: r.slug,
        name: r.name,
        category: r.category,
        chains: r.chains,
        tvl_usd: r.tvl_usd,
        change_7d: r.change_7d,
        listed_at: r.listed_at,
        age_days: r.age_days,
        watchlist: r.watchlist,
        implied_value_usd: r.implied_value_usd,
        category_multiple: r.model.category_multiple,
        growth_factor: r.model.growth_factor,
        age_factor: r.model.age_factor,
        chain_factor: r.model.chain_factor,
        peers: peersCache.get(key)!,
        farm_steps: r.farm_steps,
      };
    }),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100) return `the board holds ${board.length} rows, under the 100 a board must hold`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  const known = new Set(snapshot.protocols.map((p) => p.slug));
  for (const r of board) {
    if (!known.has(r.slug)) return `${r.slug} is not one of the snapshot's protocols`;
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
