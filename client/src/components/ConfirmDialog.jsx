export default function ConfirmDialog({
  isOpen,
  title = "האם אתה בטוח?",
  message,
  onConfirm,
  onCancel,
  confirmText = "מחק",
  danger = true,
}) {
  if (!isOpen) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{title}</h3>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button
            className={danger ? "confirm-ok confirm-ok-danger" : "confirm-ok"}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
          <button className="confirm-cancel" onClick={onCancel}>ביטול</button>
        </div>
      </div>
    </div>
  );
}
