import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import App, { RunDetailPage } from "./App";

describe("RunDetailPage", () => {
  it("renders a failed job in run detail", () => {
    render(
      <RunDetailPage
        run={{
          id: 1,
          jobKey: "batch-run",
          status: "PARTIAL",
          startedAt: "2026-08-20T00:00:00Z",
          finishedAt: "2026-08-20T00:01:00Z",
          children: [
            {
              id: 2,
              jobKey: "producthunt",
              status: "FAILED",
              startedAt: "2026-08-20T00:00:00Z",
              finishedAt: "2026-08-20T00:01:00Z",
              errorMessage: "timed out",
            },
          ],
        }}
      />
    );

    expect(screen.getByText("producthunt")).toBeTruthy();
    expect(screen.getByText("FAILED")).toBeTruthy();
  });
});

describe("ListPage date filter", () => {
  it("requests items with the selected start and end date", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2026-01-01" } });
    fireEvent.change(screen.getByLabelText("종료일"), { target: { value: "2026-01-31" } });
    fireEvent.click(screen.getByRole("button", { name: "필터" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const lastRequestUrl = fetchMock.mock.calls[1][0] as string;
    expect(lastRequestUrl).toContain("startAt=2026-01-01");
    expect(lastRequestUrl).toContain("endAt=2026-01-31");
  });
});
