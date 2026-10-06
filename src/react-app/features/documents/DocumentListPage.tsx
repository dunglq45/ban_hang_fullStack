import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { PERIOD_VALUES, type Period, periodRange } from "../../../shared/period";
import { errorMessage } from "../../api/errors";
import { useDocuments } from "../../api/inventory";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { EmptyState } from "../../components/ui/EmptyState";
import { PlusIcon, SearchIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { formatDateTime, formatMoney } from "../../lib/format";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { CreateStockCountDialog } from "../stock-counts/CreateStockCountDialog";
import { DOCUMENT_STATUS, type DocumentKind, type DocumentStatus } from "./document-status";
import { DocumentStatusBadge } from "./DocumentStatusBadge";

const PAGE_SIZE = 20;
type StatusFilter = "all" | DocumentStatus;
type TimeFilter = "all" | Period;

const TIME_LABELS: Record<TimeFilter, string> = {
  all: "Mọi thời gian",
  today: "Hôm nay",
  "7d": "7 ngày qua",
  month: "Tháng này",
};

const CONFIG = {
  purchase: {
    type: "purchase",
    base: "/nhap-hang",
    searchLabel: "Tìm theo mã phiếu hoặc nhà cung cấp",
    emptyTitle: "Chưa có phiếu nhập nào",
    emptyHint: "Tạo phiếu nhập để cộng tồn kho và ghi nợ nhà cung cấp.",
  },
  count: {
    type: "stock_count",
    base: "/kiem-kho",
    searchLabel: "Tìm theo mã phiếu",
    emptyTitle: "Chưa có phiếu kiểm kho nào",
    emptyHint: "Tạo phiếu kiểm để đếm hàng thực tế và cân bằng tồn kho.",
  },
} as const;

/** Danh sách phiếu nhập (`/nhap-hang`) hoặc phiếu kiểm kho (`/kiem-kho`), lọc qua URL. */
export function DocumentListPage({ kind }: { kind: DocumentKind }) {
  const cfg = CONFIG[kind];
  const [params, setParams] = useSearchParams();
  const statusParam = params.get("trang-thai") ?? "all";
  const status: StatusFilter = Object.hasOwn(DOCUMENT_STATUS, statusParam)
    ? (statusParam as DocumentStatus)
    : "all";
  const timeParam = params.get("thoi-gian") ?? "all";
  const time: TimeFilter = (PERIOD_VALUES as readonly string[]).includes(timeParam)
    ? (timeParam as Period)
    : "all";
  const page = Math.max(1, Number(params.get("trang")) || 1);
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(search.trim(), 300);
  const [creating, setCreating] = useState(false);

  function update(patch: Record<string, string>) {
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

  // Khoảng thời gian tính lại mỗi lần render theo giờ hiện tại; làm tròn theo ngày nên khóa cache ổn định.
  const range = time === "all" ? null : periodRange(time);
  const list = useDocuments({
    type: cfg.type,
    status: status === "all" ? undefined : status,
    q: q || undefined,
    from: range ? String(range.from) : undefined,
    to: range ? String(range.to) : undefined,
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const items = list.data?.items ?? [];

  const tabs: Array<{ value: StatusFilter; label: string }> = [
    { value: "all", label: "Tất cả" },
    { value: "draft", label: DOCUMENT_STATUS.draft[kind] },
    { value: "completed", label: DOCUMENT_STATUS.completed[kind] },
    { value: "cancelled", label: "Đã hủy" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          {list.data ? `${list.data.total.toLocaleString("vi-VN")} phiếu` : " "}
        </p>
        {kind === "purchase" ? (
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
          <Select
            aria-label="Thời gian"
            value={time}
            onChange={(e) => update({ "thoi-gian": e.target.value, trang: "" })}
            className="w-full sm:w-48"
          >
            {(["all", ...PERIOD_VALUES] as TimeFilter[]).map((t) => (
              <option key={t} value={t}>
                {TIME_LABELS[t]}
              </option>
            ))}
          </Select>
        </div>

        <div className="border-t border-line">
          {list.isPending ? (
            <div className="flex justify-center py-16">
              <Spinner size={28} label="Đang tải danh sách phiếu" className="text-primary" />
            </div>
          ) : list.isError ? (
            <div className="p-4">
              <Alert>{errorMessage(list.error)}</Alert>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title={
                status !== "all" || q || time !== "all" ? "Không có phiếu phù hợp" : cfg.emptyTitle
              }
              description={
                status !== "all" || q || time !== "all" ? "Thử đổi bộ lọc." : cfg.emptyHint
              }
              className="py-14"
            />
          ) : (
            <Table
              aria-label={kind === "purchase" ? "Phiếu nhập hàng" : "Phiếu kiểm kho"}
              minWidth={kind === "purchase" ? 860 : 560}
            >
              <THead>
                <tr>
                  <TH>Mã phiếu</TH>
                  <TH>Thời gian</TH>
                  {kind === "purchase" && <TH>Nhà cung cấp</TH>}
                  {kind === "purchase" && <TH numeric>Tổng tiền</TH>}
                  {kind === "purchase" && <TH numeric>Còn nợ</TH>}
                  <TH>Trạng thái</TH>
                  <TH>Người tạo</TH>
                </tr>
              </THead>
              <TBody>
                {items.map((d) => (
                  <TR key={d.id} className="hover:bg-table-head">
                    <TD className="py-3">
                      <Link
                        to={`${cfg.base}/${d.id}`}
                        className="inline-flex min-h-touch items-center font-semibold text-primary hover:underline"
                      >
                        {d.code}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap text-ink-body">
                      {formatDateTime(d.createdAt)}
                    </TD>
                    {kind === "purchase" && (
                      <TD>{d.contactName ?? <span className="text-ink-muted">—</span>}</TD>
                    )}
                    {kind === "purchase" && <TD numeric>{formatMoney(d.total)}</TD>}
                    {kind === "purchase" && (
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
            itemLabel="phiếu"
            className="border-t border-line px-4 py-3"
          />
        )}
      </div>

      {kind === "count" && (
        <CreateStockCountDialog open={creating} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}
