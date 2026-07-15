import { Switch, Route, Router, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LangProvider } from "@/lib/i18n";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/components/shared";
import Home from "@/pages/home";
import Network from "@/pages/network";
import HallOfFame from "@/pages/hall-of-fame";
import Submit from "@/pages/submit";
import Login from "@/pages/login";
import Reset from "@/pages/reset";
import Admin from "@/pages/admin";
import Updates from "@/pages/updates";
import Advisors from "@/pages/advisors";
import NotFound from "@/pages/not-found";

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
    <Switch>
      <Route path="/">{() => <Home />}</Route>
      <Route path="/network" component={Network} />
      <Route path="/hall-of-fame" component={HallOfFame} />
      <Route path="/submit" component={Submit} />
      <Route path="/login" component={Login} />
      <Route path="/reset" component={Reset} />
      <Route path="/updates" component={Updates} />
      <Route path="/advisors" component={Advisors} />
      <Route path="/admin" component={Admin} />
      <Route component={NotFound} />
    </Switch>
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
