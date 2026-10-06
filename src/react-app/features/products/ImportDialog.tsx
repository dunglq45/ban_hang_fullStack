import { type ChangeEvent, useRef, useState } from "react";
import { errorMessage } from "../../api/errors";
import { importProducts, useInvalidateProducts } from "../../api/products";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";
import { formatNumber } from "../../lib/format";
import {
  batches,
  type FailedRow,
  failedRowsTable,
  MAX_FILE_ROWS,
  type ParsedSheet,
  parseSheet,
  templateTable,
} from "./import-excel";

const PREVIEW_ROWS = 20;
/** File đọc hết vào bộ nhớ trình duyệt trước khi xử lý; chặn sớm file quá lớn. */
const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** SheetJS khá nặng: chỉ tải khi mở hộp thoại nhập Excel. */
const loadXlsx = () => import("xlsx");

async function downloadTable(table: unknown[][], fileName: string, sheetName: string) {
  const XLSX = await loadXlsx();
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(table), sheetName);
  XLSX.writeFile(wb, fileName);
}

interface ImportOutcome {
  succeeded: number;
  failed: FailedRow[];
  createdCategories: string[];
}

type Step =
  | { kind: "pick"; error?: string }
  | { kind: "preview"; fileName: string; sheet: ParsedSheet }
  | { kind: "importing"; fileName: string; sheet: ParsedSheet; done: number; total: number }
  | { kind: "done"; fileName: string; sheet: ParsedSheet; outcome: ImportOutcome };

