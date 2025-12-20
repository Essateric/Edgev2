// src/contexts/AuthContext.jsx
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useMemo,
} from "react";
import bcrypt from "bcryptjs";
import { useNavigate } from "react-router-dom";
import { createClient } from "@supabase/supabase-js";

import supabase from "../supabaseClient"; // ✅ default export (your base client)
import { getStaffPins, cacheStaffPins } from "../utils/PinCache.jsx";
import { logAuditIfAuthed } from "../lib/audit";
import { fetchEdgePinSession, buildUserData } from "../lib/pinSession";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timeout after ${ms}ms`)),
      ms
    );
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

function getSupabaseUrl() {
  return (
    String(import.meta.env.VITE_SUPABASE_URL || "") ||
    String(supabase?.supabaseUrl || "")
  );
}

function getSupabaseAnonKey() {
  return (
    String(import.meta.env.VITE_SUPABASE_ANON_KEY || "") ||
    String(import.meta.env.VITE_SUPABASE_KEY || "") || // fallback if you named it differently
    ""
  );
}

function getSupabaseProjectRef() {
  try {
    const url = getSupabaseUrl();
    if (!url) return null;
    return url.replace(/^https?:\/\//, "").split(".")[0] || null;
  } catch {
    return null;
  }
}

function clearSupabaseAuthStorage() {
  const ref = getSupabaseProjectRef();
  if (!ref) return;

  const shouldRemove = (k) =>
    k === `sb-${ref}-auth-token` ||
    k.startsWith(`sb-${ref}-auth-`) ||
    k.startsWith(`sb-${ref}-auth-token`);

  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && shouldRemove(k)) localStorage.removeItem(k);
    }
  } catch {
    // ignore
  }

  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k && shouldRemove(k)) sessionStorage.removeItem(k);
    }
  } catch {
    // ignore
  }
}

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  // StrictMode guard
  const didInitRef = useRef(false);

  // logout guard (so SIGNED_OUT events don’t randomly wipe PIN user)
  const logoutInProgressRef = useRef(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  const EDGE_FUNCTION_URL =
    "https://vmtcofezozrblfxudauk.functions.supabase.co/login-with-pin";

  // -------------------------------
  // ✅ Token refs (shared)
  // -------------------------------
  const tokenRef = useRef(null);
  useEffect(() => {
    tokenRef.current = currentUser?.token ?? null;
  }, [currentUser?.token]);

  // Keep latest user accessible inside callbacks
  const currentUserRef = useRef(null);
  useEffect(() => {
    currentUserRef.current = currentUser;
  }, [currentUser]);

  // Prevent multiple refresh calls at once
  const refreshInFlightRef = useRef(null);

  const decodeJwtPayload = (token) => {
    try {
      const part = token.split(".")[1];
      if (!part) return null;
      const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "===".slice((b64.length + 3) % 4);
      const json = atob(padded);
      return JSON.parse(json);
    } catch {
      return null;
    }
  };

  const tokenExpiringSoon = (token, skewSeconds = 60) => {
    const p = decodeJwtPayload(token);
    const expMs = p?.exp ? p.exp * 1000 : 0;
    if (!expMs) return true; // play safe: refresh if we can't read exp
    return expMs - Date.now() < skewSeconds * 1000;
  };

  const refreshAccessToken = async () => {
    const url = getSupabaseUrl();
    const anon = getSupabaseAnonKey();
    const u = currentUserRef.current;

    if (!url || !anon) throw new Error("Missing Supabase env (URL/ANON)");
    if (!u?.refresh_token) throw new Error("Missing refresh_token");

    const resp = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: u.refresh_token }),
    });

    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      throw new Error(
        json?.error_description || json?.msg || "Token refresh failed"
      );
    }

    const nextAccess = json.access_token;
    const nextRefresh = json.refresh_token;

    if (!nextAccess || !nextRefresh)
      throw new Error("Refresh did not return tokens");

    // update ref immediately
    tokenRef.current = nextAccess;

    // update state + storage
    setCurrentUser((prev) => {
      if (!prev) return prev;
      const next = {
        ...prev,
        token: nextAccess,
        refresh_token: nextRefresh,
        offline: false,
      };
      try {
        localStorage.setItem("currentUser", JSON.stringify(next));
      } catch {}
      return next;
    });

    return nextAccess;
  };

  const getValidAccessToken = async () => {
    const u = currentUserRef.current;

    if (!u?.token) return null;

    // if still valid, use it
    if (!tokenExpiringSoon(u.token, 60)) return u.token;

    // expiring/expired: refresh once
    if (!u.refresh_token) return u.token;

    if (!refreshInFlightRef.current) {
      refreshInFlightRef.current = refreshAccessToken().finally(() => {
        refreshInFlightRef.current = null;
      });
    }

    try {
      return await refreshInFlightRef.current;
    } catch (e) {
      console.warn("[AUTH] token refresh failed:", e?.message || e);
      return u.token; // may still 401, but at least logged
    }
  };

  // -------------------------------
  // ✅ Token-backed Supabase client (used by Calendar + Reminders)
  // -------------------------------
  const supabaseTokenClient = useMemo(() => {
    // Avoid StrictMode double-create warnings in dev
    if (
      typeof window !== "undefined" &&
      window.__edgehd_supabase_token_client__ &&
      window.__edgehd_supabase_token_client__.__token === currentUser?.token
    ) {
      return window.__edgehd_supabase_token_client__;
    }

    const url = getSupabaseUrl();
    const anon = getSupabaseAnonKey();
    if (!url || !anon) return supabase;

    const client = createClient(url, anon, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,

        // prevent “Multiple GoTrueClient instances” fighting over storage
        storageKey: "edgehd_token_client",
        storage: {
          getItem: () => null,
          setItem: () => {},
          removeItem: () => {},
        },
      },

      // Always send the current PIN access token (and apikey) on every request.
      global: {
        fetch: async (input, init = {}) => {
          const headers = new Headers(init.headers || {});
          const token = await getValidAccessToken();
          if (token) headers.set("Authorization", `Bearer ${token}`);
          headers.set("apikey", anon);
          return fetch(input, { ...init, headers });
        },
      },


      // ✅ important
      accessToken: getValidAccessToken,
    });

    if (typeof window !== "undefined") {
      client.__token = currentUser?.token || null;
      window.__edgehd_supabase_token_client__ = client;
    }

    return client;
    // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [currentUser?.token]);

  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList, error } = await supabase
      .from("staff")
      .select("id, name, email, permission, pin_hash");
    if (!error && staffList) cacheStaffPins(staffList);
  };

  const warmPinCache = async () => {
    if (!navigator.onLine) return;
    try {
      await withTimeout(cacheStaffPinsFromSupabase(), 4000, "cacheStaffPins");
    } catch {
      // best effort
    }
  };

  // ---------- initial session restore ----------
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    let cancelled = false;

    const path = typeof window !== "undefined" ? window.location.pathname : "";
    const isAuthRoute = path === "/login" || path === "/set-pin";

    const restoreSession = async () => {
      if (!isAuthRoute) setAuthLoading(true);
      else setAuthLoading(false);

      try {
        const offlineUserRaw = localStorage.getItem("offlineUser");
        const storedUserRaw = localStorage.getItem("currentUser");

        // 1) OFFLINE user takes priority
        if (offlineUserRaw) {
          let parsed = null;
          try {
            parsed = JSON.parse(offlineUserRaw);
          } catch {
            parsed = null;
          }

          if (cancelled) return;

          if (parsed) {
            setCurrentUser({
              ...parsed,
              staff_id: parsed.staff_id ?? parsed.id ?? null,
              permission: (parsed.permission ?? "staff").toLowerCase(),
              offline: true,
            });
          } else {
            setCurrentUser(null);
          }

          warmPinCache().catch(() => {});
          return;
        }

        // 2) Stored PIN user (fast path)
        let storedUser = null;
        try {
          storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
        } catch {
          storedUser = null;
        }

        if (!cancelled && storedUser && (storedUser.id || storedUser.email)) {
          const normalized = {
            ...storedUser,
            staff_id: storedUser.staff_id ?? storedUser.id ?? null,
            permission: (storedUser.permission ?? "staff").toLowerCase(),
            offline: !!storedUser.offline,
          };
          console.log("[AUTH] restoreSession: using stored currentUser (PIN)", normalized);
          setCurrentUser(normalized);

          // Best-effort: seed Supabase session (never block UI)
          if (
            navigator.onLine &&
            normalized?.token &&
            normalized?.refresh_token &&
            !normalized.offline
          ) {
            try {
              const p = supabase.auth.setSession({
                access_token: normalized.token,
                refresh_token: normalized.refresh_token,
              });
              withTimeout(p, 2500, "restore setSession").catch((e) => {
                console.warn(
                  "[AUTH] seedSupabaseFromStoredUser failed/timeout (ignored)",
                  e?.message || e
                );
              });
            } catch {
              // ignore
            }
          }

          warmPinCache().catch(() => {});
          return;
        }

        // 3) No stored PIN user
        if (isAuthRoute) {
          warmPinCache().catch(() => {});
          return;
        }

        // 4) Private routes: best-effort Supabase session
        const { data } = await withTimeout(
          supabase.auth.getSession(),
          5000,
          "supabase.auth.getSession"
        );
        if (cancelled) return;

        const session = data?.session ?? null;

        if (session?.user) {
          const staffId = await findStaffIdForUser(session.user);

          const userData = {
            id: session.user.id,
            email: session.user.email,
            name: session.user.email,
            permission: "staff",
            token: session.access_token ?? null,
            refresh_token: session.refresh_token ?? null,
            offline: false,
            staff_id: staffId ?? null,
          };

          console.log("[AUTH] restoreSession: setting currentUser from Supabase", userData);
          setCurrentUser(userData);
          localStorage.setItem("currentUser", JSON.stringify(userData));
          localStorage.removeItem("offlineUser");
        } else {
          setCurrentUser(null);
        }

        warmPinCache().catch(() => {});
      } catch (e) {
        console.warn("[AUTH] restoreSession warning:", e);
      } finally {
        if (!cancelled && !isAuthRoute) setAuthLoading(false);
      }
    };

    restoreSession();

    // Keep tokens in sync if Supabase refreshes them
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[AUTH] onAuthStateChange:", event, "hasUser:", !!session?.user);

      if (localStorage.getItem("offlineUser")) return;

      if (event === "SIGNED_OUT") {
        if (logoutInProgressRef.current) {
          setCurrentUser(null);
          localStorage.removeItem("offlineUser");
          localStorage.removeItem("currentUser");
          logoutInProgressRef.current = false;
        }
        return;
      }

      if (
        session?.user &&
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
      ) {
        setCurrentUser((prev) => {
          if (!prev || prev.offline) return prev;
          if (prev.id && prev.id !== session.user.id) return prev;

          const next = {
            ...prev,
            token: session.access_token ?? prev.token ?? null,
            refresh_token: session.refresh_token ?? prev.refresh_token ?? null,
          };

          try {
            localStorage.setItem("currentUser", JSON.stringify(next));
          } catch {}

          return next;
        });
      }
    });

    return () => {
      cancelled = true;
      sub?.subscription?.unsubscribe();
    };
  }, [navigate]);

  // ---------- PIN login flow ----------
  const loginWithPin = async (pin) => {
    console.log("[AUTH] loginWithPin: start");
    setAuthLoading(true);

    const step = (n, msg) => console.log(`[AUTH][STEP ${n}] ${msg}`);

    try {
      const pinStr = String(pin ?? "").trim();
      if (!pinStr) throw new Error("PIN required");

      step(1, "clearing local tokens (no signOut)");
      localStorage.removeItem("currentUser");
      localStorage.removeItem("offlineUser");

      logoutInProgressRef.current = false;

      try {
        supabase.auth.stopAutoRefresh();
      } catch {}

      step(2, `navigator.onLine=${navigator.onLine}`);

      // ---------- OFFLINE ----------
      if (!navigator.onLine) {
        step(2.1, "offline path -> loading cached staff pins");
        const staffPins = await getStaffPins();
        step(2.2, `cached staff count=${staffPins?.length ?? 0}`);

        const user = staffPins.find(
          (s) => s.pin_hash && bcrypt.compareSync(pinStr, s.pin_hash)
        );
        if (!user) throw new Error("Invalid PIN (offline)");

        const offlineUser = {
          ...user,
          offline: true,
          staff_id: user.id ?? null,
          permission: (user.permission ?? "staff").toLowerCase(),
          token: null,
          refresh_token: null,
        };

        setCurrentUser(offlineUser);
        localStorage.setItem("offlineUser", JSON.stringify(offlineUser));
        localStorage.removeItem("currentUser");

        console.log("[AUTH][STEP 2.3] offline user set -> /calendar");
        window.location.replace("/calendar");
        return;
      }

      // ---------- ONLINE VIA EDGE FUNCTION ----------
      step(3, "calling Edge Function /login-with-pin");
      const result = await fetchEdgePinSession(EDGE_FUNCTION_URL, pinStr);
      console.log("[AUTH][STEP 3.1] edge ok keys:", Object.keys(result || {}));

      const access_token = result?.access_token;
      const refresh_token = result?.refresh_token;
      if (!access_token || !refresh_token) {
        throw new Error("Edge function did not return access/refresh tokens");
      }

      step(4, "supabase.auth.setSession with returned tokens");
      try {
        const p = supabase.auth.setSession({ access_token, refresh_token });
        await withTimeout(p, 5000, "setSession");
      } catch (e) {
        console.warn("[AUTH][STEP 4] setSession slow/failed (ignored)", e?.message || e);
      }

      step(5, "buildUserData()");

      const sessionForUser = {
        user:
          result.user || {
            id: result.user?.id ?? null,
            email: result.email ?? null,
          },
        access_token,
        refresh_token,
      };

      const fallbackUser = {
        id: sessionForUser?.user?.id ?? null,
        email: sessionForUser?.user?.email ?? result?.email ?? null,
        name: result?.name || sessionForUser?.user?.email || "User",
        permission: (result?.permission || "staff").toLowerCase(),
        token: access_token,
        refresh_token,
        offline: false,
        staff_id: result?.staff_id ?? null,
      };

      let userData = fallbackUser;

      try {
        const safeFindStaffId = async (authUser) => {
          if (result?.staff_id) return result.staff_id;
          return await withTimeout(findStaffIdForUser(authUser), 1500, "findStaffIdForUser");
        };

        userData = await withTimeout(
          buildUserData(
            sessionForUser,
            { name: result?.name, permission: result?.permission },
            safeFindStaffId
          ),
          2000,
          "buildUserData"
        );

        userData = {
          ...userData,
          token: access_token,
          refresh_token,
          staff_id: userData.staff_id ?? result?.staff_id ?? null,
        };
      } catch (e) {
        console.warn("[AUTH][STEP 5] buildUserData slow/failed; using fallback", e?.message || e);
        userData = fallbackUser;
      }

      step(6, "setCurrentUser + persist");
      setCurrentUser(userData);
      localStorage.setItem("currentUser", JSON.stringify(userData));
      localStorage.removeItem("offlineUser");

      step(7, "warm PIN cache (best-effort)");
      warmPinCache().catch(() => {});

      try {
        supabase.auth.startAutoRefresh();
      } catch {}

      step(8, "navigate -> /calendar");
      window.location.replace("/calendar");
    } catch (e) {
      console.error("[AUTH] loginWithPin error:", e);
      throw e;
    } finally {
      setAuthLoading(false);
      console.log("[AUTH] loginWithPin: end");
    }
  };

  // ---------- Email/password login ----------
  const login = async (email, password) => {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw new Error(error.message);

      const staffId = await findStaffIdForUser(data.user);
      const user = {
        id: data.user.id,
        email: data.user.email,
        name: data.user.email,
        permission: "staff",
        token: data.session.access_token ?? null,
        refresh_token: data.session.refresh_token ?? null,
        offline: false,
        staff_id: staffId ?? null,
      };

      setCurrentUser(user);
      localStorage.setItem("currentUser", JSON.stringify(user));
      localStorage.removeItem("offlineUser");

      navigate("/calendar", { replace: true });
    } finally {
      setAuthLoading(false);
    }
  };

  // ---------- Logout ----------
  const logout = async () => {
    console.log("[AUTH] logout: start");
    const snapshot = currentUser;

    logoutInProgressRef.current = true;

    try {
      supabase.auth.stopAutoRefresh();
    } catch {}

    setCurrentUser(null);
    setAuthLoading(false);
    setPageLoading(false);
    localStorage.removeItem("offlineUser");
    localStorage.removeItem("currentUser");

    clearSupabaseAuthStorage();

    try {
      await withTimeout(
        logAuditIfAuthed({
          entity_type: "auth",
          entity_id: snapshot?.id ?? null,
          action: "signed_out",
          source: "auth",
          details: {
            email: snapshot?.email ?? null,
            ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
          },
        }),
        800,
        "logout audit"
      );
    } catch (e) {
      console.warn("[AUTH] audit on logout failed/timeout (ignored)", e?.message || e);
    }

    try {
      await withTimeout(
        supabase.auth.signOut({ scope: "local" }),
        800,
        "signOut(local)"
      );
    } catch (e) {
      console.warn("[AUTH] signOut(local) failed/timeout (ignored)", e?.message || e);
    }

    console.log("[AUTH] logout: redirect -> /login");
    window.location.replace("/login");

    try {
      supabase.auth.signOut({ scope: "global" }).catch(() => {});
    } catch {}
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        login,
        loginWithPin,
        logout,
        authLoading,
        isAuthenticated: !!currentUser,
        pageLoading,
        setPageLoading,

        // ✅ token-backed client
        supabaseClient: supabaseTokenClient,

        // optional: still expose the base client
        baseSupabaseClient: supabase,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

/* ----------------------- helpers ----------------------- */
async function findStaffIdForUser(authUser) {
  try {
    if (!authUser) return null;

    if (authUser.email) {
      const byEmail = await supabase
        .from("staff")
        .select("id")
        .eq("email", authUser.email)
        .maybeSingle();
      if (!byEmail.error && byEmail.data?.id) return byEmail.data.id;
    }

    const tryUid = String(import.meta.env.VITE_STAFF_UID_COLUMN || "").toLowerCase();
    const uidEnabled = tryUid === "1" || tryUid === "true" || tryUid === "yes";

    if (uidEnabled) {
      try {
        const byUid = await supabase
          .from("staff")
          .select("id")
          .eq("uid", authUser.id)
          .maybeSingle();
        if (!byUid.error && byUid.data?.id) return byUid.data.id;
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
  return null;
}
