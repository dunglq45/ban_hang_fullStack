import { useState } from "react";
import { Link, useParams } from "react-router";
import { useSession } from "../../api/auth";
import { errorMessage } from "../../api/errors";
import {
  imageUrl,
  type Movement,
  type ProductDetail,
  useMovements,
  useProduct,
  useSetProductActive,
} from "../../api/products";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { EmptyState } from "../../components/ui/EmptyState";
import { ChevronLeftIcon, PlusIcon } from "../../components/ui/icons";
import { KpiStrip, type KpiItem } from "../../components/ui/KpiStrip";
import { Pagination } from "../../components/ui/Pagination";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { Tabs } from "../../components/ui/Tabs";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { formatDate, formatDateTime, formatMoney, formatNumber, formatQty } from "../../lib/format";
import { unitOptions } from "../pos/cart";
import { formatPercent, profitOf } from "./product-form";
import { productStatus } from "./status";

type Tab = "history" | "units" | "info";

/** Chi tiết hàng hóa (design/ChiTietHang). */
export function ProductDetailPage() {
  const { id = "" } = useParams();
  const product = useProduct(id);

  if (product.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} label="Đang tải hàng hóa" className="text-primary" />
      </div>
    );
  }
  if (product.isError) {
    return (
      <div className="flex flex-col gap-3">
        <BackLink />
        <Alert>{errorMessage(product.error)}</Alert>
      </div>
    );
  }
  return <Detail product={product.data} />;
}

function BackLink() {
  return (
    <Link
      to="/hang-hoa"
      className="inline-flex min-h-touch items-center gap-1.5 self-start text-sm font-medium text-ink-body hover:text-primary"
    >
      <ChevronLeftIcon size={18} />
      Hàng hóa
    </Link>
  );
}

const STATUS_BADGE = {
  ok: null,
  low: { tone: "warn", label: "Sắp hết" },
  out: { tone: "danger", label: "Hết hàng" },
  inactive: { tone: "neutral", label: "Ngừng bán" },
} as const;

