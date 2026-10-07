import {
  type ChangeEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Controller,
  type Path,
  type UseFormReturn,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { Link, useBlocker, useNavigate, useParams } from "react-router";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_UNITS } from "../../../shared/schemas/product";
import { uuidv7 } from "../../../shared/uuid";
import { useCategories } from "../../api/categories";
import { ApiError, errorMessage } from "../../api/errors";
import {
  imageUrl,
  type ProductDetail,
  uploadProductImage,
  useCreateProduct,
  useProduct,
  useUpdateProduct,
} from "../../api/products";
import { TAB_BAR_CLEARANCE } from "../../components/layout/MobileTabBar";
import { Alert } from "../../components/ui/Alert";
import { Button, IconButton } from "../../components/ui/Button";
import { buttonClass } from "../../components/ui/button-class";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { ChevronLeftIcon, CloseIcon, PlusIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { MoneyInput } from "../../components/ui/MoneyInput";
import { QtyInput } from "../../components/ui/QtyInput";
import { Select } from "../../components/ui/Select";
import { Spinner } from "../../components/ui/Spinner";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/toast-context";
import { cn } from "../../lib/cn";
import { applyFieldErrors } from "../../lib/form-errors";
import { formatMoney } from "../../lib/format";
import {
  detailToForm,
  emptyProductForm,
  emptyUnitRow,
  type FormMode,
  formatPercent,
  formToCreateInput,
  formToUpdateInput,
  type ProductFormValues,
  productFormResolver,
  profitOf,
} from "./product-form";

type Form = UseFormReturn<ProductFormValues>;

/** /hang-hoa/moi và /hang-hoa/:id/sua (design/ThemHang). */
export function ProductFormPage() {
  const { id } = useParams();
  const product = useProduct(id);

  if (!id) return <ProductForm key="new" mode="create" />;
  if (product.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={28} label="Đang tải hàng hóa" className="text-primary" />
      </div>
    );
  }
  if (product.isError) return <Alert>{errorMessage(product.error)}</Alert>;
  return <ProductForm key={id} mode="edit" product={product.data} />;
}

