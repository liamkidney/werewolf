import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Dev uses the shared backend's isolated Werewolf schema. Production remains
// on its original Supabase project until all existing games are migrated.
export const supabaseClient = createClient(
  'https://psoncybkfsdmjksyrcvv.supabase.co',
  'sb_publishable_z-Aumyx5v_WMPTbY77u88A_H3oEEzFH',
  { db: { schema: 'werewolf' } }
);
