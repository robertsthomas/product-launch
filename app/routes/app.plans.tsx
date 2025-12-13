import type {
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PLANS, PLAN_CONFIG } from "../lib/billing/constants";
import { getAICreditStatus } from "../lib/billing/ai-gating.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const creditStatus = await getAICreditStatus(shop);

  return {
    creditStatus,
    plans: [
      {
        id: PLANS.FREE,
        name: PLAN_CONFIG[PLANS.FREE].name,
        price: PLAN_CONFIG[PLANS.FREE].price,
        period: "forever",
        description: "Perfect for getting started",
        features: [
          "20 audits per month",
          "Basic product scanning",
          "Launch checklist",
        ],
        locked: [],
      },
      {
        id: PLANS.STARTER,
        name: PLAN_CONFIG[PLANS.STARTER].name,
        price: PLAN_CONFIG[PLANS.STARTER].price,
        period: "/month",
        trialDays: PLAN_CONFIG[PLANS.STARTER].trialDays,
        description: "For growing stores",
        features: [
          "Unlimited audits",
          "Auto-fix capabilities",
          "Automatic scanning",
          "Priority support",
        ],
        locked: ["AI Generation", "Custom rules"],
        highlight: false,
      },
      {
        id: PLANS.PRO,
        name: PLAN_CONFIG[PLANS.PRO].name,
        price: PLAN_CONFIG[PLANS.PRO].price,
        period: "/month",
        trialDays: PLAN_CONFIG[PLANS.PRO].trialDays,
        description: "For scaling businesses",
        features: [
          "Unlimited audits",
          "100 AI credits monthly",
          "Auto-fix capabilities",
          "Custom rules",
          "Bulk AI operations",
          "Priority support",
        ],
        locked: [],
        highlight: true,
      },
    ],
  };
};

