export async function checkBrokerStatus() {
  try {
    const response = await fetch("/api/broker/status");
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Failed to check broker status:", error);
    return { connected: false, exchange: "KALSHI" };
  }
}
