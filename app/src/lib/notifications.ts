let permissionGranted = false;

export function requestNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    permissionGranted = true;
    return;
  }
  if (Notification.permission === 'denied') return;
  void Notification.requestPermission().then((result) => {
    permissionGranted = result === 'granted';
  });
}

export function sendGateNotification(description: string): void {
  if (!permissionGranted) return;
  if (typeof document === 'undefined' || !document.hidden) return;
  try {
    const notification = new Notification('Resume Agent', {
      body: description,
      tag: 'pipeline-gate',
    });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Notifications not supported in this context
  }
}
