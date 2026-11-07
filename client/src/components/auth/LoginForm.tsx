"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/features/authentication/AuthContext";
import { MfaLoginChallenge, MfaFactor, User } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertCircle,
  Lock,
  Mail,
  Sparkles,
  ShieldCheck,
  Smartphone,
  KeyRound,
  ArrowLeft,
  RotateCw,
} from "lucide-react";
import { BrandIcon } from "@/components/brand/BrandLogo";

const loginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const {
    login,
    verifyMfaOtp,
    verifyMfaTotp,
    verifyMfaRecovery,
    resendMfaOtp,
    switchMfaFactor,
  } = useAuth();

  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // MFA Challenge State
  const [mfaChallenge, setMfaChallenge] = useState<MfaLoginChallenge | null>(null);
  const [activeFactor, setActiveFactor] = useState<MfaFactor>("TOTP");
  const [mfaCode, setMfaCode] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  // Countdown timer for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const redirectUser = (user: User) => {
    if (user.role === "ORGANIZER") {
      router.push("/organizer/dashboard");
    } else {
      router.push("/attendee/registrations");
    }
  };

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setServerError(null);
    try {
      const result = await login(data);
      if (result.mfa) {
        setMfaChallenge(result.mfa);
        setActiveFactor(result.mfa.factor);
        setMfaCode("");
        if (result.mfa.factor === "EMAIL_OTP") {
          setResendCooldown(60);
        }
      } else if (result.user) {
        redirectUser(result.user);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setServerError(
        error.message || "Failed to sign in. Please verify your credentials."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge || !mfaCode.trim()) return;

    setIsLoading(true);
    setServerError(null);

    try {
      let user: User;
      if (activeFactor === "EMAIL_OTP") {
        user = await verifyMfaOtp({
          challengeId: mfaChallenge.challengeId,
          otp: mfaCode.trim(),
        });
      } else if (activeFactor === "TOTP") {
        user = await verifyMfaTotp({
          challengeId: mfaChallenge.challengeId,
          code: mfaCode.trim(),
        });
      } else {
        user = await verifyMfaRecovery({
          challengeId: mfaChallenge.challengeId,
          recoveryCode: mfaCode.trim(),
        });
      }

      redirectUser(user);
    } catch (err: unknown) {
      const error = err as Error;
      setServerError(
        error.message || "Authentication failed. Please verify your code."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (!mfaChallenge || resendCooldown > 0 || isResending) return;
    setIsResending(true);
    setServerError(null);
    try {
      await resendMfaOtp(mfaChallenge.challengeId);
      setResendCooldown(60);
    } catch (err: unknown) {
      const error = err as Error;
      setServerError(error.message || "Failed to resend verification code.");
    } finally {
      setIsResending(false);
    }
  };

  const handleFactorSwitch = async (factor: MfaFactor) => {
    if (!mfaChallenge || factor === activeFactor) return;
    setIsLoading(true);
    setServerError(null);
    setMfaCode("");
    try {
      await switchMfaFactor({
        challengeId: mfaChallenge.challengeId,
        factor,
      });
      setActiveFactor(factor);
      if (factor === "EMAIL_OTP") {
        setResendCooldown(60);
      }
    } catch (err: unknown) {
      const error = err as Error;
      setServerError(error.message || "Failed to switch authentication method.");
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemoAccount = (role: "ORGANIZER" | "ATTENDEE") => {
    if (role === "ORGANIZER") {
      setValue("email", "organizer@eventora.demo");
      setValue("password", "Organizer@123");
    } else {
      setValue("email", "attendee@eventora.demo");
      setValue("password", "Attendee@123");
    }
  };

  // -------------------------------------------------------------
  // RENDER: MFA CHALLENGE RESOLUTION SCREEN
  // -------------------------------------------------------------
  if (mfaChallenge) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6 py-12">
        <div className="w-full max-w-md space-y-6">
          <Card className="border-border/60 shadow-lg">
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-2">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Two-Factor Authentication
              </CardTitle>
              <CardDescription className="text-xs">
                {activeFactor === "EMAIL_OTP" && (
                  <>Enter the 6-digit code sent to <strong className="text-foreground">{mfaChallenge.maskedEmail}</strong></>
                )}
                {activeFactor === "TOTP" && (
                  <>Enter the 6-digit code from your authenticator app</>
                )}
                {activeFactor === "RECOVERY_CODE" && (
                  <>Enter one of your 10-character emergency recovery codes</>
                )}
              </CardDescription>
            </CardHeader>

            <form onSubmit={onMfaSubmit}>
              <CardContent className="space-y-4">
                {/* Server Error Alert */}
                {serverError && (
                  <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{serverError}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="relative">
                    {activeFactor === "EMAIL_OTP" && (
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    )}
                    {activeFactor === "TOTP" && (
                      <Smartphone className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    )}
                    {activeFactor === "RECOVERY_CODE" && (
                      <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    )}

                    <Input
                      type="text"
                      inputMode={activeFactor === "RECOVERY_CODE" ? "text" : "numeric"}
                      placeholder={activeFactor === "RECOVERY_CODE" ? "XXXXX-XXXXX" : "000000"}
                      maxLength={activeFactor === "RECOVERY_CODE" ? 12 : 6}
                      autoFocus
                      required
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.toUpperCase())}
                      className="pl-9 text-center font-mono text-lg tracking-widest uppercase"
                      disabled={isLoading}
                    />
                  </div>

                  {activeFactor === "EMAIL_OTP" && (
                    <div className="flex items-center justify-between text-xs pt-1">
                      <span className="text-muted-foreground">Didn&apos;t receive code?</span>
                      <button
                        type="button"
                        onClick={handleResendOtp}
                        disabled={resendCooldown > 0 || isResending}
                        className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline flex items-center gap-1"
                      >
                        {isResending ? (
                          <RotateCw className="h-3 w-3 animate-spin" />
                        ) : null}
                        {resendCooldown > 0
                          ? `Resend in ${resendCooldown}s`
                          : "Resend Code"}
                      </button>
                    </div>
                  )}
                </div>

                {/* Alternate Factor Switcher */}
                {mfaChallenge.availableFactors.length > 1 && (
                  <div className="border-t border-border/60 pt-4 space-y-2">
                    <p className="text-xs text-muted-foreground text-center font-medium">
                      Or verify another way:
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      {mfaChallenge.availableFactors
                        .filter((f) => f !== activeFactor)
                        .map((f) => (
                          <Button
                            key={f}
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleFactorSwitch(f)}
                            className="text-xs h-8 gap-1.5"
                          >
                            {f === "EMAIL_OTP" && <Mail className="h-3 w-3" />}
                            {f === "TOTP" && <Smartphone className="h-3 w-3" />}
                            {f === "RECOVERY_CODE" && <KeyRound className="h-3 w-3" />}
                            {f === "EMAIL_OTP" && "Email Code"}
                            {f === "TOTP" && "Authenticator App"}
                            {f === "RECOVERY_CODE" && "Recovery Code"}
                          </Button>
                        ))}
                    </div>
                  </div>
                )}
              </CardContent>

              <CardFooter className="flex flex-col space-y-3">
                <Button
                  type="submit"
                  className="w-full font-semibold"
                  disabled={isLoading || !mfaCode.trim()}
                >
                  {isLoading ? "Verifying..." : "Verify & Sign In"}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMfaChallenge(null);
                    setMfaCode("");
                    setServerError(null);
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground gap-1.5"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: STANDARD EMAIL & PASSWORD LOGIN SCREEN
  // -------------------------------------------------------------
  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <Card className="border-border/60 shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <BrandIcon className="mx-auto h-12 w-12 mb-2" />
            <CardTitle className="text-2xl font-bold tracking-tight">
              Welcome back
            </CardTitle>
            <CardDescription className="text-xs">
              Enter your credentials or choose a demo persona below
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Server Error Alert */}
            {serverError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            )}

            {/* Quick Demo Credentials Autofill */}
            <div className="rounded-lg border border-border/80 bg-muted/40 p-3 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>One-Click Demo Personas</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fillDemoAccount("ORGANIZER")}
                  className="w-full text-xs h-8 border-border/60 hover:bg-background"
                >
                  Organizer Demo
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fillDemoAccount("ATTENDEE")}
                  className="w-full text-xs h-8 border-border/60 hover:bg-background"
                >
                  Attendee Demo
                </Button>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Email address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    disabled={isLoading}
                    {...register("email")}
                    className={`pl-9 ${
                      errors.email ? "border-destructive focus-visible:ring-destructive" : ""
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="password"
                    className="text-xs font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={isLoading}
                    {...register("password")}
                    className={`pl-9 ${
                      errors.password
                        ? "border-destructive focus-visible:ring-destructive"
                        : ""
                    }`}
                  />
                </div>
                {errors.password && (
                  <p className="text-xs text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full font-semibold"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex flex-col space-y-2 text-center text-xs text-muted-foreground">
            <div>
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
              >
                Create one now
              </Link>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
