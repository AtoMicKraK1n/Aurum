CREATE TABLE IF NOT EXISTS dust_sweep_settings (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  min_sweep_usdc DECIMAL(18, 6) NOT NULL DEFAULT 1 CHECK (min_sweep_usdc > 0),
  max_sweep_usdc DECIMAL(18, 6) NOT NULL DEFAULT 25 CHECK (max_sweep_usdc > 0),
  slippage_percent DECIMAL(5, 2) NOT NULL DEFAULT 20 CHECK (slippage_percent >= 0 AND slippage_percent <= 100),
  cooldown_minutes INTEGER NOT NULL DEFAULT 30 CHECK (cooldown_minutes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (max_sweep_usdc >= min_sweep_usdc)
);

CREATE TABLE IF NOT EXISTS dust_sweep_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('queued', 'intent_created', 'signed', 'submitted', 'failed', 'skipped')),
  trigger_amount_usdc DECIMAL(18, 6) NOT NULL CHECK (trigger_amount_usdc >= 0),
  sweep_amount_usdc DECIMAL(18, 6) NOT NULL CHECK (sweep_amount_usdc >= 0),
  trade_id UUID REFERENCES self_custody_trades(id) ON DELETE SET NULL,
  tx_signature VARCHAR(88),
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dust_sweep_runs_user_id ON dust_sweep_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_dust_sweep_runs_status ON dust_sweep_runs(status);
CREATE INDEX IF NOT EXISTS idx_dust_sweep_runs_created_at ON dust_sweep_runs(created_at DESC);
