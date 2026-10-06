import { createContext, type Dispatch, useContext } from "react";
import type { Cart } from "./cart";
import type { PosTabsAction, PosTabsState } from "./pos-tabs";

export interface PosContextValue {
  state: PosTabsState;
  dispatch: Dispatch<PosTabsAction>;
  /** Hóa đơn đang mở. */
  active: Cart;
  /** Hóa đơn đang mở đang được gửi lên server: không sửa được (mở đơn mới thì được). */
  locked: boolean;
  /** Sửa hóa đơn đang mở bằng một hàm thuần trong cart.ts. */
  updateActive: (update: (cart: Cart) => Cart) => void;
  checkout: {
    /** Gửi hóa đơn đang mở. `force`: chủ cửa hàng đồng ý ghi nợ vượt hạn mức. */
    submit: (force?: boolean) => void;
    isPending: boolean;
    print: boolean;
    setPrint: (print: boolean) => void;
  };
}

export const PosContext = createContext<PosContextValue | null>(null);

export function usePos(): PosContextValue {
  const value = useContext(PosContext);
  if (!value) throw new Error("usePos phải dùng bên trong <PosProvider>");
  return value;
}
