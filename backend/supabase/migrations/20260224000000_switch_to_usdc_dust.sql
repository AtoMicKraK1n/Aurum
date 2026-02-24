-- Switch dust/batch accounting from SOL to USDC for devnet demo flow.
ALTER TABLE dust_queue
RENAME COLUMN sol_amount TO usdc_amount;

ALTER TABLE dust_queue
DROP COLUMN IF EXISTS sol_lamports;

ALTER TABLE batches
RENAME COLUMN total_sol TO total_usdc;

ALTER TABLE batches
DROP COLUMN IF EXISTS jupiter_tx_signature;

ALTER TABLE transactions
RENAME COLUMN sol_amount TO usdc_amount;
