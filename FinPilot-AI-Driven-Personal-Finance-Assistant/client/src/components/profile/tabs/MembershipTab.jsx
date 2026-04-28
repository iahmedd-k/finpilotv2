import { ROUTES } from "../../../constants/routes";
import { BG, BORDER, Card, CardHeader, GREEN, MUTED, RED, SURFACE_STRONG, TEXT, TEXT_ON_STRONG } from "../shared";

export default function MembershipTab({ user, navigate }) {
  const isPro = String(user?.subscriptionTier || "").toLowerCase() === "pro";
  const since = user?.createdAt ? new Date(user.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";
  const renewal = user?.usageResetDate ? new Date(user.usageResetDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <CardHeader
          label="Your Current Plan"
          right={
            <button type="button" onClick={() => navigate(ROUTES.SUBSCRIPTION)} style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: SURFACE_STRONG, color: TEXT_ON_STRONG, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              Manage membership
            </button>
          }
        />
        <div style={{ padding: "8px 20px 28px" }}>
          {[{ label: "Membership type", value: isPro ? "Annual" : "Free" }, { label: "Membership since", value: since }, ...(isPro ? [{ label: "Renewal date", value: renewal }, { label: "Subscription via", value: "Stripe" }] : [])].map((row) => (
            <div key={row.label} style={{ marginTop: 20 }}>
              <div style={{ fontSize: 12, color: MUTED, marginBottom: 4 }}>{row.label}</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: TEXT }}>{row.value}</div>
            </div>
          ))}
        </div>
      </Card>
      {!isPro && (
        <Card>
          <CardHeader label="Monthly Usage" />
          <div style={{ padding: "16px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[{ label: "Transactions", used: user?.transactionsUsed ?? 0, limit: 10 }, { label: "AI Queries", used: user?.aiQueriesUsed ?? 0, limit: 5 }].map((stat) => {
              const pct = Math.min((stat.used / stat.limit) * 100, 100);
              const over = stat.used >= stat.limit;

              return (
                <div key={stat.label} style={{ padding: "14px 16px", borderRadius: 12, border: `1px solid ${BORDER}`, background: BG }}>
                  <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>{stat.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: TEXT, marginBottom: 8 }}>
                    {stat.used}
                    <span style={{ fontSize: 13, fontWeight: 400, color: MUTED }}> / {stat.limit}</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 100, background: "var(--surface-muted)", overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 100, background: over ? RED : GREEN, transition: "width 0.5s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: over ? RED : MUTED, marginTop: 6 }}>{over ? "Limit reached" : `${stat.limit - stat.used} remaining`}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
