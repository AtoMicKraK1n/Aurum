-- Add GRAIL fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS grail_user_id VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS grail_user_pda VARCHAR(255),
ADD COLUMN IF NOT EXISTS grail_registered_at TIMESTAMPTZ;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_grail_user_id ON users(grail_user_id);