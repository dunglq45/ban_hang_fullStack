import { useQueryClient } from "@tanstack/react-query";
import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { useSession } from "../../api/auth";
import { ApiError, errorMessage } from "../../api/errors";
import {
  type CompleteCountResult,
  saveStockCountLines,
  scanStockCount,
  type StockCount,
  useCompleteStockCount,
  useStockCount,
} from "../../api/inventory";
import { stockCountQueryKey } from "../../api/keys";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { EmptyState } from "../../components/ui/EmptyState";
import { ChevronLeftIcon, SearchIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { QtyInput } from "../../components/ui/QtyInput";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { formatDate, formatMoney, formatNumber, formatQty } from "../../lib/format";
import { useBarcodeScanner } from "../../lib/use-barcode-scanner";
import { DocumentStatusBadge } from "../documents/DocumentStatusBadge";
import {
  type CountRow,
  type CountTab,
  filterRows,
  formatDiff,
  formatSigned,
  isDiff,
  type LineEdit,
  mergeLines,
  missingReasons,
  REASONS,
  tabCounts,
} from "./count-lines";

const SAVE_DELAY_MS = 800;
const FLASH_MS = 1000;

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

/** `/kiem-kho/:id` (design/KiemKho). */
export function StockCountPage() {
  const { id = "" } = useParams();
  const count = useStockCount(id);
  if (count.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} label="Đang tải phiếu kiểm kho" className="text-primary" />
      </div>
    );
  }
  if (count.isError) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink />
        {count.error instanceof ApiError && count.error.code === "NOT_FOUND" ? (
          <EmptyState title="Không tìm thấy phiếu kiểm kho" />
        ) : (
          <Alert>{errorMessage(count.error)}</Alert>
        )}
      </div>
    );
  }
  return <CountScreen key={id} data={count.data} />;
}

function BackLink() {
  const { user } = useSession();
  // Danh sách phiếu kiểm chỉ chủ cửa hàng xem được (chứa giá trị lệch).
  const owner = user.role === "owner";
  return (
    <Link
      to={owner ? "/kiem-kho" : "/hang-hoa"}
      className="inline-flex min-h-touch items-center gap-1.5 self-start text-sm font-medium text-ink-body hover:text-primary"
    >
      <ChevronLeftIcon size={18} />
      {owner ? "Phiếu kiểm kho" : "Hàng hóa"}
    </Link>
  );
}

