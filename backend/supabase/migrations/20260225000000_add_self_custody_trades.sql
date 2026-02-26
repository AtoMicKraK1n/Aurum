CREATE TABLE IF NOT EXISTS self_custody_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  grail_user_id VARCHAR(255) NOT NULL,
  usdc_amount DECIMAL(18, 6) NOT NULL CHECK (usdc_amount > 0),
  estimated_gold_amount DECIMAL(18, 9) NOT NULL CHECK (estimated_gold_amount > 0),
  max_usdc_amount DECIMAL(18, 6) NOT NULL CHECK (max_usdc_amount > 0),
  serialized_tx TEXT NOT NULL,
  signed_serialized_tx TEXT,
  submitted_tx_signature VARCHAR(88),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_custody_trades_user_id ON self_custody_trades(user_id);
CREATE INDEX IF NOT EXISTS idx_self_custody_trades_status ON self_custody_trades(status);
