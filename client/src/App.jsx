import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Library from "./pages/Library";
import Viewer from "./pages/Viewer";
import History from "./pages/History";
import SessionDetail from "./pages/SessionDetail";

const PrivateRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
};

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/library" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/library" element={<PrivateRoute><Library /></PrivateRoute>} />
        <Route path="/library/:id" element={<PrivateRoute><Viewer /></PrivateRoute>} />
        <Route path="/history" element={<PrivateRoute><History /></PrivateRoute>} />
        <Route path="/history/:id" element={<PrivateRoute><SessionDetail /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  );
}
