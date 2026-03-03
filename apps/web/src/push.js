function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
}

async function getServiceWorkerRegistration() {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) =>
      window.setTimeout(() => reject(new Error("push_sw_not_ready")), 4000)
    ),
  ]);
  return registration;
}

export function isAndroidPushSupported() {
  if (typeof window === "undefined") {
    return false;
  }
  const userAgent = window.navigator?.userAgent || "";
  return (
    /Android/i.test(userAgent) &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function getCurrentPushSubscription() {
  if (!isAndroidPushSupported()) {
    return null;
  }
  const registration = await getServiceWorkerRegistration();
  return registration.pushManager.getSubscription();
}

export async function ensureAndroidPushSubscription({
  publicKey,
  requestPermission = false,
}) {
  if (!isAndroidPushSupported()) {
    throw new Error("push_unsupported");
  }
  let permission = getNotificationPermission();
  if (permission !== "granted" && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission === "denied") {
    throw new Error("push_denied");
  }
  if (permission !== "granted") {
    throw new Error("push_permission_required");
  }

  const registration = await getServiceWorkerRegistration();
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });
  }
  return subscription;
}
