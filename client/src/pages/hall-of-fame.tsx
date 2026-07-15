import Home from "@/pages/home";

// Hall of Fame is a mode of the star map — this route opens it directly.
export default function HallOfFame() {
  return <Home initialView="network" initialHof />;
}
