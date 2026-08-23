import type { OutcomeTemplate, SideSpec } from '@/lib/hyperliquid/types'

/**
 * Permissionless ("template") outcome markets.
 *
 * HL's `outcomeMeta` only carries the *instance* data for these: the outcome's
 * `name` is `template:<templateId>` and its `description` is a compact
 * `key:value|key:value` payload. The human-readable format strings live in a
 * separate `outcomeTemplates` catalogue, where `name` is e.g.
 * `"{competition} {stage}: {participantA} v {participantB}"`.
 *
 * Everything here is pure so it can be unit-tested against a captured
 * outcomeMeta/outcomeTemplates pair, and every step degrades gracefully: on
 * mainnet the catalogue is empty (or the endpoint errors) and no outcome uses
 * the `template:` prefix, so all of this is inert.
 */

export type TemplateMap = Map<string, OutcomeTemplate>

const TEMPLATE_PREFIX = 'template:'
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g
const HAS_PLACEHOLDER = /\{[A-Za-z][A-Za-z0-9_]*\}/
// Deployers do post empty values ("…|season:|sport:geopolitics|…"), so the
// shape check must not require one.
const KV_PART = /^[A-Za-z][A-Za-z0-9_]*:/
const METADATA_TAG = 'metadata='

/**
 * Keywords a template's format string may reference that the instance did not
 * supply. `sportsContestWinner2` is the live example: its side names are
 * `{shortNameA}`/`{shortNameB}` but `shortName*` is not one of its keywords,
 * so instances never carry it — the full participant name is the best answer.
 */
const KEYWORD_ALIASES: Record<string, string[]> = {
  shortNameA: ['participantA'],
  shortNameB: ['participantB'],
}

export function indexTemplates(list: OutcomeTemplate[]): TemplateMap {
  return new Map(list.map((t) => [t.id, t]))
}

/** `'template:binaryPrice'` → `'binaryPrice'`; anything else → `null`. */
export function templateIdOf(name: string): string | null {
  return name.startsWith(TEMPLATE_PREFIX) ? name.slice(TEMPLATE_PREFIX.length) : null
}

/**
 * Parse a `k:v|k:v` description. Split on `|` first, then on the **first** `:`
 * only — values legitimately contain colons (`perp:xyz:SKHX`) and spaces
 * (`participantA:Minnesota Twins`).
 */
export function parseKv(desc: string): Record<string, string> {
  const out: Record<string, string> = {}
  if (!desc) return out
  for (const part of desc.split('|')) {
    const i = part.indexOf(':')
    if (i <= 0) continue
    const key = part.slice(0, i).trim()
    // Empty values are kept: they mean "this keyword does not apply here", so
    // the placeholder should vanish rather than survive into the title.
    if (key) out[key] = part.slice(i + 1).trim()
  }
  return out
}

/**
 * True when every `|`-segment looks like `key:value`. Guards against running
 * `parseKv` over rules prose (which is full of colons) and inventing keys.
 */
export function looksLikeKv(desc: string): boolean {
  if (!desc) return false
  return desc.split('|').every((p) => KV_PART.test(p.trim()))
}

/** True when `s` still contains an unsubstituted `{keyword}`. */
export function hasPlaceholder(s: string): boolean {
  return HAS_PLACEHOLDER.test(s)
}

/**
 * Substitute `{keyword}` placeholders from `kv`. Unknown keywords are left
 * verbatim so callers can detect (and fall back on) an incomplete render
 * rather than silently shipping a hole in the title.
 */
export function fillTemplate(format: string, kv: Record<string, string>): string {
  if (!format) return ''
  return format.replace(PLACEHOLDER, (whole, key: string) => {
    if (kv[key]) return kv[key]
    for (const alias of KEYWORD_ALIASES[key] ?? []) {
      if (kv[alias]) return kv[alias]
    }
    // Supplied but empty → the keyword does not apply; drop it (callers squash
    // the resulting double space). Absent entirely → leave the placeholder so
    // the caller can tell the render is incomplete.
    return key in kv ? '' : whole
  })
}

/** Collapse the whitespace left behind by empty keyword substitutions. */
export function squashSpaces(s: string): string {
  return s.replace(/[ \t]{2,}/g, ' ').replace(/ ([,.;:?!])/g, '$1').trim()
}

/** Drop the trailing `metadata=…` tag from a description. */
export function stripMetadata(text: string): string {
  if (!text) return ''
  const i = text.lastIndexOf(METADATA_TAG)
  return (i === -1 ? text : text.slice(0, i)).trim()
}

function normalizeTag(v: string | undefined): string | undefined {
  const t = v?.trim()
  if (!t || hasPlaceholder(t)) return undefined
  const lower = t.toLowerCase()
  return lower === 'n/a' ? undefined : lower
}

export interface TemplateCategory {
  category?: string
  subCategory?: string
}

/**
 * Read the `metadata=category:sports|subCategory:{sport}` tail of a description
 * (templates and hand-written outcomes both use it), substituting `kv`.
 * `N/A` and unresolved placeholders are dropped.
 */
