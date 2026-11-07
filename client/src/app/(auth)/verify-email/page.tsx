"use client";

import React, { useState, useEffect, Suspense, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
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
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Loader2,
  ArrowRight,
  RotateCw,
  AlertCircle,
} from "lucide-react";
import { BrandIcon } from "@/components/brand/BrandLogo";

type VerificationStatus = "VERIFYING" | "SUCCESS" | "EXPIRED" | "INVALID" | "IDLE";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const { user, refetchUser } = useAuth();

  const emailParam = searchParams.get("email") || "";
  const isJustRegistered = searchParams.get("registered") === "true";

  const [status, setStatus] = useState<VerificationStatus>(token ? "VERIFYING" : "IDLE");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [resendEmail, setResendEmail] = useState<string>(emailParam || user?.email || "");
  const [resendCooldown, setResendCooldown] = useState<number>(isJustRegistered ? 60 : 0);
  const [isResending, setIsResending] = useState<boolean>(false);
  const [directVerifyUrl, setDirectVerifyUrl] = useState<string | null>(null);
  const [resendFeedback, setResendFeedback] = useState<string | null>(
    isJustRegistered
      ? "A verification link has just been sent to your email. Please check your inbox (and spam folder)."
      : null
  );

  useEffect(() => {
    if (emailParam && !resendEmail) {
      setResendEmail(emailParam);
    }
  }, [emailParam, resendEmail]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const verifyToken = useCallback(async (rawToken: string) => {
    setStatus("VERIFYING");
    setErrorMessage("");

    try {
      await api.post("/auth/verify-email", { token: rawToken.trim() });
      setStatus("SUCCESS");
      if (user) {
        refetchUser();
      }
    } catch (err: unknown) {
      const error = err as Error;
      const msg = error.message || "";
      if (msg.toLowerCase().includes("expired")) {
        setStatus("EXPIRED");
        setErrorMessage("This email verification link has expired. Verification links are valid for 30 minutes.");
      } else {
        setStatus("INVALID");
        setErrorMessage(msg || "This verification link is invalid or has already been used.");
      }
    }
  }, [user, refetchUser]);

  useEffect(() => {
    if (token) {
      verifyToken(token);
    }
  }, [token, verifyToken]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim() || resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setResendFeedback(null);
    setDirectVerifyUrl(null);
    try {
      const res = await api.post<{ message: string; data?: { verifyUrl?: string } }>("/auth/resend-verification", {
        email: resendEmail.trim(),
      });
      const data = (res as any)?.data || res;
      const verifyUrl = data?.verifyUrl || (res as any)?.verifyUrl;
      setResendFeedback((res as any)?.message || "A new verification link has been dispatched to your email.");
      if (verifyUrl) {
        setDirectVerifyUrl(verifyUrl);
      }
      setResendCooldown(60);
    } catch (err: unknown) {
      const error = err as Error;
      setResendFeedback(error.message || "Unable to resend verification email. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <Card className="border-border/60 shadow-lg text-center">
          <CardHeader className="space-y-2">
            <BrandIcon className="mx-auto h-12 w-12 mb-2" />

            {/* STATUS: VERIFYING */}
            {status === "VERIFYING" && (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  Verifying your email...
                </CardTitle>
                <CardDescription className="text-xs">
                  Validating your single-use verification token with the server.
                </CardDescription>
              </>
            )}

            {/* STATUS: SUCCESS */}
            {status === "SUCCESS" && (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-emerald-500">
                  Email Verified!
                </CardTitle>
                <CardDescription className="text-xs">
                  Your email address has been authoritative verified. All features, registrations, and event operations are now unlocked.
                </CardDescription>
              </>
            )}

            {/* STATUS: EXPIRED */}
            {status === "EXPIRED" && (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10 text-amber-500">
                  <Clock className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-amber-500">
                  Link Expired
                </CardTitle>
                <CardDescription className="text-xs">
                  {errorMessage}
                </CardDescription>
              </>
            )}

            {/* STATUS: INVALID */}
            {status === "INVALID" && (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <XCircle className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight text-destructive">
                  Invalid Link
                </CardTitle>
                <CardDescription className="text-xs">
                  {errorMessage}
                </CardDescription>
              </>
            )}

            {/* STATUS: IDLE (NO TOKEN) */}
            {status === "IDLE" && (
              <>
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Mail className="h-6 w-6" />
                </div>
                <CardTitle className="text-2xl font-bold tracking-tight">
                  Verify your email
                </CardTitle>
                <CardDescription className="text-xs">
                  We sent a verification link to your email address when you registered. Click the link in the email to activate your account.
                </CardDescription>
              </>
            )}
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Success Actions */}
            {status === "SUCCESS" && (
              <div className="pt-2 space-y-3">
                <Link href={user?.role === "ORGANIZER" ? "/organizer/dashboard" : "/events"}>
                  <Button className="w-full font-semibold gap-1.5">
                    {user?.role === "ORGANIZER" ? "Go to Organizer Dashboard" : "Browse Events & RSVP"}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            )}

            {/* Resend Form for EXPIRED, INVALID, or IDLE states */}
            {status !== "SUCCESS" && status !== "VERIFYING" && (
              <div className="border-t border-border/60 pt-4 text-left space-y-3">
                <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-primary" />
                  <span>Request a New Verification Link</span>
                </div>

                {resendFeedback && (
                  <div className="rounded-lg border border-primary/20 bg-primary/10 p-3 text-xs text-foreground flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                    <span>{resendFeedback}</span>
                  </div>
                )}

                <form onSubmit={handleResend} className="space-y-3">
                  <Input
                    type="email"
                    placeholder="Enter your account email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    required
                    disabled={isResending}
                    className="text-xs"
                  />

                  <Button
                    type="submit"
                    variant="outline"
                    className="w-full text-xs font-medium gap-1.5"
                    disabled={isResending || resendCooldown > 0 || !resendEmail.trim()}
                  >
                    {isResending ? (
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    {resendCooldown > 0
                      ? `Resend available in ${resendCooldown}s`
                      : "Send Verification Email"}
                  </Button>
                </form>

                {directVerifyUrl && (
                  <div className="pt-2">
                    <Link href={directVerifyUrl}>
                      <Button className="w-full text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white">
                        <CheckCircle2 className="h-4 w-4" />
                        Verify Account Instantly (Direct Link)
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-center border-t border-border/40 pt-4 text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground underline underline-offset-4">
              Return to Eventora Home
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}

