import {
  type Dispatch,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Outlet, useLocation, useNavigate } from "react-router";
import { useSession } from "../../api/auth";
import { ApiError, errorMessage } from "../../api/errors";
import { useCreateSale } from "../../api/pos";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { useToast } from "../../components/ui/toast-context";
import {
  type Cart,
  type CartCustomer,
  checkoutError,
  lineErrorsFromApi,
  matchesSale,
  setLineErrors,
  toSaleInput,
} from "./cart";
import { PosContext, type PosContextValue } from "./pos-context";
import { loadPosPrint, savePosPrint } from "./print-preference";
import { loadTabs, posTabsReducer, type PosTabsAction, saveTabs, storageKey } from "./pos-tabs";

/**
 * Route bọc màn Bán hàng (/ban-hang và /ban-hang/thanh-toan): giữ các hóa đơn đang mở (lưu
 * localStorage theo cửa hàng + người dùng) và luồng thanh toán dùng chung cho desktop và điện thoại.
 * Đổi cửa hàng/người dùng thì dựng lại từ đầu (không ghi đơn của người này sang khóa người kia).
 */
export function PosProvider() {
  const { user, store } = useSession();
  const key = storageKey(store.id, user.id);
  return <PosProviderInner key={key} storageKey={key} />;
}

function PosProviderInner({ storageKey: key }: { storageKey: string }) {
  const { user } = useSession();
  const [state, rawDispatch] = useReducer(posTabsReducer, key, loadTabs);
  const [print, setPrintState] = useState(loadPosPrint);
  const [debtPrompt, setDebtPrompt] = useState<string | null>(null);
  /** Hóa đơn đang gửi lên server: khóa sửa cho tới khi có kết quả. */
  const [sendingId, setSendingId] = useState<string | null>(null);
  const sendingRef = useRef<string | null>(null);
  const createSale = useCreateSale();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => saveTabs(key, state), [key, state]);

  // "Ghi nợ" từ Sổ nợ: navigate("/ban-hang", { state: { customer } }). Xử lý một lần rồi xóa state
  // khỏi lịch sử để tải lại trang / bấm Back không mở thêm đơn.
  const handoff = (location.state as { customer?: CartCustomer } | null)?.customer;
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });
  // StrictMode chạy effect hai lần: mỗi mục lịch sử chỉ xử lý một lần (không toast hai lần).
  const handledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!handoff || handledKeyRef.current === location.key) return;
    handledKeyRef.current = location.key;
    const action: PosTabsAction = { type: "openForCustomer", customer: handoff };
    if (posTabsReducer(stateRef.current, action) === stateRef.current) {
      toast({
        tone: "error",
        message: "Đã mở đủ 10 hóa đơn. Đóng bớt một hóa đơn rồi chọn khách để bán.",
      });
    } else {
      rawDispatch(action);
    }
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [handoff, location.key, location.pathname, location.search, navigate, toast]);

  const active = state.tabs.find((t) => t.id === state.activeId) ?? state.tabs[0]!;

  // F9 gọi submit sau khi rời ô đang gõ: luôn đọc hóa đơn mới nhất qua ref.
  const activeRef = useRef<Cart>(active);
  useEffect(() => {
    activeRef.current = active;
  });

  /** Mọi thao tác từ giao diện: không sửa/hủy hóa đơn đang gửi (vẫn chọn tab, mở đơn mới được). */
  const dispatch = useCallback<Dispatch<PosTabsAction>>((action) => {
    if (
      sendingRef.current !== null &&
      (action.type === "update" || action.type === "close") &&
      action.id === sendingRef.current
    ) {
      return;
    }
    rawDispatch(action);
  }, []);

  const updateActive = useCallback(
    (update: (cart: Cart) => Cart) => dispatch({ type: "update", id: state.activeId, update }),
    [dispatch, state.activeId],
  );

  const setPrint = useCallback((value: boolean) => {
    setPrintState(value);
    savePosPrint(value);
  }, []);

  const { mutate } = createSale;
  const submit = useCallback(
    (force = false) => {
      if (sendingRef.current !== null) return; // đang gửi (bấm F9/nút liên tục)
      const cart = activeRef.current;
      const problem = checkoutError(cart);
      if (problem) {
        toast({ tone: "error", message: problem });
        return;
      }
      const input = toSaleInput(cart, force);
      sendingRef.current = cart.id;
      setSendingId(cart.id);
      // Mở cửa sổ in ngay trong thao tác của người dùng (trình duyệt chặn popup mở sau await).
      const printWindow = print ? window.open("", "_blank") : null;

      mutate(input, {
        onSuccess: ({ document, replayed }) => {
          setDebtPrompt(null);
          if (replayed && !matchesSale(input, document)) {
            // Key đã thuộc một hóa đơn khác (đơn bị sửa sau lần gửi lỗi mạng, hoặc cùng đơn mở ở
            // hai tab trình duyệt): đơn này CHƯA được bán. Giữ nguyên, đổi key để bán lại.
            printWindow?.close();
            rawDispatch({ type: "rekey", id: cart.id });
            toast({
              tone: "error",
              message: `Hóa đơn ${document.code} đã được lưu trước đó với nội dung khác. Đơn này chưa bán, bấm Thanh toán lại để bán.`,
            });
            return;
          }
          rawDispatch({ type: "reset", id: cart.id });
          toast(
            replayed
              ? { tone: "info", message: `Hóa đơn ${document.code} đã được lưu trước đó` }
              : `Đã bán ${document.code}`,
          );
          if (printWindow) printWindow.location.href = `/in/hoa-don/${document.id}?auto=1`;
          if (location.pathname !== "/ban-hang") navigate("/ban-hang");
        },
        onError: (err) => {
          printWindow?.close();
          if (
            err instanceof ApiError &&
            err.code === "DEBT_LIMIT_EXCEEDED" &&
            user.role === "owner" &&
            !force
          ) {
            setDebtPrompt(err.message);
            return;
          }
          setDebtPrompt(null);
          if (err instanceof ApiError) {
            const errors = lineErrorsFromApi(cart, err.code, err.message, err.details);
            if (Object.keys(errors).length > 0) {
              rawDispatch({ type: "update", id: cart.id, update: (c) => setLineErrors(c, errors) });
            }
          }
          toast({ tone: "error", message: errorMessage(err) });
        },
        onSettled: () => {
          sendingRef.current = null;
          setSendingId(null);
        },
      });
    },
    [mutate, print, toast, navigate, location.pathname, user.role],
  );

  const value = useMemo<PosContextValue>(
    () => ({
      state,
      dispatch,
      active,
      locked: sendingId === active.id,
      updateActive,
      checkout: { submit, isPending: sendingId !== null, print, setPrint },
    }),
    [state, dispatch, active, sendingId, updateActive, submit, print, setPrint],
  );

  return (
    <PosContext value={value}>
      <Outlet />
      <Dialog
        open={debtPrompt !== null}
        onClose={() => setDebtPrompt(null)}
        title="Vượt hạn mức nợ"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDebtPrompt(null)}>
              Không bán
            </Button>
            <Button loading={sendingId !== null} onClick={() => submit(true)}>
              Vẫn bán và ghi nợ
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-body">
          {debtPrompt} Bạn là chủ cửa hàng nên có thể cho khách nợ vượt hạn mức lần này.
        </p>
      </Dialog>
    </PosContext>
  );
}
