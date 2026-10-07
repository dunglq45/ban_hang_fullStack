import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { errorMessage } from "../../api/errors";
import { useCategories } from "../../api/categories";
import { lookupBarcode, usePosProducts } from "../../api/pos";
import { TAB_BAR_CLEARANCE } from "../../components/layout/MobileTabBar";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { ChevronRightIcon } from "../../components/ui/icons";
import { Spinner } from "../../components/ui/Spinner";
import { useToast } from "../../components/ui/toast-context";
import { formatMoney } from "../../lib/format";
import { useBarcodeScanner } from "../../lib/use-barcode-scanner";
import {
  addProduct,
  baseQtyByProduct,
  CartLimitError,
  type SellableProduct,
  summarize,
} from "./cart";
import { CartPanel } from "./CartPanel";
import { usePos } from "./pos-context";
import { filterProducts, findExact } from "./product-search";
import { ProductCatalog } from "./ProductCatalog";
import { blockIfInvalidField } from "./invalid-field";

const isDesktop = () => window.matchMedia?.("(min-width: 768px)").matches ?? true;

/** Màn Bán hàng (design/Main, design/BanHangMobile). */
export function PosPage() {
  const { active, updateActive, checkout, locked } = usePos();
  const products = usePosProducts();
  const categories = useCategories();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const all = useMemo(() => products.data ?? [], [products.data]);
  const filtered = useMemo(() => filterProducts(all, query, categoryId), [all, query, categoryId]);
  const usedCategories = useMemo(() => {
    const used = new Set(all.map((p) => p.categoryId));
    return (categories.data ?? []).filter((c) => used.has(c.id));
  }, [all, categories.data]);
  const inCart = useMemo(() => baseQtyByProduct(active), [active]);

  // Trên máy tính ô tìm luôn sẵn sàng nhận gõ/quét; trên điện thoại không tự mở bàn phím.
  const focusSearch = useCallback(() => {
    if (isDesktop()) searchRef.current?.focus();
  }, []);
  const loaded = products.isSuccess;
  useEffect(() => {
    if (loaded) focusSearch();
  }, [loaded, focusSearch]);

  const add = useCallback(
    (product: SellableProduct, unitName?: string | null) => {
      if (locked) {
        toast({
          tone: "info",
          message: "Hóa đơn này đang được gửi. Bấm + để mở hóa đơn mới cho khách tiếp theo.",
        });
        return;
      }
      try {
        addProduct(active, product, unitName ?? undefined); // kiểm tra giới hạn dòng trước
      } catch (err) {
        if (err instanceof CartLimitError) {
          toast({ tone: "error", message: err.message });
          return;
        }
        throw err;
      }
      updateActive((c) => addProduct(c, product, unitName ?? undefined));
    },
    [active, locked, updateActive, toast],
  );
  // Tra mã qua mạng xong mới thêm: dùng hàm add mới nhất (người dùng có thể đã đổi hóa đơn).
  const addRef = useRef(add);
  useEffect(() => {
    addRef.current = add;
  });

  /** Mã quét hoặc gõ: khớp mã vạch/mã hàng trong danh sách POS. */
  const addByCode = useCallback(
    (code: string) => {
      const match = findExact(all, code);
      if (!match) return false;
      add(match.product, match.unitName);
      return true;
    },
    [all, add],
  );

  /** Không có trong danh sách POS (hàng ẩn khỏi POS, ngừng bán, mã sai): hỏi server. */
  const lookup = useCallback(
    async (code: string) => {
      try {
        const { product, unit } = await lookupBarcode(code);
        if (!product.isActive) {
          toast({ tone: "error", message: `${product.name} đã ngừng bán, không bán được` });
          return;
        }
        addRef.current(product, unit?.name);
        // Chỉ xóa ô tìm nếu người dùng chưa gõ gì khác trong lúc chờ.
        setQuery((q) => (q.trim() === code ? "" : q));
      } catch (err) {
        toast({ tone: "error", message: errorMessage(err) });
      }
    },
    [toast],
  );

  function submitQuery() {
    const q = query.trim();
    if (!q) return;
    if (addByCode(q)) {
      setQuery("");
      return;
    }
    if (filtered.length === 1) {
      add(filtered[0]!);
      setQuery("");
      return;
    }
    // Quét khi ô tìm đang có chữ gõ dở ("mi8934588012345"): thử dãy số cuối như mã vạch,
    // thêm hàng rồi trả lại phần chữ đã gõ.
    const trailing = /^(.*?)(\d{8,})$/.exec(q);
    if (trailing && trailing[1] && findExact(all, trailing[2]!)) {
      addByCode(trailing[2]!);
      setQuery(trailing[1]);
      return;
    }
    if (filtered.length === 0 && /^\S{4,}$/.test(q)) void lookup(q);
  }

  useBarcodeScanner((code) => {
    if (!addByCode(code)) void lookup(code);
    focusSearch();
  });

  // Phím tắt: F3 tìm hàng, F9 thanh toán.
  const submitRef = useRef(checkout.submit);
  const toastRef = useRef(toast);
  useEffect(() => {
    submitRef.current = checkout.submit;
    toastRef.current = toast;
  });
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "F3") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "F9") {
        e.preventDefault();
        if (blockIfInvalidField(toastRef.current)) return;
        // Rời ô đang gõ (số lượng, giá) để số hiển thị khớp số được tính, rồi mới gửi.
        (document.activeElement as HTMLElement | null)?.blur();
        setTimeout(() => submitRef.current(), 0);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      <div className="flex flex-wrap items-start gap-5">
        {products.isPending ? (
          <div className="flex flex-[999_1_440px] justify-center py-16">
            <Spinner size={28} label="Đang tải danh sách hàng" className="text-primary" />
          </div>
        ) : products.isError ? (
          <div className="flex flex-[999_1_440px] flex-col items-start gap-3">
            <Alert>{errorMessage(products.error)}</Alert>
            <Button variant="secondary" onClick={() => void products.refetch()}>
              Thử lại
            </Button>
          </div>
        ) : (
          <ProductCatalog
            products={filtered}
            totalCount={all.length}
            categories={usedCategories}
            query={query}
            onQueryChange={setQuery}
            onSubmitQuery={submitQuery}
            categoryId={categoryId}
            onCategoryChange={setCategoryId}
            onAdd={(p) => {
              add(p);
              focusSearch();
            }}
            inCart={inCart}
            searchRef={searchRef}
          />
        )}
        <CartPanel variant="panel" className="hidden flex-[1_1_400px] md:flex" />
      </div>
      <MobileCartBar />
    </>
  );
}

/** Thanh giỏ hàng cố định trên điện thoại, nằm ngay trên thanh tab dưới. */
function MobileCartBar() {
  const { active } = usePos();
  if (active.lines.length === 0) return null;
  const summary = summarize(active);
  return (
    <>
      <div className="h-20 md:hidden" aria-hidden="true" />
      <div
        className="fixed inset-x-0 z-30 border-t border-line bg-white px-3 py-2.5 md:hidden"
        style={{ bottom: TAB_BAR_CLEARANCE }}
      >
        <Link
          to="/ban-hang/thanh-toan"
          className="flex h-14 items-center justify-between gap-3 rounded-card bg-primary px-4 text-white"
        >
          <span className="flex flex-col leading-tight">
            <span className="text-xs opacity-85">
              {summary.itemCount} món · {active.customer?.name ?? "Khách lẻ"}
            </span>
            <span className="text-[17px] font-bold tabular-nums">{formatMoney(summary.total)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold">
            Thanh toán
            <ChevronRightIcon size={18} />
          </span>
        </Link>
      </div>
    </>
  );
}
