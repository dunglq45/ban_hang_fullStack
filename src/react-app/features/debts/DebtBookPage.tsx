import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useSession } from "../../api/auth";
import {
  type ContactDetail,
  DEBT_ENTRIES_PAGE_SIZE,
  fetchAllDebtEntries,
  useContactDetail,
  useContactList,
  useDebtEntries,
  useDebtSummary,
} from "../../api/debts";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { EmptyState } from "../../components/ui/EmptyState";
import { ChevronLeftIcon, LedgerIcon, PhoneIcon, SearchIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { KpiStrip } from "../../components/ui/KpiStrip";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { Spinner } from "../../components/ui/Spinner";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPhone,
} from "../../lib/format";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import { ContactEditDialog } from "./ContactEditDialog";
import {
  type ContactKind,
  DEBT_TEXT,
  debtAgeLabel,
  isOverdue,
  ledgerFileName,
  ledgerSheetRows,
  METHOD_TEXT,
  shortDate,
} from "./debt-utils";
import { type LedgerRef, LedgerRefDialog } from "./LedgerRefDialog";
import { PaymentDialog } from "./PaymentDialog";

const LIST_PAGE_SIZE = 30;

type SortKey = "debt" | "age";
const SORTS: Record<SortKey, { label: string; api: "debt_desc" | "debt_since_asc" }> = {
  debt: { label: "Dư nợ cao nhất", api: "debt_desc" },
  age: { label: "Nợ lâu nhất", api: "debt_since_asc" },
};

/**
 * Sổ nợ (`/so-no`, `/so-no/:contactId`). Máy tính: danh sách bên trái, chi tiết bên phải.
 * Điện thoại: `/so-no` chỉ có danh sách, `/so-no/:contactId` chỉ có chi tiết (trang riêng).
 * Bộ lọc nằm trên URL: `loai=ncc`, `sap-xep=lau-nhat`, `loc=tat-ca`, `q`.
 */
