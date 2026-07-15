import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useLang } from "@/lib/i18n";
import { Layout, BrandMark } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2 } from "lucide-react";

// Landing page for emailed reset links: /#/reset?token=...
export default function Reset() {
  const { t } = useLang();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // wouter's useHashLocation strips the query part — read it from the raw hash
  const token = useMemo(() => {
    const hash = window.location.hash; // e.g. #/reset?token=abc
    const qIdx = hash.indexOf("?");
    if (qIdx === -1) return "";
    return new URLSearchParams(hash.slice(qIdx + 1)).get("token") ?? "";
  }, []);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: t("passwordMismatch"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/auth/reset", { token, password });
      toast({ title: t("resetSuccess") });
      navigate("/login");
    } catch {
      toast({ title: t("resetInvalidToken"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader className="items-center text-center">
            <BrandMark className="h-12 w-12 mb-2" />
            <CardTitle className="text-lg">{t("forgotTitle")}</CardTitle>
            <CardDescription>{t("newPassword")}</CardDescription>
          </CardHeader>
          <CardContent>
            {token ? (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="reset-pw">{t("newPassword")}</Label>
                  <Input
                    id="reset-pw" type="password" required minLength={6} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    data-testid="input-reset-password"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reset-confirm">{t("confirmPassword")}</Label>
                  <Input
                    id="reset-confirm" type="password" required minLength={6} value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    data-testid="input-reset-confirm"
                  />
                </div>
                <Button
                  type="submit" disabled={busy}
                  className="w-full bg-[hsl(193,52%,38%)] hover:bg-[hsl(193,52%,30%)] text-white"
                  data-testid="button-reset-submit"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("resetSubmit")}
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground" data-testid="text-reset-invalid">
                {t("resetInvalidToken")}
              </p>
            )}
            <Button
              variant="ghost" className="w-full mt-3"
              onClick={() => navigate("/login")}
              data-testid="button-reset-back"
            >
              {t("backToSignIn")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
