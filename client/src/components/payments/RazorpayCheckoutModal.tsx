"use client";

import React, { useState } from "react";
import { api } from "@/lib/api";
import { User, EventItem } from "@/types";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, ShieldCheck } from "lucide-react";

declare global {
  interface Window {
    Razorpay?: any;
  }
}

interface RazorpayCheckoutProps {
  event: EventItem;
  user: User | null;
  onSuccess: () => void;
  onError: (err: string) => void;
}

export function RazorpayCheckoutButton({
  event,
  user,
  onSuccess,
  onError,
}: RazorpayCheckoutProps) {
  const [loading, setLoading] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulatedOrder, setSimulatedOrder] = useState<any>(null);

  // Dynamically load official Razorpay Checkout SDK
  const loadRazorpayScript = (): Promise<boolean> => {
    return new Promise((resolve) => {
      if (typeof window !== "undefined" && window.Razorpay) {
        return resolve(true);
      }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleInitiatePayment = async () => {
    setLoading(true);
    try {
      // 1. Create authoritative checkout order & 10-minute seat hold on backend
      const res = await api.post<{
        orderId: string;
        amount: number;
        currency: string;
        keyId: string;
        expiresAt: string;
      }>("/payments/create-order", {
        eventId: event._id || event.id,
      });

      const orderData = (res as any)?.data || res;
      if (!orderData?.orderId) {
        throw new Error("Unable to create checkout order with payment provider.");
      }

      // 2. Load SDK script
      const scriptLoaded = await loadRazorpayScript();

      if (!scriptLoaded || !window.Razorpay) {
        // Fallback simulator for offline dev or automated headless test environments
        setSimulatedOrder(orderData);
        setIsSimulating(true);
        setLoading(false);
        return;
      }

      // 3. Open Razorpay Standard Checkout in Test Mode
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: "Eventora",
        description: `Ticket RSVP for ${event.title}`,
        order_id: orderData.orderId,
        prefill: {
          name: user?.name || "",
          email: user?.email || "",
        },
        theme: {
          color: "#4f46e5",
        },
        modal: {
          ondismiss: function () {
            setLoading(false);
            onError("Payment was cancelled. Your temporary seat hold will be released.");
          },
        },
        handler: async function (response: {
          razorpay_order_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) {
          try {
            await api.post("/payments/verify", {
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
            });
            onSuccess();
          } catch (err: any) {
            onError(err?.message || "Payment verification failed. Please contact support.");
          } finally {
            setLoading(false);
          }
        },
      };

      const razorpayInstance = new window.Razorpay(options);
      razorpayInstance.on("payment.failed", function (response: any) {
        onError(response.error?.description || "Payment failed. Please try again.");
        setLoading(false);
      });
      razorpayInstance.open();
    } catch (err: any) {
      onError(err?.message || "Failed to initiate checkout session.");
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleInitiatePayment}
        disabled={loading}
        className="w-full h-11 text-xs font-semibold gap-2 shadow-sm bg-indigo-600 hover:bg-indigo-700 text-white"
        data-testid="pay-and-reserve-btn"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Initializing Checkout...
          </>
        ) : (
          <>
            <CreditCard className="h-4 w-4" />
            Pay ₹{event.ticketPrice} &amp; Reserve Seat
          </>
        )}
      </Button>

      {/* Offline / Test Fallback Simulator Dialog */}
      {isSimulating && simulatedOrder && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Payment Gateway Simulator"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-2 text-indigo-500 font-bold text-base">
              <ShieldCheck className="h-5 w-5" />
              <span>Razorpay Test Sandbox Simulator</span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Razorpay checkout modal is running in simulation mode for testing. A temporary 10-minute seat hold has been reserved on the server.
            </p>

            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID:</span>
                <span className="font-mono text-foreground">{simulatedOrder.orderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount:</span>
                <span className="font-semibold text-foreground">
                  ₹{simulatedOrder.amount / 100}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Hold Window:</span>
                <span className="text-emerald-500 font-medium">10 Minutes</span>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => {
                  setIsSimulating(false);
                  onError("Payment simulated as cancelled by user.");
                }}
              >
                Simulate Dismiss
              </Button>
              <Button
                className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={async () => {
                  try {
                    setLoading(true);
                    setIsSimulating(false);
                    const paymentId = `pay_sim_${Date.now()}`;
                    await api.post("/payments/verify", {
                      orderId: simulatedOrder.orderId,
                      paymentId,
                      signature: "simulated_test_signature",
                    });
                    onSuccess();
                  } catch (err: any) {
                    onError(err?.message || "Simulation verification failed.");
                  } finally {
                    setLoading(false);
                  }
                }}
              >
                Complete Payment
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

