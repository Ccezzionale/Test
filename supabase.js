import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

export const supabaseUrl = 'https://vfzadnfpwsbzfiyzbpvx.supabase.co'
export const supabaseKey = 'sb_publishable_PL6nGBOyzAOiXWXjuplwYw_-fr60KdO'

export const supabase = createClient(supabaseUrl, supabaseKey)
