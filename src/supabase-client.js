import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Browser-only infrastructure initialization, deliberately outside the
// import chain of GameController, GameRepository and their Node unit tests.
export const supabaseClient = createClient(
  'https://guldhewlhxhsxchbattf.supabase.co',
  'sb_publishable_6g3XdNkAJesxzGzFZ9ulYg_redoxZWj'
);
