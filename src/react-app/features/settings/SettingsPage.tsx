import { zodResolver } from "@hookform/resolvers/zod";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useSearchParams } from "react-router";
import type { z } from "zod";
import { changePasswordFormSchema } from "../../../shared/schemas/auth";
import { updateStoreSchema } from "../../../shared/schemas/store";
import { useSession } from "../../api/auth";
import { ApiError, errorMessage } from "../../api/errors";
import {
  type StoreInfo,
  useChangePassword,
  useStoreInfo,
  useUpdateStore,
} from "../../api/settings";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Field } from "../../components/ui/Field";
import { ChevronRightIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { RadioCard } from "../../components/ui/RadioCard";
import { Spinner } from "../../components/ui/Spinner";
import { Tabs } from "../../components/ui/Tabs";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/toast-context";
import { applyFieldErrors } from "../../lib/form-errors";
import { formatPhone } from "../../lib/format";
import {
  loadPosPrint,
  loadReceiptWidth,
  type ReceiptWidth,
  savePosPrint,
  saveReceiptWidth,
} from "../pos/print-preference";
import { ROLE_LABEL } from "./roles";
import { StaffSection } from "./StaffSection";

type SectionKey = "cua-hang" | "nhan-vien" | "tai-khoan" | "ban-hang";

const SECTIONS: Array<{ value: SectionKey; label: string; ownerOnly?: boolean }> = [
  { value: "cua-hang", label: "Cửa hàng", ownerOnly: true },
  { value: "nhan-vien", label: "Nhân viên", ownerOnly: true },
  { value: "tai-khoan", label: "Tài khoản của tôi" },
  { value: "ban-hang", label: "Bán hàng" },
];

/** `/cai-dat`: cửa hàng, nhân viên (chỉ chủ), tài khoản của tôi, tùy chọn bán hàng. */
export function SettingsPage() {
  const { user } = useSession();
  const isOwner = user.role === "owner";
  const [params, setParams] = useSearchParams();
  const sections = SECTIONS.filter((s) => !s.ownerOnly || isOwner);
  const raw = params.get("muc");
  const current = sections.find((s) => s.value === raw)?.value ?? sections[0]!.value;

  return (
    <div className="flex flex-col gap-4">
      <MobileShortcuts />
      <div className="rounded-card border border-line bg-white">
        <Tabs
          label="Mục cài đặt"
          className="overflow-x-auto px-4"
          value={current}
          onChange={(v) => setParams({ muc: v }, { replace: true })}
          items={sections}
        />
        <div className="border-t border-line p-4 md:p-6">
          {current === "cua-hang" && <StoreSection />}
          {current === "nhan-vien" && <StaffSection />}
          {current === "tai-khoan" && <AccountSection />}
          {current === "ban-hang" && <SalesSection />}
        </div>
      </div>
    </div>
  );
}

/** Điện thoại: thanh tab dưới không có các trang này, nên để lối vào ở trang "Thêm". */
function MobileShortcuts() {
  const { user } = useSession();
  const links = [
    { to: "/hoa-don", label: "Hóa đơn đã bán" },
    ...(user.role === "owner"
      ? [
          { to: "/nhap-hang", label: "Nhập hàng" },
          { to: "/kiem-kho", label: "Kiểm kho" },
        ]
      : []),
  ];
  return (
    <nav
      aria-label="Đi nhanh"
      className="overflow-hidden rounded-card border border-line bg-white md:hidden"
    >
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="flex min-h-touch items-center justify-between border-b border-subtle px-4 py-3 text-sm font-medium text-ink last:border-b-0 hover:bg-table-head"
        >
          {l.label}
          <ChevronRightIcon size={18} className="text-ink-muted" />
        </Link>
      ))}
    </nav>
  );
}

function SectionHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-0.5">
      <h2 className="text-[15px] font-semibold">{title}</h2>
      {description && <p className="text-sm text-ink-muted">{description}</p>}
    </div>
  );
}

function StoreSection() {
  const store = useStoreInfo();
  if (store.isPending) {
    return (
      <div className="flex justify-center py-10">
        <Spinner size={24} label="Đang tải thông tin cửa hàng" className="text-primary" />
      </div>
    );
  }
  if (store.isError) return <Alert>{errorMessage(store.error)}</Alert>;
  return <StoreForm store={store.data} />;
}

type StoreFormInput = z.input<typeof updateStoreSchema>;
type StoreFormOutput = z.output<typeof updateStoreSchema>;
const STORE_FIELDS = ["name", "phone", "address", "receiptFooter"] as const;

function StoreForm({ store }: { store: StoreInfo }) {
  const toast = useToast();
  const update = useUpdateStore();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isDirty },
  } = useForm<StoreFormInput, unknown, StoreFormOutput>({
    resolver: zodResolver(updateStoreSchema),
    defaultValues: {
      name: store.name,
      phone: store.phone ?? "",
      address: store.address ?? "",
      receiptFooter: store.receiptFooter ?? "",
    },
  });

  const onSubmit = handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: (saved) => {
        reset({
          name: saved.name,
          phone: saved.phone ?? "",
          address: saved.address ?? "",
          receiptFooter: saved.receiptFooter ?? "",
        });
        toast("Đã lưu thông tin cửa hàng");
      },
      onError: (err) => applyFieldErrors(err, setError, STORE_FIELDS),
    }),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="flex max-w-xl flex-col gap-4">
      <SectionHeader
        title="Thông tin cửa hàng"
        description="Tên, số điện thoại và địa chỉ in ở đầu hóa đơn."
      />
      <Field label="Tên cửa hàng" required error={errors.name?.message}>
        <Input autoComplete="organization" {...register("name")} />
      </Field>
      <Field label="Số điện thoại" error={errors.phone?.message}>
        <Input type="tel" inputMode="tel" autoComplete="tel" {...register("phone")} />
      </Field>
      <Field label="Địa chỉ" error={errors.address?.message}>
        <Input autoComplete="street-address" {...register("address")} />
      </Field>
      <Field
        label="Dòng cuối hóa đơn"
        hint="Ví dụ: Cảm ơn quý khách, hẹn gặp lại!"
        error={errors.receiptFooter?.message}
      >
        <Textarea rows={2} {...register("receiptFooter")} />
      </Field>
      {update.isError && !(update.error instanceof ApiError && update.error.fieldErrors.length) && (
        <Alert>{errorMessage(update.error)}</Alert>
      )}
      <div>
        <Button type="submit" loading={update.isPending} disabled={!isDirty}>
          Lưu thay đổi
        </Button>
      </div>
    </form>
  );
}

