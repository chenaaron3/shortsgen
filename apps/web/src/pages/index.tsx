import { signIn, signOut, useSession } from "next-auth/react";
import Head from "next/head";
import Link from "next/link";
import { RunList } from "~/components/list/RunList";
import { Button } from "~/components/ui/button";

export default function Home() {
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
      <>
        <Head>
          <title>Shortgen | Create Short Videos</title>
          <meta name="description" content="Create faceless short videos from your content" />
        </Head>
        <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-foreground">
          <h1 className="text-3xl font-bold">Shortgen</h1>
          <p className="text-muted-foreground">Sign in to create and manage your short videos.</p>
          <Button onClick={() => void signIn()} size="lg">
            Sign in
          </Button>
        </main>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Shortgen | Your Runs</title>
        <meta name="description" content="Create faceless short videos from your content" />
      </Head>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto max-w-3xl">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Your Runs</h1>
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">{session.user?.name}</span>
              <Link href="/create">
                <Button size="lg">Create video</Button>
              </Link>
              <Button variant="outline" size="sm" onClick={() => void signOut()}>
                Sign out
              </Button>
            </div>
          </div>
          <RunList />
        </div>
      </main>
    </>
  );
}
