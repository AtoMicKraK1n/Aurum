-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(44) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dust queue
CREATE TABLE dust_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  sol_amount DECIMAL(18, 9) NOT NULL,
  sol_lamports BIGINT NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Batches
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  total_sol DECIMAL(18, 9) NOT NULL,
  total_usdc DECIMAL(18, 6),
  total_gold DECIMAL(18, 9),
  jupiter_tx_signature VARCHAR(88),
  grail_tx_signature VARCHAR(88),
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  executed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Gold balances
CREATE TABLE gold_balances (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE PRIMARY KEY,
  gold_amount DECIMAL(18, 9) DEFAULT 0 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Transactions
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('dust_deposit', 'gold_credit', 'withdrawal')),
  sol_amount DECIMAL(18, 9),
  gold_amount DECIMAL(18, 9),
  batch_id UUID REFERENCES batches(id),
  tx_signature VARCHAR(88),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_dust_queue_status ON dust_queue(status);
CREATE INDEX idx_dust_queue_user ON dust_queue(user_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_batches_status ON batches(status);