/**
 * Nhập hàng hóa từ Excel: tải file mẫu → chọn file → xem trước và báo lỗi từng dòng (kiểm tra ở
 * máy, cùng schema với server) → gửi các dòng hợp lệ theo lô 500 → kết quả + tải dòng lỗi.
 */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const fileRef = useRef<HTMLInputElement>(null);
  const invalidate = useInvalidateProducts();
  const busy = step.kind === "importing";

  function close() {
    if (busy) return; // đang gửi: không đóng giữa chừng
    setStep({ kind: "pick" });
    onClose();
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // Chặn sớm file quá lớn (đọc hết vào bộ nhớ trình duyệt rồi mới xử lý): máy yếu có thể treo tab.
    if (file.size > MAX_FILE_BYTES) {
      setStep({
        kind: "pick",
        error: `File "${file.name}" quá lớn (tối đa ${MAX_FILE_BYTES / (1024 * 1024)}MB). Hãy chia nhỏ file.`,
      });
      return;
    }
    try {
      const XLSX = await loadXlsx();
      const wb = XLSX.read(await file.arrayBuffer(), {
        type: "array",
        sheetRows: MAX_FILE_ROWS + 50, // thừa chút để parseSheet tự báo "quá nhiều dòng"
      });
      const first = wb.SheetNames[0];
      const ws = first ? wb.Sheets[first] : undefined;
      if (!ws) throw new Error("empty");
      const table = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
      setStep({ kind: "preview", fileName: file.name, sheet: parseSheet(table) });
    } catch {
      setStep({
        kind: "pick",
        error: `Không đọc được file "${file.name}". Hãy dùng file Excel (.xlsx) theo mẫu.`,
      });
    }
  }

  async function run(fileName: string, sheet: ParsedSheet) {
    const valid = sheet.rows.filter((r) => r.input !== null);
    const failed: FailedRow[] = sheet.rows
      .filter((r) => r.error !== null)
      .map((r) => ({
        rowNumber: r.rowNumber,
        cells: r.cells,
        name: nameOf(r.cells, sheet),
        reason: r.error!,
      }));
    let succeeded = 0;
    const createdCategories: string[] = [];
    let done = 0;
    setStep({ kind: "importing", fileName, sheet, done, total: valid.length });

    for (const batch of batches(valid)) {
      try {
        const res = await importProducts(batch.map((r) => r.input));
        createdCategories.push(...res.createdCategories);
        for (const r of res.rows) {
          const src = batch[r.row - 1];
          if (!src) continue;
          if (r.ok) succeeded++;
          else
            failed.push({
              rowNumber: src.rowNumber,
              cells: src.cells,
              name: src.input?.name ?? "",
              reason: r.error,
            });
        }
      } catch (err) {
        // Cả lô không gửi được (mất mạng...): ghi lỗi cho từng dòng để người dùng nhập lại sau.
        for (const src of batch) {
          failed.push({
            rowNumber: src.rowNumber,
            cells: src.cells,
            name: src.input?.name ?? "",
            reason: errorMessage(err),
          });
        }
      }
      done += batch.length;
      setStep({ kind: "importing", fileName, sheet, done, total: valid.length });
    }

    failed.sort((a, b) => a.rowNumber - b.rowNumber);
    invalidate();
    setStep({ kind: "done", fileName, sheet, outcome: { succeeded, failed, createdCategories } });
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Nhập hàng hóa từ Excel"
      description={
        step.kind === "pick"
          ? "Mỗi dòng là một mặt hàng. Tồn kho ghi theo đơn vị cơ bản."
          : step.fileName
      }
      size="lg"
      closeOnOverlayClick={false}
      footer={
        <Footer step={step} onClose={close} onPick={() => fileRef.current?.click()} onRun={run} />
      }
    >
      <input
        ref={fileRef}
        type="file"
        // Không nhận .csv: khi đọc CSV, SheetJS tự đoán kiểu ô theo kiểu Anh-Mỹ nên "31.000"
        // (viết kiểu Việt) hóa thành số 31, sai lặng lẽ. File .xlsx/.xls giữ đúng kiểu ô gốc.
        accept=".xlsx,.xls"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void onFile(e)}
      />

      {step.kind === "pick" && (
        <div className="flex flex-col gap-4 text-sm text-ink-body">
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              Tải file mẫu, điền hàng hóa vào (cột có dấu * là bắt buộc; để trống mã hàng thì hệ
              thống tự tạo mã).
            </li>
            <li>Bấm "Chọn file" và chọn file vừa điền. Kiểm tra lại các dòng báo lỗi.</li>
            <li>Bấm "Nhập" để thêm các dòng hợp lệ vào danh sách hàng hóa.</li>
          </ol>
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                void downloadTable(templateTable(), "mau-nhap-hang-hoa.xlsx", "Hàng hóa")
              }
            >
              Tải file mẫu
            </Button>
          </div>
          {step.error && <Alert>{step.error}</Alert>}
        </div>
      )}

      {(step.kind === "preview" || step.kind === "importing") && <Preview sheet={step.sheet} />}

      {step.kind === "importing" && (
        <p role="status" className="mt-3 text-sm text-ink-muted">
          Đang nhập {formatNumber(step.done)} / {formatNumber(step.total)} dòng…
        </p>
      )}

      {step.kind === "done" && <Result sheet={step.sheet} outcome={step.outcome} />}
    </Dialog>
  );
}

function nameOf(cells: unknown[], sheet: ParsedSheet) {
  const idx = sheet.headers.findIndex((h) => /t[eê]n/i.test(h));
  return idx >= 0 ? String(cells[idx] ?? "") : "";
}

