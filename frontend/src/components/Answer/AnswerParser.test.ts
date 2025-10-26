import { cloneDeep } from 'lodash'

import { AskResponse, Citation } from '../../api' // Ensure this path matches the location of your types

import { enumerateCitations, parseAnswer, ParsedAnswer } from './AnswerParser' // Update the path accordingly

const sampleCitations: Citation[] = [
  {
    id: 'doc1',
    filepath: 'file1.pdf',
    part_index: undefined,
    content: '',
    title: null,
    url: null,
    metadata: null,
    chunk_id: null,
    reindex_id: null
  },
  {
    id: 'doc2',
    filepath: 'file1.pdf',
    part_index: undefined,
    content: '',
    title: null,
    url: null,
    metadata: null,
    chunk_id: null,
    reindex_id: null
  },
  {
    id: 'doc3',
    filepath: 'file2.pdf',
    part_index: undefined,
    content: '',
    title: null,
    url: null,
    metadata: null,
    chunk_id: null,
    reindex_id: null
  }
]

const sampleAnswer: AskResponse = {
  answer: 'This is an example answer with citations [doc1] and [doc2].',
  citations: cloneDeep(sampleCitations),
  generated_chart: null
}

describe('enumerateCitations', () => {
  it('assigns unique part_index based on filepath', () => {
    const results = enumerateCitations(cloneDeep(sampleCitations))
    expect(results[0].part_index).toEqual(1)
    expect(results[1].part_index).toEqual(2)
    expect(results[2].part_index).toEqual(1)
  })
})

