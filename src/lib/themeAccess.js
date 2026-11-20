// Who may use the strawberry & matcha colour theme.
// Everyone else gets the minimal black & white theme. The role is read from
// Supabase `app_metadata.role`, which users can't edit themselves
// (never trust `user_metadata` for access).
export const STRAWBERRY_ROLES = ['simang', 'admin']

export const canUseStrawberryTheme = (user) => {
  const role = user?.app_metadata?.role
  return typeof role === 'string' && STRAWBERRY_ROLES.includes(role.toLowerCase())
}