"use client";

import React, { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { SecurityStatus, LoginSecurityEventItem } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  Mail,
  KeyRound,
  History,
  CheckCircle2,
  AlertTriangle,
  RotateCw,
  Copy,
  Check,
  Lock,
  Loader2,
  X,
  ExternalLink,
  Eye,
  EyeOff,
} from "lucide-react";

export default function SecuritySettingsPage() {
  const { user } = useAuth();

  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [history, setHistory] = useState<LoginSecurityEventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Modal Dialog States
  const [activeModal, setActiveModal] = useState<
    "EMAIL_OTP_SETUP" | "EMAIL_OTP_CONFIRM" | "TOTP_SETUP" | "TOTP_CONFIRM" | "DISABLE_MFA" | "REGEN_RECOVERY" | null
  >(null);

  const [passwordInput, setPasswordInput] = useState("");
  const [otpCodeInput, setOtpCodeInput] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // TOTP Setup Payload
  const [totpSetupData, setTotpSetupData] = useState<{
    secret: string;
    otpauthUri: string;
    qrCodeDataUrl: string;
  } | null>(null);

  // Newly generated recovery codes
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Selected factor to disable
  const [disableFactorTarget, setDisableFactorTarget] = useState<"EMAIL_OTP" | "TOTP">("EMAIL_OTP");

  // Change Password Form State
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [changePasswordLoading, setChangePasswordLoading] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changePasswordSuccess, setChangePasswordSuccess] = useState<string | null>(null);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangePasswordError(null);
    setChangePasswordSuccess(null);

    if (!currentPassword.trim()) {
      setChangePasswordError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setChangePasswordError("New password must be at least 8 characters long.");
      return;
    }
    if (
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/[0-9]/.test(newPassword) ||
      !/[^A-Za-z0-9]/.test(newPassword)
    ) {
      setChangePasswordError(
        "New password must include uppercase, lowercase, numeric, and special characters."
      );
      return;
    }
    if (currentPassword === newPassword) {
      setChangePasswordError("New password cannot be the same as your current password.");
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setChangePasswordError("New passwords do not match.");
      return;
    }

    try {
      setChangePasswordLoading(true);
      const res = await api.post<{ message: string }>("/auth/change-password", {
        currentPassword,
        newPassword,
      });

      setChangePasswordSuccess(
        res.message ||
          "Your password has been changed successfully. A security notification was emailed to your address."
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Failed to update password. Please check your current password and try again.";
      setChangePasswordError(message);
    } finally {
      setChangePasswordLoading(false);
    }
  };

  const loadSecurityData = useCallback(async () => {
    try {
      const [statusRes, historyRes] = await Promise.all([
        api.get<SecurityStatus>("/auth/security/status"),
        api.get<{ history: LoginSecurityEventItem[] }>("/auth/security/login-history"),
      ]);
      setStatus(statusRes);
      setHistory(historyRes.history || []);
    } catch {
      setFeedback({ type: "error", message: "Failed to load security settings." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSecurityData();
  }, [loadSecurityData]);

  const closeModal = () => {
    setActiveModal(null);
    setPasswordInput("");
    setOtpCodeInput("");
    setModalError(null);
    setTotpSetupData(null);
  };

  // -------------------------------------------------------------
  // EMAIL OTP HANDLERS
  // -------------------------------------------------------------
  const handleStartEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      await api.post("/auth/security/email-otp/initiate", { password: passwordInput });
      setActiveModal("EMAIL_OTP_CONFIRM");
    } catch (err: unknown) {
      const error = err as Error;
      setModalError(error.message || "Failed to initiate Email OTP.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleConfirmEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await api.post<{ recoveryCodes?: string[] }>("/auth/security/email-otp/confirm", {
        otp: otpCodeInput.trim(),
      });
      if (res.recoveryCodes) {
        setNewRecoveryCodes(res.recoveryCodes);
      }
      setFeedback({ type: "success", message: "Email OTP two-factor authentication has been enabled." });
      closeModal();
      loadSecurityData();
    } catch (err: unknown) {
      const error = err as Error;
      setModalError(error.message || "Invalid verification code.");
    } finally {
      setModalLoading(false);
    }
  };

  // -------------------------------------------------------------
  // TOTP HANDLERS
  // -------------------------------------------------------------
  const handleStartTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await api.post<{ secret: string; otpauthUri: string; qrCodeDataUrl: string }>(
        "/auth/security/totp/setup",
        { password: passwordInput }
      );
      setTotpSetupData(res);
      setActiveModal("TOTP_CONFIRM");
    } catch (err: unknown) {
      const error = err as Error;
      setModalError(error.message || "Failed to initiate TOTP setup.");
    } finally {
      setModalLoading(false);
    }
  };

  const handleConfirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await api.post<{ recoveryCodes?: string[] }>("/auth/security/totp/confirm", {
        code: otpCodeInput.trim(),
      });
      if (res.recoveryCodes) {
        setNewRecoveryCodes(res.recoveryCodes);
      }
      setFeedback({ type: "success", message: "Authenticator App (TOTP) has been successfully enabled." });
      closeModal();
      loadSecurityData();
    } catch (err: unknown) {
      const error = err as Error;
      setModalError(error.message || "Invalid authenticator code.");
    } finally {
      setModalLoading(false);
    }
  };

  // -------------------------------------------------------------
  // DISABLE MFA HANDLER
  // -------------------------------------------------------------
  const handleDisableMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      await api.post("/auth/security/mfa/disable", {
        password: passwordInput,
        factor: disableFactorTarget,
      });
      setFeedback({
        type: "success",
        message: `Two-factor authentication via ${
          disableFactorTarget === "TOTP" ? "Authenticator App" : "Email OTP"
        } has been disabled.`,
      });
      closeModal();
      loadSecurityData();
    } catch (err: unknown) {
      const error = err as Error;
      setModalError(error.message || "Failed to disable factor.");
    } finally {
      setModalLoading(false);
    }
  };

  // -------------------------------------------------------------
  // REGENERATE RECOVERY CODES HANDLER
  // -------------------------------------------------------------
  const handleRegenerateRecoveryCodes = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await api.post<{ recoveryCodes: string[] }>("/auth/security/recovery-codes/regenerate", {
        password: passwordInput,
      });
      setNewRecoveryCodes(res.recoveryCodes);
      setFeedback({
        type: "success",
        message: "New recovery codes generated. Please copy and store them safely.",
      });
      closeModal();
      loadSecurityData();
    } catch (err: unknown) {
      const error = err as Error;
      setModalError(error.message || "Failed to regenerate recovery codes.");
    } finally {
      setModalLoading(false);
    }
  };

  const copyRecoveryCodes = () => {
    if (!newRecoveryCodes) return;
    navigator.clipboard.writeText(newRecoveryCodes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2500);
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isEmailVerified = Boolean(status?.emailVerified);
  const isTotpActive = Boolean(status?.mfa?.totpEnabled);
  const isEmailOtpActive = Boolean(status?.mfa?.emailOtpEnabled);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Security & Authentication</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account verification status, multi-factor authentication, and review recent login sessions.
        </p>
      </div>

      {/* Global Alert Notification */}
      {feedback && (
        <div
          className={`flex items-center justify-between p-4 rounded-lg border text-sm ${
            feedback.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
              : "bg-destructive/10 border-destructive/30 text-destructive"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === "success" ? (
              <CheckCircle2 className="h-5 w-5 shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold hover:opacity-75"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* RECOVERY CODES PROMINENT BANNER (IF JUST GENERATED) */}
      {newRecoveryCodes && (
        <Card className="border-amber-500/40 bg-amber-500/5 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-500">
                <KeyRound className="h-5 w-5" />
                <CardTitle className="text-lg">Your Emergency Recovery Codes</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNewRecoveryCodes(null)}
                className="h-8 text-xs text-muted-foreground"
              >
                Close
              </Button>
            </div>
            <CardDescription className="text-xs text-muted-foreground">
              Save these recovery codes now in a secure password manager. Each code can only be used once if you lose access to your primary authentication factor. They will not be displayed again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 bg-background/80 p-4 rounded-lg border border-border/80 font-mono text-xs text-center font-bold">
              {newRecoveryCodes.map((code, idx) => (
                <div key={idx} className="p-2 rounded bg-muted/60 border border-border/60">
                  {code}
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center pt-0">
            <span className="text-xs text-muted-foreground font-medium">
              10 codes generated
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={copyRecoveryCodes}
              className="text-xs gap-1.5 font-semibold"
            >
              {copiedCodes ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedCodes ? "Copied All" : "Copy Codes"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Grid of Security Controls */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 1. EMAIL VERIFICATION CARD */}
        <Card className="border-border/60 shadow-sm flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Mail className="h-5 w-5 text-primary" />
                <span>Email Verification</span>
              </div>
              <Badge variant={isEmailVerified ? "default" : "destructive"} className="text-xs">
                {isEmailVerified ? "Verified" : "Unverified"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Primary email address: <strong className="text-foreground">{user?.email}</strong>
            </CardDescription>
          </CardHeader>

          <CardContent className="text-xs text-muted-foreground space-y-2">
            {isEmailVerified ? (
              <p className="flex items-center gap-1.5 text-emerald-500 font-medium">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Your email address is verified. You have full access to create events and RSVP.
              </p>
            ) : (
              <p className="text-amber-500 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Please verify your email address to unlock event creation, RSVPs, and payments.
              </p>
            )}
          </CardContent>

          <CardFooter className="border-t border-border/40 pt-4">
            {!isEmailVerified && (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    await api.post("/auth/resend-verification", { email: user?.email });
                    setFeedback({
                      type: "success",
                      message: "A new verification email has been sent to your inbox.",
                    });
                  } catch (err: unknown) {
                    const error = err as Error;
                    setFeedback({ type: "error", message: error.message || "Failed to resend email." });
                  }
                }}
                className="w-full text-xs font-semibold gap-1.5"
              >
                <RotateCw className="h-3.5 w-3.5" />
                Resend Verification Link
              </Button>
            )}
            {isEmailVerified && (
              <span className="text-xs text-muted-foreground">
                Verified on {status?.emailVerifiedAt ? new Date(status.emailVerifiedAt).toLocaleDateString() : "Active"}
              </span>
            )}
          </CardFooter>
        </Card>

        {/* 2. AUTHENTICATOR APP (TOTP) CARD */}
        <Card className="border-border/60 shadow-sm flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Smartphone className="h-5 w-5 text-primary" />
                <span>Authenticator App (TOTP)</span>
              </div>
              <Badge variant={isTotpActive ? "default" : "secondary"} className="text-xs">
                {isTotpActive ? "Active" : "Disabled"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              RFC 6238 time-based one-time password via Google Authenticator, Microsoft Authenticator, or Authy.
            </CardDescription>
          </CardHeader>

          <CardContent className="text-xs text-muted-foreground">
            {isTotpActive ? (
              <p>
                Authenticator app protection is active. You will be prompted for your 6-digit TOTP code when logging in from new devices.
              </p>
            ) : (
              <p>
                Protect your account against credential theft with a mobile authenticator app. Recommended for maximum account security.
              </p>
            )}
          </CardContent>

          <CardFooter className="border-t border-border/40 pt-4">
            {isTotpActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDisableFactorTarget("TOTP");
                  setActiveModal("DISABLE_MFA");
                }}
                className="w-full text-xs font-semibold text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                Disable Authenticator App
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={!isEmailVerified}
                onClick={() => setActiveModal("TOTP_SETUP")}
                className="w-full text-xs font-semibold"
              >
                {isEmailVerified ? "Enable Authenticator App" : "Requires Verified Email"}
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* 3. EMAIL OTP TWO-FACTOR CARD */}
        <Card className="border-border/60 shadow-sm flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <Mail className="h-5 w-5 text-primary" />
                <span>Email Verification Code (OTP)</span>
              </div>
              <Badge variant={isEmailOtpActive ? "default" : "secondary"} className="text-xs">
                {isEmailOtpActive ? "Active" : "Disabled"}
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Receive a single-use 6-digit verification code to your verified inbox upon every sign-in.
            </CardDescription>
          </CardHeader>

          <CardContent className="text-xs text-muted-foreground">
            {isEmailOtpActive ? (
              <p>
                Email OTP is active. A verification code will be dispatched to {user?.email} whenever you sign in.
              </p>
            ) : (
              <p>
                Receive an authentication code in your email whenever you log in. Requires a verified email address.
              </p>
            )}
          </CardContent>

          <CardFooter className="border-t border-border/40 pt-4">
            {isEmailOtpActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setDisableFactorTarget("EMAIL_OTP");
                  setActiveModal("DISABLE_MFA");
                }}
                className="w-full text-xs font-semibold text-destructive hover:bg-destructive/10 border-destructive/30"
              >
                Disable Email OTP
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={!isEmailVerified}
                onClick={() => setActiveModal("EMAIL_OTP_SETUP")}
                className="w-full text-xs font-semibold"
              >
                {isEmailVerified ? "Enable Email OTP" : "Requires Verified Email"}
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* 4. EMERGENCY RECOVERY CODES CARD */}
        <Card className="border-border/60 shadow-sm flex flex-col justify-between">
          <CardHeader>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <KeyRound className="h-5 w-5 text-primary" />
                <span>Emergency Recovery Codes</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {status?.mfa?.recoveryCodesRemaining || 0} remaining
              </Badge>
            </div>
            <CardDescription className="text-xs">
              Single-use backup codes to sign in if you lose access to your authenticator device or email.
            </CardDescription>
          </CardHeader>

          <CardContent className="text-xs text-muted-foreground">
            {status?.mfa?.hasRecoveryCodes ? (
              <p>
                You have <strong>{status.mfa.recoveryCodesRemaining}</strong> unused recovery codes. Generating new codes immediately invalidates all previous codes.
              </p>
            ) : (
              <p>
                Recovery codes will be generated automatically when you enable your first two-factor authentication method.
              </p>
            )}
          </CardContent>

          <CardFooter className="border-t border-border/40 pt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={!isEmailVerified || (!isTotpActive && !isEmailOtpActive)}
              onClick={() => setActiveModal("REGEN_RECOVERY")}
              className="w-full text-xs font-semibold"
            >
              {!isEmailVerified ? "Requires Verified Email" : "Regenerate Recovery Codes"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* CHANGE PASSWORD SECTION */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Change Account Password</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Update your password regularly to keep your account secure. When changed, a security alert with IP and device details will be sent to your email.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-xl">
            {changePasswordError && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-xs">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{changePasswordError}</span>
              </div>
            )}
            {changePasswordSuccess && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{changePasswordSuccess}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Current Password</label>
              <div className="relative">
                <Input
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter your existing password"
                  className="pr-10 text-xs"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">New Password</label>
              <div className="relative">
                <Input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter your new secure password"
                  className="pr-10 text-xs"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password Requirements Checklist */}
              {newPassword.length > 0 && (
                <div className="p-3 bg-muted/40 rounded-md border border-border/40 text-xs space-y-1 mt-2">
                  <p className="font-semibold text-muted-foreground mb-1.5">Password Requirements:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {[
                      { label: "At least 8 characters", valid: newPassword.length >= 8 },
                      { label: "One uppercase letter", valid: /[A-Z]/.test(newPassword) },
                      { label: "One lowercase letter", valid: /[a-z]/.test(newPassword) },
                      { label: "One number (0-9)", valid: /[0-9]/.test(newPassword) },
                      { label: "One special character", valid: /[^A-Za-z0-9]/.test(newPassword) },
                    ].map((rule, idx) => (
                      <div
                        key={idx}
                        className={`flex items-center gap-1.5 text-[11px] ${
                          rule.valid ? "text-emerald-500 font-medium" : "text-muted-foreground"
                        }`}
                      >
                        {rule.valid ? (
                          <Check className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0 ml-1 mr-1" />
                        )}
                        <span>{rule.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Confirm New Password</label>
              <Input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Confirm your new password"
                className="text-xs"
                required
              />
            </div>

            <div className="pt-2">
              <Button
                type="submit"
                disabled={changePasswordLoading || !currentPassword || !newPassword || !confirmNewPassword}
                size="sm"
                className="text-xs font-semibold"
              >
                {changePasswordLoading ? (
                  <>
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Updating Password...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* RECENT LOGIN SESSIONS AUDIT LOG */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader>
          <div className="flex items-center gap-2 text-foreground font-semibold">
            <History className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Recent Login Activity</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Review recent authentication activity on your account. If you spot unfamiliar activity, change your password immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              No recent sign-ins recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="border-b border-border/60 text-muted-foreground font-semibold">
                  <tr>
                    <th className="pb-2.5">Date & Time</th>
                    <th className="pb-2.5">Device & Browser</th>
                    <th className="pb-2.5">Approx. Location</th>
                    <th className="pb-2.5">IP Address</th>
                    <th className="pb-2.5">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40 font-medium">
                  {history.map((ev) => (
                    <tr key={ev.id} className="hover:bg-muted/30">
                      <td className="py-2.5 text-foreground whitespace-nowrap">
                        {new Date(ev.loginAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-muted-foreground">
                        {ev.device.phoneModel ? (
                          <div>
                            <span className="font-semibold text-foreground">{ev.device.phoneModel}</span>
                            <span className="text-[11px] block text-muted-foreground/80">{ev.device.os} • {ev.device.browser} {ev.device.browserVersion}</span>
                          </div>
                        ) : ev.device.summary ? (
                          <span>{ev.device.summary}</span>
                        ) : (
                          <span>{ev.device.browser} {ev.device.browserVersion} on {ev.device.os}</span>
                        )}
                      </td>
                      <td className="py-2.5 text-muted-foreground whitespace-nowrap">
                        {ev.location.city !== "Unknown" ? `${ev.location.city}, ${ev.location.country}` : ev.location.country}
                      </td>
                      <td className="py-2.5 font-mono text-muted-foreground whitespace-nowrap">
                        {ev.ipAddress}
                      </td>
                      <td className="py-2.5">
                        <Badge variant="outline" className="text-[10px] py-0">
                          {ev.authFactor}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------- */}
      {/* MODAL: TOTP SETUP PASSWORD CONFIRMATION */}
      {/* ------------------------------------------------------------- */}
      {activeModal === "TOTP_SETUP" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-border/80 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Enable Authenticator App</CardTitle>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <form onSubmit={handleStartTotp}>
              <CardContent className="space-y-4 pt-2">
                <CardDescription className="text-xs">
                  For your security, please confirm your current account password to begin authenticator setup.
                </CardDescription>

                {modalError && (
                  <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
                    {modalError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium">Current Password</label>
                  <Input
                    type="password"
                    required
                    autoFocus
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={modalLoading || !passwordInput}>
                  {modalLoading ? "Verifying..." : "Continue to QR Code"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: TOTP QR CODE & CONFIRM CODE */}
      {/* ------------------------------------------------------------- */}
      {activeModal === "TOTP_CONFIRM" && totpSetupData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-border/80 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Scan Authenticator QR Code</CardTitle>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <form onSubmit={handleConfirmTotp}>
              <CardContent className="space-y-4 pt-2 text-center">
                <p className="text-xs text-muted-foreground">
                  Scan this QR code with Google Authenticator, Microsoft Authenticator, or Authy:
                </p>

                {modalError && (
                  <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs text-left">
                    {modalError}
                  </div>
                )}

                <div className="flex justify-center p-3 bg-white rounded-lg mx-auto w-fit border border-border">
                  <Image
                    src={totpSetupData.qrCodeDataUrl}
                    alt="Authenticator QR Code"
                    width={180}
                    height={180}
                    unoptimized
                    className="h-44 w-44"
                  />
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-muted-foreground">Or enter manual setup key:</span>
                  <div className="p-2 rounded bg-muted/60 font-mono text-xs font-bold tracking-wider select-all">
                    {totpSetupData.secret}
                  </div>
                </div>

                <div className="space-y-2 pt-2 text-left">
                  <label className="text-xs font-medium">Enter 6-Digit Authenticator Code</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    required
                    value={otpCodeInput}
                    onChange={(e) => setOtpCodeInput(e.target.value)}
                    className="text-center font-mono text-lg tracking-widest"
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={modalLoading || otpCodeInput.trim().length !== 6}>
                  {modalLoading ? "Activating..." : "Confirm & Enable"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: EMAIL OTP SETUP PASSWORD PROMPT */}
      {/* ------------------------------------------------------------- */}
      {activeModal === "EMAIL_OTP_SETUP" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-border/80 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Enable Email OTP</CardTitle>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <form onSubmit={handleStartEmailOtp}>
              <CardContent className="space-y-4 pt-2">
                <CardDescription className="text-xs">
                  We will send a 6-digit verification code to <strong className="text-foreground">{user?.email}</strong>. Confirm your current password to continue.
                </CardDescription>

                {modalError && (
                  <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
                    {modalError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium">Current Password</label>
                  <Input
                    type="password"
                    required
                    autoFocus
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={modalLoading || !passwordInput}>
                  {modalLoading ? "Sending Code..." : "Send Verification Code"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: EMAIL OTP CONFIRMATION */}
      {/* ------------------------------------------------------------- */}
      {activeModal === "EMAIL_OTP_CONFIRM" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-border/80 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Confirm Email Verification Code</CardTitle>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <form onSubmit={handleConfirmEmailOtp}>
              <CardContent className="space-y-4 pt-2">
                <CardDescription className="text-xs">
                  Check your inbox at <strong className="text-foreground">{user?.email}</strong> and enter the 6-digit code below:
                </CardDescription>

                {modalError && (
                  <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
                    {modalError}
                  </div>
                )}

                <div className="space-y-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    autoFocus
                    required
                    value={otpCodeInput}
                    onChange={(e) => setOtpCodeInput(e.target.value)}
                    className="text-center font-mono text-lg tracking-widest"
                  />
                  <p className="text-[11px] text-muted-foreground text-center pt-1">
                    Did not receive the code? Please check your <strong>Spam</strong> or <strong>Promotions</strong> folder. Codes expire in 5 minutes.
                  </p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={modalLoading || otpCodeInput.trim().length !== 6}>
                  {modalLoading ? "Activating..." : "Confirm & Enable"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: DISABLE MFA FACTOR */}
      {/* ------------------------------------------------------------- */}
      {activeModal === "DISABLE_MFA" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-border/80 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg text-destructive">
                Disable {disableFactorTarget === "TOTP" ? "Authenticator App" : "Email OTP"}
              </CardTitle>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <form onSubmit={handleDisableMfa}>
              <CardContent className="space-y-4 pt-2">
                <CardDescription className="text-xs">
                  Disabling two-factor authentication reduces your account protection. Please enter your account password to confirm.
                </CardDescription>

                {modalError && (
                  <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
                    {modalError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium">Account Password</label>
                  <Input
                    type="password"
                    required
                    autoFocus
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  variant="destructive"
                  disabled={modalLoading || !passwordInput}
                >
                  {modalLoading ? "Disabling..." : "Disable 2FA Factor"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MODAL: REGENERATE RECOVERY CODES */}
      {/* ------------------------------------------------------------- */}
      {activeModal === "REGEN_RECOVERY" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <Card className="w-full max-w-md border-border/80 shadow-2xl">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-lg">Regenerate Recovery Codes</CardTitle>
              <button onClick={closeModal} className="text-muted-foreground hover:text-foreground">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <form onSubmit={handleRegenerateRecoveryCodes}>
              <CardContent className="space-y-4 pt-2">
                <CardDescription className="text-xs">
                  Regenerating recovery codes will invalidate all previously generated codes. Enter your password to proceed.
                </CardDescription>

                {modalError && (
                  <div className="p-3 rounded-lg border border-destructive/20 bg-destructive/10 text-destructive text-xs">
                    {modalError}
                  </div>
                )}

                <div className="space-y-2">
                  <label className="text-xs font-medium">Account Password</label>
                  <Input
                    type="password"
                    required
                    autoFocus
                    placeholder="••••••••"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                  />
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t border-border/40 pt-4">
                <Button type="button" variant="ghost" size="sm" onClick={closeModal}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={modalLoading || !passwordInput}>
                  {modalLoading ? "Regenerating..." : "Regenerate Codes"}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

