import { cloneDeep } from 'lodash'

import { AskResponse, Citation } from '../../api'

export type ParsedAnswer = {
  citations: Citation[]
  markdownFormatText: string,
  generated_chart: string | null
} | null

if (typeof window !== 'undefined') {
  (window as any).ENABLE_CITATION_DEBUG = true
}

// Debug logging flag - can be controlled via developer tools
// Set window.ENABLE_CITATION_DEBUG = true in browser console to enable detailed logging
const isDebugEnabled = (): boolean => {
  if (typeof window !== 'undefined') {
    return !!(window as any).ENABLE_CITATION_DEBUG
  }
  return false
}

// Safe JSON stringification with size limit to avoid performance issues
const safeStringify = (obj: any, maxLength: number = 1000): string => {
  try {
    const str = JSON.stringify(obj, null, 2)
    if (str.length > maxLength) {
      return str.substring(0, maxLength) + `... (truncated, ${str.length} total chars)`
    }
    return str
  } catch (err) {
    return `[Unable to stringify: ${err}]`
  }
}

const debugLog = (message: string, ...args: any[]) => {
  if (isDebugEnabled()) {
    console.log(message, ...args)
  }
}

export const enumerateCitations = (citations: Citation[]) => {
  const filepathMap = new Map()
  for (const citation of citations) {
    const { filepath } = citation
    let part_i = 1
    if (filepathMap.has(filepath)) {
      part_i = filepathMap.get(filepath) + 1
    }
    filepathMap.set(filepath, part_i)
    citation.part_index = part_i
  }
  return citations
}

/**
 * Minimal, isolated support for Azure AI Foundry Prompt Flow "tool" role messages.
 * Non-invasive: only used if no inline [docN] citations are found.
 * Maps Prompt Flow fields to existing Citation shape without mutating input.
 */
const extractPromptFlowCitations = (answer: AskResponse): Citation[] => {
  debugLog('[PromptFlow Citation Parser] Starting extraction from top-level `citations`')
  debugLog('[PromptFlow Citation Parser] Input answer object:', safeStringify(answer))

  const anyAnswer = answer as any
  const cits = anyAnswer?.citations

  debugLog('[PromptFlow Citation Parser] Checking for top-level `citations` array')
  if (!Array.isArray(cits)) {
    debugLog('[PromptFlow Citation Parser] ❌ No `citations` array found - returning empty citations')
    return []
  }
  debugLog(`[PromptFlow Citation Parser] ✓ Found citations array with ${cits.length} item(s)`)

  const out: Citation[] = []

  for (let i = 0; i < cits.length; i++) {
    const pf = cits[i]
    debugLog(`[PromptFlow Citation Parser] Processing item ${i + 1}/${cits.length}:`, safeStringify(pf, 500))

    // Only treat as Prompt Flow if PF-specific keys exist
    const hasPFKeys = pf && (pf.docId != null || pf.page != null || pf.url != null || pf.source)
    if (!hasPFKeys) {
      debugLog('[PromptFlow Citation Parser] ⚠ Item lacks PF keys {docID,pageSource,URL} - skipping')
      continue
    }

    const citation: Citation = {
      id: pf.docId ?? String(i + 1),
      content: pf.content ?? '',
      title: pf.title ?? null,
      filepath: pf.source ?? null,
      url: pf.url ?? null,
      metadata: pf?.page != null ? JSON.stringify({ page: pf.page }) : (pf?.metadata ?? null),
      chunk_id: pf?.chunk_id ?? null,
      reindex_id: null,
      part_index: pf?.page ?? undefined
    }

    debugLog('[PromptFlow Citation Parser] ✓ Created Citation object:', safeStringify(citation, 500))
    out.push(citation)
  }

  debugLog(`[PromptFlow Citation Parser] ✅ Extraction complete - found ${out.length} total citation(s)`)
  debugLog('[PromptFlow Citation Parser] Final citations array:', safeStringify(out))
  return out
}

