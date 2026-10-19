function sameAddress(a, b) {
  return String(a || "").toLowerCase() === String(b || "").toLowerCase();
}

function hasMethod(value, method) {
  if (typeof value === "string") return value === method;
  if (Array.isArray(value)) return value.some((entry) => hasMethod(entry, method));
  if (value instanceof Map) return value.has(method) || [...value.entries()].some(([key, entry]) => key === method || hasMethod(entry, method));
  if (value && typeof value === "object") return Object.entries(value).some(([key, entry]) => key === method || hasMethod(entry, method));
  return false;
}

function readableCalldataHasMethod(calldata, method) {
  const readable = calldata?.readable;
  if (typeof readable !== "string") return false;
  const escapedMethod = method.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`["\\\\]*method["\\\\]*\\s*:\\s*["\\\\]*${escapedMethod}["\\\\]*`).test(readable);
}

/** Check the finalized receipt's target and decoded method against a proof item. */
export function assertProofTransactionReceipt(item, receipt) {
  if (receipt.statusName !== "FINALIZED") throw new Error(`Transaction ${item.tx_hash} is not finalized.`);

  const recipient = receipt.to_address ?? receipt.recipient;
  const recipientMatches = Boolean(item.contract) && sameAddress(recipient, item.contract);
  const decoded = receipt.txDataDecoded;

  if (item.method === "deploy") {
    const decodedAsDeployment = decoded?.type === "deploy";
    const receiptConfirmsDeployment = receipt.statusName === "FINALIZED" && recipientMatches;
    if (!decodedAsDeployment && !receiptConfirmsDeployment) throw new Error(`Transaction ${item.tx_hash} is not a deployment.`);
    if (recipient && item.contract && !recipientMatches) throw new Error(`Transaction recipient mismatch for ${item.tx_hash}.`);
    return;
  }

  if (item.contract && !recipientMatches) throw new Error(`Transaction recipient mismatch for ${item.tx_hash}.`);
  if (decoded?.type === "deploy") throw new Error(`Transaction ${item.tx_hash} is a deployment, expected ${item.method}.`);
  const calldata = receipt.data?.calldata;
  const methodMatches = !item.method || hasMethod(decoded?.callData, item.method)
    || hasMethod(calldata, item.method)
    || readableCalldataHasMethod(calldata, item.method);
  if (!methodMatches) {
    throw new Error(`Decoded calldata does not identify ${item.method} for ${item.tx_hash}.`);
  }
}
