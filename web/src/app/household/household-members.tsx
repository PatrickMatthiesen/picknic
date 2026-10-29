"use client";
import { useEffect, useState } from "react";

type Data = { household: { name: string }; members: Array<{ id: string; email: string; role: string; local: boolean }>; invitations: Array<{ id: string; email: string; expiresAt: string }> };
export function HouseholdMembers() {
  const [data, setData] = useState<Data | null>(null);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sharingAvailable, setSharingAvailable] = useState(false);
  async function load() {
    const response = await fetch("/api/household", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) {
      setSharingAvailable(response.status === 409);
      throw new Error(payload.error ?? "Could not load household members.");
    }
    setSharingAvailable(false);
    setData(payload);
  }
  async function enableSharing() {
    setBusy(true); setError(null); setMessage(null);
    try {
      const response = await fetch("/api/household", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enableSharing: true }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not enable household sharing.");
      setMessage("Household sharing is ready. You can now invite people by email.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not enable household sharing."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => { if (active) void load().catch((cause) => { if (active) setError(cause.message); }); }, 0);
    return () => { active = false; clearTimeout(timer); };
  }, []);
  async function submit(method: "POST" | "DELETE", query?: string) {
    setError(null); setMessage(null); setBusy(true);
    try {
      const response = await fetch(`/api/household${query ? `?${query}` : ""}`, { method, headers: method === "POST" ? { "Content-Type": "application/json" } : undefined, body: method === "POST" ? JSON.stringify({ email }) : undefined });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Household action failed.");
      if (method === "POST") { setEmail(""); setMessage(`Invitation sent to ${payload.invitation.email}.`); }
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Household action failed."); }
    finally { setBusy(false); }
  }
  return <div className="mt-8 space-y-8">
    {sharingAvailable ? <section className="app-theme-card grid gap-3 rounded-lg p-5"><h2 className="text-lg font-semibold">Enable household sharing</h2><p className="app-theme-muted">Your recipes and plans stay in this household. Enable sharing to invite members with WorkOS.</p><button className="app-theme-primary-button min-h-11 w-fit rounded-lg px-4" disabled={busy} onClick={() => void enableSharing()} type="button">Enable sharing</button></section> : null}
    <form className="app-theme-card flex flex-wrap items-end gap-3 p-5" onSubmit={(event) => { event.preventDefault(); void submit("POST"); }}>
      <label className="min-w-64 flex-1">Invite by email<input autoComplete="email" className="app-theme-input mt-2 block w-full px-3" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>
      <button className="app-theme-primary-button min-h-11 px-4" disabled={busy || !data} type="submit">Send invitation</button>
    </form>
    {error && <p role="alert" className="household-error text-sm">{error}</p>}{message && <p role="status" className="text-sm">{message}</p>}
    <section><h2 className="text-lg font-semibold">Members</h2><ul className="mt-3 divide-y app-theme-divider">{data?.members.map((member) => <li className="flex min-h-14 items-center justify-between gap-4 py-3" key={member.id}><span>{member.email}{member.local ? "" : " · signed in to sync"}</span><span className="flex items-center gap-3 text-sm capitalize">{member.role}{member.role === "member" ? <button className="min-h-11 px-3 underline" disabled={busy} type="button" onClick={() => void submit("DELETE", `membershipId=${encodeURIComponent(member.id)}`)}>Remove</button> : null}</span></li>)}</ul></section>
    <section><h2 className="text-lg font-semibold">Pending invitations</h2>{data?.invitations.length ? <ul className="mt-3 divide-y app-theme-divider">{data.invitations.map((invite) => <li className="flex min-h-14 items-center justify-between gap-4 py-3" key={invite.id}><span>{invite.email}<small className="block app-theme-muted">Expires {new Date(invite.expiresAt).toLocaleDateString()}</small></span><button className="min-h-11 px-3 text-sm underline" disabled={busy} type="button" onClick={() => void submit("DELETE", `invitationId=${encodeURIComponent(invite.id)}`)}>Revoke</button></li>)}</ul> : <p className="mt-3 app-theme-muted">No pending invitations.</p>}</section>
  </div>;
}
