import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import type { z } from "zod";
import { loginSchema } from "../../../shared/schemas/auth";
import { useLogin } from "../../api/auth";
import { errorMessage } from "../../api/errors";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Checkbox } from "../../components/ui/Checkbox";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { applyFieldErrors } from "../../lib/form-errors";
import { APP_NAME, AuthLayout } from "./AuthLayout";

type FormInput = z.input<typeof loginSchema>;
type FormOutput = z.output<typeof loginSchema>;

/** Đăng nhập theo design/DangNhap. Thành công thì GuestOnly tự chuyển vào app. */
export function LoginPage() {
  const login = useLogin();
  const [showForgot, setShowForgot] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: "", password: "", remember: true },
  });

  useEffect(() => {
    document.title = `Đăng nhập · ${APP_NAME}`;
  }, []);

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, {
      onError: (err) => applyFieldErrors(err, setError, ["phone", "password"]),
    }),
  );

  return (
    <AuthLayout
      title="Đăng nhập"
      subtitle="Quản lý bán hàng, kho và sổ nợ của cửa hàng bạn."
      footer={
        <>
          Chưa có tài khoản?{" "}
          <Link to="/register" className="font-semibold text-primary hover:text-primary-hover">
            Đăng ký cửa hàng mới
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Số điện thoại" error={errors.phone?.message}>
          <Input
            type="tel"
            inputMode="tel"
            autoComplete="username"
            placeholder="Nhập số điện thoại"
            {...register("phone")}
          />
        </Field>
        <Field label="Mật khẩu" error={errors.password?.message}>
          <PasswordInput
            autoComplete="current-password"
            placeholder="Nhập mật khẩu"
            {...register("password")}
          />
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Checkbox label="Ghi nhớ trên máy này" {...register("remember")} />
          <button
            type="button"
            aria-expanded={showForgot}
            onClick={() => setShowForgot((v) => !v)}
            className="inline-flex min-h-touch items-center text-sm font-semibold text-primary hover:text-primary-hover"
          >
            Quên mật khẩu?
          </button>
        </div>
        {showForgot && (
          <Alert tone="info">
            Nhân viên: nhờ chủ cửa hàng đặt lại mật khẩu trong mục Cài đặt. Chủ cửa hàng: liên hệ bộ
            phận hỗ trợ để được cấp lại.
          </Alert>
        )}
        {login.isError && <Alert>{errorMessage(login.error)}</Alert>}
        <Button type="submit" size="lg" fullWidth loading={login.isPending}>
          Đăng nhập
        </Button>
      </form>
    </AuthLayout>
  );
}
