import { SVG3D } from "3dsvg";

function App() {
  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <SVG3D svg="/logo.svg" material="gold" animate="float" interactive={true} />
    </div>
  );
}

export default App;
