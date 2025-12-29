-- Add billing fields to shops table
ALTER TABLE shops ADD COLUMN plan TEXT DEFAULT 'free' NOT NULL;
ALTER TABLE shops ADD COLUMN subscription_id TEXT;
ALTER TABLE shops ADD COLUMN subscription_status TEXT;
ALTER TABLE shops ADD COLUMN trial_ends_at INTEGER;
ALTER TABLE shops ADD COLUMN current_period_end INTEGER;
ALTER TABLE shops ADD COLUMN is_dev_store INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE shops ADD COLUMN ai_credits_used INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE shops ADD COLUMN ai_credits_reset_at INTEGER;
ALTER TABLE shops ADD COLUMN audits_this_month INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE shops ADD COLUMN audits_reset_at INTEGER;



