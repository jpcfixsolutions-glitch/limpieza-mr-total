import { useEffect, useState } from "react";

const dateFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Cordoba", weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Cordoba", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function useWarehouseWelcome(user) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const hour = Number(timeFormat.formatToParts(now).find((part) => part.type === "hour").value);
  const morning = user?.role === "EMPLEADO_GALPON" ? "Buen día" : "Buenos días";
  const greeting = hour >= 5 && hour < 12 ? morning : hour >= 12 && hour < 20 ? "Buenas tardes" : "Buenas noches";
  const name = user?.name?.trim();
  const date = dateFormat.format(now);
  return { title: `¡${greeting}${name ? `, ${name}` : ""}!`, dateText: `${date.charAt(0).toUpperCase() + date.slice(1)} · ${timeFormat.format(now)} hs`, dateTime: now.toISOString() };
}

export function WarehouseEmployeeWelcome({ user }) {
  const welcome = useWarehouseWelcome(user);
  return <header className="min-w-0"><p className="text-primary text-xs font-black uppercase tracking-wider">Galpón · Equipo operativo</p>
    <h1 className="text-2xl sm:text-3xl font-black [overflow-wrap:anywhere]">{welcome.title}</h1>
    <time dateTime={welcome.dateTime} className="block text-sm text-foreground/60 mt-2">{welcome.dateText}</time>
  </header>;
}
