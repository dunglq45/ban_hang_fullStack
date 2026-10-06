import { zodResolver } from "@hookform/resolvers/zod";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { quickCustomerSchema } from "../../../shared/schemas/contact";
import { errorMessage } from "../../api/errors";
import { type ContactItem, useCreateCustomer, useCustomerSearch } from "../../api/pos";
import { Alert } from "../../components/ui/Alert";
import { Button, IconButton } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { CloseIcon, PlusIcon, SearchIcon } from "../../components/ui/icons";
import { Input } from "../../components/ui/Input";
import { cn } from "../../lib/cn";
import { contactLabel, formatMoney } from "../../lib/format";
import { useDebouncedValue } from "../../lib/use-debounced-value";
import type { CartCustomer } from "./cart";

function toCartCustomer(c: ContactItem): CartCustomer {
  return {
    id: c.id,
    code: c.code,
    name: c.name,
    phone: c.phone,
    debt: c.debt,
    debtLimit: c.debtLimit,
  };
}

/** Chọn khách cho hóa đơn: tìm theo tên/SĐT, hiện nợ cũ, tạo khách mới ngay tại chỗ. */
export function CustomerPicker({
  customer,
  onChange,
}: {
  customer: CartCustomer | null;
  onChange: (customer: CartCustomer | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const labelId = useId();
  const debounced = useDebouncedValue(query.trim(), 250);
  const search = useCustomerSearch(debounced, open && !customer);
  const options = (search.data ?? []).filter((c) => c.isActive);

  function choose(c: ContactItem | CartCustomer) {
    onChange("type" in c ? toCartCustomer(c) : c);
    setQuery("");
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      if (options.length === 0) return;
      const delta = e.key === "ArrowDown" ? 1 : -1;
      setHighlight((h) => (h + delta + options.length) % options.length);
    } else if (e.key === "Enter" && open && options[highlight]) {
      e.preventDefault();
      choose(options[highlight]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  if (customer) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-ink-body">Khách hàng</span>
        <div className="flex min-h-[52px] items-center gap-2.5 rounded-control border border-line-input py-1 pr-1 pl-3">
          <div className="min-w-0 flex-1 leading-snug">
            <div className="truncate text-sm font-semibold">{contactLabel(customer)}</div>
            <div className={cn("text-[13px]", customer.debt > 0 ? "text-warn" : "text-ink-muted")}>
              {customer.debt > 0 ? `Nợ cũ ${formatMoney(customer.debt)}` : "Không có nợ cũ"}
            </div>
          </div>
          <IconButton label="Bỏ chọn khách" onClick={() => onChange(null)}>
            <CloseIcon size={16} />
          </IconButton>
        </div>
      </div>
    );
  }

  const activeOptionId = open && options[highlight] ? `${listId}-${highlight}` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        id={labelId}
        htmlFor={`${listId}-input`}
        className="text-[13px] font-medium text-ink-body"
      >
        Khách hàng
      </label>
      <div className="relative flex gap-2">
        <Input
          ref={inputRef}
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          autoComplete="off"
          placeholder="Khách lẻ · tìm tên hoặc SĐT"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={handleKeyDown}
          leading={<SearchIcon size={18} />}
          frameClassName="flex-1"
        />
        <IconButton label="Thêm khách mới" variant="secondary" onClick={() => setCreating(true)}>
          <PlusIcon size={18} />
        </IconButton>

        {open && (
          <ul
            id={listId}
            role="listbox"
            aria-labelledby={labelId}
            className="absolute top-full right-0 left-0 z-30 mt-1 max-h-72 overflow-y-auto rounded-control border border-line bg-white py-1 shadow-lg"
          >
            {options.map((c, i) => (
              <li
                key={c.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === highlight}
                // mousedown để chọn trước khi ô nhập mất focus (onBlur đóng danh sách).
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(c);
                }}
                onMouseEnter={() => setHighlight(i)}
                className={cn(
                  "flex min-h-touch cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm",
                  i === highlight && "bg-subtle",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{contactLabel(c)}</span>
                  <span className="text-xs text-ink-muted">{c.code}</span>
                </span>
                {c.debt > 0 && (
                  <span className="shrink-0 text-[13px] font-semibold text-warn tabular-nums">
                    Nợ {formatMoney(c.debt)}
                  </span>
                )}
              </li>
            ))}
            {options.length === 0 && (
              <li role="presentation" className="px-3 py-3 text-sm text-ink-muted">
                {search.isFetching ? "Đang tìm…" : "Không tìm thấy khách. Bấm + để thêm khách mới."}
              </li>
            )}
          </ul>
        )}
      </div>

      <QuickCustomerDialog
        open={creating}
        initialQuery={query}
        onClose={() => setCreating(false)}
        onCreated={(c) => {
          setCreating(false);
          choose(c);
        }}
      />
    </div>
  );
}

type QuickInput = z.input<typeof quickCustomerSchema>;
type QuickOutput = z.output<typeof quickCustomerSchema>;

function QuickCustomerDialog(props: QuickCustomerDialogProps) {
  // Mỗi lần mở là một form mới, điền sẵn từ chữ đang gõ ở ô tìm.
  return props.open ? <QuickCustomerForm {...props} /> : null;
}

interface QuickCustomerDialogProps {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onCreated: (c: CartCustomer) => void;
}

function QuickCustomerForm({ initialQuery, onClose, onCreated }: QuickCustomerDialogProps) {
  const create = useCreateCustomer();
  const formId = useId();
  const q = initialQuery.trim();
  const isPhone = /^[\d\s.]+$/.test(q);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<QuickInput, unknown, QuickOutput>({
    resolver: zodResolver(quickCustomerSchema),
    defaultValues: { name: isPhone ? "" : q, phone: isPhone ? q : "" },
  });

  const onSubmit = handleSubmit((values) =>
    create.mutate(
      { name: values.name, phone: values.phone },
      { onSuccess: (c) => onCreated(toCartCustomer(c)) },
    ),
  );

  return (
    <Dialog
      open
      onClose={onClose}
      title="Thêm khách mới"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Hủy
          </Button>
          <Button type="submit" form={formId} loading={create.isPending}>
            Thêm và chọn
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Tên khách" required error={errors.name?.message}>
          <Input autoComplete="off" placeholder="Ví dụ: Chị Lan" {...register("name")} />
        </Field>
        <Field label="Số điện thoại" error={errors.phone?.message}>
          <Input type="tel" inputMode="tel" autoComplete="off" {...register("phone")} />
        </Field>
        {create.isError && <Alert>{errorMessage(create.error)}</Alert>}
      </form>
    </Dialog>
  );
}
