import { cn } from "../../lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "border-transparent bg-primary text-white hover:bg-primary-hover",
  secondary: "border-line-input bg-white text-ink-body hover:bg-table-head",
  ghost: "border-transparent bg-transparent text-ink-body hover:bg-subtle",
  danger: "border-transparent bg-danger text-white hover:bg-danger-hover",
};

const sizes: Record<ButtonSize, string> = {
  md: "h-touch px-4 text-sm",
  lg: "h-12 px-5 text-[15px]",
};

export interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/** Class của nút, dùng cho cả <Link> trông như nút. */
export function buttonClass({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
}: ButtonClassOptions = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center gap-2 rounded-control border font-semibold whitespace-nowrap",
    "transition-colors focus-ring disabled:cursor-not-allowed disabled:opacity-50",
    variants[variant],
    sizes[size],
    fullWidth && "w-full",
    className,
  );
}
