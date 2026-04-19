import { Omniston } from "@ston-fi/omniston-sdk";

const omniston = new Omniston({ apiUrl: "wss://omni-ws.ston.fi" });

async function run() {
  console.log("Initial status:", omniston.connectionStatus);
  const maxWaitMs = 5000;
  const startMs = Date.now();
  while (omniston.connectionStatus !== "connected") {
    if (omniston.connectionStatus === "error" || omniston.connectionStatus === "closed") {
      throw new Error(`Omniston connection failed: ${omniston.connectionStatus}`);
    }
    if (Date.now() - startMs > maxWaitMs) {
      throw new Error("Timed out waiting for Omniston to connect.");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  console.log("Connected! Status:", omniston.connectionStatus);
  omniston.close();
}

run();
