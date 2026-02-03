import type React from 'react'

interface CardProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
  hoverable?: boolean
}

export function Card({ children, style, className, hoverable = false }: CardProps) {
  return (
    <div
      className={className}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all var(--transition-base)',
        cursor: hoverable ? 'pointer' : 'auto',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

interface CardHeaderProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}

export function CardHeader({ children, style, className }: CardHeaderProps) {
  return (
    <div
      className={className}
      style={{
        padding: 'var(--space-6)',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-surface-strong)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

interface CardBodyProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}

export function CardBody({ children, style, className }: CardBodyProps) {
  return (
    <div
      className={className}
      style={{
        padding: 'var(--space-6)',
        ...style,
      }}
    >
      {children}
    </div>
  )
}

interface CardFooterProps {
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}

export function CardFooter({ children, style, className }: CardFooterProps) {
  return (
    <div
      className={className}
      style={{
        padding: 'var(--space-4) var(--space-6)',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-surface-strong)',
        display: 'flex',
        gap: 'var(--space-3)',
        alignItems: 'center',
        justifyContent: 'flex-end',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
