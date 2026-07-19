"use client";

// The deck engine is fully client-side (keyboard paging, hash routing,
// framer-motion) - one client boundary here keeps every slide file untouched.

import App from "../App";
import EmailGate from "../EmailGate";

export default function Page() {
  return (
    <EmailGate>
      <App />
    </EmailGate>
  );
}
