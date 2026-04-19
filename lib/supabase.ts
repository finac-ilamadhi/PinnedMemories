import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://yewyfbnzijwfcfidxocp.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlld3lmYm56aWp3ZmNmaWR4b2NwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY1ODQ1NjgsImV4cCI6MjA5MjE2MDU2OH0.MRxs9I6ony_GHgffegmbAqrsrFS8_Wgw4vwZJIsgU8w'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)