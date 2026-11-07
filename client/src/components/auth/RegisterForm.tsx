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
import {
  AlertCircle,
  Calendar,
  Lock,
  Mail,
  Ticket,
  User as UserIcon,
} from "lucide-react";
import { BrandIcon } from "@/components/brand/BrandLogo";

const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Please provide a valid email address").max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Requires an uppercase letter")
    .regex(/[a-z]/, "Requires a lowercase letter")
    .regex(/[0-9]/, "Requires a number")
    .regex(/[^A-Za-z0-9]/, "Requires a special character"),
  role: z.enum(["ATTENDEE", "ORGANIZER"]),
});

type RegisterFormData = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const { register: registerAuth } = useAuth();
  const [serverError, setServerError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      role: "ATTENDEE",
    },
  });

  const selectedRole = watch("role");

  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true);
    setServerError(null);
    try {
      await registerAuth(data);
      router.push("/verify-email");
    } catch (err: unknown) {
      const error = err as Error;
      setServerError(
        error.message || "Failed to create account. Please try again."
      );
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
              Create an account
            </CardTitle>
            <CardDescription className="text-xs">
              Select your role and start experiencing Eventora
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {serverError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{serverError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Role Selection */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">
                  Account Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setValue("role", "ATTENDEE")}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs transition-all ${
                      selectedRole === "ATTENDEE"
                        ? "border-foreground bg-muted/60 font-semibold text-foreground shadow-xs"
                        : "border-border text-muted-foreground hover:bg-muted/20"
                    }`}
                  >
                    <Ticket className="h-4 w-4 mb-1" aria-hidden="true" />
                    <span>Attendee</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      RSVP &amp; Book seats
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setValue("role", "ORGANIZER")}
                    className={`flex flex-col items-center justify-center p-3 rounded-lg border text-xs transition-all ${
                      selectedRole === "ORGANIZER"
                        ? "border-foreground bg-muted/60 font-semibold text-foreground shadow-xs"
                        : "border-border text-muted-foreground hover:bg-muted/20"
                    }`}
                  >
                    <Calendar className="h-4 w-4 mb-1" aria-hidden="true" />
                    <span>Organizer</span>
                    <span className="text-[10px] text-muted-foreground font-normal">
                      Host &amp; Manage events
                    </span>
                  </button>
                </div>
              </div>

              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium leading-none text-foreground">
                  Full Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    type="text"
                    placeholder="Alex Rivera"
                    className="pl-9 text-xs"
                    {...register("name")}
                    aria-label="Full name"
                  />
                </div>
                {errors.name && (
                  <p className="text-[11px] text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>

              {/* Email */}
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

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium leading-none text-foreground">
                  Password
                </label>
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
                <p className="text-[10px] text-muted-foreground">
                  Must be at least 8 characters with uppercase, lowercase,
                  number, and special character.
                </p>
              </div>

              <Button
                type="submit"
                className="w-full text-xs font-semibold h-10"
                isLoading={isLoading}
              >
                Create Account
              </Button>
            </form>
          </CardContent>

          <CardFooter className="flex justify-center border-t border-border/40 p-4">
            <p className="text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link
                href="/login"
                className="font-semibold text-foreground hover:underline"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