function ProductForm({ mode, product }: { mode: FormMode; product?: ProductDetail }) {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const formId = "product-form";
  const form = useForm<ProductFormValues>({
    defaultValues: product ? detailToForm(product) : emptyProductForm(),
    resolver: productFormResolver(mode),
  });
  const { handleSubmit, reset, setError, formState } = form;
  const [image, setImage] = useState<File | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** Vừa lưu xong và đang chuyển trang: không hỏi "rời trang chưa lưu". */
  const leavingRef = useRef(false);
  /** Chặn bấm "Lưu" nhiều lần gần nhau (mạng chậm) trước khi `saving` kịp render lại. */
  const submittingRef = useRef(false);
  /**
   * Sinh khi mở form, giữ nguyên khi gửi lại do lỗi mạng (server nhận ra là cùng một lần tạo),
   * đổi sau mỗi lần tạo thành công — kể cả "Lưu và thêm tiếp" làm trống form để thêm hàng khác.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(uuidv7);

  const dirty = formState.isDirty || image !== null;
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

  function mapServerError(err: unknown, values: ProductFormValues) {
    setServerError(errorMessage(err));
    if (!(err instanceof ApiError)) return;
    applyFieldErrors(err, setError, [
      "name",
      "code",
      "barcode",
      "baseUnit",
      "salePrice",
      "categoryId",
    ]);
    if (err.code === "CODE_TAKEN") setError("code", { message: err.message });
    if (err.code === "BARCODE_TAKEN") {
      const code = (err.details as { barcode?: string } | undefined)?.barcode;
      const unitIndex = values.units.findIndex((u) => u.barcode.trim() === code);
      const field: Path<ProductFormValues> =
        unitIndex >= 0 ? `units.${unitIndex}.barcode` : "barcode";
      setError(field, { message: err.message });
    }
  }

  async function save(values: ProductFormValues, addAnother: boolean) {
    // Chặn ngay (đồng bộ): bấm liên tiếp hoặc Enter trong lúc request trước chưa xong.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setServerError(null);
    setSaving(true);
    try {
      const saved =
        mode === "create"
          ? await create.mutateAsync(formToCreateInput(values, idempotencyKey))
          : await update.mutateAsync({ id: product!.id, json: formToUpdateInput(values) });
      if (image) {
        try {
          await uploadProductImage(saved.id, image);
        } catch (err) {
          toast({
            tone: "error",
            message: `Đã lưu hàng nhưng chưa tải được ảnh: ${errorMessage(err)}`,
          });
        }
      }
      toast(mode === "create" ? `Đã thêm ${saved.name} (${saved.code})` : `Đã lưu ${saved.name}`);
      if (mode === "create" && addAnother) {
        setIdempotencyKey(uuidv7());
        reset(emptyProductForm(values.categoryId));
        setImage(null);
        form.setFocus("name");
      } else {
        leavingRef.current = true;
        navigate(`/hang-hoa/${saved.id}`, { replace: mode === "create" });
      }
    } catch (err) {
      mapServerError(err, values);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  const backTo = product ? `/hang-hoa/${product.id}` : "/hang-hoa";

  return (
    <div className="flex flex-col gap-4 pb-28 md:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          to={backTo}
          className="inline-flex min-h-touch items-center gap-1.5 text-sm font-medium text-ink-body hover:text-primary"
        >
          <ChevronLeftIcon size={18} />
          {product ? `Quay lại ${product.name}` : "Quay lại danh sách hàng hóa"}
        </Link>
        {/* Cố định đáy màn hình trên điện thoại (trên thanh tab dưới) để không phải cuộn lên đầu
            trang dài mới bấm được "Lưu"; giữ nguyên ở đầu trang trong luồng ở máy tính. */}
        <div
          className="fixed inset-x-0 z-30 flex flex-wrap gap-2 border-t border-line bg-white px-4 py-2.5 md:static md:border-0 md:bg-transparent md:px-0 md:py-0"
          style={{ bottom: TAB_BAR_CLEARANCE }}
        >
          <Link to={backTo} className={buttonClass({ variant: "secondary" })}>
            Hủy
          </Link>
          {/* "Lưu hàng hóa" đứng trước trong DOM (dù hiện sau bằng CSS order) để Enter trong ô nhập
              gửi nút này — trình duyệt chọn nút submit đầu tiên theo thứ tự DOM, không theo vị trí
              hiển thị, khi có nhiều nút submit cùng gắn với một <form>. */}
          <Button type="submit" form={formId} loading={saving} className="order-2">
            Lưu hàng hóa
          </Button>
          {mode === "create" && (
            <Button
              type="submit"
              form={formId}
              variant="secondary"
              disabled={saving}
              data-intent="add-another"
              className="order-1"
            >
              Lưu và thêm tiếp
            </Button>
          )}
        </div>
      </div>

      {serverError && <Alert>{serverError}</Alert>}

      <form
        id={formId}
        onSubmit={(e) => {
          // Nút "Lưu và thêm tiếp" gửi kèm data-intent; Enter trong ô thì là "Lưu".
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
          const addAnother = submitter?.dataset.intent === "add-another";
          void handleSubmit((values) => save(values, addAnother))(e);
        }}
        noValidate
        className="flex flex-wrap items-start gap-4"
      >
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          <GeneralSection form={form} />
          <PriceSection form={form} mode={mode} product={product} />
          <UnitsSection form={form} />
          <StockSection form={form} mode={mode} />
        </div>
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <ImageSection image={image} onImage={setImage} currentKey={product?.imageKey ?? null} />
          <Section title="Trạng thái">
            <div className="flex flex-col">
              <Checkbox label="Đang kinh doanh" {...form.register("isActive")} />
              <Checkbox label="Hiện ở màn hình bán hàng" {...form.register("showInPos")} />
            </div>
          </Section>
          <Section title="Ghi chú">
            <Field label="Ghi chú" error={form.formState.errors.note?.message}>
              <Textarea
                rows={4}
                placeholder="Ví dụ: vị trí kệ, nhà cung cấp quen…"
                {...form.register("note")}
              />
            </Field>
          </Section>
        </div>
      </form>

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
          Thông tin hàng hóa bạn vừa nhập chưa được lưu sẽ bị mất.
        </p>
      </Dialog>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-card border border-line bg-white">
      <div className="border-b border-line px-5 py-3.5 leading-snug">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {subtitle && <p className="text-[13px] text-ink-muted">{subtitle}</p>}
      </div>
      <div className="flex flex-col gap-4 px-5 pt-[18px] pb-5">{children}</div>
    </section>
  );
}

/** Máy quét mã vạch gõ xong thì Enter: không để Enter gửi form, chuyển sang ô kế tiếp. */
function scanFriendly(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key !== "Enter") return;
  e.preventDefault();
  const fields = Array.from(
    e.currentTarget.form?.querySelectorAll<HTMLElement>("input, select, textarea") ?? [],
  ).filter((el) => !(el as HTMLInputElement).disabled && el.tabIndex !== -1);
  fields[fields.indexOf(e.currentTarget) + 1]?.focus();
}

