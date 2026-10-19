import { Suspense } from "react";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import SignInForm from "./SignInForm";

async function SignInContent() {
  const { userId } = await auth();

  if (userId) {
    redirect("/");
  }

  return <SignInForm />;
}

export default function SignInPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p>Loading Finatyx sign-in...</p>
        </main>
      }
    >
      <SignInContent />
    </Suspense>
  );
}
