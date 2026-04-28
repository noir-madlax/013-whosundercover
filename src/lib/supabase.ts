import { createClient } from '@supabase/supabase-js'

const rawSupabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const rawSupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

function normalizeSupabaseUrl(value: string | undefined) {
  const cleanValue = value?.trim()
  if (!cleanValue) return undefined

  const urlMatch = cleanValue.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i)
  if (urlMatch) return urlMatch[0]

  const projectRefMatch = cleanValue.match(/\b[a-z0-9]{20}\b/i)
  if (projectRefMatch) return `https://${projectRefMatch[0]}.supabase.co`

  return cleanValue
}

function normalizeSupabaseKey(value: string | undefined) {
  const cleanValue = value?.trim()
  if (!cleanValue) return undefined
  return cleanValue.split(/\s+/)[0]
}

const supabaseUrl = normalizeSupabaseUrl(rawSupabaseUrl)
const supabaseAnonKey = normalizeSupabaseKey(rawSupabaseAnonKey)

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 10,
        },
      },
    })
  : null

export async function ensureAnonymousUser() {
  if (!supabase) {
    throw new Error('Supabase 尚未配置。请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY。')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (sessionData.session?.user) return sessionData.session.user

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) throw error
  if (!data.user) throw new Error('匿名登录失败，请检查 Supabase Auth 设置。')
  return data.user
}
