import { toCoin, toAssetId } from '@/lib/hyperliquid/encoding'
import {
  deadlineOf,
  fillTemplate,
  looksLikeKv,
  parseKv,
  parseMetadata,
  resolveSideNames,
  resolveTemplateName,
  scheduledOf,
  squashSpaces,
  stripMetadata,
  templateCategory,
  templateIdOf,
  type TemplateMap,
} from '@/lib/templates'
import type { MarketKind, Outcome, ParsedMarket, Question } from '@/lib/hyperliquid/types'

const EMPTY_TEMPLATES: TemplateMap = new Map()

/** Names HL gives a question's catch-all outcome, across all deployers. */
const FALLBACK_NAMES = new Set(['Fallback', 'Other', 'template fallback', 'Recurring Fallback'])

const fmtUsd = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 6 })

/** Human label for bucket `index` of a priceBucket question. */
function bucketLabel(underlying: string, thresholds: number[], index: number): string {
  if (index <= 0) return `${underlying} below ${fmtUsd(thresholds[0])}`
  if (index >= thresholds.length) return `${underlying} above ${fmtUsd(thresholds[thresholds.length - 1])}`
  return `${underlying} between ${fmtUsd(thresholds[index - 1])} and ${fmtUsd(thresholds[index])}`
}

/** A bare ticker we can show a coin logo / mainnet mid for — not `xyz:SKHX`. */
function asSymbol(v: string | undefined): string {
  return v && /^[A-Za-z0-9]{1,10}$/.test(v) ? v.toUpperCase() : ''
}

function firstNumber(...values: (string | undefined)[]): number {
  for (const v of values) {
    if (v == null) continue
    const n = parseFloat(v)
    if (Number.isFinite(n)) return n
  }
  return 0
}

/**
 * Parse an outcome into a ParsedMarket. `q` is the outcome's parent question
 * when it has one; `templates` is the `outcomeTemplates` catalogue (empty on
 * mainnet, where nothing uses it).
 *
 * Four shapes, all reachable from the same fields:
 *
 * 1. Protocol price markets (`kind: 'price'`, venue null). Standalone binaries
 *    carry their own description
 *      "class:priceBinary|underlying:BTC|expiry:…|targetPrice:…|period:1d"
 *    while named outcomes of a priceBucket *question* only carry "index:N" —
 *    class/underlying/expiry/thresholds live on the question.
 * 2. Permissionless standalone templates (`kind: 'template'`): name is
 *    "template:<id>", description is "k:v|k:v", the title format string and the
 *    category live in the template catalogue.
 * 3. Question members (`kind: 'question-member'`): the member resolves to a
 *    short label ("Cats", "Draw", "Decrease", "Spain") and inherits the
 *    question's resolved title as `questionName` plus its dates/category.
 * 4. Hand-written prose markets (`kind: 'freeform'`): name/description are used
 *    verbatim, minus any trailing `metadata=` tag.
 *
 * A question's fallback outcome keeps `bucketIndex: -1` in every shape; callers
 * filter it out of listings.
 */
