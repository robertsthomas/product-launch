import type React from 'react'

interface BadgeProps {
  children: React.ReactNode
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral'
  size?: 'sm' | 'md'
  className?: string
  style?: React.CSSProperties
}

const variantStyles = {
  primary: { background: 'var(--color-primary-soft)', color: 'var(--color-primary)', border: '1px solid var(--color-primary-strong)' },
  success: { background: '#dcfce7', color: '#166534', border: '1px solid #86efac' },
  warning: { background: '#fef08a', color: '#854d0e', border: '1px solid #facc15' },
  danger: { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
  neutral: { background: 'var(--color-surface-strong)', color: 'var(--color-muted)', border: '1px solid var(--color-border)' },
}

const sizeStyles = {
  sm: { padding: '4px 8px', fontSize: 'var(--text-xs)' },
  md: { padding: '6px 12px', fontSize: 'var(--text-sm)' },
}

export function Badge({ children, variant = 'neutral', size = 'sm', className, style }: BadgeProps) {
  const vStyle = variantStyles[variant]
  const sStyle = sizeStyles[size]

  return (
    <span
      className={className}
      style={{
        ...vStyle,
        ...sStyle,
        borderRadius: 'var(--radius-md)',
        fontWeight: '500',
        display: 'inline-block',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  style?: React.CSSProperties
}

export function EmptyState({ icon, title, description, action, style }: EmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-12)',
        textAlign: 'center',
        ...style,
      }}
    >
      {icon && <div style={{ marginBottom: 'var(--space-4)', color: 'var(--color-muted)' }}>{icon}</div>}
      <h3 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--text-lg)', fontWeight: '600', color: 'var(--color-text)' }}>
        {title}
      </h3>
      {description && (
        <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--text-sm)', color: 'var(--color-muted)', maxWidth: '300px' }}>
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message: string
  action?: React.ReactNode
  style?: React.CSSProperties
}

export function ErrorState({ title = 'Error', message, action, style }: ErrorStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8)',
        background: '#fee2e2',
        border: '1px solid #fca5a5',
        borderRadius: 'var(--radius-lg)',
        textAlign: 'center',
        ...style,
      }}
    >
      <h3 style={{ margin: '0 0 var(--space-2) 0', fontSize: 'var(--text-lg)', fontWeight: '600', color: '#991b1b' }}>
        {title}
      </h3>
      <p style={{ margin: '0 0 var(--space-4) 0', fontSize: 'var(--text-sm)', color: '#7f1d1d', maxWidth: '300px' }}>
        {message}
      </p>
      {action && <div>{action}</div>}
    </div>
  )
}

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  text?: string
}

const spinnerSizes = {
  sm: '24px',
  md: '40px',
  lg: '56px',
}

export function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
  const spinnerSize = spinnerSizes[size]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-4)',
      }}
    >
      <svg
        width={spinnerSize}
        height={spinnerSize}
        viewBox="0 0 24 24"
        fill="none"
        style={{
          animation: 'spin 1s linear infinite',
        }}
      >
        <circle cx="12" cy="12" r="10" stroke="var(--color-border)" strokeWidth="2" />
        <circle cx="12" cy="12" r="10" stroke="var(--color-primary)" strokeWidth="2" strokeDasharray="15.7 47.1" />
      </svg>
      {text && <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-muted)' }}>{text}</p>}
    </div>
  )
}

interface ProgressIndicatorProps {
  current: number
  total: number
  size?: 'sm' | 'md' | 'lg'
}

export function ProgressIndicator({ current, total, size = 'md' }: ProgressIndicatorProps) {
  const percentage = (current / total) * 100
  const heights = { sm: '4px', md: '6px', lg: '8px' }

  return (
    <div
      style={{
        width: '100%',
        height: heights[size],
        background: 'var(--color-surface-strong)',
        borderRadius: 'var(--radius-full)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${percentage}%`,
          background: 'var(--color-primary)',
          transition: 'width 0.3s ease',
          borderRadius: 'var(--radius-full)',
        }}
      />
    </div>
  )
}