function Detail({ product: p }: { product: ProductDetail }) {
  const { user } = useSession();
  const isOwner = user.role === "owner";
  const [tab, setTab] = useState<Tab>("history");
  const setActive = useSetProductActive();
  const toast = useToast();
  const status = productStatus(p);
  const badge = STATUS_BADGE[status];
  const unit = p.baseUnit.toLowerCase();
  const cost = "costPrice" in p ? p.costPrice : undefined;
  const profit = profitOf(p.salePrice, cost);

  const kpis: KpiItem[] = [
    {
      label: "Tồn kho",
      value: formatQty(p.stock, unit),
      tone: status === "out" ? "danger" : status === "low" ? "warn" : "default",
      hint:
        p.minStock > 0 ? `Cảnh báo dưới ${formatQty(p.minStock, unit)}` : "Chưa đặt mức cảnh báo",
    },
    ...(cost !== undefined
      ? [
          {
            label: "Giá vốn bình quân",
            value: formatMoney(cost),
            hint: p.lastPurchase
              ? `Cập nhật ${formatDate(p.lastPurchase.createdAt)} theo ${p.lastPurchase.code}`
              : "Chưa có phiếu nhập",
          },
        ]
      : []),
    {
      label: "Giá bán",
      value: formatMoney(p.salePrice),
      hint:
        profit && cost !== undefined
          ? `Lãi ${formatMoney(profit.amount)} / ${unit}${profit.percent !== null ? ` · ${formatPercent(profit.percent)}` : ""}`
          : `Theo ${unit}`,
    },
    {
      label: "Đã bán 30 ngày",
      value: formatQty(p.sold30d, unit),
      hint: `Trung bình ~${formatQty(Math.round(p.sold30d / 30), unit)} / ngày`,
    },
  ];

  function toggleActive() {
    setActive.mutate(
      { id: p.id, isActive: !p.isActive },
      {
        onSuccess: () => toast(p.isActive ? `Đã ngừng bán ${p.name}` : `Đã bán lại ${p.name}`),
        onError: (err) => toast({ tone: "error", message: errorMessage(err) }),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <BackLink />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {p.imageKey && (
            <img
              src={imageUrl(p.imageKey)}
              alt=""
              className="size-14 shrink-0 rounded-control border border-line object-cover"
            />
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">{p.name}</h2>
              {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
            </div>
            <p className="text-sm text-ink-muted">
              {p.code}
              {p.categoryName && ` · ${p.categoryName}`}
              {p.barcode && ` · Mã vạch ${p.barcode}`}
            </p>
          </div>
        </div>
        {isOwner && (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" loading={setActive.isPending} onClick={toggleActive}>
              {p.isActive ? "Ngừng bán" : "Bán lại"}
            </Button>
            <Link to={`/hang-hoa/${p.id}/sua`} className={buttonClass({ variant: "secondary" })}>
              Sửa thông tin
            </Link>
            <Link to={`/nhap-hang/moi?productId=${p.id}`} className={buttonClass()}>
              <PlusIcon size={18} />
              Nhập thêm hàng
            </Link>
          </div>
        )}
      </div>

      <KpiStrip items={kpis} />

      <div className="rounded-card border border-line bg-white">
        <Tabs<Tab>
          label="Thông tin hàng hóa"
          className="px-4"
          value={tab}
          onChange={setTab}
          items={[
            { value: "history", label: "Lịch sử kho" },
            { value: "units", label: "Đơn vị và giá" },
            { value: "info", label: "Thông tin khác" },
          ]}
        />
        {tab === "history" && <History product={p} showCost={isOwner} />}
        {tab === "units" && <Units product={p} />}
        {tab === "info" && <Info product={p} />}
      </div>
    </div>
  );
}

const MOVEMENT_TYPES = {
  sale: { label: "Bán hàng", dot: "bg-[#98A2B3]" },
  purchase: { label: "Nhập hàng", dot: "bg-success-dot" },
  adjust: { label: "Kiểm kho", dot: "bg-warn-dot" },
  cancel: { label: "Hủy chứng từ", dot: "bg-danger-dot" },
  sale_return: { label: "Khách trả hàng", dot: "bg-success-dot" },
  purchase_return: { label: "Trả nhà cung cấp", dot: "bg-[#98A2B3]" },
} as const;
type MovementType = keyof typeof MOVEMENT_TYPES;

const PERIODS = {
  "7": "7 ngày qua",
  "30": "30 ngày qua",
  "90": "90 ngày qua",
  all: "Tất cả",
} as const;
type Period = keyof typeof PERIODS;
const DAY_MS = 86_400_000;
const PAGE_SIZE = 20;

/** Đường dẫn mở chứng từ gốc của một dòng sổ kho. */
function documentLink(m: Movement): string | null {
  if (!m.documentId) return null;
  switch (m.documentType) {
    case "purchase":
      return `/nhap-hang/${m.documentId}`;
    case "stock_count":
      return `/kiem-kho/${m.documentId}`;
    case "sale":
      return `/in/hoa-don/${m.documentId}`;
    default:
      return null;
  }
}

function History({ product: p, showCost }: { product: ProductDetail; showCost: boolean }) {
  const [type, setType] = useState<MovementType | "">("");
  const [period, setPeriod] = useState<Period>("30");
  const [page, setPage] = useState(1);
  // Mốc thời gian cố định theo lựa chọn (không đổi theo mỗi lần render).
  const [from, setFrom] = useState(() => Date.now() - 30 * DAY_MS);
  const movements = useMovements(p.id, {
    type: type || undefined,
    from: period === "all" ? undefined : String(from),
    page: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const items = movements.data?.items ?? [];

  return (
    <div>
      <div className="flex flex-wrap gap-2 px-4 py-3">
        <Select
          aria-label="Loại thay đổi"
          value={type}
          onChange={(e) => {
            setType(e.target.value as MovementType | "");
            setPage(1);
          }}
          className="w-full sm:w-52"
        >
          <option value="">Loại: Tất cả</option>
          {Object.entries(MOVEMENT_TYPES).map(([value, t]) => (
            <option key={value} value={value}>
              {t.label}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Thời gian"
          value={period}
          onChange={(e) => {
            const next = e.target.value as Period;
            setPeriod(next);
            if (next !== "all") setFrom(Date.now() - Number(next) * DAY_MS);
            setPage(1);
          }}
          className="w-full sm:w-44"
        >
          {Object.entries(PERIODS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      </div>
      <div className="border-t border-line">
        {movements.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner label="Đang tải lịch sử kho" className="text-primary" />
          </div>
        ) : movements.isError ? (
          <div className="p-4">
            <Alert>{errorMessage(movements.error)}</Alert>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="Chưa có thay đổi tồn kho"
            description="Thử chọn khoảng thời gian dài hơn."
          />
        ) : (
          <Table aria-label="Lịch sử kho" minWidth={showCost ? 780 : 680}>
            <THead>
              <TR>
                <TH>Thời gian</TH>
                <TH>Loại</TH>
                <TH>Chứng từ</TH>
                <TH>Đối tác / ghi chú</TH>
                <TH numeric>Thay đổi</TH>
                <TH numeric>Tồn sau</TH>
                {showCost && <TH numeric>Giá vốn</TH>}
              </TR>
            </THead>
            <TBody>
              {items.map((m) => {
                const t = MOVEMENT_TYPES[m.type as MovementType] ?? {
                  label: m.type,
                  dot: "bg-line-input",
                };
                const link = documentLink(m);
                return (
                  <TR key={m.id}>
                    <TD className="whitespace-nowrap text-ink-soft tabular-nums">
                      {formatDateTime(m.createdAt)}
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                        <span className={cn("size-2 rounded-full", t.dot)} aria-hidden="true" />
                        {t.label}
                      </span>
                    </TD>
                    <TD>
                      {m.documentCode ? (
                        link ? (
                          <Link to={link} className="font-medium text-primary hover:underline">
                            {m.documentCode}
                          </Link>
                        ) : (
                          m.documentCode
                        )
                      ) : (
                        "—"
                      )}
                    </TD>
                    <TD className="text-ink-soft">
                      {m.contactName ?? m.note ?? (m.documentType === "sale" ? "Khách lẻ" : "")}
                    </TD>
                    <TD
                      numeric
                      className={cn("font-semibold", m.qtyChange > 0 ? "text-success" : "text-ink")}
                    >
                      {m.qtyChange > 0 ? "+" : m.qtyChange < 0 ? "−" : ""}
                      {formatQty(Math.abs(m.qtyChange))}
                    </TD>
                    <TD numeric>{formatQty(m.stockAfter)}</TD>
                    {showCost && (
                      <TD numeric className="text-ink-soft">
                        {m.unitCost !== undefined ? formatMoney(m.unitCost) : ""}
                      </TD>
                    )}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
      {movements.data && movements.data.total > 0 && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={movements.data.total}
          itemLabel="lần thay đổi"
          onChange={setPage}
        />
      )}
    </div>
  );
}

function Units({ product: p }: { product: ProductDetail }) {
  const options = unitOptions(p);
  return (
    <Table aria-label="Đơn vị và giá" minWidth={560}>
      <THead>
        <TR>
          <TH>Đơn vị</TH>
          <TH numeric>Quy đổi</TH>
          <TH numeric>Giá bán</TH>
          <TH>Mã vạch</TH>
        </TR>
      </THead>
      <TBody>
        {options.map((u, i) => {
          const own = i === 0 ? null : p.units[i - 1];
          return (
            <TR key={u.name}>
              <TD className="font-medium">
                {u.name}
                {i === 0 && (
                  <span className="ml-2 text-[13px] font-normal text-ink-muted">
                    (đơn vị cơ bản)
                  </span>
                )}
              </TD>
              <TD numeric>
                {i === 0 ? "1" : `${formatNumber(u.factor)} ${p.baseUnit.toLowerCase()}`}
              </TD>
              <TD numeric className="font-semibold">
                {formatMoney(u.price)}
                {own && own.salePrice === null && (
                  <span className="block text-xs font-normal text-ink-muted">
                    tự tính theo giá lẻ
                  </span>
                )}
              </TD>
              <TD className="text-ink-soft">{(i === 0 ? p.barcode : own?.barcode) ?? "—"}</TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}

function Info({ product: p }: { product: ProductDetail }) {
  const rows: Array<[string, string]> = [
    ["Mã hàng", p.code],
    ["Mã vạch", p.barcode ?? "—"],
    ["Nhóm hàng", p.categoryName ?? "Chưa phân nhóm"],
    ["Đơn vị cơ bản", p.baseUnit],
    ["Cho phép bán khi hết hàng", p.allowNegative ? "Có" : "Không"],
    ["Hiện ở màn hình bán hàng", p.showInPos ? "Có" : "Không"],
    ["Ngày tạo", formatDateTime(p.createdAt)],
    ["Cập nhật lần cuối", formatDateTime(p.updatedAt)],
  ];
  return (
    <div className="flex flex-col gap-4 p-4">
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-[13px] text-ink-muted">{label}</dt>
            <dd className="text-sm font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <div>
        <h3 className="text-[13px] text-ink-muted">Ghi chú</h3>
        <p className="text-sm whitespace-pre-line">{p.note || "Chưa có ghi chú"}</p>
      </div>
    </div>
  );
}