function Preview({ sheet }: { sheet: ParsedSheet }) {
  if (sheet.missingColumns.length > 0) {
    return (
      <Alert>
        File thiếu cột bắt buộc: {sheet.missingColumns.join(", ")}. Hãy dùng đúng file mẫu.
      </Alert>
    );
  }
  if (sheet.rows.length === 0) return <Alert>File không có dòng hàng hóa nào.</Alert>;
  if (sheet.tooMany) {
    return (
      <Alert>
        File có {formatNumber(sheet.rows.length)} dòng, quá {formatNumber(MAX_FILE_ROWS)} dòng mỗi
        lần. Hãy chia thành nhiều file nhỏ hơn.
      </Alert>
    );
  }
  const errors = sheet.rows.filter((r) => r.error).length;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        <strong>{formatNumber(sheet.rows.length - errors)}</strong> dòng hợp lệ
        {errors > 0 && (
          <>
            , <strong className="text-danger">{formatNumber(errors)}</strong> dòng lỗi (sẽ bỏ qua
            khi nhập)
          </>
        )}
        . Xem trước {Math.min(PREVIEW_ROWS, sheet.rows.length)} dòng đầu:
      </p>
      <div className="rounded-control border border-line">
        <Table aria-label="Xem trước dữ liệu" minWidth={640}>
          <THead>
            <TR>
              <TH numeric>Dòng</TH>
              {sheet.headers.map((h, i) => (
                <TH key={i}>{h}</TH>
              ))}
              <TH>Kiểm tra</TH>
            </TR>
          </THead>
          <TBody>
            {sheet.rows.slice(0, PREVIEW_ROWS).map((r) => (
              <TR key={r.rowNumber} className={r.error ? "bg-danger/5" : undefined}>
                <TD numeric className="h-11">
                  {r.rowNumber}
                </TD>
                {sheet.headers.map((_, i) => (
                  <TD key={i} className="h-11 whitespace-nowrap">
                    {String(r.cells[i] ?? "")}
                  </TD>
                ))}
                <TD
                  className={
                    r.error ? "h-11 text-[13px] text-danger" : "h-11 text-[13px] text-success"
                  }
                >
                  {r.error ?? "Hợp lệ"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

function Result({ sheet, outcome }: { sheet: ParsedSheet; outcome: ImportOutcome }) {
  const { succeeded, failed, createdCategories } = outcome;
  return (
    <div className="flex flex-col gap-3 text-sm">
      <Alert tone={failed.length === 0 ? "info" : "warn"}>
        Đã nhập <strong>{formatNumber(succeeded)}</strong> mặt hàng
        {failed.length > 0 && <>, {formatNumber(failed.length)} dòng lỗi</>}.
        {createdCategories.length > 0 && <> Tạo nhóm mới: {createdCategories.join(", ")}.</>}
      </Alert>
      {failed.length > 0 && (
        <>
          <div className="max-h-72 overflow-y-auto rounded-control border border-line">
            <Table aria-label="Các dòng lỗi">
              <THead>
                <TR>
                  <TH numeric>Dòng</TH>
                  <TH>Tên hàng</TH>
                  <TH>Lý do</TH>
                </TR>
              </THead>
              <TBody>
                {failed.map((f) => (
                  <TR key={f.rowNumber}>
                    <TD numeric className="h-11">
                      {f.rowNumber}
                    </TD>
                    <TD className="h-11">{f.name}</TD>
                    <TD className="h-11 text-[13px] text-danger">{f.reason}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <div>
            <Button
              variant="secondary"
              onClick={() =>
                void downloadTable(
                  failedRowsTable(sheet.headers, failed),
                  "dong-loi-nhap-hang.xlsx",
                  "Dòng lỗi",
                )
              }
            >
              Tải danh sách dòng lỗi
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function Footer({
  step,
  onClose,
  onPick,
  onRun,
}: {
  step: Step;
  onClose: () => void;
  onPick: () => void;
  onRun: (fileName: string, sheet: ParsedSheet) => void;
}) {
  if (step.kind === "done") {
    return <Button onClick={onClose}>Xong</Button>;
  }
  const sheet = step.kind === "preview" || step.kind === "importing" ? step.sheet : null;
  const validCount = sheet ? sheet.rows.filter((r) => r.input).length : 0;
  const canRun =
    sheet !== null && sheet.missingColumns.length === 0 && !sheet.tooMany && validCount > 0;
  return (
    <>
      <Button variant="secondary" onClick={onClose} disabled={step.kind === "importing"}>
        Hủy
      </Button>
      <Button variant="secondary" onClick={onPick} disabled={step.kind === "importing"}>
        {sheet ? "Chọn file khác" : "Chọn file"}
      </Button>
      {sheet && (
        <Button
          loading={step.kind === "importing"}
          disabled={!canRun}
          onClick={() => step.kind === "preview" && onRun(step.fileName, step.sheet)}
        >
          Nhập {formatNumber(validCount)} dòng
        </Button>
      )}
    </>
  );
}
