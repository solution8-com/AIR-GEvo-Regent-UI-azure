import { useEffect, useCallback, useRef } from 'react'
import { useBoolean } from '@fluentui/react-hooks'

interface UseExitIntentProps {
  enabled: boolean
  conversationId: string | null
  hasUserMessage: boolean
  hasAssistantMessage: boolean
  isStreaming: boolean
}

interface UseExitIntentReturn {
  isModalOpen: boolean
  showModal: () => void
  hideModal: () => void
}

const COOLDOWN_MS = 5000 // 5 seconds
const WHITE_FLASH_DURATION = 150 // 150ms

export const useExitIntent = ({
  enabled,
  conversationId,
  hasUserMessage,
  hasAssistantMessage,
  isStreaming
}: UseExitIntentProps): UseExitIntentReturn => {
  const [isModalOpen, { setTrue: showModal, setFalse: hideModal }] = useBoolean(false)
  const lastTriggerTime = useRef<number>(0)
  const flashOverlayRef = useRef<HTMLDivElement | null>(null)

  const isQualified = hasUserMessage && hasAssistantMessage

  const showWhiteFlash = useCallback(() => {
    // Create flash overlay if it doesn't exist
    if (!flashOverlayRef.current) {
      const overlay = document.createElement('div')
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-color: white;
        opacity: 0;
        pointer-events: none;
        z-index: 9999;
        transition: opacity ${WHITE_FLASH_DURATION}ms ease-out;
      `
      document.body.appendChild(overlay)
      flashOverlayRef.current = overlay
    }

    const overlay = flashOverlayRef.current

    // Flash white
    overlay.style.opacity = '0.6'

    setTimeout(() => {
      if (overlay) {
        overlay.style.opacity = '0'
      }
    }, WHITE_FLASH_DURATION)
  }, [])

  const handleExitAttempt = useCallback(() => {
    // Feature gate: only active when enabled
    if (!enabled) {
      return
    }

    // Check qualification
    if (!isQualified || !conversationId) {
      return
    }

    // Check if already submitted (check at runtime for fresh value)
    const hasSubmitted = sessionStorage.getItem(`exit_intent_submitted_${conversationId}`) === 'true'
    if (hasSubmitted) {
      return
    }

    // Check cooldown
    const now = Date.now()
    if (now - lastTriggerTime.current < COOLDOWN_MS) {
      return
    }

    lastTriggerTime.current = now

    // Show flash and modal
    showWhiteFlash()
    showModal()
  }, [enabled, isQualified, conversationId, showWhiteFlash, showModal])

  // Mouse leave at top edge trigger
  useEffect(() => {
    if (!enabled) {
      return
    }

    const handleMouseLeave = (event: MouseEvent) => {
      // Only trigger if mouse leaves from the top edge
      if (event.clientY <= 0) {
        handleExitAttempt()
      }
    }

    document.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave)
    }
  }, [enabled, handleExitAttempt])

  // Page hide for telemetry only
  useEffect(() => {
    if (!enabled) {
      return
    }

    const handlePageHide = () => {
      if (isStreaming) {
        console.log('[Exit Intent] User canceled early during streaming')
      }
    }

    window.addEventListener('pagehide', handlePageHide)

    return () => {
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [enabled, isStreaming])

  // Cleanup flash overlay on unmount
  useEffect(() => {
    return () => {
      if (flashOverlayRef.current) {
        flashOverlayRef.current.remove()
        flashOverlayRef.current = null
      }
    }
  }, [])

  return {
    isModalOpen,
    showModal: handleExitAttempt,
    hideModal
  }
}
