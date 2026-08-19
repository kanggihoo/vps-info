export type ItemFilters = {
  source?: string;
  startAt?: string;
  endAt?: string;
  limit: number;
  offset: number;
};

export type ItemSummary = {
  id: number;
  source: string;
  title: string;
  url: string;
  publishedAt: string | null;
  score: number | null;
};

export type ItemDetail = ItemSummary & {
  summary: string | null;
  sourceItemUrl: string | null;
  tags: string[];
};

export type ItemListResponse = {
  items: ItemSummary[];
  total: number;
  limit: number;
  offset: number;
};

export type JobRun = {
  id: number;
  jobKey: string;
  status: "RUNNING" | "SUCCESS" | "PARTIAL" | "FAILED";
  startedAt: string;
  finishedAt: string | null;
  children?: JobRun[];
  errorType?: string | null;
  errorMessage?: string | null;
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function loadItems(filters: ItemFilters): Promise<ItemListResponse> {
  const params = new URLSearchParams();
  if (filters.source) params.set("source", filters.source);
  if (filters.startAt) params.set("startAt", filters.startAt);
  if (filters.endAt) params.set("endAt", filters.endAt);
  params.set("limit", String(filters.limit));
  params.set("offset", String(filters.offset));
  return request(`/api/items?${params}`);
}

export function loadItem(id: number): Promise<ItemDetail> {
  return request(`/api/items/${id}`);
}

export function loadJobRuns(): Promise<JobRun[]> {
  return request("/api/job-runs");
}

export function loadJobRun(id: number): Promise<JobRun> {
  return request(`/api/job-runs/${id}`);
}
