// ===== NOTIFICATION SCHEDULER =====
const notifiedBlocks = new Set();

function checkNotifications() {
  if (!state.settings.notifications) return;

  const now = new Date();
  const todayKey = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  if (checkNotifications.lastDate && checkNotifications.lastDate !== todayKey) {
    notifiedBlocks.clear();
  }
  checkNotifications.lastDate = todayKey;

  const todayBlocks = state.blocks.filter(b => b.date === todayKey);
  const reminderMin = state.settings.reminderMin || 10;

  todayBlocks.forEach(block => {
    if (notifiedBlocks.has(block.id)) return;

    const startMin = timeToMinutes(block.start);
    const diff = startMin - nowMin;

    if (diff > 0 && diff <= reminderMin) {
      const subj = state.subjects.find(s => s.id === block.subjectId);
      const subjName = subj ? subj.name : I18n.t('block.subject');
      const msg = I18n.t('notification.block_starting', { name: subjName, start: block.start, end: block.end, diff });

      // In-App Toast
      DS.toast(msg, 'info');

      // Native Notification via Service Worker (works in background on mobile)
      if ('Notification' in window && Notification.permission === 'granted') {
        const notifOptions = {
          body: msg,
          icon: 'icons/icon-192.png',
          badge: 'icons/icon-192.png',
          tag: block.id,
          renotify: true,
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
          data: { url: '/', blockId: block.id }
        };

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(I18n.t('notification.title'), notifOptions);
          }).catch(() => {
            try { new Notification(I18n.t('notification.title'), notifOptions); } catch(e) {}
          });
        } else {
          try { new Notification(I18n.t('notification.title'), notifOptions); } catch(e) {}
        }
      }

      notifiedBlocks.add(block.id);
    }
  });
}

// ===== PWA INSTALL PROMPT =====
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const section = document.getElementById('installPwaSection');
  if (section) section.classList.remove('hidden');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const section = document.getElementById('installPwaSection');
  if (section) section.classList.add('hidden');
  DS.toast(I18n.t('settings.app_installed') || 'App instalado!', 'success');
});
