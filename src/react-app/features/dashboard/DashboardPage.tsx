import { type ReactNode, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { vnDateKey, vnMonthStart } from "../../../shared/period";
import { useSession } from "../../api/auth";
import { errorMessage } from "../../api/errors";
import {
  fetchReportExport,
  type PeriodParams,
  type RestockItem,
  type RevenueDay,
  useOverview,
  useRestock,
  useRevenueDaily,
  useTopProducts,
} from "../../api/reports";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { DateRangeFields } from "../../components/ui/DateRangeFields";
import { DownloadIcon } from "../../components/ui/icons";
import { KpiStrip, type KpiItem } from "../../components/ui/KpiStrip";
import { SegmentedControl } from "../../components/ui/SegmentedControl";
import { Spinner } from "../../components/ui/Spinner";
import { StatusDot } from "../../components/ui/StatusDot";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { customRangeError } from "../../lib/date-range";
import { useLastValid } from "../../lib/use-last-valid";
import { formatDate, formatMoney, formatNumber, formatQty } from "../../lib/format";
import {
  barHeight,
  dayLabel,
  formatPercent,
  PERIOD_OPTIONS,
  type PeriodKey,
  restockQty,
  shortMoney,
  TOP_TITLE,
} from "./dashboard-utils";
import { reportFileName, reportSheets } from "./report-export";

/** Số hàng "Cần nhập thêm" hiện sẵn; còn lại bấm "Xem thêm". */
const RESTOCK_PREVIEW = 8;
/** Tải tối đa chừng này hàng cần nhập (một trang API) để tạo phiếu nhập điền sẵn. */
const RESTOCK_FETCH = 100;
const CHART_HEIGHT = 160;

/** Trạng thái chuyển sang `/nhap-hang/moi` để điền sẵn các mặt hàng cần nhập. */
export interface RestockPreset {
  restock: Array<{ productId: string; qty: number }>;
}

function periodFromParams(params: URLSearchParams, now: number) {
  const raw = params.get("ky");
  const key: PeriodKey = PERIOD_OPTIONS.some((o) => o.value === raw) ? (raw as PeriodKey) : "today";
  const from = params.get("tu") ?? vnDateKey(vnMonthStart(now));
  const to = params.get("den") ?? vnDateKey(now);
  return { key, from, to };
}

/** `/tong-quan` (chỉ chủ cửa hàng): doanh thu, lợi nhuận, công nợ, hàng cần nhập, bán chạy. */
export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [now] = useState(() => Date.now());
  const { key, from, to } = periodFromParams(params, now);
  const rangeError = key === "custom" ? customRangeError(from, to) : null;

  // Khoảng ngày đang gõ dở/không hợp lệ thì giữ kỳ hợp lệ gần nhất để số liệu không nhảy lung tung.
  const wanted = useLastValid<PeriodParams>(
    key === "custom" ? (rangeError ? null : { from, to }) : { period: key },
    { period: "today" },
  );

  function update(patch: Record<string, string | null>) {
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

  const overview = useOverview(wanted);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Kỳ báo cáo"
          options={PERIOD_OPTIONS}
          value={key}
          onChange={(v) =>
            update(
              v === "custom"
                ? { ky: v, tu: from, den: to }
                : { ky: v === "today" ? null : v, tu: null, den: null },
            )
          }
        />
        <ExportButton period={wanted} />
      </div>
      {key === "custom" && (
        <DateRangeFields
          from={from}
          to={to}
          error={rangeError}
          onChange={(p) => update(p.from !== undefined ? { tu: p.from } : { den: p.to ?? null })}
        />
      )}

      {overview.isError ? (
        <Alert>{errorMessage(overview.error)}</Alert>
      ) : (
        <KpiStrip
          items={overviewItems(overview.data)}
          className={cn(overview.isPlaceholderData && "opacity-60")}
        />
      )}
      {overview.data && key === "custom" && (
        <p className="-mt-2 text-[13px] text-ink-muted">
          Số liệu từ {formatDate(overview.data.range.from)} đến{" "}
          {formatDate(overview.data.range.to - 1)}. Phải thu và hàng cần nhập là số hiện tại.
        </p>
      )}

      <RevenueChart today={vnDateKey(now)} />

      <div className="flex flex-wrap items-start gap-4">
        <RestockSection />
        <TopProductsSection period={wanted} title={TOP_TITLE[key]} />
      </div>
    </div>
  );
}

