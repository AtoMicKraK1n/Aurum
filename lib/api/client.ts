import { ApiResponse } from "./types";

export class ApiClientError extends Error {
  status?: number;
  body?: unknown;

  constructor(message: string, status?: number, body?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.body = body;
  }
}

type HttpMethod = "GET" | "POST";

export class ApiClient {
  private readonly baseUrl: string;

  constructor(baseUrl?: string) {
    const resolved =
      baseUrl ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      "http://localhost:3001";
    this.baseUrl = resolved.replace(/\/+$/, "");
  }

  async request<T>(
    path: string,
    method: HttpMethod,
    options?: {
      body?: Record<string, unknown>;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.headers || {}),
      },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    let parsed: ApiResponse<T> | undefined;
    try {
      parsed = (await response.json()) as ApiResponse<T>;
    } catch {
      parsed = undefined;
    }

    if (!response.ok) {
      throw new ApiClientError(
        parsed?.error || `Request failed with status ${response.status}`,
        response.status,
        parsed,
      );
    }

    if (!parsed?.success) {
      throw new ApiClientError(
        parsed?.error || "Request failed",
        response.status,
        parsed,
      );
    }

    if (parsed.data === undefined) {
      throw new ApiClientError(
        "Missing response data",
        response.status,
        parsed,
      );
    }

    return parsed.data;
  }

  get<T>(path: string, headers?: Record<string, string>): Promise<T> {
    return this.request<T>(path, "GET", { headers });
  }

  post<T>(
    path: string,
    body?: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Promise<T> {
    return this.request<T>(path, "POST", { body, headers });
  }
}

export function createApiClient(baseUrl?: string): ApiClient {
  return new ApiClient(baseUrl);
}
