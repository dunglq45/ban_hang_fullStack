import { createContext, useContext } from "react";

export interface FieldControl {
  id: string;
  /** id của dòng gợi ý và dòng lỗi, nối vào aria-describedby của ô nhập. */
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

export const FieldContext = createContext<FieldControl | null>(null);

interface ControlProps {
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
}

/** Gộp thuộc tính a11y từ <Field> bao ngoài (nếu có) vào ô nhập. Prop truyền thẳng được ưu tiên. */
export function useFieldControl<P extends ControlProps>(props: P): P {
  const field = useContext(FieldContext);
  if (!field) return props;
  const describedBy = [field.describedBy, props["aria-describedby"]].filter(Boolean).join(" ");
  return {
    ...props,
    id: props.id ?? field.id,
    required: props.required ?? (field.required || undefined),
    "aria-describedby": describedBy || undefined,
    "aria-invalid": props["aria-invalid"] ?? (field.invalid || undefined),
  };
}
