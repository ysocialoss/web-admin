export type Ground = { type: 'terms' | 'illegal'; ref: string; facts: string }

export const emptyGround: Ground = { type: 'terms', ref: '', facts: '' }
export const groundReady = (ground: Ground) => Boolean(ground.ref && ground.facts.trim())

export const termsClauses = [
  { id: '3.1', title: 'Minimum age' },
  { id: '5.1', title: 'Illegal content' },
  { id: '5.2', title: 'Harassment and threats' },
  { id: '5.3', title: 'Hate' },
  { id: '5.4', title: 'Violence and glorification of violence' },
  { id: '5.5', title: 'Sexual content and nudity' },
  { id: '5.6', title: 'Self-harm' },
  { id: '5.7', title: 'Spam and manipulation' },
  { id: '5.8', title: 'Misleading information' },
  { id: '5.9', title: 'Impersonation' },
  { id: '5.10', title: 'Privacy of others' },
  { id: '5.11', title: 'Intellectual property' },
  { id: '5.12', title: 'AI-generated content' },
  { id: '6.2', title: 'Ban evasion and misuse of the service' },
] as const

export const legalCategories = [
  { id: 'child_sexual_abuse', title: 'Child sexual abuse material (§ 184b StGB)' },
  { id: 'terrorism', title: 'Terrorist content (§§ 89a, 129a StGB)' },
  { id: 'threats', title: 'Threats or calls for crimes (§§ 111, 241 StGB)' },
  { id: 'incitement', title: 'Incitement to hatred (§ 130 StGB)' },
  { id: 'insult_defamation', title: 'Insult or defamation (§§ 185 to 187 StGB)' },
  { id: 'unconstitutional_symbols', title: 'Symbols of unconstitutional organisations (§ 86a StGB)' },
  { id: 'privacy_violation', title: 'Privacy or personal images (§ 201a StGB, GDPR)' },
  { id: 'intellectual_property', title: 'Copyright or trademark infringement' },
  { id: 'fraud', title: 'Fraud (§ 263 StGB)' },
  { id: 'youth_protection', title: 'Content harmful to minors (JMStV)' },
  { id: 'other', title: 'Another law' },
] as const

export const reasonClause: Record<string, string> = {
  illegal: '5.1', harassment: '5.2', hate: '5.3', violence: '5.4', sexual: '5.5',
  self_harm: '5.6', spam: '5.7', misinformation: '5.8', impersonation: '5.9', ai_generated: '5.12',
}

type Pending = { title: string; suggested?: string; resolve: (ground: Ground | null) => void }
let listener: ((pending: Pending | null) => void) | null = null

export function onGroundRequest(next: typeof listener) {
  listener = next
}

export function requestGround(title: string, suggested?: string): Promise<Ground | null> {
  return new Promise((resolve) => {
    if (!listener) return resolve(null)
    listener({ title, suggested, resolve })
  })
}
