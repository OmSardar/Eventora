"use client";

import React, { useState, useEffect, useRef } from "react";
import { Bell, Check, CheckCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/features/authentication/AuthContext";
import { NotificationItem } from "@/types";

export function NotificationBell() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch unread count
  const fetchUnreadCount = async () => {
    try {
      const res = await api.get<{ count: number }>("/notifications/unread-count");
      if (typeof res?.count === "number") {
        setUnreadCount(res.count);
      }
    } catch {
      // Graceful silence if unauthenticated or network failure
    }
  };

  // Fetch full list
  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await api.get<{ notifications: NotificationItem[] }>("/notifications?limit=15");
      if (Array.isArray(res?.notifications)) {
        setNotifications(res.notifications);
      }
    } catch (err) {
      console.error("Failed to fetch notifications:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user || !user.emailVerified) {
      setUnreadCount(0);
      return;
    }
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleToggle = () => {
    const nextState = !isOpen;
    setIsOpen(nextState);
    if (nextState) {
      fetchNotifications();
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await api.patch("/notifications/read-all");
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err) {
      console.error("Failed to mark all notifications as read:", err);
    }
  };

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.patch(`/notifications/${id}/read`);
      setUnreadCount((prev) => Math.max(0, prev - 1));
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
      );
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  // Close when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMinutes = Math.floor(diffMs / 60000);
      if (diffMinutes < 1) return "Just now";
      if (diffMinutes < 60) return `${diffMinutes}m ago`;
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) return `${diffHours}h ago`;
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleToggle}
        className="relative text-muted-foreground hover:text-foreground"
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span
            className="absolute top-1.5 right-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-sm animate-in zoom-in"
            data-testid="notification-badge"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </Button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notification Feed"
          className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-border bg-popover text-popover-foreground shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150"
          data-testid="notification-popover"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-primary hover:underline flex items-center gap-1 font-medium transition-colors"
                title="Mark all as read"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border/40">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading alerts...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No notifications right now.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item._id}
                  className={`p-3.5 text-xs transition-colors hover:bg-muted/40 flex items-start gap-2.5 ${
                    !item.isRead ? "bg-primary/5 font-medium" : "opacity-80"
                  }`}
                >
                  <div
                    className={`mt-1 h-2 w-2 rounded-full shrink-0 ${
                      !item.isRead ? "bg-primary" : "bg-transparent"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <p className="font-semibold text-foreground truncate">{item.title}</p>
                      <span suppressHydrationWarning className="text-[10px] text-muted-foreground shrink-0">
                        {formatTime(item.createdAt)}
                      </span>
                    </div>
                    <p className="text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                  {!item.isRead && (
                    <button
                      onClick={(e) => handleMarkAsRead(item._id, e)}
                      title="Mark as read"
                      className="p-1 text-muted-foreground hover:text-foreground rounded transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

