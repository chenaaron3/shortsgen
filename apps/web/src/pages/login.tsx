"use client";

import { motion } from 'framer-motion';
import { ArrowLeft, Sparkles, WandSparkles } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect } from 'react';
import { Button } from '~/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '~/components/ui/card';
import { HoverBorderGradient } from '~/components/ui/hover-border-gradient';

function GoogleIcon() {
  return (
    <svg
      className="h-5 w-5"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
}

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const callbackUrl =
    (router.query.callbackUrl as string) ??
    (router.query.from as string) ??
    "/";

  useEffect(() => {
    if (status === "authenticated") {
      void router.replace(callbackUrl);
    }
  }, [status, callbackUrl, router]);

  if (status === "loading" || status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Redirecting…</p>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Sign in | Shortgen</title>
        <meta
          name="description"
          content="Sign in to Shortgen to create short videos from your content."
        />
      </Head>
      <main className="relative min-h-screen overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute -left-32 top-16 h-80 w-80 rounded-full bg-primary/15 blur-3xl"
            animate={{ x: [0, 24, 0], y: [0, -20, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.div
            className="absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl"
            animate={{ x: [0, -20, 0], y: [0, 26, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>

        <Link
          href="/"
          className="absolute left-4 top-4 z-10 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="relative z-10 mx-auto grid min-h-screen w-full max-w-6xl grid-cols-1 gap-8 px-4 py-16 md:grid-cols-2 md:items-center">
          <motion.section
            className="hidden md:block"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: "easeOut" }}
          >
            <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              AI-powered short video generation
            </p>
            <h1 className="max-w-md text-4xl font-semibold tracking-tight text-foreground">
              Turn your content into publish-ready shorts.
            </h1>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              Sign in to create scripts, imagery, voiceovers, and exports from one
              workflow.
            </p>

            <HoverBorderGradient
              containerClassName="mt-8 max-w-md"
              className="rounded-xl border border-border/70 bg-card/80 p-5 backdrop-blur-sm"
              duration={2.2}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary">
                  <WandSparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Smart scene generation
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    From one source, generate scenes with visuals and narration in
                    minutes.
                  </p>
                </div>
              </div>
            </HoverBorderGradient>
          </motion.section>

          <motion.section
            className="mx-auto w-full max-w-sm"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
          >
            <div className="mb-8 text-center">
              <div className="text-2xl font-bold">
                Shortgen
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Create short videos from your content
              </p>
            </div>

            <Card className="border-border/70 bg-card/90 shadow-lg shadow-primary/5">
              <CardHeader className="space-y-1 text-center">
                <CardTitle className="text-xl">Welcome back</CardTitle>
                <CardDescription>
                  Sign in with your Google account to get started.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full gap-2"
                  variant="outline"
                  onClick={() =>
                    void signIn("google", { callbackUrl })
                  }
                >
                  <GoogleIcon />
                  Sign in with Google
                </Button>
              </CardContent>
            </Card>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              By signing in, you agree to our terms of service and privacy policy.
            </p>
          </motion.section>
        </div>
      </main>
    </>
  );
}
