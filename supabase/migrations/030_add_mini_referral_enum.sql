-- Fix: add mini_referral to ptc_ad_type enum
-- The value was missing, causing "invalid input value for enum ptc_ad_type: mini_referral"
-- errors on every mini_referral task operation.
ALTER TYPE ptc_ad_type ADD VALUE IF NOT EXISTS 'mini_referral';
