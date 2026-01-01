-- Migration: Add Tier 1 & Tier 2 feature support
-- Date: 2025-12-29

-- Add new columns to shops table
ALTER TABLE shops ADD COLUMN default_tags TEXT;
ALTER TABLE shops ADD COLUMN default_metafields TEXT;
ALTER TABLE shops ADD COLUMN active_template_id TEXT;
ALTER TABLE shops ADD COLUMN brand_voice_preset TEXT;
ALTER TABLE shops ADD COLUMN brand_voice_notes TEXT;

-- Add new columns to checklist_templates table
ALTER TABLE checklist_templates ADD COLUMN description TEXT;
ALTER TABLE checklist_templates ADD COLUMN template_type TEXT DEFAULT 'custom';
ALTER TABLE checklist_templates ADD COLUMN is_built_in INTEGER DEFAULT 0;

-- Add new columns to checklist_items table
ALTER TABLE checklist_items ADD COLUMN weight INTEGER DEFAULT 1 NOT NULL;
ALTER TABLE checklist_items ADD COLUMN fix_type TEXT DEFAULT 'manual' NOT NULL;
ALTER TABLE checklist_items ADD COLUMN target_field TEXT;

-- Add new columns to product_audits table
ALTER TABLE product_audits ADD COLUMN score INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE product_audits ADD COLUMN auto_fixable_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE product_audits ADD COLUMN ai_fixable_count INTEGER DEFAULT 0 NOT NULL;

-- Add new columns to product_audit_items table
ALTER TABLE product_audit_items ADD COLUMN fix_type TEXT DEFAULT 'manual' NOT NULL;
ALTER TABLE product_audit_items ADD COLUMN target_field TEXT;
ALTER TABLE product_audit_items ADD COLUMN weight INTEGER DEFAULT 1 NOT NULL;

-- Create product_history table for change tracking
CREATE TABLE IF NOT EXISTS product_history (
  id TEXT PRIMARY KEY NOT NULL,
  shop_id TEXT NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  product_title TEXT NOT NULL,
  change_type TEXT NOT NULL,
  score INTEGER,
  passed_count INTEGER,
  failed_count INTEGER,
  changed_field TEXT,
  previous_value TEXT,
  new_value TEXT,
  description TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL
);

-- Create index for faster history lookups
CREATE INDEX IF NOT EXISTS idx_product_history_product ON product_history(product_id);
CREATE INDEX IF NOT EXISTS idx_product_history_shop ON product_history(shop_id);
CREATE INDEX IF NOT EXISTS idx_product_history_created ON product_history(created_at DESC);

