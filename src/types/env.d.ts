/// <reference types="vite/client" />

// Vite env vars this app reads (see src/core/config.ts). All optional.
interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_UPDATES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