export function parseAnswer(answer: AskResponse): ParsedAnswer {
  debugLog('[Answer Parser] ========== Starting parseAnswer ==========')
  debugLog('[Answer Parser] Received answer object:', safeStringify(answer))
  
  if (typeof answer.answer !== "string") {
    debugLog('[Answer Parser] ❌ answer.answer is not a string (type:', typeof answer.answer, ') - returning null')
    return null
  }
  debugLog('[Answer Parser] ✓ answer.answer is a valid string')
  
  let answerText = answer.answer
  debugLog('[Answer Parser] Answer text:', answerText)
  
  const citationLinks = answerText.match(/\[(doc\d\d?\d?)]/g)
  debugLog('[Answer Parser] Searching for inline [docN] citation patterns')
  debugLog('[Answer Parser] Found citation links:', citationLinks)

  const lengthDocN = '[doc'.length

  let filteredCitations = [] as Citation[]
  let citationReindex = 0

  // Existing behavior for inline [docN] citations (unchanged)
  debugLog('[Answer Parser] Processing inline [docN] citations (if any)')
  citationLinks?.forEach(link => {
    debugLog(`[Answer Parser] Processing inline citation link: ${link}`)
    // Replacing the links/citations with number
    const citationIndex = link.slice(lengthDocN, link.length - 1)
    debugLog(`[Answer Parser]   - Citation index: ${citationIndex}`)
    
    const citation = cloneDeep(answer.citations[Number(citationIndex) - 1]) as Citation
    debugLog(`[Answer Parser]   - Citation from answer.citations array:`, safeStringify(citation, 500))
    
    if (!filteredCitations.find(c => c.id === citationIndex) && citation) {
      answerText = answerText.replaceAll(link, ` ^${++citationReindex}^ `)
      citation.id = citationIndex // original doc index to de-dupe
      citation.reindex_id = citationReindex.toString() // reindex from 1 for display
      filteredCitations.push(citation)
      debugLog(`[Answer Parser]   - ✓ Added citation with reindex_id: ${citation.reindex_id}`)
    } else {
      debugLog(`[Answer Parser]   - ⚠ Skipped citation (duplicate or invalid)`)
    }
  })
  
  debugLog(`[Answer Parser] Inline citations processed: ${filteredCitations.length} citation(s)`)

  // Fallback: Prompt Flow tool citations (only if no inline citations were parsed)
  debugLog('[Answer Parser] Checking if PromptFlow fallback is needed')
  if (filteredCitations.length === 0) {
    debugLog('[Answer Parser] ✓ No inline citations found - activating PromptFlow citation fallback')
    const pfCitations = extractPromptFlowCitations(answer)
    debugLog(`[Answer Parser] PromptFlow extraction returned ${pfCitations.length} citation(s)`)
    
    if (pfCitations.length > 0) {
      debugLog('[Answer Parser] ✓ Re-indexing PromptFlow citations for display')
      pfCitations.forEach((c, idx) => {
        debugLog(`[Answer Parser]   - Citation ${idx}: reindex_id = ${idx + 1}`)
        c.reindex_id = (idx + 1).toString()
      })
      filteredCitations = pfCitations
      debugLog('[Answer Parser] ✅ PromptFlow citations successfully loaded as fallback')
    } else {
      debugLog('[Answer Parser] ⚠ PromptFlow extraction found no citations')
    }
  } else {
    debugLog(`[Answer Parser] ⚠ Skipping PromptFlow fallback - already have ${filteredCitations.length} inline citation(s)`)
  }

  debugLog('[Answer Parser] Enumerating citations (assigning part_index)')
  filteredCitations = enumerateCitations(filteredCitations)
  debugLog('[Answer Parser] Final enumerated citations:', safeStringify(filteredCitations))

  const result = {
    citations: filteredCitations,
    markdownFormatText: answerText,
    generated_chart: answer.generated_chart
  }
  
  debugLog('[Answer Parser] ========== parseAnswer complete ==========')
  debugLog(`[Answer Parser] Returning ${result.citations.length} citation(s)`)
  debugLog('[Answer Parser] Result:', safeStringify(result))
  
  return result
}
