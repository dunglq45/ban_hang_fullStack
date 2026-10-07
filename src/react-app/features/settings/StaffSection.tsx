import { zodResolver } from "@hookform/resolvers/zod";
import { useId, useState } from "react";
import { type UseFormRegisterReturn, useForm } from "react-hook-form";
import type { z } from "zod";
import {
  createUserSchema,
  editUserFormSchema,
  resetPasswordFormSchema,
} from "../../../shared/schemas/store";
import { useSession } from "../../api/auth";
import { ApiError, errorMessage } from "../../api/errors";
import { type StaffUser, useCreateUser, useUpdateUser, useUsers } from "../../api/settings";
import { ActionMenu, type ActionMenuItem } from "../../components/ui/ActionMenu";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { PlusIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { RadioCard } from "../../components/ui/RadioCard";
import { Spinner } from "../../components/ui/Spinner";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { useToast } from "../../components/ui/toast-context";
import { applyFieldErrors } from "../../lib/form-errors";
import { formatPhone } from "../../lib/format";
import { ROLE_LABEL } from "./roles";

type Action =
  | { kind: "create" }
  | { kind: "edit"; user: StaffUser }
  | { kind: "password"; user: StaffUser }
  | { kind: "lock"; user: StaffUser };

const ROLE_HINT = {
  staff: "Bán hàng, xem hàng hóa, thu nợ. Không thấy giá vốn, lợi nhuận, báo cáo.",
  owner: "Xem và làm được mọi thứ, kể cả quản lý nhân viên.",
} as const;

/** Mục Nhân viên (chỉ chủ): danh sách, thêm, sửa, khóa/mở, đặt lại mật khẩu. */
export function StaffSection() {
  const { user: me } = useSession();
  const users = useUsers();
  const update = useUpdateUser();
  const toast = useToast();
  const [action, setAction] = useState<Action | null>(null);

  function unlock(u: StaffUser) {
    update.mutate(
      { id: u.id, json: { isActive: true } },
      {
        onSuccess: () => toast(`Đã mở khóa tài khoản ${u.name}`),
        onError: (err) => toast({ tone: "error", message: errorMessage(err) }),
      },
    );
  }

  function menuItems(u: StaffUser): ActionMenuItem[] {
    const self = u.id === me.id;
    const items: ActionMenuItem[] = [
      { label: "Sửa tên, vai trò", onSelect: () => setAction({ kind: "edit", user: u }) },
    ];
    // Mật khẩu của chính mình đổi ở "Tài khoản của tôi" (cần mật khẩu hiện tại).
    if (!self) {
      items.push({
        label: "Đặt lại mật khẩu",
        onSelect: () => setAction({ kind: "password", user: u }),
      });
      items.push(
        u.isActive
          ? {
              label: "Khóa tài khoản",
              danger: true,
              onSelect: () => setAction({ kind: "lock", user: u }),
            }
          : { label: "Mở khóa", onSelect: () => unlock(u) },
      );
    }
    return items;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold">Nhân viên</h2>
          <p className="text-sm text-ink-muted">Mỗi người đăng nhập bằng số điện thoại của mình.</p>
        </div>
        <Button icon={<PlusIcon size={18} />} onClick={() => setAction({ kind: "create" })}>
          Thêm nhân viên
        </Button>
      </div>

      {users.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner size={24} label="Đang tải danh sách nhân viên" className="text-primary" />
        </div>
      ) : users.isError ? (
        <Alert>{errorMessage(users.error)}</Alert>
      ) : (
        <div className="overflow-hidden rounded-card border border-line">
          <Table aria-label="Danh sách nhân viên" minWidth={600}>
            <THead>
              <tr>
                <TH>Tên</TH>
                <TH>Số điện thoại</TH>
                <TH>Vai trò</TH>
                <TH>Trạng thái</TH>
                <TH className="w-14">
                  <span className="sr-only">Thao tác</span>
                </TH>
              </tr>
            </THead>
            <TBody>
              {users.data.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">
                    {u.name}
                    {u.id === me.id && (
                      <Badge tone="primary" className="ml-2">
                        Bạn
                      </Badge>
                    )}
                  </TD>
                  <TD className="tabular-nums">{formatPhone(u.phone)}</TD>
                  <TD>{ROLE_LABEL[u.role]}</TD>
                  <TD>
                    {u.isActive ? (
                      <Badge tone="success">Đang hoạt động</Badge>
                    ) : (
                      <Badge tone="danger">Đã khóa</Badge>
                    )}
                  </TD>
                  <TD className="py-1 text-right">
                    <ActionMenu label={`Thao tác với ${u.name}`} items={menuItems(u)} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      )}

      {action?.kind === "create" && <CreateUserDialog onClose={() => setAction(null)} />}
      {action?.kind === "edit" && (
        <EditUserDialog
          user={action.user}
          self={action.user.id === me.id}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === "password" && (
        <ResetPasswordDialog user={action.user} onClose={() => setAction(null)} />
      )}
      {action?.kind === "lock" && <LockDialog user={action.user} onClose={() => setAction(null)} />}
    </div>
  );
}

function RoleField({
  registration,
  disabled,
}: {
  registration: UseFormRegisterReturn<"role">;
  disabled?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5" disabled={disabled}>
      <legend className="mb-1.5 text-[13px] font-medium text-ink-body">Vai trò</legend>
      <div className="flex flex-col gap-2">
        {(["staff", "owner"] as const).map((role) => (
          <RadioCard
            key={role}
            value={role}
            label={ROLE_LABEL[role]}
            description={ROLE_HINT[role]}
            {...registration}
          />
        ))}
      </div>
    </fieldset>
  );
}

type CreateInput = z.input<typeof createUserSchema>;
type CreateOutput = z.output<typeof createUserSchema>;

function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const create = useCreateUser();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<CreateInput, unknown, CreateOutput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: { name: "", phone: "", password: "", role: "staff" },
  });

  const onSubmit = handleSubmit((values) =>
    create.mutate(values, {
      onSuccess: (u) => {
        toast(`Đã thêm ${u.name}. Gửi số điện thoại và mật khẩu tạm cho người này để đăng nhập.`);
        onClose();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.code === "PHONE_TAKEN") {
          setError("phone", { type: "server", message: err.message });
        } else applyFieldErrors(err, setError, ["name", "phone", "password"]);
      },
    }),
  );

  return (
    <Dialog
      open
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      closeOnOverlayClick={!create.isPending}
      title="Thêm nhân viên"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={create.isPending}>
            Thêm nhân viên
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Tên nhân viên" required error={errors.name?.message}>
          <Input autoComplete="off" {...register("name")} />
        </Field>
        <Field
          label="Số điện thoại"
          required
          hint="Dùng để đăng nhập"
          error={errors.phone?.message}
        >
          <Input type="tel" inputMode="tel" autoComplete="off" {...register("phone")} />
        </Field>
        <Field
          label="Mật khẩu tạm"
          required
          hint="Tối thiểu 6 ký tự. Nhân viên nên tự đổi sau lần đăng nhập đầu."
          error={errors.password?.message}
        >
          <PasswordInput autoComplete="new-password" {...register("password")} />
        </Field>
        <RoleField registration={register("role")} />
        {create.isError &&
          !(
            create.error instanceof ApiError &&
            (create.error.code === "PHONE_TAKEN" || create.error.fieldErrors.length > 0)
          ) && <Alert>{errorMessage(create.error)}</Alert>}
      </form>
    </Dialog>
  );
}

