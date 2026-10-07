import { useQueries, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router";
import { uuidv7 } from "../../../shared/uuid";
import { api } from "../../api/client";
import { ApiError, call, errorMessage } from "../../api/errors";
import {
  type DocumentDetail,
  useCancelDocument,
  useCompletePurchase,
  useCreatePurchase,
  useDocument,
  useUpdatePurchase,
} from "../../api/inventory";
import { documentQueryKey, productQueryKey } from "../../api/keys";
import { TAB_BAR_CLEARANCE } from "../../components/layout/MobileTabBar";
import { Alert } from "../../components/ui/Alert";
import { Button, IconButton } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { Dialog } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ChevronLeftIcon, TrashIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { MoneyInput } from "../../components/ui/MoneyInput";
import { QtyInput } from "../../components/ui/QtyInput";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { formatDate, formatDateTime, formatMoney, formatQty } from "../../lib/format";
import { ContactPicker, type PickedContact } from "../contacts/ContactPicker";
import type { RestockPreset } from "../dashboard/DashboardPage";
import { DocumentStatusBadge } from "../documents/DocumentStatusBadge";
import { ProductAdder } from "./ProductAdder";
import {
  addProduct,
  draftError,
  emptyDraft,
  lineNote,
  linesFromDocument,
  lineTotal,
  type PaymentMethod,
  type PurchaseDraft,
  PurchaseLimitError,
  type PurchaseLine,
  type PurchaseProduct,
  removeLine,
  setLineUnit,
  summarize,
  toPurchaseBody,
  updateLine,
} from "./purchase-lines";

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Tiền mặt" },
  { value: "transfer", label: "Chuyển khoản" },
];

/** `/nhap-hang/moi` (tạo phiếu) và `/nhap-hang/:id` (sửa nháp hoặc xem phiếu). */
export function PurchaseFormPage() {
  const { id } = useParams();
  if (!id) return <PurchaseEditor key="new" doc={null} initial={emptyDraft()} />;
  return <PurchaseLoader key={id} id={id} />;
}

function BackLink() {
  return (
    <Link
      to="/nhap-hang"
      className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-ink-body hover:text-primary"
    >
      <ChevronLeftIcon size={18} />
      Nhập hàng
    </Link>
  );
}

function PageLoading({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-16">
      <Spinner size={28} label={label} className="text-primary" />
    </div>
  );
}

function PurchaseLoader({ id }: { id: string }) {
  const doc = useDocument(id);
  if (doc.isPending) return <PageLoading label="Đang tải phiếu nhập" />;
  if (doc.isError || doc.data.type !== "purchase") {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        {doc.isError && !(doc.error instanceof ApiError && doc.error.code === "NOT_FOUND") ? (
          <Alert>{errorMessage(doc.error)}</Alert>
        ) : (
          <EmptyState title="Không tìm thấy phiếu nhập" />
        )}
      </div>
    );
  }
  if (doc.data.status !== "draft") return <PurchaseView doc={doc.data} />;
  return <DraftLoader doc={doc.data} />;
}

/** Phiếu nháp: tải chi tiết từng mặt hàng (đơn vị, tồn, giá vốn hiện tại) rồi mới cho sửa. */
function DraftLoader({ doc }: { doc: DocumentDetail }) {
  const ids = [...new Set(doc.lines.map((l) => l.productId))];
  const products = useQueries({
    queries: ids.map((id) => ({
      queryKey: productQueryKey(id),
      queryFn: () => call(api.products[":id"].$get({ param: { id } })),
      staleTime: 60_000,
    })),
    combine: (results) => ({
      pending: results.some((r) => r.isPending),
      error: results.find((r) => r.isError)?.error,
      data: results.map((r) => r.data),
    }),
  });
  if (products.pending) return <PageLoading label="Đang tải phiếu nhập" />;
  if (products.error) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        <Alert>{errorMessage(products.error)}</Alert>
      </div>
    );
  }
  const map = new Map<string, PurchaseProduct>();
  for (const p of products.data) if (p) map.set(p.id, p);
  const initial: PurchaseDraft = {
    supplier: doc.contact ? { ...doc.contact, debtLimit: null } : null,
    lines: linesFromDocument(doc.lines, map),
    discount: doc.discount,
    paid: doc.paid === doc.total ? null : doc.paid,
    paymentMethod: doc.paymentMethod ?? "cash",
    note: doc.note ?? "",
  };
  return <PurchaseEditor doc={doc} initial={initial} />;
}

