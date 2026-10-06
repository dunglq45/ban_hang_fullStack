// Vite thay `import.meta.env.DEV` lúc build (true khi `pnpm dev` và khi chạy test, false trong bản build).
// Project worker không nạp `vite/client` (tránh kéo type DOM), nên khai báo riêng phần dùng tới.
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