type EditInput = z.input<typeof editUserFormSchema>;

function EditUserDialog({
  user,
  self,
  onClose,
}: {
  user: StaffUser;
  self: boolean;
  onClose: () => void;
}) {
  const formId = useId();
  const toast = useToast();
  const update = useUpdateUser();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<EditInput>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: { name: user.name, role: user.role },
  });

  const onSubmit = handleSubmit(({ name, role }) =>
    update.mutate(
      // Không tự đổi vai trò của mình (server cũng chặn).
      { id: user.id, json: self ? { name } : { name, role } },
      {
        onSuccess: () => {
          toast("Đã lưu thông tin nhân viên");
          onClose();
        },
        onError: (err) => applyFieldErrors(err, setError, ["name"]),
      },
    ),
  );

  return (
    <Dialog
      open
      onClose={() => {
        if (!update.isPending) onClose();
      }}
      closeOnOverlayClick={!update.isPending}
      title="Sửa nhân viên"
      description={formatPhone(user.phone)}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={update.isPending}>
            Lưu
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Tên nhân viên" required error={errors.name?.message}>
          <Input autoComplete="off" {...register("name")} />
        </Field>
        <RoleField registration={register("role")} disabled={self} />
        {self && (
          <p className="-mt-2 text-[13px] text-ink-muted">Bạn không thể tự đổi vai trò của mình.</p>
        )}
        {update.isError &&
          !(update.error instanceof ApiError && update.error.fieldErrors.length > 0) && (
            <Alert>{errorMessage(update.error)}</Alert>
          )}
      </form>
    </Dialog>
  );
}

