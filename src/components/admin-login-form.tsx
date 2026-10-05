"use client";

import { useState } from "react";
import { ADMIN_LOGIN_ERROR } from "@/domain/admin-access";

export function AdminLoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: String(form.get("username") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) {
        setError(payload?.error?.message || ADMIN_LOGIN_ERROR);
        setPending(false);
        return;
      }
      window.location.assign("/admin");
    } catch {
      setError(ADMIN_LOGIN_ERROR);
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <label className="block text-sm font-medium" htmlFor="admin-username">
        Username
        <input
          id="admin-username"
          name="username"
          autoComplete="username"
          required
          className="mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-[#07111f]/80 px-3 text-base outline-none focus:border-[#3d8bff]"
        />
      </label>
      <label className="block text-sm font-medium" htmlFor="admin-password">
        Password
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 min-h-12 w-full rounded-xl border border-white/15 bg-[#07111f]/80 px-3 text-base outline-none focus:border-[#3d8bff]"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-full bg-[#2f7bff] text-base font-semibold text-white shadow-[0_0_24px_rgba(47,123,255,0.45)] disabled:opacity-70"
      >
        {pending ? "Signing in" : "Sign in"}
      </button>
      {error ? (
        <p className="text-sm text-[#ffb4bc]" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-center text-xs text-[#9eb0c8]">Protected admin access</p>
    </form>
  );
}
