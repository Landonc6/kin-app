"use client";
/**
 * Kin V3 — Integrated Frontend
 *
 * Screens in this file (single-file app):
 *   1. Onboarding / Auth
 *   2. Home Dashboard (real memory greeting)
 *   3. Bill Scanner (with "Call Myself" vs "Do It For Me" options)
 *   4. Auto-Negotiation Draft Approval screen
 *   5. Confirm Savings (triggers 10% fee)
 *   6. Legacy Story recorder
 *   7. Family Seats + Gift Invite
 *   8. Subscription / Upgrade screen
 *
 * Required env vars (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL=
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=
 *   NEXT_PUBLIC_API_URL=
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ── Supabase client ────────────────────────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Design tokens ──────────────────────────────────────────────────────────
const C = {
  forest:  "#1a2e1e",
  green:   "#2d5a3d",
  sage:    "#3d6b52",
  mint:    "#7fb896",
  cream:   "#f5f0e8",
  gold:    "#c9a84c",
  warm:    "#e8dcc8",
  text:    "#1a1a1a",
  muted:   "#666",
  danger:  "#c0392b",
  success: "#27ae60",
};

const styles = {
  app:      { minHeight:"100vh", background:C.cream, fontFamily:"Georgia, serif", color:C.text },
  screen:   { maxWidth:480, margin:"0 auto", padding:"0 0 80px 0" },
  header:   { background:C.forest, color:C.cream, padding:"48px 24px 32px", textAlign:"center" },
  greeting: { fontSize:18, lineHeight:1.6, opacity:0.9, marginTop:12 },
  card:     { background:"white", borderRadius:16, padding:24, margin:"16px 16px 0", boxShadow:"0 2px 12px rgba(0,0,0,0.08)" },
  btn:      { display:"block", width:"100%", padding:"16px 24px", borderRadius:12, border:"none",
              cursor:"pointer", fontSize:16, fontWeight:600, textAlign:"center", marginTop:12 },
  btnPrimary: { background:C.sage, color:"white" },
  btnGold:    { background:C.gold, color:C.forest },
  btnOutline: { background:"transparent", border:`2px solid ${C.sage}`, color:C.sage },
  btnDanger:  { background:C.danger, color:"white" },
  input:    { width:"100%", padding:"14px 16px", borderRadius:10, border:`1px solid #ddd`,
              fontSize:15, boxSizing:"border-box", marginTop:8 },
  label:    { fontSize:13, fontWeight:600, color:C.muted, textTransform:"uppercase", letterSpacing:1 },
  badge:    { display:"inline-block", padding:"4px 10px", borderRadius:20, fontSize:12, fontWeight:700 },
};

// ─────────────────────────────────────────────────────────────────────────────
// AUTH HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useAuth() {
  const [user, setUser]       = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setUser(session?.user ?? null); setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setUser(s?.user ?? null); setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signIn  = (email, pw) => supabase.auth.signInWithPassword({ email, password: pw });
  const signUp  = (email, pw, name) => supabase.auth.signUp({
    email, password: pw, options: { data: { display_name: name } }
  });
  const signOut = () => supabase.auth.signOut();
  return { user, session, loading, signIn, signUp, signOut };
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL MEMORY HOOK — pulls from API (which queries Supabase live)
// ─────────────────────────────────────────────────────────────────────────────
function useMemory(memberId, session) {
  const [memory, setMemory]   = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!memberId) return;
    setLoading(true);
    try {
      const r = await window.fetch(`${API_URL}/api/memory/${memberId}`, {
        headers: { Authorization: `Bearer ${session?.access_token || "dev-token"}` }
      });
      if (r.ok) setMemory(await r.json());
    } catch (e) {
      console.error("Memory fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [memberId, session]);

  useEffect(() => { fetch(); }, [fetch]);

  // Real-time: refresh when bills or stories change
  useEffect(() => {
    if (!memberId) return;
    const chan = supabase.channel(`memory-refresh:${memberId}`)
      .on("postgres_changes", { event:"*", schema:"public", table:"bills"        }, fetch)
      .on("postgres_changes", { event:"*", schema:"public", table:"legacy_stories"}, fetch)
      .subscribe();
    return () => supabase.removeChannel(chan);
  }, [memberId, fetch]);

  return { memory, loading, refresh: fetch };
}

// ─────────────────────────────────────────────────────────────────────────────
// BILL SCAN HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useBillScan(familyUnitId, memberId, session) {
  const [scanning, setScanning]   = useState(false);
  const [progress, setProgress]   = useState(0);
  const [result, setResult]       = useState(null);
  const [error, setError]         = useState(null);
  const progressRef               = useRef(null);

  const scan = async (file, autoNegotiate = false) => {
    setScanning(true); setResult(null); setError(null); setProgress(0);
    progressRef.current = setInterval(() => {
      setProgress(p => p >= 85 ? 85 : p + Math.random() * 12);
    }, 300);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("family_unit_id", familyUnitId || "");
      form.append("member_id", memberId || "");
      form.append("auto_negotiate", autoNegotiate ? "true" : "false");
      const r = await window.fetch(`${API_URL}/api/scan-bill`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token || "dev-token"}` },
        body: form,
      });
      if (!r.ok) { const e = await r.json(); throw new Error(e.detail || "Scan failed"); }
      const data = await r.json();
      clearInterval(progressRef.current); setProgress(100); setResult(data);
      return data;
    } catch (e) {
      clearInterval(progressRef.current); setError(e.message); throw e;
    } finally { setScanning(false); }
  };

  return { scan, scanning, progress, result, setResult, error };
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function KinApp() {
  const { user, session, loading, signIn, signUp, signOut } = useAuth();
  const [screen, setScreen]   = useState("home");
  const [memberId, setMemberId] = useState(null);
  const [familyId, setFamilyId] = useState(null);

  // Fetch member record after login
  useEffect(() => {
    if (!user) return;
    supabase
      .from("family_members")
      .select("id, family_unit_id")
      .eq("auth_user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data) { setMemberId(data.id); setFamilyId(data.family_unit_id); }
      });
  }, [user]);

  if (loading) return <Loading />;
  if (!user)   return <AuthScreen signIn={signIn} signUp={signUp} />;

  const props = { user, session, memberId, familyId, setScreen, signOut };

  return (
    <div style={styles.app}>
      <div style={styles.screen}>
        {screen === "home"         && <HomeScreen         {...props} />}
        {screen === "scan"         && <ScanScreen         {...props} />}
        {screen === "stories"      && <StoriesScreen      {...props} />}
        {screen === "family"       && <FamilyScreen       {...props} />}
        {screen === "subscribe"    && <SubscribeScreen    {...props} />}
        <BottomNav screen={screen} setScreen={setScreen} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOADING
// ─────────────────────────────────────────────────────────────────────────────
function Loading() {
  return (
    <div style={{ ...styles.app, display:"flex", alignItems:"center", justifyContent:"center" }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:48 }}>🛡️</div>
        <p style={{ color:C.sage, marginTop:12 }}>Kin is waking up…</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function AuthScreen({ signIn, signUp }) {
  const [mode, setMode]   = useState("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw]       = useState("");
  const [name, setName]   = useState("");
  const [err, setErr]     = useState("");
  const [busy, setBusy]   = useState(false);

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      if (mode === "signin") {
        const { error } = await signIn(email, pw);
        if (error) setErr(error.message);
      } else {
        const { error } = await signUp(email, pw, name);
        if (error) setErr(error.message);
        else setErr("Check your email to confirm your account, then sign in.");
      }
    } finally { setBusy(false); }
  };

  return (
    <div style={styles.app}>
      <div style={{ ...styles.header, padding:"64px 24px 48px" }}>
        <div style={{ fontSize:56 }}>🛡️</div>
        <h1 style={{ margin:"16px 0 8px", fontSize:32 }}>Kin</h1>
        <p style={{ opacity:0.8, margin:0 }}>Your family's financial guardian</p>
      </div>
      <div style={styles.card}>
        <h2 style={{ marginTop:0 }}>{mode === "signin" ? "Welcome back" : "Create your family vault"}</h2>
        {mode === "signup" && (
          <>
            <label style={styles.label}>Your first name</label>
            <input style={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Marcus" />
          </>
        )}
        <label style={styles.label}>Email</label>
        <input style={styles.input} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" />
        <label style={styles.label}>Password</label>
        <input style={styles.input} type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" />
        {err && <p style={{ color: err.includes("Check") ? C.success : C.danger, fontSize:14 }}>{err}</p>}
        <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={submit} disabled={busy}>
          {busy ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
        </button>
        <button style={{ ...styles.btn, ...styles.btnOutline, marginTop:8 }} onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
          {mode === "signin" ? "Create a new account" : "Already have an account"}
        </button>
      </div>
      <p style={{ textAlign:"center", fontSize:13, color:C.muted, padding:"16px 24px" }}>
        Your data is encrypted. Your stories stay on your device. Kin never sells your information.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HOME SCREEN — real memory greeting + dashboard
// ─────────────────────────────────────────────────────────────────────────────
function HomeScreen({ memberId, familyId, session, setScreen, signOut }) {
  const { memory, loading } = useMemory(memberId, session);

  return (
    <>
      {/* Header with real memory greeting */}
      <div style={styles.header}>
        <div style={{ fontSize:36 }}>🛡️</div>
        {loading ? (
          <p style={styles.greeting}>Loading your shield…</p>
        ) : (
          <p style={styles.greeting}>{memory?._greeting || "Good morning. Kin is ready."}</p>
        )}
      </div>

      {/* Savings summary */}
      {memory?.total_saved_cents > 0 && (
        <div style={{ ...styles.card, background:C.forest, color:C.cream }}>
          <p style={{ margin:0, fontSize:13, opacity:0.7, textTransform:"uppercase", letterSpacing:1 }}>Total Protected</p>
          <p style={{ margin:"4px 0 0", fontSize:36, fontWeight:700 }}>
            ${(memory.total_saved_cents / 100).toFixed(0)}
          </p>
          <p style={{ margin:"4px 0 0", fontSize:14, opacity:0.7 }}>saved for your family</p>
        </div>
      )}

      {/* Pending bills */}
      {memory?.pending_bills?.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ margin:"0 0 12px" }}>💰 Savings Waiting</h3>
          {memory.pending_bills.map((b, i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"10px 0", borderBottom: i < memory.pending_bills.length-1 ? "1px solid #eee" : "none" }}>
              <div>
                <p style={{ margin:0, fontWeight:600 }}>{b.provider}</p>
                <p style={{ margin:0, fontSize:13, color:C.muted }}>{b.days_ago > 0 ? `${b.days_ago} days ago` : "today"}</p>
              </div>
              <div style={{ textAlign:"right" }}>
                <p style={{ margin:0, fontWeight:700, color:C.success }}>${b.potential_saving}/mo</p>
                <p style={{ margin:0, fontSize:12, color:C.muted }}>potential</p>
              </div>
            </div>
          ))}
          <button style={{ ...styles.btn, ...styles.btnGold, marginTop:16 }} onClick={() => setScreen("scan")}>
            Review & Negotiate →
          </button>
        </div>
      )}

      {/* Quick actions */}
      <div style={styles.card}>
        <h3 style={{ margin:"0 0 16px" }}>Your Shield</h3>
        <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => setScreen("scan")}>
          📄 Scan a Bill
        </button>
        <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => setScreen("stories")}>
          🎙 Record a Story
        </button>
        <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => setScreen("family")}>
          👨‍👩‍👧 Family Seats
        </button>
      </div>

      {/* Stories this week */}
      {memory?.stories_this_week > 0 && (
        <div style={{ ...styles.card, background:C.warm }}>
          <p style={{ margin:0 }}>
            📖 <strong>{memory.stories_this_week} {memory.stories_this_week === 1 ? "story" : "stories"}</strong> added to your archive this week.
          </p>
        </div>
      )}

      <div style={{ padding:"24px 16px 0", textAlign:"right" }}>
        <button style={{ background:"none", border:"none", color:C.muted, fontSize:13, cursor:"pointer" }} onClick={signOut}>
          Sign out
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SCAN SCREEN — the bodyguard
// ─────────────────────────────────────────────────────────────────────────────
function ScanScreen({ memberId, familyId, session }) {
  const { scan, scanning, progress, result, setResult, error } = useBillScan(familyId, memberId, session);
  const [mode, setMode]         = useState(null);         // "self" | "auto"
  const [autoNeg, setAutoNeg]   = useState(null);         // auto-negotiation draft
  const [confirming, setConfirm] = useState(false);
  const [savedAmt, setSavedAmt] = useState("");
  const fileRef = useRef();

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !mode) return;
    await scan(file, mode === "auto");
  };

  const handleConfirmSavings = async () => {
    if (!result?.bill_id || !savedAmt) return;
    setConfirm(true);
    try {
      const r = await window.fetch(`${API_URL}/api/confirm-savings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || "dev-token"}`,
        },
        body: JSON.stringify({
          bill_id: result.bill_id,
          family_unit_id: familyId,
          member_id: memberId,
          actual_saving_dollars: parseFloat(savedAmt),
          provider: result.provider,
          category: result.category,
        }),
      });
      const data = await r.json();
      alert(`✅ Confirmed! You kept $${data.family_net_dollars}/mo. Kin's fee: $${data.kin_fee_dollars}/mo. Well done.`);
      setResult(null); setMode(null); setSavedAmt("");
    } finally { setConfirm(false); }
  };

  // Mode selection
  if (!mode) {
    return (
      <>
        <div style={styles.header}>
          <h2 style={{ margin:0 }}>Budget Bodyguard</h2>
          <p style={{ opacity:0.8, marginTop:8 }}>Scan any bill. Find savings. Keep more money.</p>
        </div>
        <div style={styles.card}>
          <h3 style={{ marginTop:0 }}>How do you want to handle this?</h3>

          <button style={{ ...styles.btn, ...styles.btnPrimary, marginTop:16 }} onClick={() => setMode("self")}>
            📞 I'll Call Myself
          </button>
          <p style={{ fontSize:13, color:C.muted, textAlign:"center", margin:"8px 0 0" }}>
            Kin gives you the script. You make the call.
          </p>

          <div style={{ margin:"24px 0", borderTop:"1px solid #eee" }} />

          <button style={{ ...styles.btn, ...styles.btnGold }} onClick={() => setMode("auto")}>
            🤖 Do It For Me
          </button>
          <p style={{ fontSize:13, color:C.muted, textAlign:"center", margin:"8px 0 0" }}>
            Kin drafts the negotiation. You approve. We send it.
          </p>
        </div>
        <p style={{ fontSize:12, color:C.muted, textAlign:"center", padding:"0 24px" }}>
          10% success fee only applies when you confirm real savings. No savings = no fee.
        </p>
      </>
    );
  }

  // Scan result
  if (result) {
    const hasSavings = result.status === "savings_found";
    return (
      <>
        <div style={{ ...styles.header, background: hasSavings ? C.sage : C.forest }}>
          <div style={{ fontSize:36 }}>{hasSavings ? "💰" : "✅"}</div>
          <h2 style={{ margin:"8px 0 0" }}>{result.provider}</h2>
          <p style={{ opacity:0.8, margin:"4px 0 0" }}>{result.agent_message}</p>
        </div>

        {result.human_flag && (
          <div style={{ ...styles.card, borderLeft:`4px solid ${C.gold}` }}>
            <p style={{ margin:0 }}>⚑ {result.human_flag}</p>
          </div>
        )}

        {hasSavings && (
          <div style={styles.card}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, textAlign:"center" }}>
              <Stat label="Monthly Savings" value={`$${result.saving_monthly_dollars?.toFixed(2)}`} highlight />
              <Stat label="Annual Savings"  value={`$${result.saving_annual_dollars?.toFixed(2)}`}  />
              <Stat label="You Keep (90%)"  value={`$${result.family_net_dollars?.toFixed(2)}/mo`}  />
              <Stat label="Kin's 10% Fee"   value={`$${result.kin_fee_dollars?.toFixed(2)}/mo`}     />
            </div>
            <p style={{ textAlign:"center", fontSize:13, color:C.muted, margin:"12px 0 0" }}>
              Best alternative: <strong>{result.best_competitor}</strong> at ${result.competitor_rate_dollars?.toFixed(2)}/mo
            </p>
          </div>
        )}

        {/* Auto-negotiation draft */}
        {result.auto_negotiation && (
          <div style={{ ...styles.card, borderLeft:`4px solid ${C.gold}` }}>
            <h3 style={{ marginTop:0 }}>🤖 Kin's Draft Message</h3>
            <p style={{ lineHeight:1.6, color:C.text }}>
              {result.auto_negotiation.draft_message}
            </p>
            <p style={{ fontSize:13, color:C.muted }}>{result.auto_negotiation.approval_prompt}</p>
            <button style={{ ...styles.btn, ...styles.btnGold }}>
              ✓ Send on My Behalf
            </button>
            <button style={{ ...styles.btn, ...styles.btnOutline, marginTop:8 }}>
              ✏️ Edit First
            </button>
          </div>
        )}

        {/* DIY script */}
        {mode === "self" && result.negotiation_script && (
          <div style={styles.card}>
            <h3 style={{ marginTop:0 }}>📞 Your Script</h3>
            <ScriptStep n={1} title="Opening" text={result.negotiation_script.opening} />
            <ScriptStep n={2} title="If They Hesitate" text={result.negotiation_script.escalation} />
            <ScriptStep n={3} title="Partial Offer" text={result.negotiation_script.partial_win} />
            <ScriptStep n={4} title="Magic Phrase" text={result.negotiation_script.magic_phrase} highlight />
            <ScriptStep n={5} title="Callback Play" text={result.negotiation_script.callback_play} />
          </div>
        )}

        {/* Confirm savings */}
        {hasSavings && (
          <div style={styles.card}>
            <h3 style={{ marginTop:0 }}>Did you save money?</h3>
            <p style={{ fontSize:14, color:C.muted }}>
              After your call or message, confirm what you actually saved. Kin's 10% fee is charged only on verified savings.
            </p>
            <label style={styles.label}>Actual monthly saving ($)</label>
            <input style={styles.input} type="number" value={savedAmt} onChange={e => setSavedAmt(e.target.value)} placeholder="e.g. 35.00" />
            <button style={{ ...styles.btn, ...styles.btnGold, marginTop:12 }} onClick={handleConfirmSavings} disabled={confirming || !savedAmt}>
              {confirming ? "Confirming…" : "✓ I Saved This Much"}
            </button>
          </div>
        )}

        <div style={{ padding:"0 16px" }}>
          <button style={{ ...styles.btn, ...styles.btnOutline, marginTop:8 }} onClick={() => { setResult(null); setMode(null); }}>
            ← Scan Another Bill
          </button>
        </div>
      </>
    );
  }

  // Upload UI
  return (
    <>
      <div style={styles.header}>
        <h2 style={{ margin:0 }}>{mode === "auto" ? "🤖 Do It For Me" : "📞 I'll Call Myself"}</h2>
        <p style={{ opacity:0.8, marginTop:8 }}>
          {mode === "auto" ? "Snap the bill. Kin drafts the negotiation." : "Snap the bill. Get your script."}
        </p>
      </div>
      <div style={styles.card}>
        {scanning ? (
          <div style={{ textAlign:"center", padding:32 }}>
            <div style={{ fontSize:48 }}>🔍</div>
            <p>Reading your bill…</p>
            <div style={{ background:"#eee", borderRadius:8, height:8, margin:"16px 0" }}>
              <div style={{ background:C.sage, width:`${progress}%`, height:"100%", borderRadius:8, transition:"width 0.3s" }} />
            </div>
            <p style={{ fontSize:13, color:C.muted }}>Masking personal information…</p>
          </div>
        ) : (
          <div style={{ textAlign:"center", padding:32 }}>
            <div style={{ fontSize:64 }}>📄</div>
            <p>Take a photo of your bill</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display:"none" }} onChange={handleFile} />
            <button style={{ ...styles.btn, ...styles.btnPrimary }} onClick={() => fileRef.current?.click()}>
              Take Photo
            </button>
            <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => { const f = document.createElement("input"); f.type="file"; f.accept="image/*"; f.onchange=handleFile; f.click(); }}>
              Upload from Library
            </button>
            {error && <p style={{ color:C.danger, fontSize:14 }}>{error}</p>}
          </div>
        )}
      </div>
      <button style={{ ...styles.btn, ...styles.btnOutline, margin:"8px 16px 0" }} onClick={() => setMode(null)}>
        ← Change approach
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STORIES SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function StoriesScreen({ memberId, familyId, session }) {
  const [stories, setStories]   = useState([]);
  const [recording, setRecord]  = useState(false);
  const [prompt, setPrompt]     = useState("");
  const [milestone, setMilestone] = useState("immediate");
  const [unlockDate, setDate]   = useState("");

  const PROMPTS = [
    "What's the hardest lesson your father taught you?",
    "When did you first feel truly proud of yourself?",
    "What would you want your children to know about hard times?",
    "Describe the morning that changed your life.",
    "What does protection mean to you?",
  ];

  useEffect(() => {
    if (!familyId) return;
    supabase.from("legacy_stories").select("*").eq("family_unit_id", familyId).order("created_at", { ascending:false })
      .then(({ data }) => setStories(data || []));
  }, [familyId]);

  const randomPrompt = () => setPrompt(PROMPTS[Math.floor(Math.random() * PROMPTS.length)]);

  const MILESTONE_LABELS = {
    "immediate":   "Share Now",
    "18th_birthday": "18th Birthday 🎂",
    "graduation":  "Graduation 🎓",
    "wedding":     "Wedding Day 💍",
    "first_job":   "First Job 💼",
    "hard_times":  "Hard Times ❤️",
    "parenthood":  "Parenthood 🍃",
    "custom_date": "Custom Date 📅",
  };

  return (
    <>
      <div style={styles.header}>
        <h2 style={{ margin:0 }}>Legacy Archive</h2>
        <p style={{ opacity:0.8, marginTop:8 }}>Your voice. Their inheritance.</p>
      </div>
      <div style={styles.card}>
        <h3 style={{ marginTop:0 }}>Record a New Story</h3>
        <button style={{ ...styles.btn, ...styles.btnOutline, marginBottom:12 }} onClick={randomPrompt}>
          ✨ Give me a prompt
        </button>
        {prompt && (
          <div style={{ background:C.warm, padding:16, borderRadius:10, marginBottom:12 }}>
            <p style={{ margin:0, fontStyle:"italic" }}>"{prompt}"</p>
          </div>
        )}
        <label style={styles.label}>Lock until milestone</label>
        <select style={{ ...styles.input, marginBottom:12 }} value={milestone} onChange={e => setMilestone(e.target.value)}>
          {Object.entries(MILESTONE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {milestone === "custom_date" && (
          <>
            <label style={styles.label}>Unlock Date</label>
            <input style={styles.input} type="date" value={unlockDate} onChange={e => setDate(e.target.value)} />
          </>
        )}
        <button style={{ ...styles.btn, ...styles.btnPrimary, marginTop:12 }}>
          🎙 Start Recording
        </button>
        <p style={{ fontSize:12, color:C.muted, textAlign:"center", marginTop:8 }}>
          Audio stays on your device. Server stores metadata only.
        </p>
      </div>

      {stories.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ marginTop:0 }}>Your Archive ({stories.length})</h3>
          {stories.map(s => (
            <div key={s.id} style={{ padding:"12px 0", borderBottom:"1px solid #eee" }}>
              <p style={{ margin:"0 0 4px", fontWeight:600, fontSize:14 }}>{s.prompt_text?.slice(0,60)}…</p>
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ ...styles.badge, background: s.unlocked_at ? C.success : C.gold, color:"white" }}>
                  {s.unlocked_at ? "✓ Unlocked" : `🔒 ${MILESTONE_LABELS[s.milestone_type] || s.milestone_type}`}
                </span>
                {s.duration_seconds && (
                  <span style={{ fontSize:12, color:C.muted }}>{Math.round(s.duration_seconds/60)}m</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FAMILY SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function FamilyScreen({ memberId, familyId, session, setScreen }) {
  const [seats, setSeats] = useState([]);
  const [giftName, setGiftName] = useState("");
  const [giftRole, setGiftRole] = useState("member");
  const [giftMsg, setGiftMsg]   = useState("");
  const [inviteUrl, setUrl]     = useState("");
  const [sending, setSending]   = useState(false);

  useEffect(() => {
    if (!familyId) return;
    supabase.from("family_members").select("id,display_name,role,invite_status,created_at")
      .eq("family_unit_id", familyId).order("created_at")
      .then(({ data }) => setSeats(data || []));
  }, [familyId]);

  const sendGift = async () => {
    setSending(true);
    try {
      const r = await window.fetch(`${API_URL}/api/gift-invite`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session?.access_token||"dev"}` },
        body: JSON.stringify({ family_unit_id:familyId, gifted_by_id:memberId, recipient_name:giftName, recipient_role:giftRole, gift_message:giftMsg }),
      });
      const data = await r.json();
      setUrl(data.invite_url);
    } finally { setSending(false); }
  };

  return (
    <>
      <div style={styles.header}>
        <h2 style={{ margin:0 }}>Family Seats</h2>
        <p style={{ opacity:0.8, marginTop:8 }}>Everyone you protect.</p>
      </div>
      <div style={styles.card}>
        <h3 style={{ marginTop:0 }}>Active Seats</h3>
        {seats.map(s => (
          <div key={s.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid #eee" }}>
            <div style={{ width:40, height:40, borderRadius:"50%", background:C.sage, display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700 }}>
              {s.display_name[0]}
            </div>
            <div style={{ flex:1 }}>
              <p style={{ margin:0, fontWeight:600 }}>{s.display_name}</p>
              <p style={{ margin:0, fontSize:13, color:C.muted, textTransform:"capitalize" }}>{s.role}</p>
            </div>
            <span style={{ ...styles.badge, background: s.invite_status==="accepted" ? C.success : "#ddd", color: s.invite_status==="accepted" ? "white" : C.muted }}>
              {s.invite_status}
            </span>
          </div>
        ))}
        <button style={{ ...styles.btn, ...styles.btnOutline, marginTop:8 }} onClick={() => setScreen("subscribe")}>
          + Upgrade for more seats
        </button>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop:0 }}>🎁 Gift a Seat</h3>
        <label style={styles.label}>Their name</label>
        <input style={styles.input} value={giftName} onChange={e => setGiftName(e.target.value)} placeholder="Diana" />
        <label style={styles.label}>Role</label>
        <select style={{ ...styles.input, marginBottom:0 }} value={giftRole} onChange={e => setGiftRole(e.target.value)}>
          <option value="spouse">Spouse / Partner</option>
          <option value="elder">Parent / Elder</option>
          <option value="child">Child</option>
          <option value="member">Family Member</option>
        </select>
        <label style={styles.label}>Personal note (they'll see this first)</label>
        <textarea style={{ ...styles.input, height:80, resize:"none" }} value={giftMsg} onChange={e => setGiftMsg(e.target.value)} placeholder="I set this up so you have your own shield too…" />
        <button style={{ ...styles.btn, ...styles.btnGold }} onClick={sendGift} disabled={sending || !giftName}>
          {sending ? "Creating…" : "Send Gift Invite"}
        </button>
        {inviteUrl && (
          <div style={{ background:C.warm, borderRadius:8, padding:12, marginTop:12 }}>
            <p style={{ margin:"0 0 8px", fontSize:13, fontWeight:600 }}>Share this link:</p>
            <p style={{ margin:0, fontSize:12, wordBreak:"break-all", color:C.sage }}>{inviteUrl}</p>
          </div>
        )}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUBSCRIBE SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function SubscribeScreen({ familyId, user, session, setScreen }) {
  const [loading, setLoading] = useState(false);

  const subscribe = async () => {
    setLoading(true);
    try {
      const r = await window.fetch(`${API_URL}/api/subscribe`, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:`Bearer ${session?.access_token||"dev"}` },
        body: JSON.stringify({ family_unit_id:familyId, email: user?.email }),
      });
      const data = await r.json();
      if (data.mock) {
        alert("✅ Subscription created (dev mode — no real charge). In production this opens Stripe payment.");
        setScreen("home");
      } else if (data.client_secret) {
        // In production: use Stripe.js to complete payment
        alert("Stripe payment sheet would open here. See docs.stripe.com/payments/accept-a-payment");
      }
    } finally { setLoading(false); }
  };

  return (
    <>
      <div style={styles.header}>
        <h2 style={{ margin:0 }}>Upgrade Your Shield</h2>
        <p style={{ opacity:0.8, marginTop:8 }}>One family. Full protection.</p>
      </div>

      <div style={{ ...styles.card, borderTop:`4px solid ${C.gold}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <h2 style={{ margin:"0 0 4px" }}>Tribe Plan</h2>
            <p style={{ margin:0, color:C.muted }}>For families who protect together</p>
          </div>
          <div style={{ textAlign:"right" }}>
            <p style={{ margin:0, fontSize:32, fontWeight:700 }}>$19</p>
            <p style={{ margin:0, fontSize:13, color:C.muted }}>/month</p>
          </div>
        </div>
        <div style={{ marginTop:20 }}>
          {["5 family seats","Unlimited bill scans","Unlimited legacy stories","Family Vault","Priority support"].map(f => (
            <div key={f} style={{ display:"flex", gap:8, padding:"8px 0", borderBottom:"1px solid #f0f0f0" }}>
              <span style={{ color:C.success }}>✓</span>
              <span>{f}</span>
            </div>
          ))}
        </div>
        <div style={{ background:C.warm, borderRadius:8, padding:12, margin:"16px 0" }}>
          <p style={{ margin:0, fontSize:14 }}>
            <strong>+ 10% Success Fee</strong> on confirmed savings. You only pay when Kin saves you money.
          </p>
        </div>
        <button style={{ ...styles.btn, ...styles.btnGold }} onClick={subscribe} disabled={loading}>
          {loading ? "Loading…" : "Start $19/mo Plan"}
        </button>
        <p style={{ fontSize:12, color:C.muted, textAlign:"center" }}>Cancel anytime. Secure payment via Stripe.</p>
      </div>

      <div style={styles.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
          <div>
            <h3 style={{ margin:"0 0 4px" }}>Free Plan</h3>
            <p style={{ margin:0, color:C.muted, fontSize:14 }}>Start here</p>
          </div>
          <p style={{ margin:0, fontSize:24, fontWeight:700 }}>$0</p>
        </div>
        <p style={{ fontSize:14, color:C.muted }}>1 seat · 3 bill scans/month · 5 legacy stories</p>
        <button style={{ ...styles.btn, ...styles.btnOutline }} onClick={() => setScreen("home")}>
          Continue with Free
        </button>
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function Stat({ label, value, highlight }) {
  return (
    <div style={{ padding:12, background: highlight ? C.forest : "#f8f8f8", borderRadius:10, color: highlight ? "white" : C.text }}>
      <p style={{ margin:"0 0 4px", fontSize:12, opacity:0.7 }}>{label}</p>
      <p style={{ margin:0, fontSize:20, fontWeight:700 }}>{value}</p>
    </div>
  );
}

function ScriptStep({ n, title, text, highlight }) {
  return (
    <div style={{ padding:"12px 0", borderBottom:"1px solid #eee" }}>
      <p style={{ margin:"0 0 4px", fontSize:12, fontWeight:700, color: highlight ? C.gold : C.muted, textTransform:"uppercase" }}>
        [{n}] {title}
      </p>
      <p style={{ margin:0, fontSize:14, lineHeight:1.6 }}>{text}</p>
    </div>
  );
}

function BottomNav({ screen, setScreen }) {
  const tabs = [
    { id:"home",    icon:"🛡️", label:"Home"    },
    { id:"scan",    icon:"📄", label:"Scan"    },
    { id:"stories", icon:"🎙", label:"Stories" },
    { id:"family",  icon:"👨‍👩‍👧", label:"Family"  },
  ];
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:"white", borderTop:"1px solid #eee",
                  display:"flex", maxWidth:480, margin:"0 auto" }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => setScreen(t.id)} style={{
          flex:1, padding:"12px 0", background:"none", border:"none", cursor:"pointer",
          color: screen === t.id ? C.sage : C.muted, fontWeight: screen === t.id ? 700 : 400,
        }}>
          <div style={{ fontSize:20 }}>{t.icon}</div>
          <div style={{ fontSize:11 }}>{t.label}</div>
        </button>
      ))}
    </div>
  );
}