function CountScreen({ data }: { data: StockCount }) {
  const { user } = useSession();
  const isOwner = user.role === "owner";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const draft = data.status === "draft";
  const queryKey = stockCountQueryKey(data.id);

  const [tab, setTab] = useState<CountTab>("all");
  const [query, setQuery] = useState("");
  const [edits, setEdits] = useState<Record<string, LineEdit>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  // n tăng mỗi lần quét: quét cùng một dòng hai lần liên tiếp vẫn cuộn và sáng lại.
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [reasonErrorIds, setReasonErrorIds] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<CompleteCountResult | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // ---- Tự lưu: gom thay đổi, gửi sau 800ms không gõ; mỗi lúc chỉ một lượt gửi. ----
  const pending = useRef(new Map<string, LineEdit>());
  const inflight = useRef<Promise<void> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    while (inflight.current) await inflight.current;
    if (pending.current.size === 0) return true;
    const batch = new Map(pending.current);
    pending.current.clear();
    setSaveState("saving");
    let ok = true;
    const run = saveStockCountLines(data.id, {
      lines: [...batch].map(([lineId, e]) => ({ lineId, ...e })),
    })
      .then((doc) => {
        queryClient.setQueryData(queryKey, doc);
        // Bỏ các thay đổi đã được lưu (giữ lại cái người dùng vừa sửa tiếp trong lúc gửi).
        setEdits((prev) => {
          const next = { ...prev };
          for (const [lineId, e] of batch) {
            const now = next[lineId];
            if (now && now.actualQty === e.actualQty && now.reason === e.reason) {
              delete next[lineId];
            }
          }
          return next;
        });
        setSaveError(null);
        setSaveState(pending.current.size > 0 ? "pending" : "saved");
      })
      .catch((err: unknown) => {
        ok = false;
        if (err instanceof ApiError && err.code === "INVALID_STATUS") {
          // Phiếu vừa được hoàn thành/hủy ở nơi khác: bỏ thay đổi, tải lại.
          pending.current.clear();
          setEdits({});
          void queryClient.invalidateQueries({ queryKey });
        } else {
          for (const [k, v] of batch) if (!pending.current.has(k)) pending.current.set(k, v);
        }
        setSaveError(errorMessage(err));
        setSaveState("error");
      })
      .finally(() => {
        inflight.current = null;
      });
    inflight.current = run;
    await run;
    return ok;
  }, [data.id, queryClient, queryKey]);

  function edit(row: CountRow, patch: Partial<LineEdit>, text?: string) {
    // Ô đang gõ chưa hợp lệ ("1.000"): không lưu (null nghĩa là xóa số đã đếm), ô tự báo đỏ.
    if (patch.actualQty === null && text !== undefined && text.trim() !== "") return;
    const next: LineEdit = {
      actualQty: patch.actualQty !== undefined ? patch.actualQty : row.actualQty,
      reason: patch.reason !== undefined ? patch.reason : row.reason,
    };
    pending.current.set(row.id, next);
    setEdits((prev) => ({ ...prev, [row.id]: next }));
    setSaveState("pending");
    if (patch.reason) {
      setReasonErrorIds((prev) => {
        if (!prev.has(row.id)) return prev;
        const s = new Set(prev);
        s.delete(row.id);
        return s;
      });
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), SAVE_DELAY_MS);
  }

  // Rời trang: gửi nốt thay đổi; đóng tab khi còn thay đổi chưa lưu thì hỏi lại.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => void flushRef.current(), []);
  const hasUnsaved = saveState === "pending" || saveState === "saving" || saveState === "error";
  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsaved]);
  // Chuyển trang trong app khi còn số chưa lưu: lưu trước rồi mới đi; lưu lỗi thì hỏi.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsaved && currentLocation.pathname !== nextLocation.pathname,
  );
  const blockerRef = useRef(blocker);
  useEffect(() => {
    blockerRef.current = blocker;
  });
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    let active = true;
    void flushRef.current().then((ok) => {
      if (active && ok) blockerRef.current.proceed?.();
    });
    return () => {
      active = false;
    };
  }, [blocker.state]);

  const rows = useMemo(() => mergeLines(data.lines, edits, draft), [data.lines, edits, draft]);
  const counts = tabCounts(rows);
  const visible = filterRows(rows, tab, query);
  const counted = rows.length - counts.uncounted;
  const percent = rows.length ? Math.round((counted / rows.length) * 1000) / 10 : 0;

  // ---- Quét: +1 (hoặc +hệ số với mã vạch thùng), cuộn tới dòng, sáng 1 giây. ----
  useEffect(() => {
    if (!flash) return;
    tableRef.current
      ?.querySelector(`[data-line="${CSS.escape(flash.id)}"]`)
      ?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    const t = setTimeout(() => setFlash(null), FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  // Thiếu lý do lệch: đưa tới ô lý do đầu tiên (cột cuối, thường phải cuộn ngang mới thấy).
  useEffect(() => {
    if (reasonErrorIds.size === 0) return;
    const t = setTimeout(() => {
      tableRef.current?.querySelector<HTMLElement>('select[aria-invalid="true"]')?.focus();
    }, 0);
    return () => clearTimeout(t);
  }, [reasonErrorIds]);

  // Máy quét bắn liên tục: mỗi mã vào hàng đợi, gửi lần lượt, không bỏ mã nào.
  const scanQueue = useRef<string[]>([]);
  const scanLoop = useRef(false);

  function scan(code: string) {
    if (!draft) return;
    scanQueue.current.push(code);
    if (scanLoop.current) return;
    scanLoop.current = true;
    setScanning(true);
    void (async () => {
      try {
        while (scanQueue.current.length > 0) await scanOne(scanQueue.current.shift()!);
      } finally {
        scanLoop.current = false;
        setScanning(false);
      }
    })();
  }

  async function scanOne(code: string) {
    try {
      // Gửi các số đang gõ trước, để +1 cộng vào đúng số mới nhất.
      await flush();
      const r = await scanStockCount(data.id, code);
      const before = r.actualQty - r.added;
      // Trong lúc quét, người dùng có thể vừa chọn lý do cho dòng này: thay đổi đó (đang chờ
      // lưu) mang số đếm cũ, chuyển sang số mới để lần lưu sau không ghi đè lượt +1. Nếu họ vừa
      // gõ một số khác hẳn thì giữ số họ gõ.
      const waiting = pending.current.get(r.lineId);
      if (waiting && waiting.actualQty === before) {
        pending.current.set(r.lineId, { ...waiting, actualQty: r.actualQty });
      }
      setEdits((prev) => {
        if (!prev[r.lineId]) return prev;
        const next = { ...prev };
        const still = pending.current.get(r.lineId);
        if (still) next[r.lineId] = still;
        else delete next[r.lineId];
        return next;
      });
      queryClient.setQueryData<StockCount>(queryKey, (old) =>
        old
          ? {
              ...old,
              lines: old.lines.map((l) =>
                l.id === r.lineId
                  ? { ...l, actualQty: r.actualQty, diff: r.actualQty - l.currentStock }
                  : l,
              ),
            }
          : old,
      );
      // Tải lại để có giá trị lệch và tổng hợp mới.
      void queryClient.invalidateQueries({ queryKey });
      setTab("all");
      setQuery("");
      setFlash((f) => ({ id: r.lineId, n: (f?.n ?? 0) + 1 }));
      toast(
        `${r.productName}: +${formatQty(r.added, r.baseUnit)} → ${formatQty(r.actualQty, r.baseUnit)}`,
      );
    } catch (err) {
      toast({ tone: "error", message: errorMessage(err) });
    }
  }

  useBarcodeScanner((code) => {
    scan(code);
  });

  function onScanKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const code = query.trim();
      if (!code) return;
      // Gõ tên hàng rồi Enter: đúng một dòng khớp thì nhảy tới ô số thực tế của dòng đó; còn lại
      // (mã vạch, không khớp tên nào) thì coi là quét.
      if (!/^\d+$/.test(code) && visible.length === 1) {
        tableRef.current
          ?.querySelector<HTMLInputElement>(`[data-line="${CSS.escape(visible[0]!.id)}"] input`)
          ?.focus();
        return;
      }
      scan(code);
    } else if (e.key === "Escape" && query) {
      e.preventDefault();
      setQuery("");
    }
  }

  // ---- Hoàn thành ----
  const complete = useCompleteStockCount();

  /** Còn ô số thực tế đang báo đỏ thì chưa cho hoàn thành / rời trang. */
  function blockIfInvalid(): boolean {
    const invalid = tableRef.current?.querySelector<HTMLElement>('input[aria-invalid="true"]');
    if (!invalid) return false;
    invalid.focus();
    toast({
      tone: "error",
      message: "Có ô số thực tế chưa hợp lệ. Số lẻ dùng dấu phẩy, ví dụ 1,5",
    });
    return true;
  }

  const [preparing, setPreparing] = useState(false);
  async function openConfirm() {
    if (preparing || blockIfInvalid()) return;
    setPreparing(true);
    try {
      if (!(await flush())) return;
      // Tải lại phiếu: tồn hiện tại có thể vừa đổi (đang bán hàng song song), hộp thoại phải hiện
      // đúng số sẽ được ghi.
      await queryClient.refetchQueries({ queryKey, exact: true });
      const fresh = queryClient.getQueryData<StockCount>(queryKey) ?? data;
      if (fresh.status !== "draft") return;
      const missing = missingReasons(mergeLines(fresh.lines, {}, true));
      if (missing.length > 0) {
        setReasonErrorIds(new Set(missing.map((r) => r.id)));
        setTab("diff");
        toast({
          tone: "error",
          message: `Vui lòng chọn lý do lệch cho ${formatNumber(missing.length)} mặt hàng`,
        });
        return;
      }
      complete.reset();
      setConfirming(true);
    } finally {
      setPreparing(false);
    }
  }

  const completingRef = useRef(false);
  function doComplete() {
    if (completingRef.current) return;
    completingRef.current = true;
    complete.mutate(data.id, {
      onSettled: () => {
        completingRef.current = false;
      },
      onSuccess: (res) => {
        setConfirming(false);
        setResult(res);
        toast(`Đã hoàn thành phiếu ${res.document.code} và cân bằng kho`);
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "REASON_REQUIRED") {
          const lines = (err.details as { lines?: Array<{ lineId: string }> } | undefined)?.lines;
          setReasonErrorIds(new Set((lines ?? []).map((l) => l.lineId)));
          setConfirming(false);
          setTab("diff");
          toast({ tone: "error", message: err.message });
          void queryClient.invalidateQueries({ queryKey });
        }
      },
    });
  }

  async function saveAndLeave() {
    if (blockIfInvalid()) return;
    if (await flush()) {
      toast("Đã lưu, bạn có thể đếm tiếp sau");
      navigate(isOwner ? "/kiem-kho" : "/hang-hoa");
    }
  }

  const changed = rows.filter((r) => r.stockChanged && r.actualQty !== null);
  const s = data.summary;
  const valueDiff =
    s.increaseValue !== undefined && s.decreaseValue !== undefined
      ? s.increaseValue + s.decreaseValue
      : undefined;
  const increasedQty = rows.filter((r) => (r.diff ?? 0) > 0).length;
  const decreasedQty = rows.filter((r) => (r.diff ?? 0) < 0).length;

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-semibold">Phiếu kiểm kho {data.code}</h2>
            <DocumentStatusBadge status={data.status} kind="count" />
          </div>
          <p className="text-[13px] text-ink-muted">
            {formatDate(data.createdAt)} · Người tạo: {data.createdBy.name} ·{" "}
            {formatNumber(rows.length)} mặt hàng
            {data.note && ` · ${data.note}`}
          </p>
        </div>
        <div className="flex min-w-60 flex-1 items-center gap-3 sm:flex-none">
          <div className="flex-1">
            <div className="mb-1.5 flex justify-between text-[13px]">
              <span className="text-ink-soft">Đã đếm</span>
              <span className="font-semibold tabular-nums">
                {formatNumber(counted)} / {formatNumber(rows.length)}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Tiến độ đếm"
              aria-valuemin={0}
              aria-valuemax={rows.length}
              aria-valuenow={counted}
              className="h-2 overflow-hidden rounded-full bg-line"
            >
              <div className="h-2 bg-primary transition-[width]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      </div>

      {result && result.warnings.length > 0 && (
        <Alert tone="warn">
          <p className="font-semibold">
            {formatNumber(result.warnings.length)} mặt hàng có tồn thay đổi trong lúc kiểm (có bán
            hoặc nhập). Tồn đã được đặt đúng bằng số đếm thực tế:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {result.warnings.map((w) => (
              <li key={w.productId}>
                {w.name}: lúc tạo phiếu {formatQty(w.systemQty)}, lúc hoàn thành{" "}
                {formatQty(w.currentStock)}
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="flex flex-wrap items-start gap-4">
        <section
          aria-label="Danh sách kiểm"
          className="min-w-0 flex-[999_1_640px] rounded-card border border-line bg-white"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4">
            <Tabs<CountTab>
              label="Lọc dòng kiểm"
              value={tab}
              onChange={setTab}
              items={[
                { value: "all", label: "Tất cả", count: counts.all },
                { value: "diff", label: "Bị lệch", count: counts.diff },
                { value: "uncounted", label: "Chưa đếm", count: counts.uncounted },
              ]}
            />
            {draft && (
              <SaveStatus state={saveState} error={saveError} onRetry={() => void flush()} />
            )}
          </div>
          <div className="flex gap-2 px-4 py-3">
            <Input
              ref={scanRef}
              type="search"
              aria-label="Tìm hàng trong phiếu"
              data-scan-search=""
              autoComplete="off"
              placeholder={
                draft ? "Quét mã vạch để đếm nhanh: mỗi lần quét +1" : "Tìm hàng trong phiếu"
              }
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={draft ? onScanKeyDown : undefined}
              aria-busy={scanning}
              leading={scanning ? <Spinner size={16} /> : <SearchIcon size={18} />}
              frameClassName="flex-1"
            />
          </div>
          <div ref={tableRef} className="border-t border-line">
            {visible.length === 0 ? (
              <EmptyState
                title={
                  query
                    ? "Không có hàng khớp"
                    : tab === "diff"
                      ? "Chưa có mặt hàng nào bị lệch"
                      : tab === "uncounted"
                        ? "Đã đếm hết các mặt hàng"
                        : "Phiếu không có mặt hàng"
                }
                description={query && draft ? "Bấm Enter để quét mã này." : undefined}
                className="py-12"
              />
            ) : (
              <CountTable
                rows={visible}
                draft={draft}
                showValue={isOwner}
                flashId={flash?.id ?? null}
                reasonErrorIds={reasonErrorIds}
                onEdit={edit}
              />
            )}
          </div>
        </section>

        <aside
          aria-label="Tổng hợp kiểm kho"
          className="flex min-w-0 flex-[1_1_300px] flex-col rounded-card border border-line bg-white"
        >
          <div className="flex flex-col gap-2.5 p-4 text-sm">
            <h3 className="mb-1 text-[15px] font-semibold">Tổng hợp</h3>
            <SummaryRow label="Khớp" value={`${formatNumber(s.matched)} mặt hàng`} />
            <SummaryRow
              label="Lệch tăng"
              value={
                <span className="font-semibold text-success">
                  {formatNumber(increasedQty)} mặt hàng
                  {s.increaseValue !== undefined &&
                    ` · ${formatSigned(s.increaseValue, formatMoney)}`}
                </span>
              }
            />
            <SummaryRow
              label="Lệch giảm"
              value={
                <span className="font-semibold text-danger">
                  {formatNumber(decreasedQty)} mặt hàng
                  {s.decreaseValue !== undefined &&
                    ` · ${formatSigned(s.decreaseValue, formatMoney)}`}
                </span>
              }
            />
            <SummaryRow label="Chưa đếm" value={`${formatNumber(counts.uncounted)} mặt hàng`} />
            {valueDiff !== undefined && (
              <div className="flex items-baseline justify-between gap-3 border-t border-line pt-2.5">
                <span className="font-semibold">Chênh lệch giá trị</span>
                <span
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    valueDiff < 0 ? "text-danger" : valueDiff > 0 ? "text-success" : "text-ink",
                  )}
                >
                  {formatSigned(valueDiff, formatMoney)}
                </span>
              </div>
            )}
            {draft && saveState !== "saved" && saveState !== "idle" && isOwner && (
              <p className="text-xs text-ink-muted">Giá trị cập nhật sau khi lưu.</p>
            )}
            <p className="text-[13px] leading-normal text-ink-muted">
              {draft
                ? "Khi hoàn thành, tồn kho được điều chỉnh theo số thực tế và ghi vào lịch sử kho của từng mặt hàng. Hàng chưa đếm giữ nguyên tồn."
                : data.status === "completed"
                  ? "Tồn kho đã được điều chỉnh theo số thực tế. Muốn sửa thì tạo phiếu kiểm mới."
                  : "Phiếu đã hủy, tồn kho không thay đổi."}
            </p>
          </div>
          {draft && (
            // mousedown không lấy focus: ô số đang gõ dở không bị rời (rời ô thì ô tự chuẩn hóa chữ),
            // để còn phát hiện ô chưa hợp lệ và đưa người dùng về đúng ô đó.
            <div
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).closest("button")) e.preventDefault();
              }}
              className="mt-auto flex flex-col gap-2 rounded-b-card border-t border-line bg-table-head px-4 py-3.5"
            >
              {isOwner && (
                <Button
                  className="h-12 w-full"
                  loading={preparing}
                  onClick={() => void openConfirm()}
                >
                  Hoàn thành và cân bằng kho
                </Button>
              )}
              <Button variant="secondary" fullWidth onClick={() => void saveAndLeave()}>
                Lưu tạm, đếm tiếp sau
              </Button>
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={blocker.state === "blocked" && saveState === "error"}
        onClose={() => blocker.reset?.()}
        title="Chưa lưu được số đếm"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => blocker.reset?.()}>
              Ở lại
            </Button>
            <Button variant="danger" onClick={() => blocker.proceed?.()}>
              Rời trang, bỏ số chưa lưu
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-body">
          {saveError ?? "Không lưu được"}. Ở lại để thử lưu lại, nếu rời trang các số vừa đếm chưa
          lưu sẽ mất.
        </p>
      </Dialog>

      <Dialog
        open={confirming}
        onClose={() => {
          setConfirming(false);
          complete.reset();
        }}
        title="Hoàn thành và cân bằng kho?"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirming(false);
                complete.reset();
              }}
            >
              Kiểm tra lại
            </Button>
            <Button loading={complete.isPending} onClick={doComplete}>
              Hoàn thành
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-sm text-ink-body">
          <p>
            Tồn kho của {formatNumber(counted)} mặt hàng đã đếm sẽ được đặt bằng số thực tế (
            {formatNumber(counts.diff)} mặt hàng lệch).
            {counts.uncounted > 0 &&
              ` ${formatNumber(counts.uncounted)} mặt hàng chưa đếm giữ nguyên tồn.`}{" "}
            Phiếu đã hoàn thành không sửa được.
          </p>
          {changed.length > 0 && (
            <Alert tone="warn">
              <p className="font-semibold">
                Tồn của {formatNumber(changed.length)} mặt hàng đã thay đổi kể từ lúc tạo phiếu (có
                bán hoặc nhập). Chênh lệch được tính theo tồn hiện tại:
              </p>
              <ul className="mt-1 list-disc pl-5">
                {changed.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    {r.productName}: {formatQty(r.systemQty)} → {formatQty(r.currentStock)}{" "}
                    {r.baseUnit.toLowerCase()}
                  </li>
                ))}
                {changed.length > 8 && <li>và {formatNumber(changed.length - 8)} mặt hàng khác</li>}
              </ul>
            </Alert>
          )}
          {complete.isError && <Alert>{errorMessage(complete.error)}</Alert>}
        </div>
      </Dialog>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-soft">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  );
}

