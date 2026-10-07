// "In hóa đơn sau khi bán": lưu ở localStorage của trình duyệt, dùng chung cho màn Bán hàng
// và trang Cài đặt. Mặc định là in.

const PRINT_KEY = "pos:print";

export function loadPosPrint(): boolean {
  try {
    return localStorage.getItem(PRINT_KEY) !== "0";
  } catch {
    return true;
  }
}

export function savePosPrint(value: boolean) {
  try {
    localStorage.setItem(PRINT_KEY, value ? "1" : "0");
  } catch {
    // Không lưu được lựa chọn: lần sau mặc định lại là in.
  }
}

export type ReceiptWidth = 58 | 80;
const PAPER_KEY = "pos:paper";

/** Khổ giấy máy in nhiệt (hóa đơn, phiếu thu/chi): 58mm hoặc 80mm. Mặc định 80mm. */
export function loadReceiptWidth(): ReceiptWidth {
  try {
    return localStorage.getItem(PAPER_KEY) === "58" ? 58 : 80;
  } catch {
    return 80;
  }
}

export function saveReceiptWidth(value: ReceiptWidth) {
  try {
    localStorage.setItem(PAPER_KEY, String(value));
  } catch {
    // Không lưu được lựa chọn: lần sau mặc định lại là 80mm.
  }
}
