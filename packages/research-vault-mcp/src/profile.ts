export type McpProfile = 'readonly' | 'full' | 'admin'

export function getActiveProfile(env: Record<string, string | undefined> = process.env): McpProfile {
  const raw = String(env.MCP_PROFILE || env.RESEARCH_VAULT_MCP_PROFILE || 'readonly').toLowerCase()
  if (raw === 'full' || raw === 'admin' || raw === 'readonly') return raw
  return 'readonly'
}

export function profileAllowsMutation(profile: McpProfile): boolean {
  return profile === 'full' || profile === 'admin'
}

export function profileAllowsAdmin(profile: McpProfile): boolean {
  return profile === 'admin'
}
