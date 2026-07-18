import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  isUnauthenticatedApiRequest,
  isUnauthenticatedProtectedPage,
  unauthorizedApiResponse,
} from "@/proxy";

const TEST_APP_ORIGIN = process.env.PICKNIC_TEST_APP_ORIGIN ?? "https://picknic.test";

function appRequest(path: string) {
  return new NextRequest(new URL(path, TEST_APP_ORIGIN));
}

describe("AuthKit proxy authorization boundary", () => {
  test("identifies an unauthenticated API request and builds a JSON 401", async () => {
    const request = appRequest("/api/recipes");
    const response = unauthorizedApiResponse();

    expect(isUnauthenticatedApiRequest(request, null)).toBe(true);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("does not classify pages or authenticated APIs as unauthorized API requests", () => {
    expect(
      isUnauthenticatedApiRequest(
        appRequest("/recipes?tag=dinner"),
        null,
      ),
    ).toBe(false);
    expect(
      isUnauthenticatedApiRequest(appRequest("/api/recipes"), {
        id: "user_workos",
      }),
    ).toBe(false);
  });

  test("classifies protected pages without treating public or authenticated pages as protected", () => {
    expect(
      isUnauthenticatedProtectedPage(
        appRequest("/recipes/new?from=planner"),
        null,
      ),
    ).toBe(true);
    expect(
      isUnauthenticatedProtectedPage(appRequest("/recipes"), {
        id: "user_workos",
      }),
    ).toBe(false);
    expect(
      isUnauthenticatedProtectedPage(appRequest("/cook?date=2026-07-18"), null),
    ).toBe(true);
    expect(
      isUnauthenticatedProtectedPage(appRequest("/"), null),
    ).toBe(false);
  });
});