function SaveStatus({
  state,
  error,
  onRetry,
}: {
  state: SaveState;
  error: string | null;
  onRetry: () => void;
}) {
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <span role="alert" className="flex items-center gap-2 text-[13px] text-danger">
        Chưa lưu được{error ? `: ${error}` : ""}
        <Button variant="ghost" onClick={onRetry}>
          Thử lại
        </Button>
      </span>
    );
  }
  return (
    <span role="status" className="text-[13px] text-ink-muted">
      {state === "saved" ? "Đã lưu" : "Đang lưu…"}
    </span>
  );
}

function CountTable({
  rows,
  draft,
  showValue,
  flashId,
  reasonErrorIds,
  onEdit,
}: {
  rows: CountRow[];
  draft: boolean;
  showValue: boolean;
  flashId: string | null;
  reasonErrorIds: Set<string>;
  onEdit: (row: CountRow, patch: Partial<LineEdit>, text?: string) => void;
}) {
  return (
    <Table aria-label="Hàng cần kiểm" minWidth={showValue ? 1000 : 880}>
      <THead>
        <tr>
          <TH className="w-24">Mã hàng</TH>
          <TH>Tên hàng</TH>
          <TH className="w-20">Đơn vị</TH>
          <TH numeric className="w-28">
            Tồn hệ thống
          </TH>
          <TH numeric className="w-32">
            Thực tế
          </TH>
          <TH numeric className="w-28">
            Chênh lệch
          </TH>
          {showValue && (
            <TH numeric className="w-28">
              Giá trị lệch
            </TH>
          )}
          <TH className="w-44">Lý do</TH>
        </tr>
      </THead>
      <TBody>
        {rows.map((r) => {
          const fmt = (m: number) => formatQty(m);
          return (
            <TR
              key={r.id}
              data-line={r.id}
              className={cn(
                "transition-colors duration-300",
                r.actualQty === null && "bg-[#FCFCFD]",
                r.id === flashId && "bg-primary-soft",
              )}
            >
              <TD className="text-ink-muted">{r.productCode}</TD>
              <TD className="py-2 leading-snug">
                <div className="min-w-44 font-medium">{r.productName}</div>
                {draft && r.stockChanged && (
                  <div className="text-xs text-warn">
                    Tồn đổi từ {formatQty(r.systemQty)} → {formatQty(r.currentStock)} từ lúc tạo
                    phiếu
                  </div>
                )}
              </TD>
              <TD className="text-ink-soft">{r.baseUnit}</TD>
              <TD numeric className="text-ink-soft">
                {formatQty(draft ? r.currentStock : r.systemQty)}
              </TD>
              <TD className="px-2">
                {draft ? (
                  <QtyInput
                    aria-label={`Số thực tế ${r.productName}`}
                    placeholder="Chưa đếm"
                    value={r.actualQty}
                    onChange={(v, text) => onEdit(r, { actualQty: v }, text)}
                    className="h-10 text-right text-sm font-semibold"
                  />
                ) : (
                  <span className="num block font-semibold">
                    {r.actualQty === null ? "—" : formatQty(r.actualQty)}
                  </span>
                )}
              </TD>
              <TD
                numeric
                className={cn(
                  (r.diff ?? 0) > 0 && "font-semibold text-success",
                  (r.diff ?? 0) < 0 && "font-semibold text-danger",
                  !isDiff(r) && "text-ink-muted",
                )}
              >
                {formatDiff(r.diff, fmt)}
              </TD>
              {showValue && (
                <TD numeric className="text-ink-body">
                  {r.unsaved
                    ? "…"
                    : r.diffValue == null
                      ? ""
                      : formatSigned(r.diffValue, formatMoney)}
                </TD>
              )}
              <TD className="px-2">
                {isDiff(r) &&
                  (draft ? (
                    <Select
                      aria-label={`Lý do lệch ${r.productName}`}
                      aria-invalid={reasonErrorIds.has(r.id) && !r.reason ? true : undefined}
                      value={r.reason ?? ""}
                      onChange={(e) => onEdit(r, { reason: e.target.value || null })}
                      className="h-10 text-sm"
                    >
                      <option value="">Chọn lý do</option>
                      {r.reason && !REASONS.includes(r.reason) && (
                        <option value={r.reason}>{r.reason}</option>
                      )}
                      {REASONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-ink-body">{r.reason}</span>
                  ))}
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
