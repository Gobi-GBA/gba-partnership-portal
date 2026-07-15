import { Switch, Route, Router } from "wouter";
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
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";

function AppRouter() {
  const { user } = useAuth();
  // Login-first flow: nothing is visible until the user signs in
  if (!user) return <Login />;
  return (
    <Switch>
      <Route path="/">{() => <Home />}</Route>
      <Route path="/network" component={Network} />
      <Route path="/hall-of-fame" component={HallOfFame} />
      <Route path="/submit" component={Submit} />
      <Route path="/login" component={Login} />
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
