import { useState } from "react";
import { useLocation } from "wouter";
import { useLang } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Layout, BrandMark } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function Login() {
  const { t } = useLang();
  const { login, register } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("login");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginEmail, loginPassword);
      navigate("/");
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      if (msg.includes("pending_approval")) {
        toast({ title: t("pendingApproval") });
      } else if (msg.includes("account_rejected")) {
        toast({ title: t("accountRejected"), variant: "destructive" });
      } else {
        toast({ title: t("invalidCredentials"), variant: "destructive" });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(regName, regEmail, regPassword);
      toast({ title: t("registerSuccess") });
      setTab("login");
      setLoginEmail(regEmail);
    } catch (err: any) {
      const msg = String(err?.message ?? "");
      toast({
        title: msg.includes("409") ? "Email already registered / 邮箱已注册" : "Registration failed / 注册失败",
        variant: "destructive",
      });
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
            <CardTitle className="text-lg">{t("loginTitle")}</CardTitle>
            <CardDescription>{t("loginBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login" data-testid="tab-login">{t("loginTab")}</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register">{t("registerTab")}</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email">{t("email")}</Label>
                    <Input
                      id="login-email" type="email" required value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      data-testid="input-login-email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="login-password">{t("password")}</Label>
                    <Input
                      id="login-password" type="password" required value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      data-testid="input-login-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={busy} data-testid="button-submit-login">
                    {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {t("signIn")}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-name">{t("name")}</Label>
                    <Input
                      id="reg-name" required value={regName}
                      onChange={(e) => setRegName(e.target.value)}
                      data-testid="input-register-name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-email">{t("email")}</Label>
                    <Input
                      id="reg-email" type="email" required value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      data-testid="input-register-email"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password">{t("password")}</Label>
                    <Input
                      id="reg-password" type="password" required minLength={6} value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      data-testid="input-register-password"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t("pendingApproval")}</p>
                  <Button type="submit" className="w-full" disabled={busy} data-testid="button-submit-register">
                    {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    {t("createAccount")}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
