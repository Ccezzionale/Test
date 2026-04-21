import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabaseUrl = 'https://TUO-PROGETTO.supabase.co'
const supabaseKey = 'TUA_ANON_KEY'

export const supabase = createClient(supabaseUrl, supabaseKey)