export function parseMetadata(text: string, kv: Record<string, string> = {}): TemplateCategory {
  if (!text) return {}
  const i = text.lastIndexOf(METADATA_TAG)
  if (i === -1) return {}
  const parsed = parseKv(fillTemplate(text.slice(i + METADATA_TAG.length).trim(), kv))
  const category = normalizeTag(parsed.category)
  const subCategory = normalizeTag(parsed.subCategory)
  return { ...(category ? { category } : {}), ...(subCategory ? { subCategory } : {}) }
}

/** `{category, subCategory}` declared by a template's `metadata=` tail. */
export function templateCategory(
  template: OutcomeTemplate | undefined,
  kv: Record<string, string> = {},
): TemplateCategory {
  return template ? parseMetadata(template.description, kv) : {}
}

/** The `sideNames` a `standaloneOutcome` template declares, if any. */
export function roleSideNames(template: OutcomeTemplate | undefined): string[] | undefined {
  const role = template?.role
  if (role && typeof role === 'object' && 'standaloneOutcome' in role) {
    return role.standaloneOutcome.sideNames
  }
  return undefined
}

/** "20260901-1200" → "Sep 1, 12:00 PM" in the viewer's timezone. */
function formatDateTime(v: string): string {
  if (!isTimestamp(v)) return v
  const d = new Date(
    `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T${v.slice(9, 11)}:${v.slice(11, 13)}:00Z`,
  )
  if (Number.isNaN(d.getTime())) return v
  return d
    .toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    .replace(/\bam\b/i, 'AM')
    .replace(/\bpm\b/i, 'PM')
}

/**
 * Keyword values as they should appear in a *title*: templates declare their
 * keyword types, so a `dateTime` renders as a date instead of `20260901-1200`.
 * Rules prose is left alone — it says "{time} UTC" and means it.
 */
export function humanizeKeywords(
  template: OutcomeTemplate | undefined,
  kv: Record<string, string>,
): Record<string, string> {
  if (!template) return kv
  let out = kv
  for (const [key, type] of template.keywords ?? []) {
    if (type !== 'dateTime' || !kv[key]) continue
    const pretty = formatDateTime(kv[key])
    if (pretty === kv[key]) continue
    if (out === kv) out = { ...kv }
    out[key] = pretty
  }
  return out
}

export interface NamedSpec {
  name: string
  description?: string
  sideSpecs?: SideSpec[]
}

/**
 * Resolve an outcome's or question's display title.
 *
 * Non-template specs (protocol markets, hand-written prose markets) are
 * returned unchanged. Template specs render the catalogue's format string with
 * the instance's keywords; if the catalogue is missing the template (older
 * client, empty endpoint) we fall back to the bare id rather than leaking a
 * `template:` prefix into the UI.
 */
export function resolveTemplateName(
  spec: NamedSpec,
  templates: TemplateMap,
  kv?: Record<string, string>,
): string {
  const id = templateIdOf(spec.name)
  if (id === null) return spec.name
  const vars = kv ?? parseKv(spec.description ?? '')
  const template = templates.get(id)
  if (!template) return id
  const filled = squashSpaces(fillTemplate(template.name, humanizeKeywords(template, vars)))
  return filled || id
}

/**
 * Resolve the two side labels. Order of preference per side:
 * the outcome's own `sideSpecs` name (minus any `template:` prefix, filled) →
 * the template role's `sideNames` (filled) → `Yes`/`No`.
 */
export function resolveSideNames(
  spec: NamedSpec,
  templates: TemplateMap,
  kv: Record<string, string> = {},
): [string, string] {
  const id = templateIdOf(spec.name)
  const sides = roleSideNames(id ? templates.get(id) : undefined)

  const pick = (i: 0 | 1): string => {
    const raw = spec.sideSpecs?.[i]?.name ?? ''
    const stripped = raw.startsWith(TEMPLATE_PREFIX) ? raw.slice(TEMPLATE_PREFIX.length) : raw
    const own = squashSpaces(fillTemplate(stripped, kv))
    if (own && !hasPlaceholder(own)) return own
    const role = squashSpaces(fillTemplate(sides?.[i] ?? '', kv))
    if (role && !hasPlaceholder(role)) return role
    return i === 0 ? 'Yes' : 'No'
  }

  return [pick(0), pick(1)]
}

/** True for a `YYYYMMDD-HHMM` UTC timestamp as used by every date keyword. */
export function isTimestamp(v: string | undefined): v is string {
  return !!v && /^\d{8}-\d{4}$/.test(v)
}

/**
 * Settlement deadline for a parsed description, in template priority order:
 * protocol `expiry`, sports `resolutionDeadline`, policy `decisionDeadline`,
 * price `time`. '' when the market has no deadline at all.
 */
export function deadlineOf(kv: Record<string, string>): string {
  for (const key of ['expiry', 'resolutionDeadline', 'decisionDeadline', 'time']) {
    if (isTimestamp(kv[key])) return kv[key]
  }
  return ''
}

/** Scheduled event time (`scheduledStart` / `scheduledDecision`), if any. */
export function scheduledOf(kv: Record<string, string>): string {
  for (const key of ['scheduledStart', 'scheduledDecision']) {
    if (isTimestamp(kv[key])) return kv[key]
  }
  return ''
}
