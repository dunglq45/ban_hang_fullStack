import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import type { z } from "zod";
import { registerFormSchema } from "../../../shared/schemas/auth";
import { useRegister } from "../../api/auth";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { applyFieldErrors } from "../../lib/form-errors";
import { APP_NAME, AuthLayout } from "./AuthLayout";

type FormInput = z.input<typeof registerFormSchema>;
type FormOutput = z.output<typeof registerFormSchema>;

/** Đăng ký cửa hàng mới: tạo cửa hàng + tài khoản chủ, đăng nhập luôn. */
export function RegisterPage() {
  const registerStore = useRegister();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { storeName: "", ownerName: "", phone: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    document.title = `Đăng ký cửa hàng · ${APP_NAME}`;
  }, []);

  const onSubmit = handleSubmit(({ confirmPassword: _, ...input }) =>
    registerStore.mutate(input, {
      onError: (err) =>
        applyFieldErrors(err, setError, ["storeName", "ownerName", "phone", "password"]),
    }),
  );

  return (
    <AuthLayout
      title="Đăng ký cửa hàng"
      subtitle="Tạo cửa hàng và tài khoản chủ cửa hàng. Bạn có thể thêm nhân viên sau."
      footer={
        <>
          Đã có tài khoản?{" "}
          <Link to="/login" className="font-semibold text-primary hover:text-primary-hover">
            Đăng nhập
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Tên cửa hàng" required error={errors.storeName?.message}>
          <Input
            autoComplete="organization"
            placeholder="Ví dụ: Tạp hóa Minh Anh"
            {...register("storeName")}
          />
        </Field>
        <Field label="Tên chủ cửa hàng" required error={errors.ownerName?.message}>
          <Input autoComplete="name" placeholder="Họ và tên" {...register("ownerName")} />
        </Field>
        <Field
          label="Số điện thoại"
          required
          hint="Dùng số này để đăng nhập."
          error={errors.phone?.message}
        >
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="Nhập số điện thoại"
            {...register("phone")}
          />
        </Field>
        <Field label="Mật khẩu" required hint="Tối thiểu 6 ký tự." error={errors.password?.message}>
          <PasswordInput
            autoComplete="new-password"
            placeholder="Nhập mật khẩu"
            {...register("password")}
          />
        </Field>
        <Field label="Nhập lại mật khẩu" required error={errors.confirmPassword?.message}>
          <PasswordInput
            autoComplete="new-password"
            placeholder="Nhập lại mật khẩu"
            {...register("confirmPassword")}
          />
        </Field>
        {registerStore.isError && <Alert>{errorMessage(registerStore.error)}</Alert>}
        <Button type="submit" size="lg" fullWidth loading={registerStore.isPending}>
          Tạo cửa hàng
        </Button>
      </form>
    </AuthLayout>
  );
}
