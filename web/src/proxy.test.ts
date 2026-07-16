import { describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import {
  isUnauthenticatedApiRequest,
  isUnauthenticatedProtectedPage,
  unauthorizedApiResponse,
} from "@/proxy";

describe("AuthKit proxy authorization boundary", () => {
  test("identifies an unauthenticated API request and builds a JSON 401", async () => {
    const request = new NextRequest("http://localhost:5333/api/recipes");
    const response = unauthorizedApiResponse();

    expect(isUnauthenticatedApiRequest(request, null)).toBe(true);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  test("does not classify pages or authenticated APIs as unauthorized API requests", () => {
    expect(
      isUnauthenticatedApiRequest(
        new NextRequest("http://localhost:5333/recipes?tag=dinner"),
        null,
      ),
    ).toBe(false);
    expect(
      isUnauthenticatedApiRequest(new NextRequest("http://localhost:5333/api/recipes"), {
        id: "user_workos",
      }),
    ).toBe(false);
  });

  test("classifies protected pages without treating public or authenticated pages as protected", () => {
    expect(
      isUnauthenticatedProtectedPage(
        new NextRequest("http://localhost:5333/recipes/new?from=planner"),
        null,
      ),
    ).toBe(true);
    expect(
      isUnauthenticatedProtectedPage(new NextRequest("http://localhost:5333/recipes"), {
        id: "user_workos",
      }),
    ).toBe(false);
    expect(
      isUnauthenticatedProtectedPage(new NextRequest("http://localhost:5333/"), null),
    ).toBe(false);
  });
});
