// Tạo cửa hàng/nhân viên qua API thật để test. Dùng lại cho các giai đoạn sau
// (đặc biệt test cô lập dữ liệu giữa hai cửa hàng).
import { expect } from "vitest";
import { client, sidCookie } from "./api";

export const TEST_PASSWORD = "matkhau123";

let phoneSeq = 0;
/** SĐT duy nhất trong một lần chạy test: 09 + 8 số. */
export function uniquePhone(): string {
  phoneSeq++;
  const rand = Math.floor(Math.random() * 10_000);
  return `09${String(rand).padStart(4, "0")}${String(phoneSeq % 10_000).padStart(4, "0")}`;
}

export interface TestUser {
  id: string;
  phone: string;
  password: string;
  role: "owner" | "staff";
  /** "sid=..." truyền vào client(cookie). */
  cookie: string;
  api: ReturnType<typeof client>;
}

export interface TestStore {
  storeId: string;
  name: string;
  owner: TestUser;
}

export async function login(phone: string, password = TEST_PASSWORD, remember = false) {
  const res = await client().auth.login.$post({ json: { phone, password, remember } });
  expect(res.status, await res.clone().text()).toBe(200);
  const cookie = sidCookie(res);
  expect(cookie).toBeDefined();
  return cookie!;
}

export async function createStore(name = "Cửa hàng thử"): Promise<TestStore> {
  const phone = uniquePhone();
  const res = await client().auth.register.$post({
    json: { storeName: name, ownerName: "Chủ " + name, phone, password: TEST_PASSWORD },
  });
  expect(res.status, await res.clone().text()).toBe(201);
  const cookie = sidCookie(res)!;
  const api = client(cookie);
  const me = await api.auth.me.$get();
  if (!me.ok) throw new Error(`me thất bại: ${me.status}`);
  const body = await me.json();
  return {
    storeId: body.store.id,
    name,
    owner: { id: body.user.id, phone, password: TEST_PASSWORD, role: "owner", cookie, api },
  };
}

/** Chủ cửa hàng thêm một nhân viên rồi đăng nhập bằng tài khoản đó. */
export async function addStaff(store: TestStore, name = "Nhân viên"): Promise<TestUser> {
  const phone = uniquePhone();
  const res = await store.owner.api.users.$post({
    json: { name, phone, password: TEST_PASSWORD, role: "staff" },
  });
  if (res.status !== 201) throw new Error(`thêm nhân viên thất bại: ${await res.text()}`);
  const user = await res.json();
  const cookie = await login(phone);
  return {
    id: user.id,
    phone,
    password: TEST_PASSWORD,
    role: "staff",
    cookie,
    api: client(cookie),
  };
}

export interface TestStoreWithStaff extends TestStore {
  staff: TestUser;
}

/** Hai cửa hàng độc lập, mỗi cửa hàng có chủ và một nhân viên. */
export async function createTwoStores(): Promise<{ a: TestStoreWithStaff; b: TestStoreWithStaff }> {
  const a = await createStore("Cửa hàng A");
  const b = await createStore("Cửa hàng B");
  return { a: { ...a, staff: await addStaff(a) }, b: { ...b, staff: await addStaff(b) } };
}
