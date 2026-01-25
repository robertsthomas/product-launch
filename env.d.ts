/// <reference types="vite/client" />
/// <reference types="@react-router/node" />

interface ImportMetaEnv {
  readonly VITE_SHOPIFY_APP_STORE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
