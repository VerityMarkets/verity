import { Link } from 'react-router-dom'

/* ---------- placeholder images ---------- */
// Replace with real images / illustrations later.
// Prompt suggestions for each section are in comments below.

function PlaceholderImg({ prompt, className = '' }: { prompt: string; className?: string }) {
  return (
    <div
      className={`rounded-xl bg-surface-2 border border-white/5 flex items-center justify-center text-center p-6 ${className}`}
      title={prompt}
    >
      <span className="text-xs text-gray-500 leading-relaxed max-w-[200px]">
        {prompt}
      </span>
    </div>
  )
}

/* ---------- data ---------- */
const usps = [
  {
    icon: (
      <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
    title: 'Every HIP-4 Market, One Interface',
    body: 'A purpose-built trading UX for prediction markets — not a generic DEX interface. Verity supports all Hyperliquid HIP-4 outcome markets: binary predictions, multi-outcome events, and options when they launch. Browse by category, trade with simple Yes/No buttons, see live odds, and track positions at a glance.',
    imgPrompt: 'Screenshot of Verity market page showing Yes/No trading buttons, price chart, category bar, and order book',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    title: 'Open Source & Verifiable',
    body: "Every line of code is public. Inspect the smart contract interactions, verify there are no hidden fees or back-doors. Don't trust — verify.",
    link: { label: 'View on GitHub →', href: 'https://github.com/AXE-LABS-LLC/verity', external: true },
    imgPrompt: 'Illustration: code editor with Verity source code, GitHub logo, and a checkmark badge',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    title: 'Direct API, No Hidden Backend',
    body: 'Verity talks directly to Hyperliquid\'s public APIs. There is no middleman server processing your orders, holding your funds, or logging your trades. Your wallet signs every transaction.',
    imgPrompt: 'Diagram: Wallet → direct arrows → Hyperliquid API. No server in the middle. Clean dark theme.',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
      </svg>
    ),
    title: 'Zero Tracking, Zero Analytics',
    body: 'No cookies, no analytics scripts, no data collection. We don\'t know who you are and we don\'t want to. Your trading activity stays between you and the blockchain.',
    imgPrompt: 'Illustration: crossed-out tracking cookie, no eye icon, privacy shield in amber/gold',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: 'Censorship Resistant',
    body: 'Deployed on IPFS — no single server to shut down. Chat runs on Nostr — no central platform to ban you from. Verity is designed to keep working even when others try to stop it.',
    badges: ['IPFS', 'Nostr'],
    imgPrompt: 'Illustration: globe with distributed nodes, IPFS logo, Nostr logo, shield icon',
  },
  {
    icon: (
      <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    title: 'Ultra-Low Fees',
    body: null, // custom content below
    imgPrompt: 'Comparison chart: Verity 0.1% vs Competitors 1-2%, bar chart, amber vs gray bars',
  },
]

/* ---------- component ---------- */
export function AboutPage() {
  return (
    <div className="max-w-3xl mx-auto pb-12">
      {/* Hero */}
      <section className="text-center pt-8 pb-6">
        <h1 className="text-3xl sm:text-4xl font-bold text-gray-100 mb-3">
          Why <span className="text-amber-400">Verity</span>?
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto leading-relaxed">
          Prediction markets should be open, private, and unstoppable.
          Here&rsquo;s how Verity gets it right.
        </p>
      </section>

      {/* Powered by Hyperliquid banner */}
      <section className="mb-12 rounded-xl bg-surface-2 border border-white/5 p-6 sm:p-8 text-center">
        <div className="flex items-center justify-center gap-2.5 mb-3">
          <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-100">Powered by Hyperliquid</h2>
        </div>
        <p className="text-gray-400 leading-relaxed max-w-lg mx-auto text-sm">
          Verity is built on{' '}
          <a
            href="https://hyperliquid.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="text-green-400 hover:text-green-300 transition-colors font-medium"
          >
            Hyperliquid
          </a>
          , the leading on-chain perpetuals and spot DEX. Your funds stay on Hyperliquid&rsquo;s L1 —
          the same infrastructure trusted by billions in daily volume. Verity is just the interface;
          your assets never touch untested software.
        </p>
        <div className="flex items-center justify-center gap-3 mt-4">
          <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            Hyperliquid L1
          </span>
          <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            HIP-4 Markets
          </span>
          <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/20">
            Non-Custodial
          </span>
        </div>
      </section>

      {/* USP sections */}
      <div className="space-y-16">
        {usps.map((usp, i) => (
          <section key={i} className="space-y-4">
            {/* Icon + title */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                {usp.icon}
              </div>
              <h2 className="text-xl font-semibold text-gray-100">{usp.title}</h2>
            </div>

            {/* Body */}
            {usp.body && (
              <p className="text-gray-400 leading-relaxed pl-14">
                {usp.body}
              </p>
            )}

            {/* Fee section — custom layout */}
            {usp.title === 'Ultra-Low Fees' && <FeeSection />}

            {/* Optional link */}
            {usp.link && (
              <div className="pl-14">
                {usp.link.external ? (
                  <a
                    href={usp.link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    {usp.link.label}
                  </a>
                ) : (
                  <Link
                    to={usp.link.href}
                    className="text-sm text-amber-400 hover:text-amber-300 transition-colors"
                  >
                    {usp.link.label}
                  </Link>
                )}
              </div>
            )}

            {/* Badges */}
            {usp.badges && (
              <div className="pl-14 flex gap-2">
                {usp.badges.map((b) => (
                  <span
                    key={b}
                    className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  >
                    {b}
                  </span>
                ))}
              </div>
            )}

            {/* Placeholder image */}
            <div className="pl-14">
              <PlaceholderImg prompt={usp.imgPrompt} className="h-40 w-full" />
            </div>
          </section>
        ))}
      </div>

      {/* CTA */}
      <section className="text-center mt-16 pt-8 border-t border-white/5">
        <p className="text-gray-400 mb-4">Ready to trade?</p>
        <Link
          to="/"
          className="inline-block px-6 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-400 text-gray-950 transition-colors"
        >
          Browse Markets
        </Link>
      </section>
    </div>
  )
}

/* ---------- fee breakdown ---------- */
function FeeSection() {
  return (
    <div className="pl-14 space-y-4">
      <p className="text-gray-400 leading-relaxed">
        Hyperliquid allows builder fees up to <span className="text-gray-200 font-semibold">1%</span> per trade — and some interfaces charge the full amount.
        We&rsquo;re committed to keeping ours as low as possible.
      </p>

      {/* Fee comparison */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-surface-2 border border-white/5 p-4 text-center">
          <div className="text-[11px] text-gray-500 uppercase tracking-wider mb-1">Others</div>
          <div className="text-2xl font-bold text-gray-400">1%</div>
          <div className="text-[11px] text-gray-500 mt-1">Max Amount</div>
        </div>
        <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-4 text-center">
          <div className="text-[11px] text-amber-400/70 uppercase tracking-wider mb-1">Verity</div>
          <div className="text-2xl font-bold text-amber-400">0.1%</div>
          <div className="text-[11px] text-gray-500 mt-1">On selling shares only!</div>
        </div>
      </div>

      <p className="text-gray-400 leading-relaxed">
        Think of it as a <span className="text-amber-400/80 font-medium">$1 donation for every $1,000</span> you take profit on — funding a small, open-source team building tools you can actually verify.
      </p>

      {/* Beta callout */}
      <div className="rounded-lg bg-surface-2 border border-white/5 px-4 py-3 flex items-start gap-3">
        <span className="text-amber-400 mt-0.5 shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
        <div>
          <p className="text-sm text-gray-300 font-medium">Beta period: 0.001% fee</p>
          <p className="text-xs text-gray-500 mt-0.5">
            During beta, the builder fee will be just 0.001% (1 cent per $1,000 traded) — mainly to track usage.
          </p>
        </div>
      </div>
    </div>
  )
}