type PasswordFormInput = z.input<typeof changePasswordFormSchema>;
type PasswordFormOutput = z.output<typeof changePasswordFormSchema>;

function AccountSection() {
  const { user } = useSession();
  const toast = useToast();
  const change = useChangePassword();
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<PasswordFormInput, unknown, PasswordFormOutput>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: "", password: "", confirmPassword: "" },
  });

  const onSubmit = handleSubmit(({ currentPassword, password }) =>
    change.mutate(
      { currentPassword, password },
      {
        onSuccess: () => {
          reset();
          toast("Đã đổi mật khẩu. Các thiết bị khác đã được đăng xuất.");
        },
        onError: (err) => {
          if (err instanceof ApiError && err.code === "WRONG_PASSWORD") {
            setError("currentPassword", { type: "server", message: err.message });
          } else applyFieldErrors(err, setError, ["currentPassword", "password"]);
        },
      },
    ),
  );

  const showAlert =
    change.isError &&
    !(
      change.error instanceof ApiError &&
      (change.error.code === "WRONG_PASSWORD" || change.error.fieldErrors.length > 0)
    );

  return (
    <div className="flex max-w-xl flex-col gap-8">
      <section>
        <SectionHeader title="Tài khoản của tôi" />
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-muted">Họ tên</dt>
          <dd className="font-medium">{user.name}</dd>
          <dt className="text-ink-muted">Số điện thoại</dt>
          <dd className="font-medium tabular-nums">{formatPhone(user.phone)}</dd>
          <dt className="text-ink-muted">Vai trò</dt>
          <dd className="font-medium">{ROLE_LABEL[user.role]}</dd>
        </dl>
      </section>

      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <SectionHeader
          title="Đổi mật khẩu"
          description="Sau khi đổi, các máy khác đang đăng nhập tài khoản này sẽ bị đăng xuất."
        />
        {/* Ô tên đăng nhập ẩn để trình quản lý mật khẩu của trình duyệt lưu đúng tài khoản. */}
        <input
          type="text"
          autoComplete="username"
          value={user.phone}
          readOnly
          hidden
          aria-hidden="true"
        />
        <Field label="Mật khẩu hiện tại" required error={errors.currentPassword?.message}>
          <PasswordInput autoComplete="current-password" {...register("currentPassword")} />
        </Field>
        <Field
          label="Mật khẩu mới"
          required
          hint="Tối thiểu 6 ký tự"
          error={errors.password?.message}
        >
          <PasswordInput autoComplete="new-password" {...register("password")} />
        </Field>
        <Field label="Nhập lại mật khẩu mới" required error={errors.confirmPassword?.message}>
          <PasswordInput autoComplete="new-password" {...register("confirmPassword")} />
        </Field>
        {showAlert && <Alert>{errorMessage(change.error)}</Alert>}
        <div>
          <Button type="submit" loading={change.isPending}>
            Đổi mật khẩu
          </Button>
        </div>
      </form>
    </div>
  );
}

function SalesSection() {
  const toast = useToast();
  const [print, setPrint] = useState(loadPosPrint);
  const [paper, setPaper] = useState<ReceiptWidth>(loadReceiptWidth);
  return (
    <div className="flex max-w-xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionHeader
          title="Bán hàng"
          description="Lựa chọn này lưu trên máy (trình duyệt) đang dùng, mỗi máy chọn riêng."
        />
        <Checkbox
          label="Tự động in hóa đơn sau khi bán"
          checked={print}
          onChange={(e) => {
            setPrint(e.target.checked);
            savePosPrint(e.target.checked);
            toast(e.target.checked ? "Sẽ in hóa đơn sau khi bán" : "Sẽ không tự in hóa đơn");
          }}
        />
        <p className="text-[13px] text-ink-muted">
          Cũng đổi được bằng ô “In hóa đơn” ở màn Bán hàng.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-[13px] font-medium text-ink-body">
          Khổ giấy máy in nhiệt
        </legend>
        <div className="flex gap-2">
          <RadioCard
            name="receipt-paper"
            label="80mm"
            checked={paper === 80}
            onChange={() => {
              setPaper(80);
              saveReceiptWidth(80);
            }}
          />
          <RadioCard
            name="receipt-paper"
            label="58mm"
            checked={paper === 58}
            onChange={() => {
              setPaper(58);
              saveReceiptWidth(58);
            }}
          />
        </div>
        <p className="text-[13px] text-ink-muted">
          Áp dụng cho hóa đơn bán và phiếu thu/chi in ra.
        </p>
      </fieldset>
    </div>
  );
}
