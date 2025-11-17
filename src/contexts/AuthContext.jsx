// src/contexts/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from "react";
import bcrypt from "bcryptjs";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient"; // ✅ default export
import { getStaffPins, cacheStaffPins } from "../utils/PinCache.jsx";
import { logAuditIfAuthed } from "../lib/audit";
import { fetchEdgePinSession, buildUserData } from "../lib/pinSession";

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);

  const EDGE_FUNCTION_URL =
    "https://vmtcofezozrblfxudauk.functions.supabase.co/login-with-pin";

  const cacheStaffPinsFromSupabase = async () => {
    const { data: staffList, error } = await supabase
      .from("staff")
      .select("id, name, email, permission, pin_hash");

    if (!error && staffList) {
      cacheStaffPins(staffList);
    }
  };

  // ---------- initial session restore ----------
  useEffect(() => {
    const restoreSession = async () => {
      setAuthLoading(true);
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
        } else {
          // 2) Try Supabase session first
          let storedUser = null;
          try {
            storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;
          } catch {
            storedUser = null;
          }

          const { data } = await supabase.auth.getSession();
          const session = data?.session ?? null;

          if (session?.user) {
            // ✅ There is a GoTrue session (email/password login etc.)
            const staffId = await findStaffIdForUser(session.user);

            const userData = {
              id: session.user.id,
              email: session.user.email,
              name: storedUser?.name ?? session.user.email,
              permission: (storedUser?.permission ?? "staff").toLowerCase(),
              token: session?.access_token ?? null,
              refresh_token: session?.refresh_token ?? null,
              offline: false,
              staff_id: staffId ?? storedUser?.staff_id ?? null,
            };

            console.log(
              "[AUTH] restoreSession: setting currentUser from Supabase",
              userData
            );
            setCurrentUser(userData);
            localStorage.setItem("currentUser", JSON.stringify(userData));
            localStorage.removeItem("offlineUser");

            // If we’re on the login/set-pin screen with a valid session, go to dashboard
            if (
              typeof window !== "undefined" &&
              (window.location.pathname === "/login" ||
                window.location.pathname === "/set-pin")
            ) {
              navigate("/dashboard", { replace: true });
            }
          } else if (storedUser && (storedUser.id || storedUser.email)) {
            // 3) ✅ No Supabase session, but we have a PIN-based currentUser in storage → trust it
            const normalized = {
              ...storedUser,
              staff_id: storedUser.staff_id ?? storedUser.id ?? null,
              permission: (storedUser.permission ?? "staff").toLowerCase(),
              offline: !!storedUser.offline,
            };
            console.log(
              "[AUTH] restoreSession: using stored currentUser (PIN)",
              normalized
            );
            setCurrentUser(normalized);
          } else {
            // 4) Nothing
            setCurrentUser(null);
          }
        }

        // Warm PIN cache if online (best effort)
        if (navigator.onLine) {
          cacheStaffPinsFromSupabase().catch(() => {});
        }
      } finally {
        setAuthLoading(false);
      }
    };

    restoreSession();

    // Listen to Supabase auth events ONLY for logging.
    // We do NOT let these events drive currentUser because our app uses PIN/offline auth.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(
        "[AUTH] onAuthStateChange:",
        event,
        "hasUser:",
        !!session?.user
      );
      // no state changes here on purpose
    });

    return () => {
      sub?.subscription?.unsubscribe();
    };
  }, [navigate]);

  // ---------- PIN login flow ----------
  const loginWithPin = async (pin) => {
    console.log("[AUTH] loginWithPin: start");
    setAuthLoading(true);
    const step = (n, msg) => console.log(`[AUTH][STEP ${n}] ${msg}`);

    const withTimeout = (p, ms, label) =>
      new Promise((res, rej) => {
        const t = setTimeout(
          () => rej(new Error(`${label} timeout after ${ms}ms`)),
          ms
        );
        p.then((v) => {
          clearTimeout(t);
          res(v);
        }).catch((e) => {
          clearTimeout(t);
          rej(e);
        });
      });

    try {
      // STEP 1 — clear local tokens + Supabase session if any
      step(1, "clearing local tokens + supabase session");
      try {
        localStorage.removeItem("currentUser");
        localStorage.removeItem("offlineUser");

        const { data: before } = await withTimeout(
          supabase.auth.getSession(),
          800,
          "getSession(before)"
        );
        if (before?.session) {
          await withTimeout(
            supabase.auth.signOut(),
            2000,
            "signOut(before PIN login)"
          );
        }
      } catch (e) {
        console.warn("[AUTH] pre-PIN cleanup error (ignored)", e);
      }

      const pinStr = String(pin);
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
        console.log("[AUTH][STEP 2.3] offline user set -> /dashboard");
        window.location.replace("/dashboard");
        return;
      }

      // ---------- ONLINE VIA EDGE FUNCTION ----------
      step(3, "calling Edge Function /login-with-pin");
      const result = await fetchEdgePinSession(EDGE_FUNCTION_URL, pinStr);
      console.log("[AUTH][STEP 3.1] edge ok keys:", Object.keys(result || {}));

      // ✅ create a real Supabase session in this browser
      step(4, "supabase.auth.setSession with returned tokens");
      try {
        const { data: setData, error: setErr } = await withTimeout(
          supabase.auth.setSession({
            access_token: result.access_token,
            refresh_token: result.refresh_token,
          }),
          4000,
          "setSession"
        );
        if (setErr) {
          console.error("[AUTH][STEP 4] setSession error:", setErr);
        } else {
          console.log(
            "[AUTH][STEP 4] setSession OK, hasUser:",
            !!setData?.session?.user
          );
        }
      } catch (e) {
        console.error("[AUTH][STEP 4] setSession threw:", e);
      }

      // ---------- Build userData ----------
      step(5, "buildUserData()");
      const sessionForUser = {
        user: result.user || {
          id: result.user?.id ?? null,
          email: result.email ?? null,
        },
        access_token: result.access_token,
        refresh_token: result.refresh_token,
      };

      let userData;
      try {
        userData = await buildUserData(
          sessionForUser,
          { name: result?.name, permission: result?.permission },
          findStaffIdForUser
        );
        console.log("[AUTH][STEP 5.1] buildUserData OK");
      } catch (e) {
        console.error("[AUTH] buildUserData FAILED, using fallback", e);
        userData = {
          id: sessionForUser?.user?.id ?? null,
          email: sessionForUser?.user?.email ?? result?.email ?? null,
          name: result?.name || sessionForUser?.user?.email || "User",
          permission: (result?.permission || "staff").toLowerCase(),
          token: result.access_token ?? null,
          refresh_token: result.refresh_token ?? null,
          offline: false,
          staff_id: null,
        };
      }

      step(6, "setCurrentUser + persist");
      setCurrentUser(userData);
      localStorage.setItem("currentUser", JSON.stringify(userData));
      localStorage.removeItem("offlineUser");

      step(7, "warm PIN cache (best-effort)");
      cacheStaffPinsFromSupabase().catch(() => {});

      step(8, "navigate -> /dashboard");
      window.location.replace("/dashboard");
      return;
    } catch (e) {
      console.error("[AUTH] loginWithPin error (catch):", e);
      throw e;
    } finally {
      console.log("[AUTH] loginWithPin: finally -> setAuthLoading(false)");
      setAuthLoading(false);
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

      navigate("/dashboard", { replace: true });
    } finally {
      setAuthLoading(false);
    }
  };

  // ---------- Logout ----------
  const logout = async () => {
    try {
      await logAuditIfAuthed({
        entity_type: "auth",
        entity_id: currentUser?.id ?? null,
        action: "signed_out",
        source: "auth",
        details: {
          email: currentUser?.email ?? null,
          ua: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
      });
    } finally {
      setCurrentUser(null);
      localStorage.removeItem("offlineUser");
      localStorage.removeItem("currentUser");
      await supabase.auth.signOut();
      navigate("/login", { replace: true });
    }
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
        supabaseClient: supabase,
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

    const tryUid = String(
      import.meta.env.VITE_STAFF_UID_COLUMN || ""
    ).toLowerCase();
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
