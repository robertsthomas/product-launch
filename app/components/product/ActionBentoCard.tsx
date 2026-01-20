interface ActionBentoCardProps {
  hasChanges: boolean;
  isSaving: boolean;
  aiAvailable: boolean;
  generatingAll: boolean;
  onSave: () => void;
  onGenerateAll: () => void;
}

export function ActionBentoCard({
  hasChanges,
  isSaving,
  aiAvailable,
  generatingAll,
  onSave,
  onGenerateAll,
}: ActionBentoCardProps) {
  return (
    <div
      style={{
        padding: "24px",
        border: "1px solid #e4e4e7",
        borderRadius: "12px",
        backgroundColor: "#fff",
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        height: "100%",
        justifyContent: "center",
      }}
    >
      <button
        type="button"
        onClick={onSave}
        disabled={!hasChanges || isSaving}
        style={{
          padding: "12px 18px",
          fontSize: "13px",
          fontWeight: 600,
          borderRadius: "10px",
          background: hasChanges ? "#18181b" : "#f4f4f5",
          color: hasChanges ? "#fff" : "#a1a1aa",
          border: "none",
          cursor: !hasChanges || isSaving ? "default" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          transition: "all 0.2s ease",
          width: "100%",
        }}
      >
        {isSaving ? (
          "Saving..."
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
            </svg>
            {hasChanges ? "Save Changes" : "Saved"}
          </>
        )}
      </button>

      {aiAvailable && (
        <button
          type="button"
          onClick={onGenerateAll}
          disabled={generatingAll}
          style={{
            padding: "12px 18px",
            fontSize: "13px",
            fontWeight: 600,
            borderRadius: "10px",
            background: "#fff",
            color: generatingAll ? "#a1a1aa" : "#18181b",
            border: "1px solid #e4e4e7",
            cursor: generatingAll ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            transition: "all 0.2s ease",
            width: "100%",
          }}
        >
          {generatingAll ? (
            "Generating..."
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2.5">
                <path d="M12 2L9.5 9.5L2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z" />
              </svg>
              Auto-Optimize
            </>
          )}
        </button>
      )}
    </div>
  );
}
