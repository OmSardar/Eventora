"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { api } from "@/lib/api";
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
  CheckCircle2,
  Lock,
  Mail,
  KeyRound,
  ArrowLeft,
  RotateCw,
  ShieldCheck,
  Check,
} from "lucide-react";
import { BrandIcon } from "@/components/brand/BrandLogo";

const requestOtpSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

const resetPasswordSchema = z
  .object({
    otp: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Verification code must be exactly 6 digits"),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password cannot exceed 128 characters")
      .regex(/[A-Z]/, "Must include at least one uppercase letter")
      .regex(/[a-z]/, "Must include at least one lowercase letter")
      .regex(/[0-9]/, "Must include at least one number")
      .regex(/[^A-Za-z0-9]/, "Must include at least one special character"),
    confirmPassword: z.string().min(1, "Please confirm your password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

type RequestOtpFormData = z.infer<typeof requestOtpSchema>;
type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export function ForgotPasswordForm() {
  const [step, setStep] = useState<"REQUEST_OTP" | "ENTER_OTP_AND_NEW_PASSWORD" | "SUCCESS">("REQUEST_OTP");
  const [targetEmail, setTargetEmail] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);

  // Resend countdown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  // Form 1: Request OTP
  const {
    register: registerRequest,
    handleSubmit: handleSubmitRequest,
    formState: { errors: errorsRequest },
  } = useForm<RequestOtpFormData>({
    resolver: zodResolver(requestOtpSchema),
  });

  // Form 2: Verify OTP and Reset Password
  const {
    register: registerReset,
    handleSubmit: handleSubmitReset,
    watch: watchReset,
    formState: { errors: errorsReset },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const newPasswordValue = watchReset("newPassword") || "";

  // Password rules validation for live checklist
  const passwordRules = [
    { label: "At least 8 characters", valid: newPasswordValue.length >= 8 },
    { label: "One uppercase letter", valid: /[A-Z]/.test(newPasswordValue) },
    { label: "One lowercase letter", valid: /[a-z]/.test(newPasswordValue) },
    { label: "One number", valid: /[0-9]/.test(newPasswordValue) },
    { label: "One special character", valid: /[^A-Za-z0-9]/.test(newPasswordValue) },
  ];

  const onRequestOtp = async (data: RequestOtpFormData) => {
    setIsLoading(true);
    setServerError(null);
    try {
      await api.post("/auth/forgot-password", { email: data.email });
      setTargetEmail(data.email);
      setStep("ENTER_OTP_AND_NEW_PASSWORD");
      setResendCooldown(60);
    } catch (err: any) {
      setServerError(err?.message || "Failed to send reset code. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isResending || !targetEmail) return;
    setIsResending(true);
    setServerError(null);
    try {
      await api.post("/auth/forgot-password", { email: targetEmail });
      setResendCooldown(60);
    } catch (err: any) {
      setServerError(err?.message || "Failed to resend code. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const onResetPassword = async (data: ResetPasswordFormData) => {
    setIsLoading(true);
    setServerError(null);
    try {
      await api.post("/auth/reset-password", {
        email: targetEmail,
        otp: data.otp,
        newPassword: data.newPassword,
      });
      setStep("SUCCESS");
    } catch (err: any) {
      setServerError(err?.message || "Failed to reset password. Please check your code.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4 sm:p-6 py-12">
      <div className="w-full max-w-md space-y-6">
        <Card className="border-border/60 shadow-lg">
          <CardHeader className="space-y-1 text-center">
            <BrandIcon className="mx-auto h-12 w-12 mb-2" />
            <CardTitle className="text-2xl font-bold tracking-tight">
              {step === "SUCCESS"
                ? "Password Reset Complete"
                : step === "ENTER_OTP_AND_NEW_PASSWORD"
                ? "Enter Verification Code"
                : "Forgot Your Password?"}
            </CardTitle>
            <CardDescription className="text-xs">
              {step === "SUCCESS"
                ? "Your password has been securely updated."
                : step === "ENTER_OTP_AND_NEW_PASSWORD"
                ? `Enter the 6-digit code sent to ${targetEmail} and choose a new password.`
                : "Enter your registered email address and we'll send you a 6-digit verification code."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Error Notification */}
            {serverError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            )}

            {/* STEP 1: REQUEST OTP */}
            {step === "REQUEST_OTP" && (
              <form onSubmit={handleSubmitRequest(onRequestOtp)} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-xs font-medium">
                    Account Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      autoComplete="email"
                      autoFocus
                      disabled={isLoading}
                      {...registerRequest("email")}
                      className={`pl-9 ${
                        errorsRequest.email
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }`}
                    />
                  </div>
                  {errorsRequest.email && (
                    <p className="text-xs text-destructive">{errorsRequest.email.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full font-semibold" disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <RotateCw className="h-4 w-4 animate-spin" /> Sending Verification Code...
                    </span>
                  ) : (
                    "Send Verification Code"
                  )}
                </Button>
              </form>
            )}

            {/* STEP 2: ENTER OTP & NEW PASSWORD */}
            {step === "ENTER_OTP_AND_NEW_PASSWORD" && (
              <form onSubmit={handleSubmitReset(onResetPassword)} className="space-y-4">
                {/* 6-Digit OTP Input */}
                <div className="space-y-2">
                  <label htmlFor="otp" className="text-xs font-medium">
                    6-Digit Verification Code
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="otp"
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      autoFocus
                      disabled={isLoading}
                      {...registerReset("otp")}
                      className={`pl-9 text-center font-mono text-lg tracking-widest ${
                        errorsReset.otp
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }`}
                    />
                  </div>
                  {errorsReset.otp && (
                    <p className="text-xs text-destructive">{errorsReset.otp.message}</p>
                  )}
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-muted-foreground">Didn&apos;t get the code?</span>
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendCooldown > 0 || isResending}
                      className="font-medium text-primary hover:underline disabled:text-muted-foreground disabled:no-underline flex items-center gap-1"
                    >
                      {isResending ? <RotateCw className="h-3 w-3 animate-spin" /> : null}
                      {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend Code"}
                    </button>
                  </div>
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <label htmlFor="newPassword" className="text-xs font-medium">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...registerReset("newPassword")}
                      className={`pl-9 ${
                        errorsReset.newPassword
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }`}
                    />
                  </div>
                  {errorsReset.newPassword && (
                    <p className="text-xs text-destructive">{errorsReset.newPassword.message}</p>
                  )}
                </div>

                {/* Live Password Checklist */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 p-2.5 rounded-lg bg-muted/40 border border-border/60 text-[11px]">
                  {passwordRules.map((rule, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center gap-1.5 ${
                        rule.valid ? "text-emerald-500 font-medium" : "text-muted-foreground"
                      }`}
                    >
                      <Check className={`h-3 w-3 ${rule.valid ? "opacity-100" : "opacity-30"}`} />
                      <span>{rule.label}</span>
                    </div>
                  ))}
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-xs font-medium">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      autoComplete="new-password"
                      disabled={isLoading}
                      {...registerReset("confirmPassword")}
                      className={`pl-9 ${
                        errorsReset.confirmPassword
                          ? "border-destructive focus-visible:ring-destructive"
                          : ""
                      }`}
                    />
                  </div>
                  {errorsReset.confirmPassword && (
                    <p className="text-xs text-destructive">{errorsReset.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full font-semibold" disabled={isLoading}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <RotateCw className="h-4 w-4 animate-spin" /> Updating Password...
                    </span>
                  ) : (
                    "Reset Password"
                  )}
                </Button>
              </form>
            )}

            {/* STEP 3: SUCCESS */}
            {step === "SUCCESS" && (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">Password Successfully Updated</p>
                  <p className="text-xs text-muted-foreground">
                    A confirmation email has been delivered to <strong>{targetEmail}</strong>. You may now sign in using your new credentials.
                  </p>
                </div>
                <Link href="/login" className="block pt-2">
                  <Button className="w-full font-semibold">Sign In to Eventora</Button>
                </Link>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex flex-col space-y-2 text-center text-xs text-muted-foreground border-t border-border/40 pt-4">
            <Link
              href="/login"
              className="font-medium text-foreground hover:underline inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Sign In
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

