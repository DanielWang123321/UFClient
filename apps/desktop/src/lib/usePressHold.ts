import { onBeforeUnmount, ref, watch } from 'vue'
import { PressHold, STATE } from './motion'
import { useMotionStore } from '../stores/motion'

export interface JogCallbacks {
  onClick: () => void
  onHoldStart: () => void
}

/** Shared press-and-hold + keyboard step binding for jog and preset buttons. */
export function usePressHold() {
  const motion = useMotionStore()
  const activeId = ref('')
  const holders = new Map<string, PressHold>()

  function getHolder(id: string, cbs: JogCallbacks): PressHold {
    let h = holders.get(id)
    if (!h) {
      h = new PressHold({
        onClick: cbs.onClick,
        onHoldStart: cbs.onHoldStart,
        onHoldEnd: () => motion.stop(),
      })
      holders.set(id, h)
    }
    return h
  }

  function abortAll() {
    activeId.value = ''
    for (const h of holders.values()) h.abort()
  }

  function down(e: PointerEvent, id: string, cbs: JogCallbacks, disabled = false) {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.preventDefault()
    abortAll()
    motion.stop()
    const el = e.currentTarget as HTMLElement | null
    el?.focus?.({ preventScroll: true })
    try {
      el?.setPointerCapture?.(e.pointerId)
    } catch {
      /* synthetic events may omit active pointer */
    }
    activeId.value = id
    getHolder(id, cbs).press()
  }

  function up(e: PointerEvent, id: string) {
    if (activeId.value !== id) return
    activeId.value = ''
    const el = e.currentTarget as HTMLElement | null
    try {
      if (el?.hasPointerCapture?.(e.pointerId)) el.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    holders.get(id)?.release()
  }

  function cancel(id: string) {
    if (activeId.value !== id) return
    activeId.value = ''
    const h = holders.get(id)
    const wasHolding = h?.isActive() ?? false
    h?.cancel()
    if (wasHolding) motion.stop()
  }

  function key(e: KeyboardEvent, id: string, onClick: () => void, disabled = false) {
    if (disabled || (e.key !== 'Enter' && e.key !== ' ')) return
    e.preventDefault()
    if (!e.repeat) {
      abortAll()
      motion.stop()
      onClick()
    }
  }

  watch(
    () => motion.state,
    (s) => {
      if (s === STATE.stopped) abortAll()
    },
  )

  onBeforeUnmount(() => {
    abortAll()
  })

  return { activeId, down, up, cancel, key, abortAll }
}
