interface CompactActionCardProps {
  hasChanges: boolean;
  isSaving: boolean;
  onSave: () => void;
}

export function CompactActionCard({
  hasChanges,
  isSaving,
  onSave,
}: CompactActionCardProps) {
  return (
    <button
      type="button"
      onClick={onSave}
      disabled={!hasChanges || isSaving}
      style={{
        padding: "10px 14px",
        fontSize: "12px",
        fontWeight: 600,
        borderRadius: "8px",
        background: hasChanges ? "#18181b" : "#f4f4f5",
        color: hasChanges ? "#fff" : "#a1a1aa",
        border: "none",
        cursor: !hasChanges || isSaving ? "default" : "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "6px",
        transition: "all 0.2s ease",
        width: "100%",
      }}
    >
      {isSaving ? (
        "Saving..."
      ) : hasChanges ? (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
          </svg>
          Save
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          Saved
        </>
      )}
    </button>
  );
}
