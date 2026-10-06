/** Các trang cần hiện: trang đầu, cuối, quanh trang hiện tại; "gap" là dấu "…". */
export function pageList(page: number, totalPages: number): Array<number | "gap"> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  let start = Math.max(2, page - 1);
  let end = Math.min(totalPages - 1, page + 1);
  if (page <= 3) end = 4;
  if (page >= totalPages - 2) start = totalPages - 3;
  const pages: Array<number | "gap"> = [1];
  if (start > 2) pages.push("gap");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push("gap");
  pages.push(totalPages);
  return pages;
}
