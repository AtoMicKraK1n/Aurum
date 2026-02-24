export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-5 py-14">
      <section className="grid gap-6 rounded-3xl border border-amber-900/20 bg-[var(--panel)] p-8 shadow-[0_24px_80px_rgba(109,74,19,0.12)] md:grid-cols-[1.2fr_0.8fr] md:p-10">
        <div>
          <p className="inline-flex rounded-full border border-amber-700/25 bg-amber-50 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-amber-800">
            AURUM TOOLING
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight text-[var(--foreground)] md:text-5xl">
            Convert Dust USDC into Tokenized Gold
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-amber-950/75">
            Internal operations console for validating custodial deposit intents,
            on-chain confirmations, batch conversion runs, and user ledger outcomes.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href="/qa"
              className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--accent-strong)]"
            >
              Open QA Panel
            </a>
            <a
              href="/QA_TESTING.md"
              className="rounded-lg border border-amber-700/35 bg-amber-50 px-5 py-2.5 text-sm font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Read QA Guide
            </a>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl border border-amber-800/20 bg-[var(--panel-strong)] p-4 text-sm text-amber-950/80">
          <p className="font-semibold text-amber-950">Current Test Sequence</p>
          <p>1. Connect Wallet</p>
          <p>2. Create Deposit Intent</p>
          <p>3. Send Devnet USDC</p>
          <p>4. Confirm Deposit</p>
          <p>5. Run Batch</p>
          <p>6. Verify Ledger Balance</p>
        </div>
      </section>
    </main>
  );
}