function GeneralSection({ form }: { form: Form }) {
  const categories = useCategories();
  const { register, formState } = form;
  const errors = formState.errors;
  return (
    <Section title="Thông tin chung" subtitle="Tên và mã giúp tìm hàng nhanh khi bán">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Field label="Tên hàng" required error={errors.name?.message}>
          <Input autoComplete="off" {...register("name")} />
        </Field>
        <Field label="Mã hàng" hint="Để trống để hệ thống tự tạo mã" error={errors.code?.message}>
          <Input autoComplete="off" placeholder="SP000128" {...register("code")} />
        </Field>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Field
          label="Mã vạch"
          hint="Bấm vào ô rồi quét bằng máy quét"
          error={errors.barcode?.message}
        >
          <Input
            inputMode="numeric"
            autoComplete="off"
            onKeyDown={scanFriendly}
            {...register("barcode")}
          />
        </Field>
        <Field label="Nhóm hàng" error={errors.categoryId?.message}>
          <Select {...register("categoryId")}>
            <option value="">Chưa phân nhóm</option>
            {(categories.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Section>
  );
}

function PriceSection({
  form,
  mode,
  product,
}: {
  form: Form;
  mode: FormMode;
  product?: ProductDetail;
}) {
  const { control, formState } = form;
  const [salePrice, costPrice] = useWatch({ control, name: ["salePrice", "costPrice"] });
  const cost =
    mode === "create" ? costPrice : product && "costPrice" in product ? product.costPrice : null;
  const profit = profitOf(salePrice, cost);
  return (
    <Section title="Giá" subtitle="Giá vốn sẽ tự cập nhật theo bình quân mỗi lần nhập hàng">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        {mode === "create" ? (
          <Field label="Giá vốn" error={formState.errors.costPrice?.message}>
            <Controller
              control={control}
              name="costPrice"
              render={({ field }) => (
                <MoneyInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            />
          </Field>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-ink-body">Giá vốn bình quân</span>
            <span className="flex h-touch items-center text-[15px] font-semibold tabular-nums">
              {cost !== null && cost !== undefined ? formatMoney(cost) : "—"}
            </span>
          </div>
        )}
        <Field label="Giá bán lẻ" required error={formState.errors.salePrice?.message}>
          <Controller
            control={control}
            name="salePrice"
            render={({ field }) => (
              <MoneyInput
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
        </Field>
        <div className="flex flex-col gap-1.5" aria-live="polite">
          <span className="text-[13px] font-medium text-ink-body">Lãi mỗi đơn vị</span>
          <span
            className={cn(
              "flex h-touch items-center gap-2 text-[15px] font-semibold tabular-nums",
              profit && profit.amount < 0 ? "text-danger" : "text-success",
            )}
          >
            {profit ? (
              <>
                {formatMoney(profit.amount)}
                {profit.percent !== null && (
                  <span className="text-[13px] font-medium">{formatPercent(profit.percent)}</span>
                )}
              </>
            ) : (
              <span className="text-ink-muted">—</span>
            )}
          </span>
        </div>
      </div>
    </Section>
  );
}

function UnitsSection({ form }: { form: Form }) {
  const { control, register, formState } = form;
  const errors = formState.errors;
  const { fields, append, remove } = useFieldArray({ control, name: "units" });
  const [baseUnit, salePrice] = useWatch({ control, name: ["baseUnit", "salePrice"] });
  const base = baseUnit.trim().toLowerCase() || "đơn vị";
  const cols = "grid gap-3 sm:grid-cols-[1.1fr_1fr_1fr_1.2fr_44px] sm:items-start";

  return (
    <Section title="Đơn vị tính" subtitle="Bán theo thùng, lốc… thì thêm đơn vị quy đổi">
      <div className={cols}>
        <Field label="Đơn vị cơ bản" required error={errors.baseUnit?.message}>
          <Input placeholder="Ví dụ: Chai" autoComplete="off" {...register("baseUnit")} />
        </Field>
        <p className="text-sm text-ink-muted sm:pt-9">Đơn vị cơ bản</p>
        <p className="text-sm font-semibold tabular-nums sm:pt-9">
          {salePrice !== null ? formatMoney(salePrice) : "—"}
        </p>
        <p className="text-sm text-ink-muted sm:pt-9">Dùng mã vạch chính</p>
        <span />
      </div>

      {fields.map((f, i) => {
        const unitErrors = errors.units?.[i];
        return (
          <div key={f.id} className={cn(cols, "border-t border-subtle pt-3")}>
            <Field label="Đơn vị quy đổi" error={unitErrors?.name?.message}>
              <Input
                placeholder="Ví dụ: Thùng"
                autoComplete="off"
                {...register(`units.${i}.name`)}
              />
            </Field>
            <Field label={`Số ${base} mỗi đơn vị`} error={unitErrors?.factor?.message}>
              <Controller
                control={control}
                name={`units.${i}.factor`}
                render={({ field }) => (
                  <Input
                    inputMode="numeric"
                    autoComplete="off"
                    value={field.value === null ? "" : String(field.value)}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 6);
                      field.onChange(digits ? Number(digits) : null);
                    }}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    trailing={<span className="pr-2 text-sm text-ink-muted">{base}</span>}
                  />
                )}
              />
            </Field>
            <Field
              label="Giá bán theo đơn vị"
              hint="Để trống thì tự tính"
              error={unitErrors?.salePrice?.message}
            >
              <Controller
                control={control}
                name={`units.${i}.salePrice`}
                render={({ field }) => {
                  const factor = form.getValues(`units.${i}.factor`);
                  const auto = salePrice !== null && factor ? salePrice * factor : null;
                  return (
                    <MoneyInput
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      placeholder={auto !== null ? formatMoney(auto) : "Tự tính"}
                      title="Để trống: giá = giá bán lẻ × quy đổi"
                    />
                  );
                }}
              />
            </Field>
            <Field label="Mã vạch riêng" error={unitErrors?.barcode?.message}>
              <Input
                placeholder="Không bắt buộc"
                inputMode="numeric"
                autoComplete="off"
                onKeyDown={scanFriendly}
                {...register(`units.${i}.barcode`)}
              />
            </Field>
            <IconButton
              label={`Xóa đơn vị ${form.getValues(`units.${i}.name`) || i + 1}`}
              className="sm:mt-[26px]"
              onClick={() => remove(i)}
            >
              <CloseIcon size={18} />
            </IconButton>
          </div>
        );
      })}

      <div>
        <Button
          variant="ghost"
          className="text-primary"
          disabled={fields.length >= MAX_UNITS}
          onClick={() => append(emptyUnitRow())}
        >
          <PlusIcon size={18} />
          Thêm đơn vị quy đổi
        </Button>
      </div>
    </Section>
  );
}

function StockSection({ form, mode }: { form: Form; mode: FormMode }) {
  const { control, register, formState } = form;
  const baseUnit = useWatch({ control, name: "baseUnit" }).trim().toLowerCase() || "đơn vị";
  return (
    <Section
      title="Tồn kho"
      subtitle={
        mode === "create"
          ? "Nhập số lượng đang có trong cửa hàng"
          : "Tồn kho chỉ đổi qua nhập hàng, bán hàng, kiểm kho"
      }
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        {mode === "create" && (
          <Field
            label={`Tồn kho ban đầu (${baseUnit})`}
            error={formState.errors.openingStock?.message}
          >
            <Controller
              control={control}
              name="openingStock"
              render={({ field }) => (
                <QtyInput
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                />
              )}
            />
          </Field>
        )}
        <Field
          label={`Cảnh báo khi còn dưới (${baseUnit})`}
          hint="Hàng sẽ hiện trong danh sách Sắp hết"
          error={formState.errors.minStock?.message}
        >
          <Controller
            control={control}
            name="minStock"
            render={({ field }) => (
              <QtyInput
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                ref={field.ref}
              />
            )}
          />
        </Field>
      </div>
      <div>
        <Checkbox label="Cho phép bán khi hết hàng" {...register("allowNegative")} />
        <p className="text-[13px] text-ink-muted">
          Dùng khi hàng thực tế còn nhưng chưa kịp nhập phiếu
        </p>
      </div>
    </Section>
  );
}

function ImageSection({
  image,
  onImage,
  currentKey,
}: {
  image: File | null;
  onImage: (file: File | null) => void;
  currentKey: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError("Chỉ nhận ảnh JPG, PNG hoặc WEBP");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("Ảnh quá lớn, tối đa 2MB");
      return;
    }
    setError(null);
    onImage(file);
  }

  const src = preview ?? (currentKey ? imageUrl(currentKey) : null);
  return (
    <Section title="Ảnh hàng hóa">
      <div className="flex flex-col items-center gap-3 rounded-control border border-dashed border-line-input p-4 text-center">
        {src ? (
          <img src={src} alt="Ảnh hàng hóa" className="max-h-48 rounded-small object-contain" />
        ) : (
          <p className="py-6 text-sm text-ink-muted">Chưa có ảnh</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={onChange}
        />
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="secondary" onClick={() => inputRef.current?.click()}>
            {src ? "Đổi ảnh" : "Tải ảnh lên"}
          </Button>
          {image && (
            <Button variant="ghost" onClick={() => onImage(null)}>
              Bỏ ảnh mới
            </Button>
          )}
        </div>
        <p className="text-[13px] text-ink-muted">
          hoặc chụp bằng camera · JPG, PNG, WEBP · tối đa 2MB
        </p>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </Section>
  );
}
