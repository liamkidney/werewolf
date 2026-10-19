import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Production and development use the shared Apps Supabase project, with
// Werewolf isolated in its own schema.
export const supabaseClient = createClient(
  'https://psoncybkfsdmjksyrcvv.supabase.co',
  'sb_publishable_z-Aumyx5v_WMPTbY77u88A_H3oEEzFH',
  { db: { schema: 'werewolf' } }
);
