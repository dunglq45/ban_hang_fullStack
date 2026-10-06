/** Chỉ nhận đường dẫn nội bộ ("/hang-hoa"), không nhận "//site-khac.com", "/\site-khac.com"... */
export function isSafePath(path: string | undefined): path is string {
  if (!path || !path.startsWith("/")) return false;
  try {
    return new URL(path, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}
