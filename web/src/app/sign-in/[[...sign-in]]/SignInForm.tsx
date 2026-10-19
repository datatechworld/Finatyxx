"use client";

import { Suspense } from "react";
import { SignIn } from "@clerk/nextjs";

export default function SignInForm() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-slate-900">Welcome to Finatyx</h1>
          <p className="mt-2 text-slate-500">Sign in to your business workspace.</p>
        </div>
        <Suspense fallback={<div className="rounded-xl bg-white p-8 text-center shadow-sm">Loading secure sign-in...</div>}>
          <SignIn routing="path" path="/sign-in" forceRedirectUrl="/" />
        </Suspense>
      </div>
    </main>
  );
}