function Aside({ label, children }: { label: string; children: ReactNode }) {
  return (
    <aside
      aria-label={label}
      className="flex min-w-0 flex-[1_1_340px] flex-col rounded-card border border-line bg-white"
    >
      {children}
    </aside>
  );
}

function Row({
  label,
  value,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function PurchaseEditor({ doc, initial }: { doc: DocumentDetail | null; initial: PurchaseDraft }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [params] = useSearchParams();
  const [draft, setDraft] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => uuidv7());
  const [openedAt] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [errorProductId, setErrorProductId] = useState<string | null>(null);
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [adding, setAdding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const submittingRef = useRef(false);
  const leavingRef = useRef(false);

  const create = useCreatePurchase();
  const update = useUpdatePurchase();
  const complete = useCompletePurchase();
  const cancel = useCancelDocument();
  const [pendingMode, setPendingMode] = useState<"draft" | "completed" | null>(null);
  const saving = pendingMode !== null;
  const summary = summarize(draft);

  // Mọi thay đổi đi qua ref: thêm hàng chạy sau một lượt gọi API (tra mã, tải chi tiết), nhiều
  // lượt quét liên tiếp phải cộng dồn trên bản mới nhất chứ không trên bản của lần render cũ.
  const draftRef = useRef(draft);
  function change(fn: (d: PurchaseDraft) => PurchaseDraft) {
    const next = fn(draftRef.current);
    draftRef.current = next;
    setDraft(next);
    setDirty(true);
    setError(null);
    setErrorProductId(null);
  }

  function add(product: PurchaseProduct, unitName?: string) {
    try {
      const r = addProduct(draftRef.current.lines, product, unitName);
      change((d) => ({ ...d, lines: r.lines }));
      setFlashKey(r.key);
    } catch (err) {
      if (err instanceof PurchaseLimitError) toast({ tone: "error", message: err.message });
      else throw err;
    }
  }

  // Cuộn tới dòng vừa thêm/cộng, sáng lên 1 giây.
  useEffect(() => {
    if (!flashKey) return;
    tableRef.current
      ?.querySelector(`[data-line="${CSS.escape(flashKey)}"]`)
      ?.scrollIntoView?.({ block: "nearest" });
    const t = setTimeout(() => setFlashKey(null), 1000);
    return () => clearTimeout(t);
  }, [flashKey, draft.lines]);

  // "Nhập thêm hàng" từ trang chi tiết: ?productId=... thêm sẵn mặt hàng đó.
  const presetId = doc ? null : params.get("productId");
  const presetDone = useRef(false);
  useEffect(() => {
    if (!presetId || presetDone.current) return;
    presetDone.current = true;
    queryClient
      .fetchQuery({
        queryKey: productQueryKey(presetId),
        queryFn: () => call(api.products[":id"].$get({ param: { id: presetId } })),
      })
      .then((p) => {
        if (draftRef.current.lines.length > 0) return;
        const next = { ...draftRef.current, lines: addProduct([], p).lines };
        draftRef.current = next;
        setDraft(next);
      })
      .catch((err: unknown) => toast({ tone: "error", message: errorMessage(err) }));
  }, [presetId, queryClient, toast]);

  // "Tạo phiếu nhập" ở Tổng quan: điền sẵn các mặt hàng cần nhập với số lượng gợi ý.
  const restockPreset = doc
    ? undefined
    : (location.state as Partial<RestockPreset> | null)?.restock;
  const restockDone = useRef(false);
  useEffect(() => {
    if (!restockPreset?.length || restockDone.current) return;
    restockDone.current = true;
    // Xóa state để tải lại trang / quay lại không điền lần nữa.
    void navigate({ search: location.search }, { replace: true, state: null });
    setAdding(true);
    void Promise.allSettled(
      restockPreset.map((r) =>
        queryClient.fetchQuery({
          queryKey: productQueryKey(r.productId),
          queryFn: () => call(api.products[":id"].$get({ param: { id: r.productId } })),
        }),
      ),
    ).then((results) => {
      setAdding(false);
      // Gộp vào phiếu (người dùng có thể đã quét thêm hàng trong lúc chờ tải; trùng thì cộng dồn).
      let lines: PurchaseLine[] = draftRef.current.lines;
      let failed = 0;
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          lines = addProduct(lines, res.value, undefined, restockPreset[i]!.qty).lines;
        } else failed++;
      });
      const next = { ...draftRef.current, lines };
      draftRef.current = next;
      setDraft(next);
      // Có hàng điền sẵn thì rời trang phải hỏi như phiếu đã sửa.
      if (lines.length > 0) setDirty(true);
      if (failed > 0) {
        toast({
          tone: "error",
          message: `Không tải được ${failed} mặt hàng, hãy thêm lại bằng tay`,
        });
      }
    });
  }, [restockPreset, location.search, navigate, queryClient, toast]);

  // F3: về ô tìm hàng.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "F3" || document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !leavingRef.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function showError(err: unknown) {
    setError(errorMessage(err));
    const details = err instanceof ApiError ? (err.details as { productId?: unknown }) : undefined;
    setErrorProductId(typeof details?.productId === "string" ? details.productId : null);
  }

  function leaveTo(path: string) {
    leavingRef.current = true;
    setDirty(false);
    navigate(path, { replace: true });
  }

  async function submit(mode: "draft" | "completed") {
    if (submittingRef.current) return;
    // Rời ô đang gõ để số hiển thị khớp số được gửi.
    (document.activeElement as HTMLElement | null)?.blur();
    if (adding) {
      setError("Đang thêm hàng vừa quét, đợi một chút rồi bấm lại");
      return;
    }
    const invalid = tableRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
    if (invalid) {
      invalid.focus();
      setError("Có ô số lượng chưa hợp lệ. Số lẻ dùng dấu phẩy, ví dụ 1,5");
      return;
    }
    const problem = draftError(draft);
    if (problem) {
      setError(problem);
      return;
    }
    submittingRef.current = true;
    setPendingMode(mode);
    setError(null);
    const body = toPurchaseBody(draft);
    try {
      if (!doc) {
        const result = await create.mutateAsync({ ...body, idempotencyKey, status: mode });
        queryClient.setQueryData(documentQueryKey(result.document.id), result.document);
        toast(
          result.replayed
            ? `Phiếu ${result.document.code} đã được lưu từ lần bấm trước (giữ nội dung lúc đó), hãy kiểm tra lại`
            : mode === "draft"
              ? `Đã lưu nháp ${result.document.code}`
              : `Đã nhập kho phiếu ${result.document.code}`,
        );
        setIdempotencyKey(uuidv7());
        leaveTo(`/nhap-hang/${result.document.id}`);
        return;
      }
      const saved = await update.mutateAsync({ id: doc.id, json: body });
      if (mode === "draft") {
        queryClient.setQueryData(documentQueryKey(doc.id), saved);
        setDirty(false);
        toast(`Đã lưu nháp ${doc.code}`);
        return;
      }
      setDirty(false);
      const done = await complete.mutateAsync(doc.id);
      toast(`Đã nhập kho phiếu ${doc.code}`);
      leavingRef.current = true;
      queryClient.setQueryData(documentQueryKey(doc.id), done);
    } catch (err) {
      showError(err);
      // Lần trước đã hoàn thành trên server nhưng mất phản hồi (mạng): tải lại để chuyển sang
      // màn xem phiếu thay vì kẹt ở màn sửa.
      if (doc && err instanceof ApiError && err.code === "INVALID_STATUS") {
        leavingRef.current = true;
        setDirty(false);
        void queryClient.invalidateQueries({ queryKey: documentQueryKey(doc.id) });
      }
    } finally {
      submittingRef.current = false;
      setPendingMode(null);
    }
  }

  function cancelDraft() {
    if (!doc) return;
    cancel.mutate(doc.id, {
      onSuccess: (d) => {
        setConfirmCancel(false);
        toast(`Đã hủy phiếu nháp ${d.code}`);
        leaveTo("/nhap-hang");
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <BackLink />
          <DocumentStatusBadge status="draft" kind="purchase" />
        </div>
        <span className="text-[13px] text-ink-muted">
          Mẹo: quét mã vạch liên tục để thêm nhanh nhiều mặt hàng
        </span>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section
          aria-label="Hàng nhập"
          className="min-w-0 flex-[999_1_600px] rounded-card border border-line bg-white"
        >
          <div className="flex gap-2 border-b border-line px-4 py-3.5">
            <ProductAdder ref={searchRef} onAdd={add} onBusyChange={setAdding} disabled={saving} />
          </div>
          <div ref={tableRef}>
            {draft.lines.length === 0 ? (
              <EmptyState
                title="Chưa có mặt hàng nào"
                description="Tìm theo tên, mã hàng hoặc quét mã vạch để thêm hàng vào phiếu."
                className="py-12"
              />
            ) : (
              <LinesTable
                lines={draft.lines}
                flashKey={flashKey}
                errorProductId={errorProductId}
                disabled={saving}
                onChange={(fn) => change((d) => ({ ...d, lines: fn(d.lines) }))}
              />
            )}
          </div>
          <p className="px-4 py-3 text-[13px] text-ink-muted">
            Giá vốn bình quân của từng mặt hàng sẽ được tính lại khi bạn hoàn thành phiếu.
          </p>
        </section>

        <Aside label="Thông tin phiếu nhập">
          <fieldset disabled={saving} className="flex min-w-0 flex-col gap-3.5 p-4">
            <legend className="sr-only">Nhà cung cấp và ghi chú</legend>
            <ContactPicker
              kind="supplier"
              contact={draft.supplier}
              onChange={(c: PickedContact | null) => change((d) => ({ ...d, supplier: c }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <ReadonlyField label="Mã phiếu" value={doc?.code ?? "Tự sinh khi lưu"} />
              <ReadonlyField label="Ngày nhập" value={formatDate(doc?.createdAt ?? openedAt)} />
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-ink-body">Ghi chú</span>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Số hóa đơn của nhà cung cấp, người giao…"
                value={draft.note}
                onChange={(e) => change((d) => ({ ...d, note: e.target.value }))}
              />
            </label>
          </fieldset>

          <fieldset
            disabled={saving}
            className="flex min-w-0 flex-col gap-2 border-t border-line p-4 text-sm"
          >
            <legend className="sr-only">Thanh toán</legend>
            <Row
              label={
                <span className="text-ink-soft">
                  Tổng tiền hàng ({summary.productCount} mặt hàng)
                </span>
              }
              value={formatMoney(summary.subtotal)}
            />
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="pn-discount" className="whitespace-nowrap text-ink-soft">
                Chiết khấu
              </label>
              <MoneyInput
                id="pn-discount"
                value={draft.discount || null}
                onChange={(v) => change((d) => ({ ...d, discount: v ?? 0 }))}
                placeholder="0"
                frameClassName="w-36"
              />
            </div>
            <Row
              className="border-t border-line pt-2"
              label={<span className="text-[15px] font-semibold">Cần trả nhà cung cấp</span>}
              value={<span className="text-[22px] font-bold">{formatMoney(summary.total)}</span>}
            />
            <div className="flex items-center justify-between gap-3">
              <label htmlFor="pn-paid" className="whitespace-nowrap font-medium text-ink-body">
                Đã trả
              </label>
              <MoneyInput
                id="pn-paid"
                value={draft.paid}
                onChange={(v) => change((d) => ({ ...d, paid: v }))}
                placeholder={formatMoney(summary.total)}
                aria-describedby="pn-paid-hint"
                frameClassName="w-40"
                className="text-base font-semibold"
              />
            </div>
            <p id="pn-paid-hint" className="text-right text-xs text-ink-muted">
              Để trống là trả đủ
            </p>
            {summary.paid > 0 && (
              <SegmentedControl
                label="Hình thức trả"
                options={PAYMENT_OPTIONS}
                value={draft.paymentMethod}
                onChange={(v) => change((d) => ({ ...d, paymentMethod: v }))}
              />
            )}
            <Row
              className="pt-1 font-semibold text-warn"
              label="Còn nợ nhà cung cấp"
              value={<span className="font-bold">{formatMoney(summary.debt)}</span>}
            />
            {draft.supplier && summary.supplierDebtAfter !== null && (
              <Row
                className="text-[13px]"
                label={
                  <span className="text-ink-muted">
                    Tổng nợ {draft.supplier.name} sau phiếu này
                  </span>
                }
                value={
                  <span className="text-ink-body">{formatMoney(summary.supplierDebtAfter)}</span>
                }
              />
            )}
          </fieldset>

          {error && (
            <div className="px-4 pb-3">
              <Alert>{error}</Alert>
            </div>
          )}

          {/* Cố định đáy màn hình trên điện thoại (trên thanh tab dưới) để không phải cuộn hết
              phiếu dài mới bấm được "Lưu nháp"/"Hoàn thành"; giữ nguyên trong luồng ở máy tính. */}
          <div
            className="sticky z-10 mt-auto flex flex-col gap-2 rounded-b-card border-t border-line bg-table-head px-4 py-3.5 md:static"
            style={{ bottom: TAB_BAR_CLEARANCE }}
          >
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="h-12 flex-1"
                loading={pendingMode === "draft"}
                disabled={saving}
                onClick={() => void submit("draft")}
              >
                Lưu nháp
              </Button>
              <Button
                className="h-12 flex-[2] text-[15px]"
                loading={pendingMode === "completed"}
                disabled={saving}
                onClick={() => void submit("completed")}
              >
                Hoàn thành nhập hàng
              </Button>
            </div>
            {doc && (
              <Button variant="ghost" disabled={saving} onClick={() => setConfirmCancel(true)}>
                Hủy phiếu nháp
              </Button>
            )}
          </div>
        </Aside>
      </div>

      <CancelDialog
        open={confirmCancel}
        title="Hủy phiếu nháp?"
        description={`Phiếu ${doc?.code ?? ""} sẽ chuyển sang "Đã hủy". Phiếu nháp chưa nhập kho nên tồn kho và công nợ không đổi.`}
        pending={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : null}
        onClose={() => {
          setConfirmCancel(false);
          cancel.reset();
        }}
        onConfirm={cancelDraft}
      />

      <Dialog
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Rời trang khi chưa lưu?"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Ở lại
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Rời trang
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-body">
          Phiếu nhập chưa được lưu. Bấm "Lưu nháp" nếu muốn làm tiếp sau.
        </p>
      </Dialog>
    </div>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-body">{label}</span>
      <Input value={value} readOnly className="text-ink-muted" />
    </label>
  );
}

function LinesTable({
  lines,
  flashKey,
  errorProductId,
  disabled,
  onChange,
}: {
  lines: PurchaseLine[];
  flashKey: string | null;
  errorProductId: string | null;
  disabled: boolean;
  onChange: (fn: (lines: PurchaseLine[]) => PurchaseLine[]) => void;
}) {
  return (
    <Table aria-label="Hàng trong phiếu" minWidth={960}>
      <THead>
        <tr>
          <TH className="w-10 pr-0">#</TH>
          <TH className="w-24">Mã hàng</TH>
          <TH>Tên hàng</TH>
          <TH className="w-40">Đơn vị</TH>
          <TH numeric className="w-28">
            Số lượng
          </TH>
          <TH numeric className="w-36">
            Giá nhập
          </TH>
          <TH numeric className="w-32">
            Thành tiền
          </TH>
          <TH className="w-14">
            <span className="sr-only">Xóa</span>
          </TH>
        </tr>
      </THead>
      <TBody>
        {lines.map((l, i) => (
          <TR
            key={l.key}
            data-line={l.key}
            className={cn(
              "transition-colors duration-500",
              l.key === flashKey && "bg-primary-soft",
              l.productId === errorProductId && "bg-danger/5",
            )}
          >
            <TD className="pr-0 text-ink-muted">{i + 1}</TD>
            <TD className="text-ink-muted">{l.code}</TD>
            <TD className="py-2 leading-snug">
              {/* min-w: ô tên không bị các cột ô nhập ép hẹp, bảng cuộn ngang thay vì xuống dòng từng chữ. */}
              <div className="min-w-44 font-medium">{l.name}</div>
              <div className="text-xs text-ink-muted">{lineNote(l)}</div>
            </TD>
            <TD className="px-2">
              <Select
                aria-label={`Đơn vị nhập ${l.name}`}
                value={l.unitName}
                disabled={disabled}
                onChange={(e) => onChange((ls) => setLineUnit(ls, l.key, e.target.value))}
                className="h-10 min-w-40 text-sm"
              >
                {l.units.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.factor === 1
                      ? u.name
                      : `${u.name} (${u.factor} ${l.baseUnit.toLowerCase()})`}
                  </option>
                ))}
              </Select>
            </TD>
            <TD className="px-2">
              <QtyInput
                aria-label={`Số lượng ${l.name}`}
                value={l.qty}
                disabled={disabled}
                onChange={(v) => onChange((ls) => updateLine(ls, l.key, { qty: v }))}
                className="h-10 text-right text-sm"
              />
            </TD>
            <TD className="px-2">
              <MoneyInput
                aria-label={`Giá nhập ${l.name}`}
                value={l.unitPrice}
                disabled={disabled}
                // Xóa trắng để gõ lại: giữ giá cũ (rời ô thì hiện lại), không thành 0.
                onChange={(v) => {
                  if (v !== null) onChange((ls) => updateLine(ls, l.key, { unitPrice: v }));
                }}
                className="h-10 text-sm"
              />
            </TD>
            <TD numeric className="font-semibold">
              {formatMoney(lineTotal(l))}
            </TD>
            <TD className="px-1">
              <IconButton
                label={`Xóa ${l.name} khỏi phiếu`}
                disabled={disabled}
                onClick={() => onChange((ls) => removeLine(ls, l.key))}
              >
                <TrashIcon size={18} />
              </IconButton>
            </TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}

function CancelDialog({
  open,
  title,
  description,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Không hủy
          </Button>
          <Button variant="danger" loading={pending} onClick={onConfirm}>
            Hủy phiếu
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink-body">
        <p>{description}</p>
        {error && <Alert>{error}</Alert>}
      </div>
    </Dialog>
  );
}

/** Phiếu đã hoàn thành hoặc đã hủy: chỉ xem; chủ cửa hàng hủy được phiếu đã hoàn thành. */
function PurchaseView({ doc }: { doc: DocumentDetail }) {
  const toast = useToast();
  const cancel = useCancelDocument();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);

  function doCancel() {
    cancel.mutate(doc.id, {
      onSuccess: (d) => {
        queryClient.setQueryData(documentQueryKey(d.id), d);
        setConfirm(false);
        toast(`Đã hủy phiếu ${d.code}`);
      },
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-semibold">Phiếu nhập {doc.code}</h2>
            <DocumentStatusBadge status={doc.status} kind="purchase" />
          </div>
          <p className="text-[13px] text-ink-muted">
            {formatDateTime(doc.completedAt ?? doc.createdAt)} · Người nhập: {doc.createdBy.name}
            {doc.cancelledAt &&
              ` · Hủy lúc ${formatDateTime(doc.cancelledAt)}${doc.cancelledBy ? ` bởi ${doc.cancelledBy.name}` : ""}`}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/in/phieu-nhap/${doc.id}`}
            target="_blank"
            rel="noreferrer"
            className={buttonClass({ variant: "secondary" })}
          >
            In phiếu
          </a>
          {doc.status === "completed" && (
            <Button variant="secondary" onClick={() => setConfirm(true)}>
              Hủy phiếu
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section
          aria-label="Hàng nhập"
          className="min-w-0 flex-[999_1_600px] rounded-card border border-line bg-white"
        >
          <Table aria-label="Hàng trong phiếu" minWidth={640}>
            <THead>
              <tr>
                <TH className="w-10 pr-0">#</TH>
                <TH className="w-24">Mã hàng</TH>
                <TH>Tên hàng</TH>
                <TH numeric>Số lượng</TH>
                <TH numeric>Giá nhập</TH>
                <TH numeric>Thành tiền</TH>
              </tr>
            </THead>
            <TBody>
              {doc.lines.map((l, i) => (
                <TR key={l.id}>
                  <TD className="pr-0 text-ink-muted">{i + 1}</TD>
                  <TD className="text-ink-muted">{l.productCode}</TD>
                  <TD className="py-3 font-medium">{l.productName}</TD>
                  <TD numeric>{formatQty(l.qty, l.unitName)}</TD>
                  <TD numeric>{formatMoney(l.unitPrice)}</TD>
                  <TD numeric className="font-semibold">
                    {formatMoney(l.lineTotal)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>

        <Aside label="Thông tin phiếu nhập">
          <div className="flex flex-col gap-3 p-4 text-sm">
            <div>
              <div className="text-[13px] font-medium text-ink-body">Nhà cung cấp</div>
              {doc.contact ? (
                <>
                  <div className="font-semibold">{doc.contact.name}</div>
                  <div
                    className={cn(
                      "text-[13px]",
                      doc.contact.debt > 0 ? "text-warn" : "text-ink-muted",
                    )}
                  >
                    {doc.contact.debt > 0
                      ? `Hiện mình đang nợ ${formatMoney(doc.contact.debt)}`
                      : "Hiện không nợ nhà cung cấp này"}
                  </div>
                </>
              ) : (
                <div className="text-ink-muted">Không chọn nhà cung cấp</div>
              )}
            </div>
            {doc.note && (
              <div>
                <div className="text-[13px] font-medium text-ink-body">Ghi chú</div>
                <p className="whitespace-pre-line">{doc.note}</p>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 border-t border-line p-4 text-sm">
            <Row
              label={<span className="text-ink-soft">Tổng tiền hàng</span>}
              value={formatMoney(doc.subtotal)}
            />
            <Row
              label={<span className="text-ink-soft">Chiết khấu</span>}
              value={formatMoney(doc.discount)}
            />
            <Row
              className="border-t border-line pt-2"
              label={<span className="text-[15px] font-semibold">Cần trả nhà cung cấp</span>}
              value={<span className="text-[22px] font-bold">{formatMoney(doc.total)}</span>}
            />
            <Row
              label={
                <span className="text-ink-soft">
                  Đã trả
                  {doc.paid > 0 &&
                    doc.paymentMethod &&
                    ` (${doc.paymentMethod === "cash" ? "tiền mặt" : "chuyển khoản"})`}
                </span>
              }
              value={formatMoney(doc.paid)}
            />
            <Row
              className="font-semibold text-warn"
              label="Còn nợ nhà cung cấp"
              value={formatMoney(doc.debtAmount)}
            />
          </div>
        </Aside>
      </div>

      <CancelDialog
        open={confirm}
        title={`Hủy phiếu nhập ${doc.code}?`}
        description="Tồn kho của các mặt hàng sẽ bị trừ lại, giá vốn được tính lại và khoản nợ nhà cung cấp của phiếu này được xóa. Không hủy được nếu hàng của phiếu đã bán bớt."
        pending={cancel.isPending}
        error={cancel.isError ? errorMessage(cancel.error) : null}
        onClose={() => {
          setConfirm(false);
          cancel.reset();
        }}
        onConfirm={doCancel}
      />
    </div>
  );
}
