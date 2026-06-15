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

      const typeStr = subj ? subj.type : 'study';
      const colorHex = subj ? subj.color : '#007aff';
      
      const emojis = { study: '📚', training: '🏋️', inactive: '✅' };
      const titlePrefix = emojis[typeStr] || '⏰';
      const title = `${titlePrefix} Take Time`;

      // Generate dynamic SVG icon based on type and subject color
      const getNotifIcon = (t, c) => {
        const encColor = encodeURIComponent(c);
        const svgs = {
          study: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${encColor}" opacity="0.15"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" fill="none" stroke="${encColor}" stroke-width="2" stroke-linecap="round"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" fill="none" stroke="${encColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
          training: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${encColor}" opacity="0.15"/><path d="M6 5.5v13M18 5.5v13M4 8h4M4 16h4M16 8h4M16 16h4M9 12h6" fill="none" stroke="${encColor}" stroke-width="2" stroke-linecap="round"/></svg>`,
          inactive: `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="${encColor}" opacity="0.15"/><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" fill="none" stroke="${encColor}" stroke-width="2" stroke-linecap="round"/><polyline points="22 4 12 14.01 9 11.01" fill="none" stroke="${encColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`
        };
        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgs[t] || svgs.study);
      };

      const dynamicIcon = getNotifIcon(typeStr, colorHex);

      // In-App Toast
      DS.toast(`${titlePrefix} ${msg}`, 'info');

      // Native Notification via Service Worker (works in background on mobile)
      if ('Notification' in window && Notification.permission === 'granted') {
        const notifOptions = {
          body: msg,
          icon: dynamicIcon,
          badge: dynamicIcon,
          tag: block.id,
          renotify: true,
          vibrate: [200, 100, 200, 100, 200],
          requireInteraction: true,
          data: { url: '/', blockId: block.id }
        };

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, notifOptions);
          }).catch(() => {
            try { new Notification(title, notifOptions); } catch(e) {}
          });
        } else {
          try { new Notification(title, notifOptions); } catch(e) {}
        }
      }

      notifiedBlocks.add(block.id);
    }
  });
}

// ===== ATOMIC CHECK-IN REMINDERS =====
const notifiedAtomic = new Set();

function checkAtomicNotifications() {
  if (!state.settings.notifications) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  const now = new Date();
  const todayKey = dateKey(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Reset daily
  if (checkAtomicNotifications.lastDate && checkAtomicNotifications.lastDate !== todayKey) {
    notifiedAtomic.clear();
  }
  checkAtomicNotifications.lastDate = todayKey;

  const rec = state.checkins?.records?.find(r => r.date === todayKey);

  // Morning reminder: 8:00-8:30 if not done
  if (!notifiedAtomic.has('morning') && !rec?.morning && nowMin >= 480 && nowMin <= 510) {
    sendAtomicNotif('morning',
      I18n.t('notification.atomic_morning_title', null, 'Bom dia! ☀️'),
      I18n.t('notification.atomic_morning_body', null, 'Faça seu check-in matinal e comece o dia com foco.')
    );
  }

  // Evening reminder: 21:00-21:30 if morning done but evening not
  if (!notifiedAtomic.has('evening') && rec?.morning && !rec?.evening && nowMin >= 1260 && nowMin <= 1290) {
    sendAtomicNotif('evening',
      I18n.t('notification.atomic_evening_title', null, 'Hora de refletir 🌙'),
      I18n.t('notification.atomic_evening_body', null, 'Registre seu encerramento do dia.')
    );
  }

  // "Never fail twice" nudge: 9:00 if yesterday had no completed blocks
  if (!notifiedAtomic.has('nft') && nowMin >= 540 && nowMin <= 570) {
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const ydKey = dateKey(yesterday);
    const ydBlocks = state.blocks?.filter(b => b.date === ydKey) || [];
    const anyDone = ydBlocks.some(b => b.done);
    if (ydBlocks.length > 0 && !anyDone) {
      sendAtomicNotif('nft',
        I18n.t('notification.nft_title', null, 'Nunca falhe duas vezes 💪'),
        I18n.t('notification.nft_body', null, 'Ontem ficou em branco. Hoje é a chance de voltar ao ritmo!')
      );
    }
  }
}

function sendAtomicNotif(tag, title, body) {
  notifiedAtomic.add(tag);
  DS.toast(`${title} ${body}`, 'info');

  const notifOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/favicon-32.png',
    tag: 'atomic-' + tag,
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: '/' }
  };

  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then(reg => {
      reg.showNotification(title, notifOptions);
    }).catch(() => {
      try { new Notification(title, notifOptions); } catch(e) {}
    });
  } else {
    try { new Notification(title, notifOptions); } catch(e) {}
  }
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
  DS.toast(I18n.t('settings.app_installed') || 'App installed!', 'success');
});
