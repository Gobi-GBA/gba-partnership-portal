import Home from "@/pages/home";

// The star map now lives on the home page with full filters — this route keeps old links working.
export default function Network() {
  return <Home initialView="network" />;
}
