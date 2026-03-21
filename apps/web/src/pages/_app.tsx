import { type Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { type AppType } from "next/app";
import { Geist } from "next/font/google";
import { useRouter } from "next/router";
import { Toaster } from "sonner";

import { Navbar } from "~/components/layouts/Navbar";
import { api } from "~/utils/api";

import "~/styles/globals.css";

const geist = Geist({
  subsets: ["latin"],
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

  return (
    <>
      {!isRunsPage && <Navbar />}
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
      <div className={geist.className}>
        <AppContent Component={Component} pageProps={pageProps} />
      </div>
      <Toaster richColors />
    </SessionProvider>
  );
};

export default api.withTRPC(MyApp);
