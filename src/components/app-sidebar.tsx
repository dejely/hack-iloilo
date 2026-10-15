"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo, Wordmark } from "@/components/brand";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { signOut } from "@/modules/accounts/actions";
import type { Staff } from "@/modules/accounts/auth";
import { nav } from "./nav";

export function AppSidebar({ staff }: { staff: Staff }) {
  const pathname = usePathname();
  const groups = nav
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !item.role || item.role === staff.role || staff.role === "manager",
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            {/* The wordmark, or just the mark when the sidebar collapses to icons. */}
            <SidebarMenuButton
              size="lg"
              render={<Link href="/capacity" aria-label="SACKTO" />}
            >
              <Wordmark
                aria-hidden
                className="h-6! w-auto! text-primary group-data-[collapsible=icon]:hidden"
              />
              <Logo className="hidden size-8! text-primary group-data-[collapsible=icon]:block" />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sm">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      tooltip={item.title}
                      isActive={pathname.startsWith(item.href)}
                      render={<Link href={item.href} />}
                      className="h-9 text-[0.9375rem] [&_svg]:size-[1.125rem]"
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" />}>
                <Avatar className="size-8 shrink-0 rounded-full">
                  <AvatarFallback className="rounded-full bg-primary/10 font-semibold text-primary">
                    {initials(staff.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate font-medium">{staff.name}</span>
                  <span className="truncate text-xs text-muted-foreground capitalize">
                    {staff.role}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start">
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** `MM` from "Maria Manager": the first letters of the first and last names. */
function initials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return [words[0], words.length > 1 ? words.at(-1) : undefined]
    .map((word) => word?.[0]?.toUpperCase() ?? "")
    .join("");
}
