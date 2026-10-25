// The address iPads should use for the kiosk.
//
// At an event the Mac usually sits on two networks: a wired LAN with the iPads (no internet)
// and the venue's Wi‑Fi for the internet. The iPads need the wired address, so we prefer the
// interface that does NOT carry the default (internet) route. LAN_IP in .env pins it outright.
import os from "os";
import { execFileSync } from "child_process";

let defaultIface: string | null | undefined; // undefined = not looked up yet
let lastLookup = 0;

function internetInterface(): string | null {
  const now = Date.now();
  if (defaultIface !== undefined && now - lastLookup < 30_000) return defaultIface;
  lastLookup = now;
  try {
    const out = execFileSync("route", ["-n", "get", "default"], { encoding: "utf8", timeout: 2000 });
    const m = out.match(/interface:\s*(\S+)/);
    defaultIface = m ? m[1] : null;
  } catch {
    defaultIface = null;
  }
  return defaultIface;
}

export function lanAddresses(): { iface: string; address: string; internet: boolean }[] {
  const inet = internetInterface();
  const out: { iface: string; address: string; internet: boolean }[] = [];
  for (const [iface, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === "IPv4" && !a.internal) out.push({ iface, address: a.address, internet: iface === inet });
    }
  }
  return out;
}

export function getLanIp(): string {
  if (process.env.LAN_IP) return process.env.LAN_IP;
  const all = lanAddresses();
  const real = all.filter((a) => !a.address.startsWith("169.254.")); // self-assigned = no network there
  const pool = real.length ? real : all;
  // the network without the internet route is where the iPads are; otherwise anything
  const local = pool.find((a) => !a.internet);
  return (local ?? pool[0])?.address ?? "localhost";
}
