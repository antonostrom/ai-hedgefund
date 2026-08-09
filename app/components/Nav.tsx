"use client";

import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/performance", label: "Performance" },
  { href: "/risk", label: "Risk" },
  { href: "/sectors", label: "Sectors" },
  { href: "/macro", label: "Macro" },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="border-b border-slate-800 bg-slate-950">
      <div className="mx-auto flex max-w-5xl gap-1 px-4">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <a key={link.href} href={link.href} className={`px-3 py-3 text-sm ${active ? "border-b-2 border-slate-100 font-medium text-slate-100" : "text-slate-400 hover:text-slate-200"}`}>
              {link.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}