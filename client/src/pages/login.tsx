import { useState } from "react";
import { useLocation } from "wouter";
import { useLang, type DictKey } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { Layout, BrandMark } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SECRET_QUESTIONS } from "@/lib/constants";
import { Loader2, ArrowLeft, Mail, ShieldQuestion } from "lucide-react";

type ForgotStep = "email" | "sent" | "questions" | "done";

export default function Login() {
  const { t } = useLang();
  const { login, register, updateUser } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regQ1, setRegQ1] = useState("");
  const [regA1, setRegA1] = useState("");
  const [regQ2, setRegQ2] = useState("");
  const [regA2, setRegA2] = useState("");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(false);
  const [tab, setTab] = useState("login");

  // Forgot-password flow state
  const [forgot, setForgot] = useState(false);
  const [fStep, setFStep] = useState<ForgotStep>("email");
  const [fEmail, setFEmail] = useState("");
  const [fQuestions, setFQuestions] = useState<DictKey[]>([]);
  const [fA1, setFA1] = useState("");
  const [fA2, setFA2] = useState("");
  const [fPassword, setFPassword] = useState("");
  const [fConfirm, setFConfirm] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(loginEmail, loginPassword, remember);
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
    if (regQ1 === regQ2) {
      toast({ title: t("secretSameQuestion"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const result = await register(regName, regEmail, regPassword, {
        secretQ1: regQ1,
        secretA1: regA1,
        secretQ2: regQ2,
        secretA2: regA2,
      });
      const title = result.autoApproved ? t("registerAutoApproved") : t("registerSuccess");
      toast({
        title,
        description: result.emailSent ? t("registerEmailSent") : undefined,
      });
      if (result.loggedIn) {
        // Signed in directly — try to pull photo & title from the gobi.vc team page
        try {
          const res = await apiRequest("POST", "/api/profile/sync-gobi", { name: regName.trim() });
          const data = await res.json();
          updateUser(data.user);
          toast({ title: t("syncGobiDone"), description: `${data.matched.name} — ${data.matched.title}` });
        } catch (syncErr: any) {
          const m = String(syncErr?.message ?? "");
          if (m.includes("not_found_on_gobi")) toast({ title: t("syncGobiNotFound") });
        }
        return;
      }
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

  const forgotByEmail = async () => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot", { email: fEmail });
      const data = await res.json();
      if (!data.emailConfigured) {
        toast({ title: t("forgotEmailUnavailable") });
      } else {
        setFStep("sent");
      }
    } catch {
      toast({ title: t("forgotEmailUnavailable"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const forgotByQuestions = async () => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/auth/forgot/questions", { email: fEmail });
      const data = await res.json();
      setFQuestions((data.questions ?? []) as DictKey[]);
      setFStep("questions");
    } catch {
      toast({ title: t("forgotNoQuestions"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const submitAnswers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fPassword !== fConfirm) {
      toast({ title: t("passwordMismatch"), variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await apiRequest("POST", "/api/auth/reset", {
        email: fEmail,
        answers: [fA1, fA2],
        password: fPassword,
      });
      toast({ title: t("resetSuccess") });
      setForgot(false);
      setFStep("email");
      setLoginEmail(fEmail);
      setFA1(""); setFA2(""); setFPassword(""); setFConfirm("");
    } catch {
      toast({ title: t("resetWrongAnswers"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const questionSelect = (
    value: string,
    onChange: (v: string) => void,
    exclude: string,
    testid: string,
  ) => (
    <Select value={value} onValueChange={onChange} required>
      <SelectTrigger data-testid={testid}>
        <SelectValue placeholder={t("secretQuestionPick")} />
      </SelectTrigger>
      <SelectContent>
        {SECRET_QUESTIONS.filter((q) => q !== exclude).map((q) => (
          <SelectItem key={q} value={q}>{t(q)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-16">
        <Card>
          <CardHeader className="items-center text-center">
            <BrandMark className="h-12 w-12 mb-2" />
            <CardTitle className="text-lg">{forgot ? t("forgotTitle") : t("loginTitle")}</CardTitle>
            <CardDescription>{forgot ? t("forgotBody") : t("loginBody")}</CardDescription>
          </CardHeader>
          <CardContent>
            {forgot ? (
              <div className="space-y-4">
                {fStep === "email" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="forgot-email">{t("email")}</Label>
                      <Input
                        id="forgot-email" type="email" required value={fEmail}
                        onChange={(e) => setFEmail(e.target.value)}
                        data-testid="input-forgot-email"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Button
                        onClick={forgotByEmail}
                        disabled={busy || !fEmail}
                        className="w-full bg-[hsl(193,52%,38%)] hover:bg-[hsl(193,52%,30%)] text-white"
                        data-testid="button-forgot-email"
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                        {t("forgotByEmail")}
                      </Button>
                      <Button
                        onClick={forgotByQuestions}
                        disabled={busy || !fEmail}
                        variant="outline"
                        className="w-full"
                        data-testid="button-forgot-questions"
                      >
                        <ShieldQuestion className="h-4 w-4 mr-2" />
                        {t("forgotByQuestions")}
                      </Button>
                    </div>
                  </>
                )}

                {fStep === "sent" && (
                  <p className="text-sm text-muted-foreground" data-testid="text-forgot-sent">
                    {t("forgotEmailSent")}
                  </p>
                )}

                {fStep === "questions" && (
                  <form onSubmit={submitAnswers} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label>{fQuestions[0] ? t(fQuestions[0]) : ""}</Label>
                      <Input
                        required value={fA1} onChange={(e) => setFA1(e.target.value)}
                        data-testid="input-answer-1"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>{fQuestions[1] ? t(fQuestions[1]) : ""}</Label>
                      <Input
                        required value={fA2} onChange={(e) => setFA2(e.target.value)}
                        data-testid="input-answer-2"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-new-pw">{t("newPassword")}</Label>
                      <Input
                        id="f-new-pw" type="password" required minLength={6} value={fPassword}
                        onChange={(e) => setFPassword(e.target.value)}
                        data-testid="input-new-password"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="f-confirm-pw">{t("confirmPassword")}</Label>
                      <Input
                        id="f-confirm-pw" type="password" required minLength={6} value={fConfirm}
                        onChange={(e) => setFConfirm(e.target.value)}
                        data-testid="input-confirm-password"
                      />
                    </div>
                    <Button
                      type="submit" disabled={busy}
                      className="w-full bg-[hsl(193,52%,38%)] hover:bg-[hsl(193,52%,30%)] text-white"
                      data-testid="button-submit-answers"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {t("resetSubmit")}
                    </Button>
                  </form>
                )}

                <Button
                  variant="ghost" className="w-full" disabled={busy}
                  onClick={() => { setForgot(false); setFStep("email"); }}
                  data-testid="button-back-to-login"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  {t("backToSignIn")}
                </Button>
              </div>
            ) : (
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
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                        className="h-4 w-4 rounded border-input accent-[hsl(193,52%,38%)]"
                        data-testid="checkbox-remember-me"
                      />
                      {t("rememberMe")}
                    </label>
                    <Button type="submit" className="w-full" disabled={busy} data-testid="button-submit-login">
                      {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {t("signIn")}
                    </Button>
                    <button
                      type="button"
                      className="block w-full text-center text-sm text-[hsl(193,52%,38%)] hover:underline"
                      onClick={() => { setForgot(true); setFEmail(loginEmail); }}
                      data-testid="link-forgot-password"
                    >
                      {t("forgotPassword")}
                    </button>
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

                    <div className="rounded-md border border-border p-3 space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {t("secretQuestionsTitle")}
                      </p>
                      <div className="space-y-1.5">
                        <Label>{t("secretQuestion1")}</Label>
                        {questionSelect(regQ1, setRegQ1, regQ2, "select-secret-q1")}
                        <Input
                          required placeholder={t("secretAnswer")} value={regA1}
                          onChange={(e) => setRegA1(e.target.value)}
                          data-testid="input-secret-a1"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>{t("secretQuestion2")}</Label>
                        {questionSelect(regQ2, setRegQ2, regQ1, "select-secret-q2")}
                        <Input
                          required placeholder={t("secretAnswer")} value={regA2}
                          onChange={(e) => setRegA2(e.target.value)}
                          data-testid="input-secret-a2"
                        />
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground">{t("pendingApproval")}</p>
                    <Button
                      type="submit" className="w-full"
                      disabled={busy || !regQ1 || !regQ2}
                      data-testid="button-submit-register"
                    >
                      {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {t("createAccount")}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
