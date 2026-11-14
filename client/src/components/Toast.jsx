import { useEffect, useState } from "react";

export default function Toast({ message, type = "info", onClose, duration = 4000 }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!message) return;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, duration);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) return null;

  const icons = { error: "✕", success: "✓", info: "i" };

  return (
    <div className={`toast toast-${type} ${visible ? "toast-show" : "toast-hide"}`}>
      <span className="toast-icon">{icons[type] ?? "i"}</span>
      <span className="toast-message">{message}</span>
      <button
        className="toast-close"
        onClick={() => { setVisible(false); setTimeout(onClose, 300); }}
        aria-label="סגור"
      >✕</button>
    </div>
  );
}
