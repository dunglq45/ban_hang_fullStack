import { useEffect, useRef } from "react";

/** Máy quét USB gõ mỗi ký tự cách nhau vài ms; người gõ tay hiếm khi 3 phím liền dưới 35ms. */
const FAST_GAP_MS = 35;
/** Khi focus không ở ô nhập (vừa bấm nút), máy quét Bluetooth chậm vẫn được nhận. */
const SLOW_GAP_MS = 300;
const MIN_LENGTH = 4;
/** Từ ký tự nhanh thứ 3 trở đi thì chặn không cho chèn vào ô đang focus. */
const SUPPRESS_FROM = 3;

type TextField = HTMLInputElement | HTMLTextAreaElement;

function textFieldOf(el: Element | null): TextField | null {
  if (el instanceof HTMLTextAreaElement) return el;
  if (
    el instanceof HTMLInputElement &&
    ["text", "search", "tel", "password", ""].includes(el.type)
  ) {
    return el;
  }
  return null;
}

/** Đặt lại giá trị ô do React điều khiển (qua setter gốc + sự kiện input để onChange chạy). */
function setFieldValue(el: TextField, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/**
 * Nhận mã từ máy quét mã vạch (giả lập bàn phím: gõ rất nhanh rồi Enter) ở mọi nơi trên màn hình
 * đang dùng (Bán hàng, Nhập hàng, Kiểm kho):
 * - Focus ở ô nhập khác ô tìm (giá, số lượng...): chuỗi phím nhanh được coi là mã quét; từ ký tự thứ 3
 *   không cho chèn vào ô, khi Enter thì trả ô về giá trị trước khi quét rồi mới thêm hàng.
 * - Focus ở nút hoặc trang: ≥ 4 ký tự rồi Enter là mã quét (máy quét chậm cũng được), Enter không
 *   "bấm" nút đang focus.
 * - Ô tìm/quét của trang (`data-scan-search`): để trang tự xử lý Enter.
 * Không chạy khi có hộp thoại đang mở hoặc đang ở ô chọn (select).
 */
export function useBarcodeScanner(onScan: (code: string) => void) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    let buffer = "";
    let last = 0;
    let allFast = true;
    let field: TextField | null = null;
    let fieldStart = "";
    let suppressed = "";

    function reset() {
      // Người gõ tay nhanh bị chặn nhầm vài ký tự: trả lại các ký tự đó vào ô.
      if (field && suppressed && document.activeElement === field) {
        const start = field.selectionStart ?? field.value.length;
        const end = field.selectionEnd ?? start;
        setFieldValue(field, field.value.slice(0, start) + suppressed + field.value.slice(end));
      }
      buffer = "";
      allFast = true;
      field = null;
      suppressed = "";
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
      const active = document.activeElement;
      if (document.querySelector('[role="dialog"]') || active instanceof HTMLSelectElement) {
        reset();
        return;
      }
      // Ô tìm hàng tự xử lý Enter với toàn bộ chữ trong ô (kể cả mã quét dính sau chữ gõ dở),
      // không cắt chuỗi theo khoảng cách phím (trình duyệt bận có thể làm khoảng cách > 35ms).
      if (active instanceof HTMLElement && active.dataset.scanSearch !== undefined) {
        reset();
        return;
      }
      const target = textFieldOf(active);
      const now = e.timeStamp || performance.now();
      const gap = now - last;
      last = now;

      if (e.key === "Enter") {
        const isScan =
          buffer.length >= MIN_LENGTH &&
          (field ? allFast && gap <= SLOW_GAP_MS : gap <= SLOW_GAP_MS);
        if (isScan) {
          e.preventDefault();
          e.stopPropagation(); // ô tìm / nút đang focus không xử lý Enter này nữa
          const code = buffer;
          if (field) setFieldValue(field, fieldStart);
          suppressed = "";
          reset();
          onScanRef.current(code);
          return;
        }
        reset();
        return;
      }
      if (e.key.length !== 1) {
        if (e.key !== "Shift") reset();
        return;
      }

      const maxGap = target ? FAST_GAP_MS : SLOW_GAP_MS;
      if (buffer && (gap > maxGap || target !== field)) reset();
      if (!buffer) {
        field = target;
        fieldStart = target?.value ?? "";
        allFast = true;
      } else {
        allFast = allFast && gap <= FAST_GAP_MS;
      }
      buffer += e.key;
      if (field && allFast && buffer.length >= SUPPRESS_FROM) {
        e.preventDefault();
        suppressed += e.key;
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