type PasswordInputValues = z.input<typeof resetPasswordFormSchema>;

function ResetPasswordDialog({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const formId = useId();
  const toast = useToast();
  const update = useUpdateUser();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<PasswordInputValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: { password: "" },
  });

  const onSubmit = handleSubmit(({ password }) =>
    update.mutate(
      { id: user.id, json: { password } },
      {
        onSuccess: () => {
          toast(`Đã đặt lại mật khẩu cho ${user.name}`);
          onClose();
        },
        onError: (err) => applyFieldErrors(err, setError, ["password"]),
      },
    ),
  );

  return (
    <Dialog
      open
      onClose={() => {
        if (!update.isPending) onClose();
      }}
      closeOnOverlayClick={!update.isPending}
      size="sm"
      title={`Đặt lại mật khẩu cho ${user.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={update.isPending}>
            Đặt lại mật khẩu
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-ink-body">
          Người này sẽ bị đăng xuất khỏi mọi thiết bị và phải đăng nhập lại bằng mật khẩu mới.
        </p>
        <Field
          label="Mật khẩu mới"
          required
          hint="Tối thiểu 6 ký tự"
          error={errors.password?.message}
        >
          <PasswordInput autoComplete="new-password" {...register("password")} />
        </Field>
        {update.isError &&
          !(update.error instanceof ApiError && update.error.fieldErrors.length > 0) && (
            <Alert>{errorMessage(update.error)}</Alert>
          )}
      </form>
    </Dialog>
  );
}

function LockDialog({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const toast = useToast();
  const update = useUpdateUser();
  return (
    <Dialog
      open
      onClose={() => {
        if (!update.isPending) onClose();
      }}
      closeOnOverlayClick={!update.isPending}
      size="sm"
      title={`Khóa tài khoản ${user.name}?`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            Không khóa
          </Button>
          <Button
            variant="danger"
            loading={update.isPending}
            onClick={() =>
              update.mutate(
                { id: user.id, json: { isActive: false } },
                {
                  onSuccess: () => {
                    toast(`Đã khóa tài khoản ${user.name}`);
                    onClose();
                  },
                },
              )
            }
          >
            Khóa tài khoản
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 text-sm text-ink-body">
        <p>
          Người này sẽ bị đăng xuất ngay và không đăng nhập được nữa. Hóa đơn, phiếu đã lập vẫn giữ
          nguyên. Bạn có thể mở khóa lại bất cứ lúc nào.
        </p>
        {update.isError && <Alert>{errorMessage(update.error)}</Alert>}
      </div>
    </Dialog>
  );
}
