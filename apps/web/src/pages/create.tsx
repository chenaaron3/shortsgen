import Head from "next/head";
import Link from "next/link";
import { CreateForm } from "~/components/create/CreateForm";

export default function CreatePage() {
  return (
    <>
      <Head>
        <title>Create Short | Shortgen</title>
      </Head>
      <main className="min-h-screen bg-background px-4 py-8 text-foreground">
        <div className="mx-auto max-w-2xl">
          <Link href="/" className="mb-6 inline-block text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <h1 className="mb-6 text-2xl font-bold">Create Short</h1>
          <CreateForm />
        </div>
      </main>
    </>
  );
}
