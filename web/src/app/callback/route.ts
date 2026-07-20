import { handleAuth } from "@workos-inc/authkit-nextjs";

const redirectUri = process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI;
const baseURL = redirectUri ? new URL(redirectUri).origin : undefined;

export const GET = handleAuth({ baseURL });
