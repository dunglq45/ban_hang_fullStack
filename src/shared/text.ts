// Xử lý chữ tiếng Việt cho tìm kiếm: gõ "nuoc mam" vẫn ra "Nước mắm".

/** Bỏ dấu tiếng Việt, kể cả đ/Đ → d/D (đ không phải ký tự tổ hợp nên NFD không tách được). */
export function removeDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D");
}

/** Chuẩn hóa để lưu cột name_search và để so khớp: bỏ dấu, chữ thường, gộp khoảng trắng. */
export function toSearch(s: string): string {
  return removeDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();
}

/** Giá trị cột products.name_search: tên + mã + mã vạch. */
export function productSearchText(p: { name: string; code: string; barcode?: string | null }): string {
  return toSearch(`${p.name} ${p.code} ${p.barcode ?? ""}`);
}

/** Giá trị cột contacts.name_search: tên + mã + số điện thoại. */
export function contactSearchText(c: { name: string; code: string; phone?: string | null }): string {
  return toSearch(`${c.name} ${c.code} ${c.phone ?? ""}`);
}
