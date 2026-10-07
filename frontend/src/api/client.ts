// Port tu vi-pham-app/linh-kien-app frontend/src/api/client.ts.
import { congTyDangChon } from "../lib/congTy";

const BASE = "/api";
// Bo loc cong ty dang xem (da phap nhan) - server tu giao voi cong ty tai khoan duoc phep.
const HEADER_CONG_TY: Record<string, string> = congTyDangChon ? { "x-cong-ty": congTyDangChon } : {};

export class ApiError extends Error {
  status: number;
  code?: string;
  detail?: string;
  body?: Record<string, unknown>;
  constructor(status: number, code?: string, detail?: string, body?: Record<string, unknown>) {
    super(code ?? `HTTP_${status}`);
    this.status = status;
    this.code = code;
    this.detail = detail;
    this.body = body;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormBody = init?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...init,
    headers: isFormBody ? { ...HEADER_CONG_TY, ...init?.headers } : { "Content-Type": "application/json", ...HEADER_CONG_TY, ...init?.headers },
  });

  if (!res.ok) {
    let code: string | undefined;
    let detail: string | undefined;
    let body: Record<string, unknown> | undefined;
    try {
      body = await res.json();
      code = body?.error as string | undefined;
      if (typeof body?.message === "string") detail = body.message as string;
    } catch {
      /* body khong phai JSON */
    }
    throw new ApiError(res.status, code, detail, body);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  /** Gui BYTES tho (anh / PDF) - Content-Type = mime that, giong postBinary() cua vi-pham-app. */
  postBinary: <T>(path: string, body: Blob, contentType: string) =>
    request<T>(path, { method: "POST", body, headers: { "Content-Type": contentType } }),
};
