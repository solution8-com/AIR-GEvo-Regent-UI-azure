import React, { useState, useCallback, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogType,
  DialogFooter,
  PrimaryButton,
  DefaultButton,
  TextField,
  Stack,
  Text
} from '@fluentui/react'
import { useBoolean } from '@fluentui/react-hooks'

import { intentClassification, ExitIntent, IntentClassificationResponse, ExitIntentLog } from '../../api'

import styles from './ExitIntentModal.module.css'

interface ExitIntentModalProps {
  isOpen: boolean
  onDismiss: () => void
  conversationId: string
  messages: Array<{ role: string; content: string | any }>
  isStreaming: boolean
}

const FALLBACK_INTENTS: ExitIntent[] = [
  { label: 'I achieved my goal', confidence: 1.0 },
  { label: 'I did not get to what I wanted', confidence: 1.0 },
  { label: 'It was too hard', confidence: 1.0 }
]

const MAX_FREE_TEXT_LENGTH = 500

export const ExitIntentModal: React.FC<ExitIntentModalProps> = ({
  isOpen,
  onDismiss,
  conversationId,
  messages,
  isStreaming
}) => {
  const [selectedIntent, setSelectedIntent] = useState<string | null>(null)
  const [selectedConfidence, setSelectedConfidence] = useState<number | undefined>(undefined)
  const [freeText, setFreeText] = useState<string>('')
  const [intents, setIntents] = useState<ExitIntent[]>(FALLBACK_INTENTS)
  const [intentSource, setIntentSource] = useState<'model' | 'fallback'>('fallback')
  const [isLoadingIntents, { setTrue: startLoading, setFalse: stopLoading }] = useBoolean(false)

  // Fetch intent classification when modal opens
  useEffect(() => {
    if (!isOpen) {
      return
    }

    // Reset state
    setSelectedIntent(null)
    setSelectedConfidence(undefined)
    setFreeText('')
    setIntents(FALLBACK_INTENTS)
    setIntentSource('fallback')

    // Start loading and fetch intents
    startLoading()

    const fetchIntents = async () => {
      try {
        // Prepare messages for classification
        const simplifiedMessages = messages.map(msg => {
          let content = msg.content
          if (typeof content !== 'string') {
            // Handle multi-part content
            if (Array.isArray(content)) {
              const textParts = content
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text || '')
              content = textParts.join(' ')
            } else {
              content = ''
            }
          }
          return {
            role: msg.role,
            content: String(content)
          }
        })

        const response = await intentClassification(conversationId, simplifiedMessages)

        if (!response.ok) {
          console.warn('Intent classification failed, using fallback')
          stopLoading()
          return
        }

        const data: IntentClassificationResponse = await response.json()

        if (data.fallback || !data.intents || data.intents.length === 0) {
          console.warn('Using fallback intents')
          stopLoading()
          return
        }

        // Successfully got intents from model
        setIntents(data.intents)
        setIntentSource('model')
        stopLoading()
      } catch (error) {
        console.error('Error fetching intents:', error)
        stopLoading()
      }
    }

    fetchIntents()
  }, [isOpen, conversationId, messages, startLoading, stopLoading])

  const handleIntentClick = useCallback((intent: ExitIntent) => {
    setSelectedIntent(intent.label)
    setSelectedConfidence(intent.confidence)
  }, [])

  const handleSubmit = useCallback(() => {
    // Log the exit intent
    const log: ExitIntentLog = {
      conversation_id: conversationId,
      timestamp: new Date().toISOString(),
      selected_intent: selectedIntent || 'none',
      confidence: selectedConfidence,
      free_text: freeText.trim() || undefined,
      user_canceled_early: isStreaming,
      source: intentSource
    }

    // Log to console (in production, this would be sent to analytics)
    console.log('[Exit Intent]', log)

    // Mark this conversation as submitted in sessionStorage
    sessionStorage.setItem(`exit_intent_submitted_${conversationId}`, 'true')

    onDismiss()
  }, [conversationId, selectedIntent, selectedConfidence, freeText, isStreaming, intentSource, onDismiss])

  const handleTextChange = useCallback(
    (_event: React.FormEvent<HTMLInputElement | HTMLTextAreaElement>, newValue?: string) => {
      if (newValue !== undefined && newValue.length <= MAX_FREE_TEXT_LENGTH) {
        setFreeText(newValue)
      }
    },
    []
  )

  const canSubmit = useMemo(() => {
    return selectedIntent !== null || freeText.trim().length > 0
  }, [selectedIntent, freeText])

  return (
    <Dialog
      hidden={!isOpen}
      onDismiss={onDismiss}
      dialogContentProps={{
        type: DialogType.normal,
        title: 'Before you go',
        subText: 'Help us understand your experience.'
      }}
      modalProps={{
        isBlocking: false,
        className: styles.modal
      }}
    >
      <Stack tokens={{ childrenGap: 16 }}>
        <Stack tokens={{ childrenGap: 8 }}>
          <Text variant="medium">What best describes your situation?</Text>
          {isLoadingIntents && (
            <Text variant="small" styles={{ root: { fontStyle: 'italic', color: '#666' } }}>
              Loading suggestions...
            </Text>
          )}
          <Stack tokens={{ childrenGap: 8 }}>
            {intents.map((intent, index) => (
              <DefaultButton
                key={index}
                text={intent.label}
                onClick={() => handleIntentClick(intent)}
                className={selectedIntent === intent.label ? styles.selectedButton : styles.intentButton}
                styles={{
                  root: {
                    width: '100%',
                    textAlign: 'left',
                    justifyContent: 'flex-start',
                    height: 'auto',
                    minHeight: '40px',
                    padding: '12px 16px',
                    whiteSpace: 'normal',
                    wordWrap: 'break-word'
                  }
                }}
              />
            ))}
          </Stack>
        </Stack>

        <TextField
          label="Additional feedback (optional)"
          multiline
          rows={3}
          value={freeText}
          onChange={handleTextChange}
          placeholder="Tell us more about your experience..."
          maxLength={MAX_FREE_TEXT_LENGTH}
          description={`${freeText.length}/${MAX_FREE_TEXT_LENGTH} characters`}
        />
      </Stack>

      <DialogFooter>
        <PrimaryButton onClick={handleSubmit} text="Submit" disabled={!canSubmit} />
        <DefaultButton onClick={onDismiss} text="Cancel" />
      </DialogFooter>
    </Dialog>
  )
}
