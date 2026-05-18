import { useCallback, useEffect, useRef } from 'react'
import { SendHorizontal, Square } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'
import { uploadImage } from '@/lib/upload'

type ChatInputProps = {
  input: string
  isStreaming: boolean
  onInputChange: (value: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
  onInsertText: (text: string) => void
  onSend: () => void
}

export const ChatInput = ({
  input,
  isStreaming,
  onInputChange,
  onKeyDown,
  onInsertText,
  onSend,
}: ChatInputProps) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isMobile = useIsMobile()

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return

    // Reset height to recalculate
    textarea.style.height = '0px'
    // Set new height based on scrollHeight
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [input])

  // On mobile, scroll input into view when focused (helps with virtual keyboard)
  useEffect(() => {
    if (!isMobile) return
    const textarea = textareaRef.current
    if (!textarea) return

    const handleFocus = () => {
      // Small delay to let the virtual keyboard appear
      setTimeout(() => {
        textarea.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 300)
    }

    textarea.addEventListener('focus', handleFocus)
    return () => textarea.removeEventListener('focus', handleFocus)
  }, [isMobile])

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return

      for (const item of items) {
        if (!item.type.startsWith('image/')) continue

        e.preventDefault()
        const blob = item.getAsFile()
        if (!blob) continue

        try {
          const { absolutePath } = await uploadImage(blob)
          onInsertText(`![screenshot](${absolutePath})`)
        } catch (err) {
          console.error('Failed to upload image:', err)
        }
        return
      }
    },
    [onInsertText],
  )

  const canSend = input.trim().length > 0

  return (
    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-end gap-2">
      <span className="text-blue-700 dark:text-blue-500 leading-normal pb-0.5">&gt;</span>
      <textarea
        ref={textareaRef}
        value={input}
        onChange={e => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={handlePaste}
        rows={1}
        className="flex-1 bg-transparent outline-none caret-blue-500 text-blue-700 dark:text-blue-300 placeholder:text-gray-500 dark:placeholder:text-gray-400 resize-none overflow-hidden leading-normal"
        style={{ maxHeight: '12rem' }}
        placeholder={
          isStreaming
            ? '输入 /abort 停止生成'
            : isMobile
              ? '输入消息...'
              : '输入消息（Shift+Enter 换行，/help 查看命令）'
        }
        spellCheck={false}
      />
      {/* Send/Abort button - always visible on mobile, visible on desktop when there's input */}
      {(isMobile || canSend || isStreaming) && (
        <button
          type="button"
          onClick={onSend}
          disabled={isStreaming ? false : !canSend}
          className={`shrink-0 p-1.5 rounded-md transition-colors ${
            isStreaming
              ? 'text-red-500 hover:bg-red-100 dark:hover:bg-red-950/30'
              : canSend
                ? 'text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-950/30'
                : 'text-gray-300 dark:text-gray-600'
          }`}
          title={isStreaming ? 'Abort' : 'Send'}
        >
          {isStreaming ? (
            <Square className="size-4" />
          ) : (
            <SendHorizontal className="size-4" />
          )}
        </button>
      )}
    </div>
  )
}