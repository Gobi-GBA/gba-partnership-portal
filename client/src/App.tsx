import { lazy, Suspense } from "react";
import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LangProvider } from "@/lib/i18n";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/shared";
import { ThankYouHost } from "@/components/thank-you";
import Login from "@/pages/login";
import Reset from "@/pages/reset";

// v6.01 — route-level code splitting. Only the sign-in screen ships in the
// first bundle; every page behind the login loads on demand (d3 graphs, the
// advisor CRM and admin tooling stay out of the initial download).
const Home = lazy(() => import("@/pages/home"));
const Network = lazy(() => import("@/pages/network"));
const HallOfFame = lazy(() => import("@/pages/hall-of-fame"));
const Submit = lazy(() => import("@/pages/submit"));
const Admin = lazy(() => import("@/pages/admin"));
const Updates = lazy(() => import("@/pages/updates"));
const Advisors = lazy(() => import("@/pages/advisors"));
const RdPlanner = lazy(() => import("@/pages/rd-planner"));
const Scoreboard = lazy(() => import("@/pages/scoreboard"));
const NotFound = lazy(() => import("@/pages/not-found"));

function PageFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background" data-testid="screen-page-loading">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(193,52%,38%)] border-t-transparent" />
    </div>
  );
}

function AppRouter() {
  const { user, restoring } = useAuth();
  const [location] = useLocation();
  // Remember me: while a saved session is being restored, show a quiet
  // splash instead of flashing the login page.
  if (!user && restoring) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background" data-testid="screen-restoring">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[hsl(193,52%,38%)] border-t-transparent" />
      </div>
    );
  }
  // Login-first flow: nothing is visible until the user signs in.
  // Exception: the emailed password-reset link must work while signed out.
  if (!user) return location.startsWith("/reset") ? <Reset /> : <Login />;
  return (
    <Suspense fallback={<PageFallback />}>
    <Switch>
      <Route path="/">{() => <Home />}</Route>
      <Route path="/partner/:id">{() => <Home />}</Route>
      <Route path="/network" component={Network} />
      <Route path="/hall-of-fame" component={HallOfFame} />
      <Route path="/submit" component={Submit} />
      <Route path="/login" component={Login} />
      <Route path="/reset" component={Reset} />
      <Route path="/updates" component={Updates} />
      <Route path="/advisors" component={Advisors} />
      <Route path="/advisors/:id" component={Advisors} />
      <Route path="/scoreboard" component={Scoreboard} />
      <Route path="/rd" component={RdPlanner} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LangProvider>
          <AuthProvider>
            <TooltipProvider>
              <Toaster />
              <ThankYouHost />
              <Router hook={useHashLocation}>
                <AppRouter />
              </Router>
            </TooltipProvider>
          </AuthProvider>
        </LangProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
