CREATE TABLE wallet_auth_nonces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address VARCHAR(44) NOT NULL,
  nonce VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (wallet_address, nonce)
);

CREATE INDEX idx_wallet_auth_nonces_wallet ON wallet_auth_nonces(wallet_address);
CREATE INDEX idx_wallet_auth_nonces_expires ON wallet_auth_nonces(expires_at);
