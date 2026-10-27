
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isBackendApiRoute = createRouteMatcher([
  "/api/backend(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // Backend API handlers perform their own authentication checks.
  // Let unauthenticated requests reach those handlers so they can
  // return JSON 401 responses instead of HTML redirects.
  if (isBackendApiRoute(request)) {
    return;
  }

  // Protect all other non-public application routes.
  if (!isPublicRoute(request)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|woff2?|ttf|map)).*)",
    "/(api|trpc)(.*)",
  ],
};
