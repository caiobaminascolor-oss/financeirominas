import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "ADMIN" | "GERENTE" | "VENDEDOR" | "FINANCEIRO" | "ESTOQUE";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  hasRole: (...roles: AppRole[]) => boolean;
  canSeeFinance: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadDetails = (userId: string) => {
      // Deferred so we never call other Supabase APIs inside the auth callback.
      setTimeout(async () => {
        const [{ data: profileRow }, { data: roleRows }] = await Promise.all([
          supabase.from("profiles").select("id, full_name, email, avatar_url").eq("id", userId).maybeSingle(),
          supabase.from("user_roles").select("role").eq("user_id", userId),
        ]);
        if (!active) return;
        setProfile((profileRow as Profile) ?? null);
        setRoles(((roleRows ?? []) as { role: AppRole }[]).map((r) => r.role));
      }, 0);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (nextSession?.user) {
        loadDetails(nextSession.user.id);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) loadDetails(data.session.user.id);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const hasRole = (...wanted: AppRole[]) => wanted.some((r) => roles.includes(r));
    return {
      session,
      user: session?.user ?? null,
      profile,
      roles,
      loading,
      hasRole,
      canSeeFinance: hasRole("ADMIN", "GERENTE", "FINANCEIRO"),
      signOut: async () => {
        await supabase.auth.signOut();
      },
    };
  }, [session, profile, roles, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
