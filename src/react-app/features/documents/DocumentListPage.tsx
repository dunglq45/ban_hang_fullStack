import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  PERIOD_VALUES,
  type Period,
  periodRange,
  vnDateKey,
  vnDayStart,
} from "../../../shared/period";
import { useContactDetail } from "../../api/debts";
import { errorMessage } from "../../api/errors";
import { useDocuments } from "../../api/inventory";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { DateRangeFields } from "../../components/ui/DateRangeFields";
import { EmptyState } from "../../components/ui/EmptyState";
import { PlusIcon, SearchIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { TableSkeleton } from "../../components/ui/Skeleton";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { customRangeError } from "../../lib/date-range";
import { formatDateTime, formatMoney } from "../../lib/format";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { useLastValid } from "../../lib/use-last-valid";
import { ContactPicker, type PickedContact } from "../contacts/ContactPicker";
import { CreateStockCountDialog } from "../stock-counts/CreateStockCountDialog";
import { DOCUMENT_STATUS, type DocumentKind, type DocumentStatus } from "./document-status";
import { DocumentStatusBadge } from "./DocumentStatusBadge";
import { InvoiceDialog } from "./InvoiceDialog";

const PAGE_SIZE = 20;
type StatusFilter = "all" | DocumentStatus;
type TimeFilter = "all" | Period | "custom";

const TIME_LABELS: Record<TimeFilter, string> = {
  all: "Mọi thời gian",
  today: "Hôm nay",
  "7d": "7 ngày qua",
  month: "Tháng này",
  custom: "Tùy chọn",
};

/** Hóa đơn bán lọc được theo khách; dùng `ContactPicker` dạng bộ lọc (không tạo mới). */
function ContactFilter({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const detail = useContactDetail(value || undefined);
  if (value && detail.isPending) {
    return <div className="h-touch w-full animate-pulse rounded-control bg-table-head sm:w-64" />;
  }
  const picked: PickedContact | null = detail.data
    ? {
        id: detail.data.id,
        code: detail.data.code,
        name: detail.data.name,
        phone: detail.data.phone,
        debt: detail.data.debt,
        debtLimit: detail.data.debtLimit,
      }
    : null;
  return (
    <div className="w-full sm:w-64">
      <ContactPicker
        kind="customer"
        variant="filter"
        contact={value ? picked : null}
        onChange={(c) => onChange(c?.id ?? "")}
      />
    </div>
  );
}

const CONFIG = {
  sale: {
    type: "sale",
    base: "/hoa-don",
    unit: "hóa đơn",
    tableLabel: "Hóa đơn đã bán",
    searchLabel: "Tìm theo mã hóa đơn hoặc tên khách",
    emptyTitle: "Chưa có hóa đơn nào",
    emptyHint: "Hóa đơn bán ở màn Bán hàng sẽ hiện ở đây.",
  },
  purchase: {
    type: "purchase",
    base: "/nhap-hang",
    unit: "phiếu",
    tableLabel: "Phiếu nhập hàng",
    searchLabel: "Tìm theo mã phiếu hoặc nhà cung cấp",
    emptyTitle: "Chưa có phiếu nhập nào",
    emptyHint: "Tạo phiếu nhập để cộng tồn kho và ghi nợ nhà cung cấp.",
  },
  count: {
    type: "stock_count",
    base: "/kiem-kho",
    unit: "phiếu",
    tableLabel: "Phiếu kiểm kho",
    searchLabel: "Tìm theo mã phiếu",
    emptyTitle: "Chưa có phiếu kiểm kho nào",
    emptyHint: "Tạo phiếu kiểm để đếm hàng thực tế và cân bằng tồn kho.",
  },
} as const;

/**
 * Danh sách hóa đơn đã bán (`/hoa-don`), phiếu nhập (`/nhap-hang`) hoặc phiếu kiểm kho
 * (`/kiem-kho`), lọc qua URL. Hóa đơn bấm mã thì mở hộp thoại xem/in lại/hủy.
 */
export function DocumentListPage({ kind }: { kind: DocumentKind }) {
  const cfg = CONFIG[kind];
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("trang-thai") ?? "all";
  // Hóa đơn bán không có bản nháp: ?trang-thai=draft coi như Tất cả.
  const status: StatusFilter =
    Object.hasOwn(DOCUMENT_STATUS, statusParam) && !(kind === "sale" && statusParam === "draft")
      ? (statusParam as DocumentStatus)
      : "all";
  const timeParam = params.get("thoi-gian") ?? "all";
  const time: TimeFilter = (["all", ...PERIOD_VALUES, "custom"] as string[]).includes(timeParam)
    ? (timeParam as TimeFilter)
    : "all";
  const [now] = useState(() => Date.now());
  const customFrom = params.get("tu") ?? "";
  const customTo = params.get("den") ?? "";
  // Mặc định khi mới bật Tùy chọn: 7 ngày gần nhất.
  const defaultFrom = vnDateKey(vnDayStart(now) - 6 * 86_400_000);
  const defaultTo = vnDateKey(now);
  const rangeError = time === "custom" ? customRangeError(customFrom, customTo) : null;
  const page = Math.max(1, Number(params.get("trang")) || 1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(search.trim(), 300);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);
  const hasContact = kind !== "count";
  // Chỉ hóa đơn bán lọc được theo khách (lọc theo NCC ít cần vì phiếu nhập không nhiều).
  const contactId = kind === "sale" ? (params.get("khach") ?? "") : "";

  function update(patch: Record<string, string | null>) {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v && v !== "all") next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  }

  // Khoảng thời gian: kỳ có sẵn tính lại mỗi lần render (làm tròn theo ngày nên khóa cache ổn
  // định); khoảng tùy chọn đang gõ dở/sai thì giữ khoảng hợp lệ gần nhất để danh sách không nhảy
  // về "mọi thời gian".
  type Range = { from: number; to: number };
  const customRange =
    time === "custom" && !rangeError ? periodRange({ from: customFrom, to: customTo }) : null;
  const lastValidCustom = useLastValid<Range>(customRange, periodRange("today"));
  const range: Range | null =
    time === "all" ? null : time === "custom" ? lastValidCustom : periodRange(time);
  const list = useDocuments({
    type: cfg.type,
    status: status === "all" ? undefined : status,
    contactId: contactId || undefined,
    q: q || undefined,
    from: range ? String(range.from) : undefined,
    to: range ? String(range.to) : undefined,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const items = list.data?.items ?? [];
  const filtered = status !== "all" || q || time !== "all" || !!contactId;

  const tabs: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "Tất cả" },
    // Hóa đơn bán không có bản nháp.
    ...(kind === "sale" ? [] : [{ value: "draft" as const, label: DOCUMENT_STATUS.draft[kind] }]),
    { value: "completed", label: DOCUMENT_STATUS.completed[kind] },
    { value: "cancelled", label: "Đã hủy" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {list.data ? `${list.data.total.toLocaleString("vi-VN")} ${cfg.unit}` : " "}
        </p>
        {kind === "sale" ? (
          <Link to="/ban-hang" className={buttonClass()}>
            <PlusIcon size={18} />
            Bán hàng
          </Link>
        ) : kind === "purchase" ? (
          <Link to="/nhap-hang/moi" className={buttonClass()}>
            <PlusIcon size={18} />
            Tạo phiếu nhập
          </Link>
        ) : (
          <Button icon={<PlusIcon size={18} />} onClick={() => setCreating(true)}>
            Tạo phiếu kiểm
          </Button>
        )}
      </div>

      <div className="rounded-card border border-line bg-white">
        <Tabs
          label="Lọc theo trạng thái"
          className="px-4"
          value={status}
          onChange={(v) => update({ "trang-thai": v, trang: "" })}
          items={tabs}
        />
        <div className="flex flex-wrap gap-2 px-4 py-3">
          <Input
            type="search"
            aria-label={cfg.searchLabel}
            placeholder={cfg.searchLabel}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              update({ q: e.target.value.trim(), trang: "" });
            }}
            leading={<SearchIcon size={18} />}
            frameClassName="flex-[1_1_260px]"
          />
          {kind === "sale" && (
            <ContactFilter value={contactId} onChange={(id) => update({ khach: id, trang: "" })} />
          )}
          <Select
            aria-label="Thời gian"
            value={time}
            onChange={(e) => {
              const v = e.target.value;
              update(
                v === "custom"
                  ? {
                      "thoi-gian": v,
                      tu: customFrom || defaultFrom,
                      den: customTo || defaultTo,
                      trang: "",
                    }
                  : { "thoi-gian": v, tu: null, den: null, trang: "" },
              );
            }}
            className="w-full sm:w-48"
          >
            {(["all", ...PERIOD_VALUES, "custom"] as TimeFilter[]).map((t) => (
              <option key={t} value={t}>
                {TIME_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>
        {time === "custom" && (
          <div className="px-4 pb-3">
            <DateRangeFields
              from={customFrom}
              to={customTo}
              error={rangeError}
              onChange={(p) =>
                update(p.from !== undefined ? { tu: p.from } : { den: p.to ?? null })
              }
            />
          </div>
        )}

        <div className="border-t border-line">
          {list.isPending ? (
            <Table
              aria-label={`Đang tải ${cfg.tableLabel.toLowerCase()}`}
              minWidth={hasContact ? 860 : 560}
            >
              <THead>
                <tr>
                  <TH>{kind === "sale" ? "Mã hóa đơn" : "Mã phiếu"}</TH>
                  <TH>Thời gian</TH>
                  {hasContact && <TH>{kind === "sale" ? "Khách hàng" : "Nhà cung cấp"}</TH>}
                  {hasContact && <TH numeric>Tổng tiền</TH>}
                  {hasContact && <TH numeric>{kind === "sale" ? "Ghi nợ" : "Còn nợ"}</TH>}
                  <TH>Trạng thái</TH>
                  <TH>{kind === "sale" ? "Người bán" : "Người tạo"}</TH>
                </tr>
              </THead>
              <TableSkeleton columns={hasContact ? 7 : 4} />
            </Table>
          ) : list.isError ? (
            <div className="p-4">
              <Alert>{errorMessage(list.error)}</Alert>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title={filtered ? `Không có ${cfg.unit} phù hợp` : cfg.emptyTitle}
              description={filtered ? "Thử đổi bộ lọc." : cfg.emptyHint}
              className="py-14"
            />
          ) : (
            <Table aria-label={cfg.tableLabel} minWidth={hasContact ? 860 : 560}>
              <THead>
                <tr>
                  <TH>{kind === "sale" ? "Mã hóa đơn" : "Mã phiếu"}</TH>
                  <TH>Thời gian</TH>
                  {hasContact && <TH>{kind === "sale" ? "Khách hàng" : "Nhà cung cấp"}</TH>}
                  {hasContact && <TH numeric>Tổng tiền</TH>}
                  {hasContact && <TH numeric>{kind === "sale" ? "Ghi nợ" : "Còn nợ"}</TH>}
                  <TH>Trạng thái</TH>
                  <TH>{kind === "sale" ? "Người bán" : "Người tạo"}</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((d) => (
                  <TR key={d.id} className="hover:bg-table-head">
                    <TD className="py-3">
                      {kind === "sale" ? (
                        <button
                          type="button"
                          onClick={() => setViewing(d.id)}
                          className="inline-flex min-h-touch items-center font-semibold text-primary hover:underline"
                        >
                          {d.code}
                        </button>
                      ) : (
                        <Link
                          to={`${cfg.base}/${d.id}`}
                          className="inline-flex min-h-touch items-center font-semibold text-primary hover:underline"
                        >
                          {d.code}
                        </Link>
                      )}
                    </TD>
                    <TD className="whitespace-nowrap text-ink-body">
                      {formatDateTime(d.createdAt)}
                    </TD>
                    {hasContact && (
                      <TD>
                        {d.contactName ?? (
                          <span className="text-ink-muted">
                            {kind === "sale" ? "Khách lẻ" : "—"}
                          </span>
                        )}
                      </TD>
                    )}
                    {hasContact && <TD numeric>{formatMoney(d.total)}</TD>}
                    {hasContact && (
                      <TD
                        numeric
                        className={d.debtAmount > 0 ? "font-semibold text-warn" : "text-ink-muted"}
                      >
                        {formatMoney(d.debtAmount)}
                      </TD>
                    )}
                    <TD>
                      <DocumentStatusBadge status={d.status} kind={kind} />
                    </TD>
                    <TD className="text-ink-body">{d.createdByName}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
        {list.data && list.data.total > PAGE_SIZE && (
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={list.data.total}
            onChange={(p) => update({ trang: p > 1 ? String(p) : "" })}
            itemLabel={cfg.unit}
            className="border-t border-line px-4 py-3"
          />
        )}
      </div>

      {kind === "count" && (
        <CreateStockCountDialog open={creating} onClose={() => setCreating(false)} />
      )}
      {viewing && <InvoiceDialog id={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
