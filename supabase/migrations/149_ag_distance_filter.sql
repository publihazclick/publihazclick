-- Migration 149: Movi — distanceFilter configurable desde admin
INSERT INTO platform_settings (key, value)
VALUES ('ag_distance_filter', '50')
ON CONFLICT (key) DO NOTHING;
