-- Migration: Change subjects.slots from integer to jsonb
-- This allows storing weekly schedule templates as an array of slot objects:
-- [{daysOfWeek: [0,1,2,3,4], start: "08:00", end: "10:00"}, ...]

-- 1. Change column type (integer 0 → jsonb empty array)
ALTER TABLE public.subjects
  ALTER COLUMN slots SET DEFAULT '[]'::jsonb;

ALTER TABLE public.subjects
  ALTER COLUMN slots TYPE jsonb
  USING CASE
    WHEN slots IS NULL OR slots = 0 THEN '[]'::jsonb
    ELSE ('[]')::jsonb
  END;
