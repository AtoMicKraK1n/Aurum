CREATE TABLE IF NOT EXISTS deposit_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  wallet_address VARCHAR(44) NOT NULL,
  expected_usdc_amount DECIMAL(18, 6) NOT NULL CHECK (expected_usdc_amount > 0),
  tx_signature VARCHAR(88),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'failed')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_deposit_intents_user_id ON deposit_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_deposit_intents_status ON deposit_intents(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_deposit_intents_tx_signature ON deposit_intents(tx_signature) WHERE tx_signature IS NOT NULL;
