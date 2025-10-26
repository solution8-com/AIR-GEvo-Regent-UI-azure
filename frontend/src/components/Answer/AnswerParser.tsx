import { cloneDeep } from 'lodash'

import { AskResponse, Citation } from '../../api'

export type ParsedAnswer = {
  citations: Citation[]
  markdownFormatText: string,
  generated_chart: string | null
} | null

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
  debugLog('[PromptFlow Citation Parser] Starting extraction from PromptFlow response')
  debugLog('[PromptFlow Citation Parser] Input answer object:', safeStringify(answer))
  
  const anyAnswer = answer as any
  const choices = anyAnswer?.choices
  
  debugLog('[PromptFlow Citation Parser] Checking for choices array in response')
  if (!Array.isArray(choices)) {
    debugLog('[PromptFlow Citation Parser] ❌ No choices array found in response - returning empty citations')
    return []
  }
  debugLog(`[PromptFlow Citation Parser] ✓ Found choices array with ${choices.length} choice(s)`)

  const out: Citation[] = []

  for (const choice of choices) {
    debugLog('[PromptFlow Citation Parser] Processing choice:', safeStringify(choice))
    const messages = choice?.messages
    
    if (!Array.isArray(messages)) {
      debugLog('[PromptFlow Citation Parser] ⚠ Choice does not contain messages array - skipping')
      continue
    }
    debugLog(`[PromptFlow Citation Parser] ✓ Found messages array with ${messages.length} message(s)`)

    for (const msg of messages) {
      debugLog('[PromptFlow Citation Parser] Examining message:', safeStringify(msg))
      
      if (msg?.role !== 'tool') {
        debugLog(`[PromptFlow Citation Parser] ⚠ Message role is "${msg?.role}", not "tool" - skipping`)
        continue
      }
      debugLog('[PromptFlow Citation Parser] ✓ Found message with role="tool"')
      
      if (msg?.content == null) {
        debugLog('[PromptFlow Citation Parser] ⚠ Tool message has null/undefined content - skipping')
        continue
      }
      debugLog('[PromptFlow Citation Parser] ✓ Tool message has content')

      let contentObj: any = msg.content
      if (typeof msg.content === 'string') {
        debugLog('[PromptFlow Citation Parser] Content is a string, attempting to parse as JSON')
        debugLog('[PromptFlow Citation Parser] Raw content string:', msg.content)
        try {
          contentObj = JSON.parse(msg.content)
          debugLog('[PromptFlow Citation Parser] ✓ Successfully parsed JSON content:', safeStringify(contentObj))
        } catch (err) {
          debugLog('[PromptFlow Citation Parser] ❌ Failed to parse JSON content:', err)
          continue
        }
      } else {
        debugLog('[PromptFlow Citation Parser] Content is already an object (not a string)')
      }

      const cits = contentObj?.citations
      debugLog('[PromptFlow Citation Parser] Checking for citations array in parsed content')
      if (!Array.isArray(cits)) {
        debugLog('[PromptFlow Citation Parser] ⚠ No citations array found in content object - skipping')
        debugLog('[PromptFlow Citation Parser] Content object keys:', Object.keys(contentObj ?? {}))
        continue
      }
      debugLog(`[PromptFlow Citation Parser] ✓ Found citations array with ${cits.length} citation(s)`)

      for (let i = 0; i < cits.length; i++) {
        const pf = cits[i]
        debugLog(`[PromptFlow Citation Parser] Processing citation ${i + 1}/${cits.length}:`, safeStringify(pf, 500))
        
        const citation: Citation = {
          id: pf?.docId ?? String(i + 1),
          content: pf?.content ?? '',
          title: pf?.title ?? null,
          filepath: pf?.source ?? pf?.filepath ?? null,
          url: pf?.url ?? null,
          metadata: pf?.page != null ? JSON.stringify({ page: pf.page }) : (pf?.metadata ?? null),
          chunk_id: pf?.chunk_id ?? null,
          reindex_id: null,
          part_index: pf?.page ?? undefined
        }
        
        debugLog(`[PromptFlow Citation Parser] ✓ Created Citation object:`, safeStringify(citation, 500))
        debugLog(`[PromptFlow Citation Parser]   - docId: ${pf?.docId} → id: ${citation.id}`)
        debugLog(`[PromptFlow Citation Parser]   - source: ${pf?.source} → filepath: ${citation.filepath}`)
        debugLog(`[PromptFlow Citation Parser]   - page: ${pf?.page} → part_index: ${citation.part_index}`)
        
        out.push(citation)
      }
    }
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
