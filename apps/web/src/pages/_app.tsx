import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { type AppType } from "next/app";
import { Geist } from "next/font/google";
import Head from "next/head";
import { useRouter } from "next/router";
import { Toaster } from "sonner";

import { Navbar } from "~/components/layouts/Navbar";
import { api } from "~/utils/api";

import "~/styles/globals.css";

/** Variable + class on wrapper; :root --font-geist-sans so portals (shadcn Select, etc.) match Geist. */
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

function AppContent({
  Component,
  pageProps,
}: {
  Component: React.ComponentType<Record<string, unknown>>;
  pageProps: Record<string, unknown>;
}) {
  const router = useRouter();
  const isRunsPage = router.pathname.startsWith("/runs/");
  const isAuthPage = router.pathname === "/login";
  const shouldShowNavbar = !isRunsPage && !isAuthPage;

  return (
    <>
      {shouldShowNavbar && <Navbar />}
      <Component {...pageProps} />
    </>
  );
}

const MyApp: AppType<{ session: Session | null }> = ({
  Component,
  pageProps: { session, ...pageProps },
}) => {
  return (
    <SessionProvider session={session}>
      <Head>
        <style
          dangerouslySetInnerHTML={{
            __html: `:root { --font-geist-sans: ${geist.style.fontFamily}; }`,
          }}
        />
      </Head>
      <div className={`${geist.variable} ${geist.className}`}>
        <AppContent Component={Component} pageProps={pageProps} />
      </div>
      <Toaster richColors />
    </SessionProvider>
  );
};

export default api.withTRPC(MyApp);
