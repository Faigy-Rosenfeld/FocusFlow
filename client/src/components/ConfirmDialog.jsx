/**
 * ConfirmDialog — dialog אישור מתוך האתר במקום window.confirm()
 * Props:
 *   isOpen   — האם להציג
 *   title    — כותרת
 *   message  — הודעה
 *   onConfirm — callback אישור
 *   onCancel  — callback ביטול
 *   confirmText — טקסט כפתור אישור (ברירת מחדל: "Delete")
 *   danger    — האם כפתור האישור בצבע אדום
 */
export default function ConfirmDialog({
  isOpen,
  title = "Are you sure?",
  message,
  onConfirm,
  onCancel,
  confirmText = "Delete",
  danger = true,
}) {
  if (!isOpen) return null;

  return (
    <div className="confirm-overlay" onClick={onCancel}>
      <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="confirm-title">{title}</h3>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>Cancel</button>
          <button
            className={danger ? "confirm-ok confirm-ok-danger" : "confirm-ok"}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
