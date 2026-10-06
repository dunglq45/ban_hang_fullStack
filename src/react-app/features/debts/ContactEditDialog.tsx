import { zodResolver } from "@hookform/resolvers/zod";
import { useId } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { updateContactSchema } from "../../../shared/schemas/contact";
import { useSession } from "../../api/auth";
import { type ContactDetail, useUpdateContact } from "../../api/debts";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { MoneyInput } from "../../components/ui/MoneyInput";
import { Textarea } from "../../components/ui/Textarea";
import { useToast } from "../../components/ui/toast-context";
import { applyFieldErrors } from "../../lib/form-errors";

type FormInput = z.input<typeof updateContactSchema>;
type FormOutput = z.output<typeof updateContactSchema>;

const FIELDS = ["name", "phone", "address", "note", "debtLimit"] as const;

/**
 * Sửa thông tin khách / nhà cung cấp. Hạn mức nợ và "Ngừng giao dịch" chỉ chủ cửa hàng thấy
 * (server cũng bỏ qua hai trường này khi nhân viên gửi lên).
 */
export function ContactEditDialog({
  contact,
  onClose,
}: {
  contact: ContactDetail;
  onClose: () => void;
}) {
  const { user } = useSession();
  const isOwner = user.role === "owner";
  const isCustomer = contact.type === "customer";
  const formId = useId();
  const update = useUpdateContact(contact.id);
  const toast = useToast();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(updateContactSchema),
    defaultValues: {
      name: contact.name,
      phone: contact.phone ?? "",
      address: contact.address ?? "",
      note: contact.note ?? "",
      debtLimit: contact.debtLimit,
      isActive: contact.isActive,
    },
  });

  const onSubmit = handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: () => {
        toast("Đã lưu thông tin");
        onClose();
      },
      onError: (err) => applyFieldErrors(err, setError, FIELDS),
    }),
  );

  return (
    <Dialog
      open
      onClose={() => {
        if (!update.isPending) onClose();
      }}
      closeOnOverlayClick={!update.isPending}
      title={isCustomer ? "Sửa thông tin khách" : "Sửa thông tin nhà cung cấp"}
      description={contact.code}
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
        <Field
          label={isCustomer ? "Tên khách" : "Tên nhà cung cấp"}
          required
          error={errors.name?.message}
        >
          <Input autoComplete="off" {...register("name")} />
        </Field>
        <Field label="Số điện thoại" error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...register("phone")} />
        </Field>
        <Field label="Địa chỉ" error={errors.address?.message}>
          <Input autoComplete="off" {...register("address")} />
        </Field>
        {isOwner && isCustomer && (
          <Field
            label="Hạn mức nợ"
            hint="Để trống nếu không giới hạn. Bán ghi nợ vượt hạn mức sẽ bị chặn."
            error={errors.debtLimit?.message}
          >
            <Controller
              control={control}
              name="debtLimit"
              render={({ field }) => (
                <MoneyInput
                  value={field.value ?? null}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  placeholder="Không giới hạn"
                />
              )}
            />
          </Field>
        )}
        <Field label="Ghi chú" error={errors.note?.message}>
          <Textarea rows={2} {...register("note")} />
        </Field>
        {isOwner && (
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Checkbox
                label={
                  isCustomer
                    ? "Ngừng giao dịch (không bán cho khách này nữa)"
                    : "Ngừng giao dịch với nhà cung cấp này"
                }
                checked={field.value === false}
                onChange={(e) => field.onChange(!e.target.checked)}
              />
            )}
          />
        )}
        {update.isError && <Alert>{errorMessage(update.error)}</Alert>}
      </form>
    </Dialog>
  );
}