export function DebtBookPage() {
  const { contactId } = useParams();
  const [params, setParams] = useSearchParams();
  const urlKind: ContactKind = params.get("loai") === "ncc" ? "supplier" : "customer";
  const sort: SortKey = params.get("sap-xep") === "lau-nhat" ? "age" : "debt";
  const showAll = params.get("loc") === "tat-ca";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(search.trim(), 250);
  const [listPage, setListPage] = useState(1);
  const summary = useDebtSummary();
  const navigate = useNavigate();
  const [now] = useState(Date.now);

  function update(patch: Record<string, string>) {
    setListPage(1);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace: true },
    );
  }

  // Mở thẳng /so-no/:id của một nhà cung cấp mà URL không ghi loai=ncc (hoặc ngược lại): tab theo
  // loại của đối tác đang xem.
  const detail = useContactDetail(contactId);
  const kind: ContactKind = detail.data?.type ?? urlKind;

  const list = useContactList({
    type: kind,
    q: q || undefined,
    hasDebt: showAll ? undefined : "true",
    sort: showAll && !q ? "name" : SORTS[sort].api,
    page: String(listPage),
    pageSize: String(LIST_PAGE_SIZE),
  });
  const items = list.data?.items ?? [];
  const text = DEBT_TEXT[kind];
  const s = summary.data;
  const month = new Date(now + 7 * 3600_000).getUTCMonth() + 1;
  const linkParams = new URLSearchParams(params);
  if (kind === "supplier") linkParams.set("loai", "ncc");
  else linkParams.delete("loai");
  const query = linkParams.size > 0 ? `?${linkParams.toString()}` : "";

  return (
    <div className="flex flex-col gap-4">
      <KpiStrip
        items={[
          {
            label: "Tổng phải thu khách hàng",
            value: s ? formatMoney(s.receivable.amount) : "…",
            hint: s ? `${formatNumber(s.receivable.customers)} khách đang nợ` : undefined,
          },
          {
            label: `Nợ quá ${s?.overdue.days ?? 30} ngày`,
            value: s ? formatMoney(s.overdue.amount) : "…",
            hint: s ? (
              <span className={s.overdue.customers > 0 ? "text-warn" : undefined}>
                {s.overdue.customers > 0
                  ? `${formatNumber(s.overdue.customers)} khách cần nhắc`
                  : "Không có khách nợ lâu"}
              </span>
            ) : undefined,
            tone: s && s.overdue.amount > 0 ? "warn" : "default",
          },
          {
            label: `Đã thu nợ tháng ${month}`,
            value: s ? formatMoney(s.collectedThisMonth.amount) : "…",
            hint: s ? `${formatNumber(s.collectedThisMonth.count)} lần thu` : undefined,
          },
        ]}
      />

      <Tabs
        label="Loại công nợ"
        value={kind}
        onChange={(v) => {
          setSearch("");
          setListPage(1);
          const next = new URLSearchParams();
          if (v === "supplier") next.set("loai", "ncc");
          if (params.get("sap-xep")) next.set("sap-xep", params.get("sap-xep")!);
          const qs = next.toString();
          void navigate(`/so-no${qs ? `?${qs}` : ""}`);
        }}
        items={[
          { value: "customer", label: DEBT_TEXT.customer.tab, count: s?.receivable.customers },
          { value: "supplier", label: DEBT_TEXT.supplier.tab, count: s?.payable.suppliers },
        ]}
      />

      <div className="flex overflow-hidden rounded-card border border-line bg-white">
        <section
          aria-label={text.listLabel}
          className={cn(
            "min-w-0 flex-col border-line md:flex md:w-[320px] md:shrink-0 md:border-r",
            contactId ? "hidden" : "flex w-full",
          )}
        >
          <div className="flex flex-col gap-2 border-b border-line p-3">
            <Input
              type="search"
              aria-label={text.searchLabel}
              placeholder="Tên hoặc số điện thoại"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                update({ q: e.target.value.trim() });
              }}
              leading={<SearchIcon size={18} />}
            />
            <div className="flex gap-2">
              <Select
                aria-label="Sắp xếp"
                value={sort}
                onChange={(e) => update({ "sap-xep": e.target.value === "age" ? "lau-nhat" : "" })}
                className="h-10 min-w-0 flex-1 text-sm"
                disabled={showAll && !q}
              >
                {(Object.keys(SORTS) as SortKey[]).map((k) => (
                  <option key={k} value={k}>
                    {SORTS[k].label}
                  </option>
                ))}
              </Select>
              <Select
                aria-label="Lọc"
                value={showAll ? "all" : "debt"}
                onChange={(e) => update({ loc: e.target.value === "all" ? "tat-ca" : "" })}
                className="h-10 w-28 shrink-0 text-sm"
              >
                <option value="debt">Đang nợ</option>
                <option value="all">Tất cả</option>
              </Select>
            </div>
          </div>

          {list.isError ? (
            <Alert className="m-3">{errorMessage(list.error)}</Alert>
          ) : list.isPending ? (
            <ul aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <li
                  key={i}
                  className="flex min-h-16 items-center gap-3 border-b border-subtle px-4 py-3"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Skeleton className="h-4" style={{ width: `${55 + (i % 3) * 10}%` }} />
                    <Skeleton className="h-3 w-24" />
                  </span>
                  <Skeleton className="h-4 w-16" />
                </li>
              ))}
            </ul>
          ) : items.length === 0 ? (
            <EmptyState
              title={q ? "Không tìm thấy" : showAll ? text.emptyAll : text.emptyList}
              description={q ? `Không có ${text.who} nào khớp "${q}".` : undefined}
            />
          ) : (
            <ul className={cn(list.isPlaceholderData && "opacity-60")}>
              {items.map((c) => {
                const selected = c.id === contactId;
                const overdue = c.debt > 0 && isOverdue(c.debtSince, now);
                const age = c.debt > 0 ? debtAgeLabel(c.debtSince, now) : null;
                return (
                  <li key={c.id}>
                    <Link
                      to={`/so-no/${c.id}${query}`}
                      aria-current={selected ? "page" : undefined}
                      className={cn(
                        "flex min-h-16 items-center gap-3 border-b border-subtle px-4 py-3 text-ink hover:bg-table-head",
                        selected && "bg-primary-soft hover:bg-primary-soft",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col leading-snug">
                        <span className="truncate text-sm font-semibold">
                          {c.name}
                          {!c.isActive && (
                            <span className="font-normal text-ink-muted"> · Ngừng giao dịch</span>
                          )}
                        </span>
                        <span className="text-[13px] text-ink-muted">
                          {c.phone ? formatPhone(c.phone) : c.code}
                        </span>
                      </span>
                      <span className="flex flex-col items-end leading-snug">
                        <span
                          className={cn(
                            "text-sm font-semibold tabular-nums",
                            c.debt <= 0 && "font-normal text-ink-muted",
                          )}
                        >
                          {c.debt === 0 ? "Không nợ" : formatMoney(c.debt)}
                        </span>
                        {age && (
                          <span
                            className={cn(
                              "text-xs",
                              overdue ? "font-semibold text-warn" : "text-ink-muted",
                            )}
                          >
                            {age}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {list.data && list.data.total > LIST_PAGE_SIZE && (
            <Pagination
              page={listPage}
              pageSize={LIST_PAGE_SIZE}
              total={list.data.total}
              onChange={setListPage}
              itemLabel={text.who}
              className="px-3"
            />
          )}
        </section>

        <section
          aria-label="Chi tiết công nợ"
          className={cn("min-w-0 flex-1 flex-col md:flex", contactId ? "flex" : "hidden")}
        >
          {contactId ? (
            <ContactDebtDetail
              contactId={contactId}
              query={detail}
              backTo={`/so-no${query}`}
              now={now}
            />
          ) : (
            <EmptyState
              icon={<LedgerIcon size={24} />}
              title={`Chọn một ${text.who} để xem sổ nợ`}
              description="Bấm vào một dòng trong danh sách bên trái."
              className="flex-1"
            />
          )}
        </section>
      </div>
    </div>
  );
}

function StatCell({
  label,
  children,
  sub,
}: {
  label: string;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="bg-white px-4 py-3">
      <div className="text-[13px] text-ink-muted">{label}</div>
      <div className="pt-1 text-[15px] font-semibold tabular-nums">{children}</div>
      {sub && <div className="text-[13px] text-ink-muted">{sub}</div>}
    </div>
  );
}

function ContactDebtDetail({
  contactId,
  query,
  backTo,
  now,
}: {
  contactId: string;
  query: ReturnType<typeof useContactDetail>;
  backTo: string;
  now: number;
}) {
  const { user } = useSession();
  const isOwner = user.role === "owner";
  const navigate = useNavigate();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refTarget, setRefTarget] = useState<LedgerRef | null>(null);
  const entries = useDebtEntries(contactId, page);

  // Đổi người đang xem thì về trang 1 của sổ.
  const [shownId, setShownId] = useState(contactId);
  if (shownId !== contactId) {
    setShownId(contactId);
    setPage(1);
  }

  const back = (
    <Link
      to={backTo}
      className="-ml-2 flex h-touch w-fit items-center gap-1 px-2 text-sm font-medium text-primary md:hidden"
    >
      <ChevronLeftIcon size={18} />
      Danh sách
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col p-5">
        {back}
        <div className="flex justify-center py-10">
          <Spinner label="Đang tải" />
        </div>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col gap-3 p-5">
        {back}
        <Alert>{errorMessage(query.error)}</Alert>
      </div>
    );
  }

  const c: ContactDetail = query.data;
  const kind = c.type;
  const text = DEBT_TEXT[kind];
  const isCustomer = kind === "customer";
  // Phiếu chi (trả nợ NCC) chỉ chủ cửa hàng lập.
  const canPay = isCustomer || isOwner;
  const age = c.debt > 0 ? debtAgeLabel(c.debtSince, now) : null;
  const overdue = c.debt > 0 && isOverdue(c.debtSince, now);
  const info = [c.code, c.phone ? formatPhone(c.phone) : null, c.address].filter(Boolean);
  const entryData = entries.data;

  async function exportExcel() {
    setExporting(true);
    try {
      const [all, XLSX] = await Promise.all([fetchAllDebtEntries(c.id), import("xlsx")]);
      const at = Date.now();
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(ledgerSheetRows(c, all, at));
      ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 36 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws, "So no");
      XLSX.writeFile(wb, ledgerFileName(c.code, at));
    } catch (err) {
      toast({ tone: "error", message: `Không xuất được file: ${errorMessage(err)}` });
    } finally {
      setExporting(false);
    }
  }

  function sellOnDebt() {
    void navigate("/ban-hang", {
      state: {
        customer: {
          id: c.id,
          code: c.code,
          name: c.name,
          phone: c.phone,
          debt: c.debt,
          debtLimit: c.debtLimit,
        },
      },
    });
  }

  return (
    <div className="@container flex flex-col gap-[18px] px-4 pt-3 pb-6 md:px-6 md:pt-5">
      {back}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 leading-snug">
          <h2 className="text-lg font-semibold text-ink">
            {c.name}
            {!c.isActive && (
              <span className="ml-2 align-middle text-[13px] font-medium text-ink-muted">
                (Ngừng giao dịch)
              </span>
            )}
          </h2>
          <div className="text-sm text-ink-muted">{info.join(" · ")}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {c.phone && (
            <a href={`tel:${c.phone}`} className={buttonClass({ variant: "secondary" })}>
              <PhoneIcon size={16} />
              Gọi
            </a>
          )}
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Sửa
          </Button>
          {isCustomer && c.isActive && (
            <Button variant="secondary" onClick={sellOnDebt}>
              Ghi nợ
            </Button>
          )}
          {canPay && (
            <Button
              onClick={() => setPaying(true)}
              disabled={c.debt <= 0}
              title={c.debt <= 0 ? "Không còn nợ" : undefined}
            >
              {text.pay}
            </Button>
          )}
        </div>
      </div>

      <div
        className={cn(
          "grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line",
          // Khách: 4 ô (có hạn mức), NCC: 3 ô; hẹp thì 2 cột, ô lẻ cuối trải hết hàng.
          isCustomer
            ? "@lg:grid-cols-4"
            : "@lg:grid-cols-3 [&>*:last-child]:col-span-2 @lg:[&>*:last-child]:col-span-1",
        )}
      >
        <div className="bg-white px-4 py-3">
          <div className="text-[13px] text-ink-muted">Dư nợ hiện tại</div>
          <div
            className={cn(
              "text-[22px] font-semibold tabular-nums",
              c.debt > 0 ? "text-warn" : "text-ink",
            )}
          >
            {formatMoney(c.debt)}
          </div>
        </div>
        <StatCell
          label="Nợ từ ngày"
          sub={
            age && <span className={overdue ? "font-semibold text-warn" : undefined}>{age}</span>
          }
        >
          {c.debt > 0 && c.debtSince !== null ? formatDate(c.debtSince) : "—"}
        </StatCell>
        {isCustomer && (
          <StatCell
            label="Hạn mức nợ"
            sub={
              c.debtLimit !== null ? (
                c.debt > c.debtLimit ? (
                  <span className="font-semibold text-danger">
                    Vượt {formatMoney(c.debt - c.debtLimit)}
                  </span>
                ) : (
                  `Còn ${formatMoney(c.debtLimit - Math.max(0, c.debt))}`
                )
              ) : undefined
            }
          >
            {c.debtLimit !== null ? formatMoney(c.debtLimit) : "Không giới hạn"}
          </StatCell>
        )}
        <StatCell
          label={text.lastPayment}
          sub={
            c.lastPayment
              ? `${formatMoney(c.lastPayment.amount)} · ${METHOD_TEXT[c.lastPayment.method]}`
              : undefined
          }
        >
          {c.lastPayment ? formatDate(c.lastPayment.createdAt) : "Chưa có"}
        </StatCell>
      </div>

      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[15px] font-semibold">Sổ chi tiết công nợ</h3>
        <Button
          variant="secondary"
          className="h-10 font-medium"
          loading={exporting}
          disabled={!entryData || entryData.total === 0}
          onClick={() => void exportExcel()}
        >
          Xuất Excel
        </Button>
      </div>

      <div className="overflow-hidden rounded-control border border-line">
        {entries.isError ? (
          <Alert className="m-3">{errorMessage(entries.error)}</Alert>
        ) : !entryData ? (
          <div className="flex justify-center py-8">
            <Spinner label="Đang tải" />
          </div>
        ) : entryData.total === 0 ? (
          <EmptyState title="Chưa có phát sinh công nợ" className="py-8" />
        ) : (
          <>
            <Table
              aria-label="Sổ chi tiết công nợ"
              minWidth={560}
              className={cn(entries.isPlaceholderData && "opacity-60")}
            >
              <THead>
                <TR>
                  <TH className="px-3.5">Ngày</TH>
                  <TH className="px-3.5">Chứng từ</TH>
                  <TH className="px-3.5">Diễn giải</TH>
                  <TH numeric className="px-3.5">
                    Phát sinh nợ
                  </TH>
                  <TH numeric className="px-3.5">
                    Đã trả
                  </TH>
                  <TH numeric className="px-3.5">
                    Dư nợ
                  </TH>
                </TR>
              </THead>
              <TBody>
                {entryData.items.map((e) => (
                  <TR key={e.id}>
                    <TD className="h-12 px-3.5 whitespace-nowrap text-ink-soft">
                      <span title={formatDateTime(e.createdAt)}>{shortDate(e.createdAt, now)}</span>
                    </TD>
                    <TD className="h-12 px-3.5">
                      {e.ref?.code ? (
                        // Nhân viên chỉ xem được hóa đơn bán (như server): chứng từ khác chỉ hiện mã.
                        e.ref.kind === "document" && e.ref.type !== "sale" && !isOwner ? (
                          <span className="font-medium">{e.ref.code}</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRefTarget(e.ref)}
                            className="-mx-1 min-h-touch px-1 font-medium text-primary hover:underline"
                          >
                            {e.ref.code}
                          </button>
                        )
                      ) : (
                        <span className="text-ink-muted">—</span>
                      )}
                    </TD>
                    <TD className="h-12 px-3.5 text-ink-body">{e.description}</TD>
                    <TD numeric className="h-12 px-3.5">
                      {e.increase > 0 ? formatMoney(e.increase) : "—"}
                    </TD>
                    <TD numeric className="h-12 px-3.5 text-success">
                      {e.decrease > 0 ? formatMoney(e.decrease) : "—"}
                    </TD>
                    <TD numeric className="h-12 px-3.5 font-semibold">
                      {formatMoney(e.balanceAfter)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            {entryData.total > DEBT_ENTRIES_PAGE_SIZE && (
              <Pagination
                page={page}
                pageSize={DEBT_ENTRIES_PAGE_SIZE}
                total={entryData.total}
                onChange={setPage}
                className="border-t border-line"
              />
            )}
          </>
        )}
      </div>

      {paying && <PaymentDialog contact={c} onClose={() => setPaying(false)} />}
      {editing && <ContactEditDialog contact={c} onClose={() => setEditing(false)} />}
      {refTarget && <LedgerRefDialog target={refTarget} onClose={() => setRefTarget(null)} />}
    </div>
  );
}
