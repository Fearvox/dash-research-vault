import { getActiveProfile, type McpProfile } from './profile.ts'
import { blockGuidance, passGuidance, type AgentGuidance } from './guidance.ts'
import { sanitizePublicData, scanPublicSafety } from './public_safety.ts'

export interface EvidenceMetadata {
  as_of: string
  profile: McpProfile
  public_safe: boolean
  safety_reasons?: string[]
  freshness?: string
  provenance?: string
  release?: string
}

export interface ToolEnvelope<T> {
  ok: boolean
  data: T
  agent_guidance: AgentGuidance
  evidence: EvidenceMetadata
}

type EvidenceInput = Partial<EvidenceMetadata>

function buildEvidence(evidence: EvidenceInput = {}, public_safe = true, safety_reasons?: string[]): EvidenceMetadata {
  return {
    ...evidence,
    as_of: evidence.as_of || new Date().toISOString(),
    profile: evidence.profile || getActiveProfile(),
    public_safe,
    safety_reasons: safety_reasons || evidence.safety_reasons,
  }
}

export function okEnvelope<T>(
  data: T,
  guidance: AgentGuidance = passGuidance('Request completed.', 'Use the returned evidence.'),
  evidence: EvidenceInput = {},
): ToolEnvelope<T> {
  const scan = scanPublicSafety(data)
  const sanitized = sanitizePublicData(data)

  if (!scan.public_safe) {
    return {
      ok: false,
      data: sanitized,
      agent_guidance: blockGuidance(
        'Public-surface leak candidates were redacted from the tool response.',
        'Use a private diagnostic profile or sanitize the source data before sharing this result.',
      ),
      evidence: buildEvidence(evidence, false, scan.reasons),
    }
  }

  return {
    ok: true,
    data: sanitized,
    agent_guidance: guidance,
    evidence: buildEvidence(evidence, true),
  }
}

export function errorEnvelope(
  reason: string,
  next_step: string,
  evidence: EvidenceInput = {},
): ToolEnvelope<null> {
  return {
    ok: false,
    data: null,
    agent_guidance: blockGuidance(reason, next_step),
    evidence: buildEvidence(evidence, evidence.public_safe ?? true, evidence.safety_reasons),
  }
}
