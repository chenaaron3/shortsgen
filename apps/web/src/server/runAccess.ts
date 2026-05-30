import { isAdminSessionUser } from "~/server/isAdminUser";

/** Run owner or admin (ADMIN_EMAILS). */
export function canAccessRunAsViewer(
  user: { id: string; email?: string | null },
  runUserId: string,
) {
  return runUserId === user.id || isAdminSessionUser(user);
}