function ExportButton({ period }: { period: PeriodParams }) {
  const { store } = useSession();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  async function exportReport() {
    setExporting(true);
    try {
      const [data, XLSX] = await Promise.all([fetchReportExport(period), import("xlsx")]);
      const wb = XLSX.utils.book_new();
      for (const sheet of reportSheets({ ...data, storeName: store.name, now: Date.now() })) {
        const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
        ws["!cols"] = sheet.widths.map((wch) => ({ wch }));
        XLSX.utils.book_append_sheet(wb, ws, sheet.name);
      }
      XLSX.writeFile(wb, reportFileName(data.overview.range));
    } catch (err) {
      toast({ tone: "error", message: `Không xuất được báo cáo: ${errorMessage(err)}` });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      variant="secondary"
      icon={<DownloadIcon size={18} />}
      loading={exporting}
      onClick={() => void exportReport()}
    >
      Xuất báo cáo
    </Button>
  );
}

function overviewItems(data: ReturnType<typeof useOverview>["data"]): KpiItem[] {
  const dash = "…";
  if (!data) {
    return ["Doanh thu", "Lợi nhuận gộp", "Phải thu khách hàng", "Hàng cần nhập"].map((label) => ({
      label,
      value: dash,
    }));
  }
  const { receivable, restock } = data;
  return [
    {
      label: "Doanh thu",
      value: formatMoney(data.revenue),
      hint: `${formatNumber(data.orders)} đơn · TB ${formatMoney(data.averageOrder)} / đơn`,
    },
    {
      label: "Lợi nhuận gộp",
      value: formatMoney(data.grossProfit),
      hint:
        data.margin === null ? "Chưa có doanh thu" : `Biên lợi nhuận ${formatPercent(data.margin)}`,
    },
    {
      label: "Phải thu khách hàng",
      value: formatMoney(receivable.amount),
      hint:
        receivable.overdueCustomers > 0 ? (
          <span className="text-warn">{receivable.overdueCustomers} khách quá 30 ngày</span>
        ) : (
          `${formatNumber(receivable.customers)} khách đang nợ`
        ),
    },
    {
      label: "Hàng cần nhập",
      value: formatNumber(restock.total),
      hint:
        restock.out > 0 ? (
          <span className="text-danger">{restock.out} mặt hàng đã hết</span>
        ) : restock.total > 0 ? (
          `${restock.low} mặt hàng sắp hết`
        ) : (
          "Đủ hàng"
        ),
    },
  ];
}

function Card({
  label,
  title,
  action,
  children,
  className,
}: {
  label: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={label}
      className={cn("min-w-0 overflow-hidden rounded-card border border-line bg-white", className)}
    >
      <div className="flex min-h-16 items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex justify-center py-10">
      <Spinner size={24} label={label} className="text-primary" />
    </div>
  );
}

function RevenueChart({ today }: { today: string }) {
  const daily = useRevenueDaily(7);
  const [active, setActive] = useState<number | null>(null);
  const items = daily.data?.items ?? [];
  const max = Math.max(0, ...items.map((d) => d.revenue));

  return (
    <section
      aria-label="Doanh thu 7 ngày"
      className="flex flex-col gap-3.5 rounded-card border border-line bg-white px-5 pt-[18px] pb-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Doanh thu 7 ngày gần nhất</h2>
        {daily.data && (
          <span className="text-sm text-ink-muted">
            Tổng{" "}
            <span className="font-semibold text-ink tabular-nums">
              {formatMoney(daily.data.total)}
            </span>
          </span>
        )}
      </div>
      {daily.isPending ? (
        <Loading label="Đang tải biểu đồ doanh thu" />
      ) : daily.isError ? (
        <Alert>{errorMessage(daily.error)}</Alert>
      ) : (
        <>
          <div className="relative h-[200px] border-b border-line-input">
            {[20, 80, 140].map((top) => (
              <div
                key={top}
                aria-hidden="true"
                className="absolute inset-x-0 border-t border-dashed border-line"
                style={{ top }}
              />
            ))}
            <ul className="absolute inset-0 flex items-end gap-2 px-2 sm:gap-4">
              {items.map((d, i) => (
                <Bar
                  key={d.date}
                  day={d}
                  label={dayLabel(d.from, today)}
                  isToday={d.date === today}
                  height={barHeight(d.revenue, max, CHART_HEIGHT)}
                  active={active === i}
                  onActive={(on) => setActive(on ? i : (cur) => (cur === i ? null : cur))}
                  edge={i === 0 ? "start" : i === items.length - 1 ? "end" : undefined}
                />
              ))}
            </ul>
          </div>
          <div aria-hidden="true" className="flex gap-2 px-2 sm:gap-4">
            {items.map((d) => (
              <div
                key={d.date}
                className="min-w-0 flex-1 text-center text-[11px] leading-tight text-ink-muted sm:text-xs"
              >
                {dayLabel(d.from, today)}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Bar({
  day,
  label,
  isToday,
  height,
  active,
  onActive,
  edge,
}: {
  day: RevenueDay;
  label: string;
  isToday: boolean;
  height: number;
  active: boolean;
  onActive: (on: boolean) => void;
  edge?: "start" | "end";
}) {
  const exact = `${formatMoney(day.revenue)} đ · ${formatNumber(day.orders)} đơn`;
  return (
    <li
      tabIndex={0}
      aria-label={`${label} (${formatDate(day.from)}): ${exact}`}
      onMouseEnter={() => onActive(true)}
      onMouseLeave={() => onActive(false)}
      onFocus={() => onActive(true)}
      onBlur={() => onActive(false)}
      className="relative flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end gap-1.5 rounded-small focus-visible:outline-offset-2"
    >
      <span
        aria-hidden="true"
        className="text-[11px] whitespace-nowrap text-ink-soft tabular-nums sm:text-xs"
      >
        {shortMoney(day.revenue)}
      </span>
      <div
        aria-hidden="true"
        className={cn(
          "w-full max-w-14 rounded-t-[4px]",
          isToday ? "bg-primary" : "bg-primary/22",
          active && !isToday && "bg-primary/40",
        )}
        style={{ height }}
      />
      {active && (
        <div
          role="tooltip"
          // Ngay trên nhãn số của cột; cột đầu/cuối canh theo mép để không tràn ra ngoài màn hình.
          className={cn(
            "pointer-events-none absolute z-10 rounded-control bg-ink px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg",
            edge === "start" ? "left-0" : edge === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
          )}
          style={{ bottom: height + 28 }}
        >
          <div className="font-semibold">{formatDate(day.from)}</div>
          <div className="tabular-nums">{exact}</div>
        </div>
      )}
    </li>
  );
}

function RestockSection() {
  const navigate = useNavigate();
  const restock = useRestock(RESTOCK_FETCH);
  const [expanded, setExpanded] = useState(false);
  const items = restock.data?.items ?? [];
  const shown = expanded ? items : items.slice(0, RESTOCK_PREVIEW);

  function createPurchase(list: RestockItem[]) {
    const state: RestockPreset = {
      restock: list.map((r) => ({ productId: r.id, qty: restockQty(r.stock, r.minStock) })),
    };
    navigate("/nhap-hang/moi", { state });
  }

  return (
    <Card
      label="Hàng cần nhập thêm"
      title="Cần nhập thêm"
      className="flex-[1_1_380px]"
      action={
        items.length > 0 && (
          <Button variant="secondary" className="h-10" onClick={() => createPurchase(items)}>
            Tạo phiếu nhập
          </Button>
        )
      }
    >
      {restock.isPending ? (
        <Loading label="Đang tải hàng cần nhập" />
      ) : restock.isError ? (
        <div className="p-4">
          <Alert>{errorMessage(restock.error)}</Alert>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="Chưa có hàng nào cần nhập"
          description="Hàng sắp hết (tồn dưới mức tối thiểu) hoặc đã hết sẽ hiện ở đây."
          className="py-10"
        />
      ) : (
        <>
          <Table aria-label="Hàng cần nhập thêm" minWidth={400}>
            <THead>
              <tr>
                <TH>Tên hàng</TH>
                <TH numeric>Tồn</TH>
                <TH numeric>Tối thiểu</TH>
                <TH>Trạng thái</TH>
              </tr>
            </THead>
            <TBody>
              {shown.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium">{r.name}</TD>
                  <TD numeric className="font-semibold">
                    {formatQty(r.stock)}
                  </TD>
                  <TD numeric className="text-ink-soft">
                    {formatQty(r.minStock)}
                  </TD>
                  <TD className="whitespace-nowrap">
                    <StatusDot status={r.status} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {items.length > RESTOCK_PREVIEW && (
            <div className="border-t border-line px-4 py-1">
              <Button variant="ghost" onClick={() => setExpanded((v) => !v)}>
                {expanded ? "Thu gọn" : `Xem thêm ${items.length - RESTOCK_PREVIEW} mặt hàng`}
              </Button>
            </div>
          )}
          {restock.data && restock.data.total > items.length && (
            <p className="border-t border-line px-4 py-3 text-[13px] text-ink-muted">
              Còn {formatNumber(restock.data.total - items.length)} mặt hàng khác chưa hiện. Phiếu
              nhập chỉ điền sẵn {RESTOCK_FETCH} mặt hàng đầu.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

function TopProductsSection({ period, title }: { period: PeriodParams; title: string }) {
  const top = useTopProducts(period, 10);
  const items = top.data?.items ?? [];
  return (
    <Card label={title} title={title} className="flex-[1_1_380px]">
      {top.isPending ? (
        <Loading label="Đang tải hàng bán chạy" />
      ) : top.isError ? (
        <div className="p-4">
          <Alert>{errorMessage(top.error)}</Alert>
        </div>
      ) : items.length === 0 ? (
        <EmptyState title="Chưa bán được hàng nào trong kỳ này" className="py-10" />
      ) : (
        <Table
          aria-label={title}
          minWidth={380}
          className={cn(top.isPlaceholderData && "opacity-60")}
        >
          <THead>
            <tr>
              <TH className="w-10">#</TH>
              <TH>Tên hàng</TH>
              <TH numeric>Đã bán</TH>
              <TH numeric>Doanh thu</TH>
            </tr>
          </THead>
          <TBody>
            {items.map((t) => (
              <TR key={t.productId}>
                <TD className="text-ink-muted">{t.rank}</TD>
                <TD className="font-medium">{t.name}</TD>
                <TD numeric className="whitespace-nowrap">
                  {formatQty(t.qty, t.baseUnit.toLowerCase())}
                </TD>
                <TD numeric className="font-semibold">
                  {formatMoney(t.revenue)}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}
