"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { Coins, CreditCard, LogOut } from "lucide-react";

import { useUserConfig } from "~/hooks/useUserConfig";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Button } from "~/components/ui/button";
import {
  AvatarRoot,
  AvatarFallback,
  AvatarImage,
} from "~/components/ui/avatar";
import { cn } from "~/lib/utils";

function ProfileMenu() {
  const { data: session, status } = useSession();
  const { creditsBalance, isLoading } = useUserConfig();

  if (status !== "authenticated" || !session.user) return null;

  const initial =
    session.user.name?.charAt(0)?.toUpperCase() ??
    session.user.email?.charAt(0)?.toUpperCase() ??
    "?";

  const menuLink =
    "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-muted";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "rounded-full ring-offset-background transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          )}
          aria-label="Profile menu"
        >
          <AvatarRoot className="h-8 w-8">
            {session.user.image ? (
              <AvatarImage src={session.user.image} alt={session.user.name ?? ""} />
            ) : (
              <AvatarFallback>{initial}</AvatarFallback>
            )}
          </AvatarRoot>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-1">
        <div className="mb-1 px-2 py-1.5">
          <p className="truncate text-sm font-medium">{session.user.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {session.user.email}
          </p>
        </div>
        <nav className="flex flex-col">
          <Link href="/billing" className={menuLink}>
            <Coins className="h-4 w-4 shrink-0" />
            <span>{isLoading ? "…" : `${creditsBalance} credits`}</span>
          </Link>
          <Link href="/billing" className={menuLink}>
            <CreditCard className="h-4 w-4 shrink-0" />
            Billing
          </Link>
          <div className="my-1 h-px bg-border" />
          <button
            className={menuLink}
            onClick={() => void signOut()}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </nav>
      </PopoverContent>
    </Popover>
  );
}

export function Navbar() {
  const { data: session, status } = useSession();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-card">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          Shortgen
        </Link>

        <nav className="flex items-center gap-6">
          <Link
            href="/pricing"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </Link>

          {status === "authenticated" && (
            <>
              <Link href="/create">
                <Button size="sm">Create video</Button>
              </Link>
              <ProfileMenu />
            </>
          )}

          {status === "unauthenticated" && (
            <Button size="sm" onClick={() => void signIn()}>
              Sign in
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
