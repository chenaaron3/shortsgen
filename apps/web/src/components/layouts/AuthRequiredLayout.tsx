"use client";

import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { Button } from "~/components/ui/button";

interface AuthRequiredLayoutProps {
  children: React.ReactNode;
}

export function AuthRequiredLayout({ children }: AuthRequiredLayoutProps) {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
        <p>Sign in to edit runs.</p>
        <Button onClick={() => void signIn()} variant="secondary">
          Sign in
        </Button>
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          ← Back
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
