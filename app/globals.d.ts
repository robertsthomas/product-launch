/// <reference types="react" />

declare module "*.css"

// Polaris web components type declarations
declare namespace JSX {
  interface IntrinsicElements {
    "s-page": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      heading?: string
      backAction?: { onAction: () => void }
    }
    "s-card": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    "s-box": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      padding?: string
    }
    "s-button": React.DetailedHTMLProps<React.ButtonHTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
      variant?: "primary" | "secondary" | "tertiary"
      size?: "slim" | "medium" | "large"
      loading?: boolean
      slot?: string
    }
    "s-section": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      heading?: string
    }
    "s-stack": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      direction?: "inline" | "block"
      gap?: string
      align?: string
      blockAlign?: string
    }
    "s-text": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      variant?: string
      tone?: string
      fontWeight?: string
    }
    "s-checkbox": React.DetailedHTMLProps<React.InputHTMLAttributes<HTMLInputElement>, HTMLInputElement> & {
      label?: string
      helpText?: string
      checked?: boolean
      onChange?: (checked: boolean) => void
    }
    "s-select": React.DetailedHTMLProps<React.SelectHTMLAttributes<HTMLSelectElement>, HTMLSelectElement> & {
      label?: string
      labelHidden?: boolean
      options?: Array<{ label: string; value: string }>
      onChange?: (value: string) => void
    }
    "s-progress-bar": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      progress?: number
      tone?: string
    }
    "s-thumbnail": React.DetailedHTMLProps<React.ImgHTMLAttributes<HTMLImageElement>, HTMLImageElement> & {
      source?: string
      alt?: string
      size?: string
    }
    "s-badge": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      tone?: string
      size?: string
    }
    "s-divider": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      direction?: "horizontal" | "vertical"
    }
    "s-paragraph": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    "s-resource-list": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    "s-resource-item": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
    "s-link": React.DetailedHTMLProps<React.AnchorHTMLAttributes<HTMLAnchorElement>, HTMLAnchorElement>
    "s-icon": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      source?: string
      tone?: string
    }
    "s-banner": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      tone?: string
      heading?: string
    }
    "s-app-nav": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>
  }
}
