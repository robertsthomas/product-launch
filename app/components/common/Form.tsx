import type React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  helpText?: string
  fullWidth?: boolean
}

export function Input({ label, error, helpText, fullWidth = false, className, ...props }: InputProps) {
  return (
    <div style={{ width: fullWidth ? '100%' : 'auto' }}>
      {label && (
        <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--text-sm)', fontWeight: '500', color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <input
        className={className}
        style={{
          width: fullWidth ? '100%' : 'auto',
          padding: '10px 12px',
          fontSize: 'var(--text-sm)',
          border: error ? '1px solid #dc2626' : '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          transition: 'all var(--transition-fast)',
        }}
        {...props}
      />
      {error && <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: '#dc2626' }}>{error}</div>}
      {helpText && <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{helpText}</div>}
    </div>
  )
}

interface TextAreaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  helpText?: string
  fullWidth?: boolean
}

export function TextArea({ label, error, helpText, fullWidth = false, className, ...props }: TextAreaProps) {
  return (
    <div style={{ width: fullWidth ? '100%' : 'auto' }}>
      {label && (
        <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--text-sm)', fontWeight: '500', color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <textarea
        className={className}
        style={{
          width: fullWidth ? '100%' : 'auto',
          padding: '10px 12px',
          fontSize: 'var(--text-sm)',
          border: error ? '1px solid #dc2626' : '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          fontFamily: 'inherit',
          transition: 'all var(--transition-fast)',
          resize: 'vertical',
        }}
        {...props}
      />
      {error && <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: '#dc2626' }}>{error}</div>}
      {helpText && <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{helpText}</div>}
    </div>
  )
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  helpText?: string
  fullWidth?: boolean
  options?: Array<{ value: string; label: string }>
}

export function Select({ label, error, helpText, fullWidth = false, options, className, ...props }: SelectProps) {
  return (
    <div style={{ width: fullWidth ? '100%' : 'auto' }}>
      {label && (
        <label style={{ display: 'block', marginBottom: '8px', fontSize: 'var(--text-sm)', fontWeight: '500', color: 'var(--color-text)' }}>
          {label}
        </label>
      )}
      <select
        className={className}
        style={{
          width: fullWidth ? '100%' : 'auto',
          padding: '10px 12px',
          fontSize: 'var(--text-sm)',
          border: error ? '1px solid #dc2626' : '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-surface)',
          color: 'var(--color-text)',
          transition: 'all var(--transition-fast)',
        }}
        {...props}
      >
        {options?.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: '#dc2626' }}>{error}</div>}
      {helpText && <div style={{ marginTop: '4px', fontSize: 'var(--text-xs)', color: 'var(--color-muted)' }}>{helpText}</div>}
    </div>
  )
}

interface FormGroupProps {
  children: React.ReactNode
  layout?: 'vertical' | 'horizontal'
  gap?: string
  className?: string
  style?: React.CSSProperties
}

export function FormGroup({ children, layout = 'vertical', gap = 'var(--space-4)', className, style }: FormGroupProps) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: layout === 'vertical' ? 'column' : 'row',
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  )
}
