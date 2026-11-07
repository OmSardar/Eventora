"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { AlertCircle, Lock, Mail, Sparkles } from "lucide-react";
import { BrandIcon } from "@/components/brand/BrandLogo";

const loginSchema = z.object({
  email: z.string().email("Please provide a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormData = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const { login } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setServerError(null);
    try {
      const user = await login(data);
      if (user.role === "ORGANIZER") {
        router.push("/organizer/dashboard");
      } else {
        router.push("/attendee/registrations");
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

  const fillDemoAccount = (role: "ORGANIZER" | "ATTENDEE") => {
    if (role === "ORGANIZER") {
      setValue("email", "organizer@eventora.demo");
      setValue("password", "Organizer@123");
    } else {
      setValue("email", "attendee@eventora.demo");
      setValue("password", "Attendee@123");
    }
  };

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
                <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span>One-Click Demo Accounts</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fillDemoAccount("ORGANIZER")}
                  className="text-xs h-8 justify-start"
                >
                  Fill Organizer
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fillDemoAccount("ATTENDEE")}
                  className="text-xs h-8 justify-start"
                >
                  Fill Attendee
                </Button>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium leading-none text-foreground">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    className="pl-9 text-xs"
                    {...register("email")}
                    aria-label="Email address"
                  />
                </div>
                {errors.email && (
                  <p className="text-[11px] text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium leading-none text-foreground">
                    Password
                  </label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="password"
                    placeholder="••••••••"
                    className="pl-9 text-xs"
                    {...register("password")}
                    aria-label="Password"
                  />
                </div>
                {errors.password && (
                  <p className="text-[11px] text-destructive">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full text-xs font-semibold h-10"
                isLoading={isLoading}
              >
                Sign In
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex justify-center border-t border-border/40 p-4">
            <p className="text-xs text-muted-foreground">
              Don&apos;t have an account?{" "}
              <Link
                href="/register"
                className="font-semibold text-foreground hover:underline"
              >
                Register here
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
