import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { listContent, createContent, deleteContent } from "../api/content";
import { getMe } from "../api/auth";

export default function Library() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ title: "", type: "youtube", source: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getMe().then((r) => setUser(r.data));
    listContent().then((r) => setItems(r.data));
  }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await createContent(form);
      setItems([...items, res.data]);
      setForm({ title: "", type: "youtube", source: "" });
    } catch (err) {
      setError(err.response?.data?.detail || "Failed to add content");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this item?")) return;
    await deleteContent(id);
    setItems(items.filter((i) => i.id !== id));
  };

  return (
    <div>
      <Navbar displayName={user?.display_name} />
      <div className="page-container">
        <h2>My Library</h2>

        <form onSubmit={handleAdd} className="add-form">
          <h3>Add Content</h3>
          {error && <p className="error">{error}</p>}
          <label>Title
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
          <label>Type
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="youtube">YouTube</option>
              <option value="text">Text</option>
            </select>
          </label>
          <label>{form.type === "youtube" ? "YouTube URL" : "Text Content"}
            {form.type === "youtube"
              ? <input type="url" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} required />
              : <textarea value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} rows={5} required />
            }
          </label>
          <button type="submit" disabled={loading}>{loading ? "Adding..." : "Add"}</button>
        </form>

        <div className="content-list">
          {items.length === 0 && <p>Your library is empty. Add your first content above.</p>}
          {items.map((item) => (
            <div key={item.id} className="content-card">
              <div>
                <span className="content-type">{item.type}</span>
                <h4>{item.title}</h4>
              </div>
              <div className="content-actions">
                <button onClick={() => navigate(`/library/${item.id}`)}>Open</button>
                <button onClick={() => handleDelete(item.id)} className="btn-danger">Delete</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
