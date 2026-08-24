import { createRoot } from "react-dom/client";
import Card from "./components/Card.jsx";
const App = () => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", maxWidth: 780 }}>
    {["As","Kh","Qd","Jc","Ts","9h","8d","7c","6s","5h","4d","3c","2s"].map((c) => (
      <Card key={c} card={c} width={112} />
    ))}
    <Card card="As" faceDown width={112} />
  </div>
);
createRoot(document.getElementById("root")).render(<App />);
