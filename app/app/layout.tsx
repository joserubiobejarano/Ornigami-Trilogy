import Link from "next/link";
import { Button } from "@/components/ui/button";
import { signOut } from "./actions";

const navItems = [
  { href: "/app/events", label: "Entrenamientos" },
  { href: "/app/people", label: "Participantes" },
  { href: "/app/bgk", label: "Backlogs" },
  { href: "/app/reports", label: "Reportes" },
  { href: "/app/historial", label: "Historial" },
  { href: "/app/administration", label: "Administración" },
];

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="grid grid-cols-3 items-center border-b px-4 py-3 md:px-6 md:py-4">
        <Link href="/app" className="ml-4 text-xl font-semibold">
          Somos Trilogy
        </Link>
        <nav className="flex justify-center items-center gap-1">
          {navItems.map((item) => (
            <Button
              key={item.href}
              variant="ghost"
              size="sm"
              asChild
            >
              <Link href={item.href}>{item.label}</Link>
            </Button>
          ))}
        </nav>
        <form action={signOut} className="flex justify-end pr-4">
          <Button type="submit" variant="ghost" size="sm">
            Cerrar sesión
          </Button>
        </form>
      </header>
      <main className="min-w-0 flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
    </div>
  );
}
