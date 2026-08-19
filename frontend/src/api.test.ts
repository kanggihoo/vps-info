import { describe, expect, it, vi } from "vitest";

import { loadItems } from "./api";

describe("loadItems", () => {
  it("requests items with a relative API path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadItems({ limit: 20, offset: 0 });

    expect(fetchMock).toHaveBeenCalledWith("/api/items?limit=20&offset=0");
  });
});
