import { handleAuth } from "@workos-inc/authkit-nextjs";
import { NextRequest, NextResponse } from "next/server";

const authHandler = handleAuth({ returnPathname: "/" });

export async function GET(request: NextRequest) {
  if (!request.nextUrl.searchParams.get("code")) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  try {
    const response = await authHandler(request);
    if (response.status < 400) {
      return response;
    }
  } catch (error) {
    console.error("WorkOS callback failed.", error);
  }

  return NextResponse.redirect(new URL("/", request.url));
}