export function outcomeToParsedMarket(
  o: Outcome,
  q?: Question,
  templates: TemplateMap = EMPTY_TEMPLATES,
): ParsedMarket {
  // Only parse `k:v` payloads as such — rules prose is full of colons.
  const own = looksLikeKv(o.description) ? parseKv(o.description) : {}
  const parentKv = q && looksLikeKv(q.description) ? parseKv(q.description) : {}
  // Members carry only their own keys ("index:0", "participant:Cats"); the
  // shared ones (dates, competition, sport…) live on the question.
  const kv = q ? { ...parentKv, ...own } : own

  const templateId = templateIdOf(o.name) ?? undefined
  const questionTemplateId = q ? (templateIdOf(q.name) ?? undefined) : undefined
  const template = templateId ? templates.get(templateId) : undefined
  const questionTemplate = questionTemplateId ? templates.get(questionTemplateId) : undefined

  const cls = kv.class ?? ''
  const isPrice = cls === 'priceBinary' || cls === 'priceBucket'

  const thresholds = kv.priceThresholds
    ? kv.priceThresholds.split(',').map((t) => parseFloat(t)).filter((n) => Number.isFinite(n))
    : undefined
  const underlying = kv.underlying || asSymbol(kv.perp)

  const isFallback =
    !!q && (q.fallbackOutcome === o.outcome || FALLBACK_NAMES.has(o.name) || o.description === 'other')
  const rawIndex = own.index != null ? parseInt(own.index, 10) : NaN
  const bucketIndex = q
    ? isFallback
      ? -1
      : Number.isFinite(rawIndex)
        ? rawIndex
        : undefined
    : undefined

  let questionName = q
    ? questionTemplateId
      ? resolveTemplateName(q, templates, parentKv)
      : q.name
    : undefined
  // Deployers reuse the 2-team `sportsContestResult` template ("{competition}
  // {stage}: {participantA} v {participantB}") for tournament/season-winner
  // questions with many entrants. When the question has more than two real
  // contestants, title it as a winner market instead of "A v B".
  if (q && questionTemplateId && parentKv?.competition) {
    const entrants = q.namedOutcomes.length
    const type = (parentKv.contestType ?? '').toLowerCase()
    if (entrants > 3 || type === 'tournament' || type === 'season') {
      const season = parentKv.season ? ` ${parentKv.season}` : ''
      const stage = parentKv.stage && !/^(tournament|season)$/i.test(parentKv.stage) ? ` ${parentKv.stage}` : ''
      questionName = `${parentKv.competition}${season}${stage} winner`
    }
  }

  let name: string
  if (isFallback) {
    name = `${questionName ?? 'Question'}: none of the above`
  } else if (isPrice && q) {
    name =
      thresholds?.length && underlying && bucketIndex != null
        ? bucketLabel(underlying, thresholds, bucketIndex)
        : `${questionName ?? o.name} #${bucketIndex ?? '?'}`
  } else if (templateId) {
    name = resolveTemplateName(o, templates, kv)
  } else {
    name = o.name
  }

  const kind: MarketKind = isPrice
    ? 'price'
    : q
      ? 'question-member'
      : templateId
        ? 'template'
        : 'freeform'

  // Category tag: own template → parent question's template → own prose tail →
  // question's prose tail. Price templates (a `perp` keyword) and the protocol
  // ladders declare no tag but are unambiguously price markets.
  let category: string | undefined
  let subCategory: string | undefined
  for (const meta of [
    templateCategory(template, kv),
    templateCategory(questionTemplate, kv),
    templateId ? {} : parseMetadata(o.description, kv),
    q && !questionTemplateId ? parseMetadata(q.description, kv) : {},
  ]) {
    category ??= meta.category
    subCategory ??= meta.subCategory
  }
  if (!category && (isPrice || kv.perp)) category = 'price'

  let description: string
  if (isPrice) {
    description = q ? q.description : o.description
  } else {
    const ownDesc = template
      ? squashSpaces(fillTemplate(stripMetadata(template.description), kv))
      : stripMetadata(o.description)
    const parentDesc = !q
      ? ''
      : questionTemplate
        ? squashSpaces(fillTemplate(stripMetadata(questionTemplate.description), kv))
        : stripMetadata(q.description)
    description = isFallback ? parentDesc : ownDesc || parentDesc
  }

  const expiry = deadlineOf(kv)
  const scheduled = scheduledOf(kv)

  return {
    outcomeId: o.outcome,
    name,
    description,
    class: cls,
    underlying,
    expiry,
    targetPrice: firstNumber(kv.targetPrice, kv.threshold, kv.target),
    period: kv.period ?? '',
    sideNames: resolveSideNames(o, templates, kv),
    yesCoin: toCoin(o.outcome, 0),
    noCoin: toCoin(o.outcome, 1),
    yesAssetId: toAssetId(o.outcome, 0),
    noAssetId: toAssetId(o.outcome, 1),
    quoteToken: o.quoteToken ?? 'USDC',
    questionId: q?.question,
    bucketIndex,
    priceThresholds: thresholds,
    kind,
    templateId,
    category,
    subCategory,
    startsAt: scheduled && scheduled !== expiry ? scheduled : undefined,
    venue: o.venue ?? null,
    deployerFeeScale: o.deployerFeeScale ?? null,
    officialSource: kv.officialSource || undefined,
    kv: Object.keys(kv).length ? kv : undefined,
    questionName,
  }
}