function PricingCard({
  plan,
  isHighlight,
  creditStatus,
}: {
  plan: any;
  isHighlight?: boolean;
  creditStatus: any;
}) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    // Navigate to upgrade flow
    window.location.href = `/api/billing/upgrade?plan=${plan.id}`;
  };

  return (
    <div
      className="animate-fade-in-up"
      style={{
        position: "relative",
        padding: "28px",
        borderRadius: "var(--radius-xl)",
        border: isHighlight
          ? "2px solid var(--color-primary)"
          : "1px solid var(--color-border)",
        background: isHighlight
          ? "linear-gradient(135deg, var(--color-primary-soft), var(--color-surface))"
          : "var(--color-surface)",
        transition: "all var(--transition-base)",
        display: "flex",
        flexDirection: "column",
        gap: "20px",
      }}
      onMouseEnter={(e) => {
        if (!isHighlight) {
          e.currentTarget.style.borderColor = "var(--color-primary)";
          e.currentTarget.style.boxShadow = "var(--shadow-card)";
        }
      }}
      onMouseLeave={(e) => {
        if (!isHighlight) {
          e.currentTarget.style.borderColor = "var(--color-border)";
          e.currentTarget.style.boxShadow = "none";
        }
      }}
    >
      {isHighlight && (
        <div
          style={{
            position: "absolute",
            top: "-12px",
            left: "50%",
            transform: "translateX(-50%)",
            padding: "4px 16px",
            background: "var(--color-primary)",
            color: "#fff",
            fontSize: "var(--text-xs)",
            fontWeight: 700,
            borderRadius: "var(--radius-full)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Most Popular
        </div>
      )}

      {/* Plan Name & Price */}
      <div>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-heading)",
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            color: "var(--color-text)",
            marginBottom: "8px",
          }}
        >
          {plan.name}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: "var(--text-sm)",
            color: "var(--color-muted)",
          }}
        >
          {plan.description}
        </p>
        <div style={{ marginTop: "16px", display: "flex", alignItems: "baseline", gap: "4px" }}>
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-3xl)",
              fontWeight: 700,
              color: "var(--color-text)",
            }}
          >
            ${plan.price}
          </span>
          <span
            style={{
              fontSize: "var(--text-base)",
              color: "var(--color-muted)",
            }}
          >
            {plan.period}
          </span>
        </div>
        {plan.trialDays && (
          <p
            style={{
              margin: "8px 0 0",
              fontSize: "var(--text-xs)",
              color: "var(--color-success)",
              fontWeight: 500,
            }}
          >
            {plan.trialDays}-day free trial
          </p>
        )}
      </div>

      {/* CTA Button */}
      <button
        onClick={handleUpgrade}
        style={{
          padding: "12px 20px",
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          border: isHighlight ? "none" : "1px solid var(--color-border)",
          borderRadius: "var(--radius-full)",
          background: isHighlight ? "var(--color-primary)" : "var(--color-surface-strong)",
          color: isHighlight ? "#fff" : "var(--color-text)",
          cursor: "pointer",
          transition: "all var(--transition-fast)",
          width: "100%",
        }}
      >
        {plan.id === "free" ? "Current plan" : "Upgrade"}
      </button>

      {/* Features List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {plan.features.map((feature: string, idx: number) => (
          <div key={idx} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--color-success)"
              strokeWidth="2.5"
              style={{ flexShrink: 0, marginTop: "2px" }}
            >
              <path d="M20 6L9 17l-5-5" />
            </svg>
            <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text)" }}>
              {feature}
            </span>
          </div>
        ))}
        {plan.locked.length > 0 && (
          <>
            {plan.locked.map((feature: string, idx: number) => (
              <div key={idx} style={{ display: "flex", gap: "10px", alignItems: "flex-start", opacity: 0.5 }}>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--color-muted)"
                  strokeWidth="2"
                  style={{ flexShrink: 0, marginTop: "2px" }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
                <span
                  style={{
                    fontSize: "var(--text-sm)",
                    color: "var(--color-muted)",
                    textDecoration: "line-through",
                  }}
                >
                  {feature}
                </span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

export default function Plans() {
  const { creditStatus, plans } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Page Header */}
      <div className="animate-fade-in-up" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <button
          type="button"
          onClick={() => navigate("/app")}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "36px",
            height: "36px",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--color-border)",
            background: "var(--color-surface)",
            color: "var(--color-muted)",
            cursor: "pointer",
            transition: "all var(--transition-fast)",
            flexShrink: 0,
          }}
          title="Back to dashboard"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "var(--text-2xl)",
              fontWeight: 500,
              color: "var(--color-text)",
              margin: 0,
            }}
          >
            Upgrade Your Plan
          </h1>
          <p style={{ color: "var(--color-muted)", fontSize: "var(--text-sm)", margin: "4px 0 0" }}>
            Choose the plan that's right for your business
          </p>
        </div>
      </div>

      {/* AI Credits Status (if Pro) */}
      {creditStatus.allowed && (
        <div
          className="card animate-fade-in-up"
          style={{
            padding: "20px",
            background: "linear-gradient(135deg, var(--color-primary-soft), var(--color-surface))",
            border: "1px solid var(--color-primary)",
            animationDelay: "50ms",
            animationFillMode: "both",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
            <div>
              <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)", marginBottom: "4px" }}>
                AI Credits Usage
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div
                  style={{
                    flex: 1,
                    height: "6px",
                    background: "var(--color-surface-strong)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                    minWidth: "200px",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${(creditStatus.creditsUsed / creditStatus.creditsLimit) * 100}%`,
                      background: "var(--color-primary)",
                      borderRadius: "var(--radius-full)",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
                <span style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)", minWidth: "100px", textAlign: "right" }}>
                  {creditStatus.creditsUsed}/{creditStatus.creditsLimit} used
                </span>
              </div>
            </div>
            {creditStatus.resetsAt && (
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "var(--text-xs)", color: "var(--color-muted)", marginBottom: "4px" }}>
                  Resets
                </div>
                <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text)" }}>
                  {new Date(creditStatus.resetsAt).toLocaleDateString()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pricing Cards Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "24px",
        }}
      >
        {plans.map((plan) => (
          <PricingCard
            key={plan.id}
            plan={plan}
            isHighlight={plan.highlight}
            creditStatus={creditStatus}
          />
        ))}
      </div>

      {/* FAQ Section */}
      <div
        className="card animate-fade-in-up"
        style={{
          padding: "28px",
          marginTop: "20px",
          animationDelay: "200ms",
          animationFillMode: "both",
        }}
      >
        <h2
          style={{
            margin: "0 0 24px",
            fontFamily: "var(--font-heading)",
            fontSize: "var(--text-xl)",
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Frequently Asked Questions
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
          <div>
            <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text)", marginBottom: "8px" }}>
              Can I cancel anytime?
            </h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0, lineHeight: "1.6" }}>
              Yes, you can cancel your subscription at any time. Your access will continue until the end of your billing cycle.
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text)", marginBottom: "8px" }}>
              What happens after the trial?
            </h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0, lineHeight: "1.6" }}>
              Your trial gives you full access to all Pro features. After the trial ends, you'll be charged the monthly subscription fee.
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text)", marginBottom: "8px" }}>
              How do AI credits work?
            </h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0, lineHeight: "1.6" }}>
              Each AI generation (title, description, SEO optimization, etc.) consumes 1 credit. Pro plans get 100 credits per month.
            </p>
          </div>
          <div>
            <h3 style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--color-text)", marginBottom: "8px" }}>
              What if I need more credits?
            </h3>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-muted)", margin: 0, lineHeight: "1.6" }}>
              Contact us to discuss custom credit packages for your business needs.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

