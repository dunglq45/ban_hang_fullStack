import { useMatches } from "react-router";

/** Khai báo ở `handle` của route: hiện trên header (đường dẫn trang + tiêu đề) và tiêu đề tab. */
export interface PageMeta {
  /** Dòng nhỏ phía trên tiêu đề: "Vận hành", "Hàng hóa"... */
  section: string;
  title: string;
}

function isPageMeta(handle: unknown): handle is PageMeta {
  return typeof (handle as PageMeta | null)?.title === "string";
}

/** Meta của route sâu nhất có khai báo. */
export function usePageMeta(): PageMeta | undefined {
  const matches = useMatches();
  for (let i = matches.length - 1; i >= 0; i--) {
    const handle = matches[i]!.handle;
    if (isPageMeta(handle)) return handle;
  }
  return undefined;
}
