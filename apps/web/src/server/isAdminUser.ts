import { env } from "~/env";

/** True when the user's email is listed in ADMIN_EMAILS (comma-separated). */
export function isAdminSessionUser(user: { email?: string | null }): boolean {
  const emails = env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return (
    emails.length > 0 &&
    !!user.email &&
    emails.includes(user.email.toLowerCase())
  );
}
