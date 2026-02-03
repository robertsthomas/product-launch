import { useState } from 'react'
import { ChevronIcon } from './IconButton'

interface CollapsibleProps {
  title: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  onToggle?: (isOpen: boolean) => void
  className?: string
  style?: React.CSSProperties
}

export function Collapsible({ title, children, defaultOpen = false, onToggle, className, style }: CollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  const handleToggle = () => {
    const newState = !isOpen
    setIsOpen(newState)
    onToggle?.(newState)
  }

  return (
    <div
      className={className}
      style={{
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        transition: 'all var(--transition-base)',
        background: 'var(--color-surface)',
        ...style,
      }}
    >
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: 'var(--space-4)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'var(--color-text)',
          transition: 'all var(--transition-fast)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--color-surface-strong)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent'
        }}
      >
        <div style={{ fontWeight: '500', fontSize: 'var(--text-sm)' }}>{title}</div>
        <div style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform var(--transition-fast)' }}>
          <ChevronIcon direction="down" />
        </div>
      </button>

      {isOpen && (
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            padding: 'var(--space-4)',
            animation: 'slideDown 0.2s ease-out',
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

interface AccordionProps {
  items: Array<{
    id: string | number
    title: React.ReactNode
    content: React.ReactNode
  }>
  allowMultiple?: boolean
  className?: string
  style?: React.CSSProperties
}

export function Accordion({ items, allowMultiple = false, className, style }: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string | number>>(new Set())

  const handleToggle = (id: string | number) => {
    const newOpenItems = new Set(openItems)
    if (newOpenItems.has(id)) {
      newOpenItems.delete(id)
    } else {
      if (!allowMultiple) {
        newOpenItems.clear()
      }
      newOpenItems.add(id)
    }
    setOpenItems(newOpenItems)
  }

  return (
    <div className={className} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', ...style }}>
      {items.map((item) => (
        <Collapsible
          key={item.id}
          title={item.title}
          defaultOpen={openItems.has(item.id)}
          onToggle={() => handleToggle(item.id)}
        >
          {item.content}
        </Collapsible>
      ))}
    </div>
  )
}
