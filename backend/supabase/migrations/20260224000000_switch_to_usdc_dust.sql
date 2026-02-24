-- Switch dust/batch accounting from SOL to USDC for devnet demo flow.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dust_queue'
      AND column_name = 'sol_amount'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dust_queue'
      AND column_name = 'usdc_amount'
  ) THEN
    ALTER TABLE dust_queue RENAME COLUMN sol_amount TO usdc_amount;
  END IF;
END $$;

ALTER TABLE dust_queue
DROP COLUMN IF EXISTS sol_lamports;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'batches'
      AND column_name = 'total_sol'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'batches'
      AND column_name = 'total_usdc'
  ) THEN
    ALTER TABLE batches RENAME COLUMN total_sol TO total_usdc;
  END IF;
END $$;

ALTER TABLE batches
DROP COLUMN IF EXISTS jupiter_tx_signature;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'sol_amount'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'transactions'
      AND column_name = 'usdc_amount'
  ) THEN
    ALTER TABLE transactions RENAME COLUMN sol_amount TO usdc_amount;
  END IF;
END $$;
