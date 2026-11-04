import { useEffect, useState } from "react";

/**
 * Toast — הודעת popup שנעלמת אחרי כמה שניות
 * Props:
 *   message  — הטקסט להצגה
 *   type     — "error" | "success" | "info" (ברירת מחדל: info)
 *   onClose  — callback לאיפוס מהקומפוננט ההורה
 *   duration — משך הצגה במילישניות (ברירת מחדל: 4000)
 */
export default function Toast({ message, type = "info", onClose, duration = 4000 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // מחכה לאנימציית fade-out
    }, duration);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  return (
    <div className={`toast toast-${type} ${visible ? "toast-show" : "toast-hide"}`}>
      <span className="toast-icon">
        {type === "error" ? "✕" : type === "success" ? "✓" : "ℹ"}
      </span>
      <span className="toast-message">{message}</span>
      <button className="toast-close" onClick={() => { setVisible(false); setTimeout(onClose, 300); }}>✕</button>
    </div>
  );
}