describe('parseAnswer - PromptFlow citation extraction', () => {
  // Mock console.log to reduce test output noise
  let consoleLogSpy: jest.SpyInstance
  
  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation()
  })
  
  afterEach(() => {
    consoleLogSpy.mockRestore()
  })

  it('should extract citations from PromptFlow tool role messages when no inline citations present', () => {
    const promptFlowResponse: any = {
      answer: 'BROEN-LAB UniFlex™ fittings are needed for Grade 3 purified water.',
      citations: [],
      generated_chart: null,
      choices: [
        {
          messages: [
            {
              content: 'BROEN-LAB UniFlex™ fittings are needed for Grade 3 purified water.',
              role: 'assistant'
            },
            {
              content: '{"citations": [{"docId": "TI46", "page": 1, "source": "Technical information - TI46 - LAB - Installation, Maintenance and Operation Special Water rev 01.pdf"}]}',
              role: 'tool'
            }
          ]
        }
      ]
    }
    
    const result = parseAnswer(promptFlowResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(1)
    expect(result?.citations[0].id).toBe('TI46')
    expect(result?.citations[0].filepath).toBe('Technical information - TI46 - LAB - Installation, Maintenance and Operation Special Water rev 01.pdf')
    expect(result?.citations[0].part_index).toBe(1)
    expect(result?.citations[0].reindex_id).toBe('1')
    expect(result?.citations[0].metadata).toBe('{"page":1}')
  })

  it('should extract multiple citations from PromptFlow tool messages', () => {
    const promptFlowResponse: any = {
      answer: 'Multiple sources provide information about water treatment.',
      citations: [],
      generated_chart: null,
      choices: [
        {
          messages: [
            {
              content: 'Multiple sources provide information.',
              role: 'assistant'
            },
            {
              content: JSON.stringify({
                citations: [
                  { docId: 'TI46', page: 1, source: 'document1.pdf' },
                  { docId: 'TI47', page: 2, source: 'document2.pdf' },
                  { docId: 'TI48', page: 3, source: 'document3.pdf' }
                ]
              }),
              role: 'tool'
            }
          ]
        }
      ]
    }
    
    const result = parseAnswer(promptFlowResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(3)
    expect(result?.citations[0].id).toBe('TI46')
    expect(result?.citations[0].reindex_id).toBe('1')
    expect(result?.citations[1].id).toBe('TI47')
    expect(result?.citations[1].reindex_id).toBe('2')
    expect(result?.citations[2].id).toBe('TI48')
    expect(result?.citations[2].reindex_id).toBe('3')
  })

  it('should NOT use PromptFlow citations when inline citations are present', () => {
    const mixedResponse: any = {
      answer: 'This has inline citation [doc1].',
      citations: cloneDeep(sampleCitations),
      generated_chart: null,
      choices: [
        {
          messages: [
            {
              content: 'Answer text',
              role: 'assistant'
            },
            {
              content: '{"citations": [{"docId": "TI46", "page": 1, "source": "promptflow.pdf"}]}',
              role: 'tool'
            }
          ]
        }
      ]
    }
    
    const result = parseAnswer(mixedResponse)
    
    expect(result).not.toBeNull()
    // Should use inline citation, not PromptFlow
    expect(result?.citations).toHaveLength(1)
    expect(result?.citations[0].id).toBe('1') // from inline [doc1]
    expect(result?.citations[0].filepath).toBe('file1.pdf') // from sampleCitations
  })

  it('should handle missing choices array gracefully', () => {
    const noChoicesResponse: AskResponse = {
      answer: 'Answer without choices.',
      citations: [],
      generated_chart: null
    }
    
    const result = parseAnswer(noChoicesResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(0)
  })

  it('should handle missing messages array gracefully', () => {
    const noMessagesResponse: any = {
      answer: 'Answer text.',
      citations: [],
      generated_chart: null,
      choices: [{}]
    }
    
    const result = parseAnswer(noMessagesResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(0)
  })

  it('should handle non-tool role messages gracefully', () => {
    const noToolRoleResponse: any = {
      answer: 'Answer text.',
      citations: [],
      generated_chart: null,
      choices: [
        {
          messages: [
            {
              content: 'Answer',
              role: 'assistant'
            },
            {
              content: '{"citations": [{"docId": "TI46"}]}',
              role: 'user' // Wrong role
            }
          ]
        }
      ]
    }
    
    const result = parseAnswer(noToolRoleResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(0)
  })

  it('should handle invalid JSON in tool content gracefully', () => {
    const invalidJsonResponse: any = {
      answer: 'Answer text.',
      citations: [],
      generated_chart: null,
      choices: [
        {
          messages: [
            {
              content: 'Answer',
              role: 'assistant'
            },
            {
              content: '{invalid json',
              role: 'tool'
            }
          ]
        }
      ]
    }
    
    const result = parseAnswer(invalidJsonResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(0)
  })

  it('should handle missing citations array in parsed content', () => {
    const noCitationsArrayResponse: any = {
      answer: 'Answer text.',
      citations: [],
      generated_chart: null,
      choices: [
        {
          messages: [
            {
              content: 'Answer',
              role: 'assistant'
            },
            {
              content: '{"other_field": "value"}',
              role: 'tool'
            }
          ]
        }
      ]
    }
    
    const result = parseAnswer(noCitationsArrayResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(0)
  })

  it('should handle citations with minimal fields', () => {
    const minimalCitationResponse: any = {
      answer: 'Answer text.',
      citations: [],
      generated_chart: null,
      choices: [
        {
          messages: [
            {
              content: 'Answer',
              role: 'assistant'
            },
            {
              content: '{"citations": [{}]}', // Empty citation object
              role: 'tool'
            }
          ]
        }
      ]
    }
    
    const result = parseAnswer(minimalCitationResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(1)
    expect(result?.citations[0].id).toBe('1') // Fallback ID
    expect(result?.citations[0].filepath).toBeNull()
  })

  it('should preserve source field as filepath when both are present', () => {
    const sourceAndFilepathResponse: any = {
      answer: 'Answer text.',
      citations: [],
      generated_chart: null,
      choices: [
        {
          messages: [
            {
              content: 'Answer',
              role: 'assistant'
            },
            {
              content: JSON.stringify({
                citations: [{
                  docId: 'TEST',
                  source: 'source-file.pdf',
                  filepath: 'filepath-file.pdf'
                }]
              }),
              role: 'tool'
            }
          ]
        }
      ]
    }
    
    const result = parseAnswer(sourceAndFilepathResponse)
    
    expect(result).not.toBeNull()
    expect(result?.citations).toHaveLength(1)
    // source should take precedence over filepath
    expect(result?.citations[0].filepath).toBe('source-file.pdf')
  })
})
