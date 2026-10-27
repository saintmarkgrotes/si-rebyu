// Offline validation. Messages include variable names, never their values.
export function validateConfig(env, target, { production = true } = {}) {
  const issues = []
  const requireValue = (name) => {
    if (!env[name]?.trim()) issues.push(`${name}: missing`)
  }
  const origin = (name, value = env[name]) => {
    if (!value?.trim()) return
    try {
      const url = new URL(value)
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error()
      if (production && (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error()
      if (/YOUR-|YOUR_|PLACEHOLDER/i.test(value)) throw new Error()
    } catch { issues.push(`${name}: use a complete ${production ? 'HTTPS' : 'HTTP(S)'} origin, without credentials, placeholders or a path`) }
  }
  const publicKey = (name) => {
    const key = env[name]?.trim() || ''
    let privileged = key.startsWith('sb_secret_')
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
      privileged ||= claims.role === 'service_role'
    } catch { /* Publishable keys do not use JWT encoding. */ }
    if (privileged) issues.push(`${name}: a privileged server key cannot be used as a public key`)
  }
  if (target === 'frontend') {
    for (const name of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'VITE_API_URL']) requireValue(name)
    origin('VITE_SUPABASE_URL'); origin('VITE_API_URL'); publicKey('VITE_SUPABASE_ANON_KEY')
    for (const name of Object.keys(env)) {
      if (/^VITE_.*(SECRET|SERVICE|PASSWORD|PRIVATE|AI_API_KEY|ACCESS_TOKEN)/i.test(name) && env[name]) {
        issues.push(`${name}: remove server secrets from browser environment variables`)
      }
    }
  } else {
    for (const name of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'AI_API_KEY', 'AI_MODEL']) requireValue(name)
    origin('SUPABASE_URL'); publicKey('SUPABASE_ANON_KEY')
    if (env.AI_PROVIDER && env.AI_PROVIDER.trim().toLowerCase() !== 'gemini') issues.push('AI_PROVIDER: only gemini is supported')
    if (env.AI_REQUESTS_PER_MINUTE && (!/^\d+$/.test(env.AI_REQUESTS_PER_MINUTE) || Number(env.AI_REQUESTS_PER_MINUTE) < 1)) issues.push('AI_REQUESTS_PER_MINUTE: use a positive integer')
    if (target === 'api') {
      requireValue('CORS_ORIGINS')
      for (const value of (env.CORS_ORIGINS || '').split(',')) origin('CORS_ORIGINS', value.trim())
    }
    if (target === 'worker') {
      requireValue('SUPABASE_SERVICE_KEY')
      const key = env.SUPABASE_SERVICE_KEY?.trim()
      if (key && (key === env.SUPABASE_ANON_KEY?.trim() || key.startsWith('sb_publishable_'))) issues.push('SUPABASE_SERVICE_KEY: use a server service-role/secret key, not the public key')
      try {
        const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
        if (claims.role !== 'service_role') issues.push('SUPABASE_SERVICE_KEY: JWT role must be service_role')
      } catch { /* Modern secret keys are opaque. */ }
    }
  }
  return [...new Set(issues)]
}

export function validateConsistency(configs) {
  const issues = []
  const projectUrls = configs.map(({ env, target }) => env[target === 'frontend' ? 'VITE_SUPABASE_URL' : 'SUPABASE_URL']?.replace(/\/$/, '')).filter(Boolean)
  if (new Set(projectUrls).size > 1) issues.push('SUPABASE_URL: all three deployments must use the same project')
  const services = configs.filter(({ target }) => target !== 'frontend')
  for (const name of ['AI_MODEL', 'AI_PROVIDER', 'AI_REQUESTS_PER_MINUTE']) {
    const values = services.map(({ env }) => env[name] || ({ AI_PROVIDER: 'gemini', AI_REQUESTS_PER_MINUTE: '12' }[name] || ''))
    if (new Set(values).size > 1) issues.push(`${name}: API and worker settings must match`)
  }
  return issues
}
