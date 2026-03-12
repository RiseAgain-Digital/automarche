"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Package2,
  LayoutDashboard,
  Kanban,
  ClipboardList,
  Package,
  Truck,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

const navItems = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/kanban",
    label: "Kanban",
    icon: Kanban,
  },
  {
    href: "/tarefas",
    label: "Gestão de Tarefas",
    icon: ClipboardList,
  },
  {
    href: "/produtos",
    label: "Produtos",
    icon: Package,
  },
  {
    href: "/operacional",
    label: "Operacional",
    icon: Truck,
  },
];

interface SidebarProps {
  userName?: string;
  userEmail?: string;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

export function Sidebar({ userName = "Usuário", userEmail = "" }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      router.push("/login");
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <aside
      className={`
        flex flex-col h-screen bg-[#1c2333] text-white transition-all duration-300 ease-in-out flex-shrink-0
        ${collapsed ? "w-16" : "w-60"}
      `}
    >
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-5 border-b border-[#2a3347]">
        <Link
          href="/dashboard"
          className={`flex items-center gap-2.5 ${collapsed ? "justify-center w-full" : ""}`}
        >
          <div className="flex-shrink-0 p-1.5 bg-[#3b5bdb] rounded-lg">
            <Package2 className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <span className="text-base font-bold tracking-tight text-white">
              automarche
            </span>
          )}
        </Link>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-[#243044] transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="flex justify-center py-2 border-b border-[#2a3347]">
          <button
            onClick={() => setCollapsed(false)}
            className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-[#243044] transition-colors"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 sidebar-scroll space-y-1">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                transition-colors duration-150
                ${
                  isActive
                    ? "bg-[#243044] text-white"
                    : "text-slate-400 hover:text-white hover:bg-[#243044]"
                }
                ${collapsed ? "justify-center" : ""}
              `}
            >
              <Icon className="h-4.5 w-4.5 flex-shrink-0" size={18} />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-[#2a3347] p-3">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 bg-[#3b5bdb] rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold text-white">
                {getInitials(userName)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {userName}
              </p>
              <p className="text-xs text-slate-400 truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sair"
              className="flex-shrink-0 p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-[#243044] transition-colors disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 bg-[#3b5bdb] rounded-full flex items-center justify-center">
              <span className="text-xs font-semibold text-white">
                {getInitials(userName)}
              </span>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sair"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-[#243044] transition-colors disabled:opacity-50"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
