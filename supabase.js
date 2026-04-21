import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://vfzadnfpwsbzfiyzbpvx.supabase.co'
const supabaseKey = 'sb_publishable_PL6nGBOyzAOiXWXjuplwYw_-fr60KdO'

export const supabase = createClient(supabaseUrl, supabaseKey)
