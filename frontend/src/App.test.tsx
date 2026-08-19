import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RunDetailPage } from "./App";

describe("RunDetailPage", () => {
  it("renders a failed channel in run detail", () => {
    render(
      <RunDetailPage
        run={{
          id: 1,
          jobKey: "fetch-all",
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
