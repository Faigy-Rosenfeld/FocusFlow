import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import ConfirmDialog from "../components/ConfirmDialog";
import Toast from "../components/Toast";
import { listContent, createContent, deleteContent } from "../api/content";
import { getMe } from "../api/auth";

const TYPE_LABELS = { youtube: "YouTube", text: "טקסט" };

export default function Library() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ title: "", type: "youtube", source: "" });
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState({ message: "", type: "success" });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    listContent().then((r) => setItems(r.data));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    try {
      const res = await createContent(form);
      setItems([...items, res.data]);
      setForm({ title: "", type: "youtube", source: "" });
      setShowForm(false);
      setToast({ message: "הפריט נוסף לספרייה.", type: "success" });
    } catch (err) {
      const detail = err.response?.data?.detail;
      setFormError(typeof detail === "string" ? detail : "הוספת הפריט נכשלה.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    await deleteContent(id);
    setItems(items.filter((i) => i.id !== id));
    setConfirmDelete(null);
    setToast({ message: "הפריט נמחק.", type: "success" });
  };

  return (
    <div className="app-shell">
      <Navbar displayName={user?.display_name} />
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: "", type: "success" })} />
      <ConfirmDialog
        isOpen={!!confirmDelete}
        title="מחיקת פריט"
        message={`למחוק את "${confirmDelete?.title}"? לא ניתן לשחזר.`}
        confirmText="מחק"
        onConfirm={() => handleDelete(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />

      <main className="main-content">
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">הספרייה שלי</h1>
            <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
              {showForm ? "ביטול" : "הוסף תוכן"}
            </button>
          </div>

          {/* Add form */}
          {showForm && (
            <div className="panel">
              <p className="panel-label">פריט חדש</p>
              <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {formError && <span className="field-error">{formError}</span>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 12 }}>
                  <div className="field">
                    <label className="field-label">כותרת</label>
                    <input
                      className="field-input"
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="שם הפריט"
                      required
                    />
                  </div>
                  <div className="field">
                    <label className="field-label">סוג</label>
                    <select
                      className="field-input"
                      value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value, source: "" })}
                    >
                      <option value="youtube">YouTube</option>
                      <option value="text">טקסט</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">
                    {form.type === "youtube" ? "קישור YouTube" : "תוכן הטקסט"}
                  </label>
                  {form.type === "text" ? (
                    <textarea
                      className="field-input"
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                      placeholder="הדבק כאן את הטקסט..."
                      required
                    />
                  ) : (
                    <input
                      className="field-input"
                      type="url"
                      value={form.source}
                      onChange={(e) => setForm({ ...form, source: e.target.value })}
                      placeholder="https://www.youtube.com/watch?v=..."
                      required
                    />
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="submit" disabled={loading} className="btn btn-primary btn-sm">
                    {loading ? <span className="btn-spinner" /> : "הוסף"}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowForm(false)}>
                    ביטול
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List */}
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            {items.length === 0 ? (
              <div className="empty-state">
                <p>הספרייה ריקה עדיין.</p>
                <button className="btn btn-primary" onClick={() => setShowForm(true)}>
                  הוסף את הפריט הראשון
                </button>
              </div>
            ) : (
              <table className="flat-table">
                <thead>
                  <tr>
                    <th>כותרת</th>
                    <th>סוג</th>
                    <th>תאריך</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id} onClick={() => navigate(`/library/${item.id}`)}>
                      <td style={{ fontWeight: 500 }}>{item.title}</td>
                      <td><span className="status-badge status-done">{TYPE_LABELS[item.type] || item.type}</span></td>
                      <td style={{ color: "var(--muted)", fontSize: 13 }}>
                        {new Date(item.created_at).toLocaleDateString("he-IL")}
                      </td>
                      <td style={{ textAlign: "left" }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={(e) => { e.stopPropagation(); setConfirmDelete(item); }}
                          style={{ color: "var(--low)", borderColor: "#e5bab0" }}
                        >
                          מחק
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
