
/* ——— Client auth ——— */
const AUTH_TOKEN_KEY = 'ws_token';
const AUTH_DEVICE_KEY = 'ws_device_id';
function getAuthToken() { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; }
function getDeviceId() {
  let id = localStorage.getItem(AUTH_DEVICE_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) || ('d' + Math.random().toString(16).slice(2) + Date.now());
    localStorage.setItem(AUTH_DEVICE_KEY, id);
  }
  return id;
}
function authHeaders(extra = {}) {
  const h = { ...extra };
  const t = getAuthToken();
  if (t) h['Authorization'] = 'Bearer ' + t;
  h['X-Device-Id'] = getDeviceId();
  return h;
}
async function downloadAuthFile(filename) {
  const name = String(filename || '').split('/').pop();
  if (!name) throw new Error('missing file');
  const url = '/api/downloads/' + encodeURIComponent(name) + '?token=' + encodeURIComponent(getAuthToken());
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) {
    let err = 'download_failed';
    try { const j = await res.json(); err = j.error || err; } catch {}
    throw new Error(err);
  }
  const blob = await res.blob();
  const a = document.createElement('a');
  const obj = URL.createObjectURL(blob);
  a.href = obj;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(obj), 2000);
}
function authDownloadHref(filename) {
  return '/api/downloads/' + encodeURIComponent(filename) + '?token=' + encodeURIComponent(getAuthToken());
}
function clearAuthAndRedirect() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem('ws_user');
  if (!location.pathname.endsWith('login.html') && !location.pathname.endsWith('admin.html')) {
    location.href = '/login.html';
  }
}
async function ensureLoggedIn() {
  if (!getAuthToken()) {
    clearAuthAndRedirect();
    return null;
  }
  try {
    const res = await fetch('/api/auth/me', { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) {
      clearAuthAndRedirect();
      return null;
    }
    window.__user = data.user;
    return data.user;
  } catch {
    clearAuthAndRedirect();
    return null;
  }
}

const API = '';
const EMOJIS = ['😀','😁','😂','🤣','😊','😇','😍','😘','😎','🤩','🤔','😅','😢','😭','😡','🤯','😴','🥳','👍','👎','👏','🙏','🔥','✨','💯','✅','❌','⭐','💪','👋','🤝','🎉','❤️','💙','💚','💛','💜','🧡','🖤','🤍','💔','🤗','🙌','📞','📧','🏠','🎁','📌','⏰','📅','🚀','💡','🛠','📱','💬','👌','✌️','🤞','👀','💀','🤖','🌟','⚡','🎯','🏆'];

const I18N = {
  he: {
    btn_logout: 'התנתק',
    scheduled: 'תוזמן',
    btn_clear_log: 'נקה לוג',
    stat_uptime: 'Uptime',
    stat_messages: 'הודעות (7י)',
    stat_ratio: 'הצלחה / כישלון',
    lbl_category: 'קטגוריה',
    btn_filter: 'סנן',
    cat_all: 'הכל',
    cat_message: 'הודעות',
    cat_campaign: 'קמפיינים',
    cat_session: 'סשנים',
    cat_warmer: 'חימום',
    cat_mailbox: 'תיבת דואר',
    cat_group: 'קבוצות',
    cat_system: 'מערכת',
    stats_recent: 'פעילות אחרונה',
    stats_empty: 'אין נתונים עדיין',
    stat_online: 'מחוברים',
    stat_today: 'היום',
    stat_events: 'אירועים',
    stat_running: 'רצים',
    theme_system: 'לפי המערכת',
    lbl_font_scale: 'גודל טקסט',
    chk_high_contrast: 'ניגודיות גבוהה',
    chk_sound: 'צליל התראות',
    chk_desktop_notif: 'התראות דפדפן',
    set_section_display: 'תצוגה',
    set_section_behavior: 'התנהגות',
    set_section_about: 'אודות',
    lbl_default_tab: 'מסך פתיחה',
    lbl_mailbox_poll: 'רענון תיבת דואר (שנ׳)',
    chk_confirm_danger: 'אישור לפני מחיקה',
    chk_auto_reconnect: 'חיבור מחדש אוטומטי לסשנים',
    btn_reset_settings: 'איפוס הגדרות',
    settings_saved: 'ההגדרות נשמרו',
    settings_reset: 'ההגדרות אופסו',
    about_text: 'WASender — ניהול סשנים, קמפיינים, שליחה ותיבת דואר ל־WhatsApp.',
    status_connected: 'מחובר',
    status_wait: 'ממתין',
    btn_refresh: 'רענון',

    btn_clear: 'נקה',
    title_attach: 'צרף קובץ / תמונה / וידאו',
    title_emoji: 'אימוג׳ים',
    btn_choose_file: 'בחר קובץ',
    lbl_no_file: 'לא נבחר קובץ',
    pick_sessions: 'בחר חשבון',
    send_options_title: 'Send options',
    send_schedule_hint: 'השליחה תתחיל בזמן שנבחר. אם הוגדרה עצירה — תיעצר אוטומטית.',
    btn_start_campaign: 'הפעל קמפיין',
    status_on: 'פעיל',
    brand_sub: 'פלטפורמת ניהול WhatsApp',
    nav_sessions: 'חשבונות', nav_mailbox: 'תיבת דואר', nav_campaigns: 'קמפיינים', nav_warmer: 'חימום',
    nav_send: 'שליחה', nav_groups: 'קבוצות', nav_stats: 'סטטיסטיקות', stats_title: 'סטטיסטיקות ודוחות', stats_desc: 'מעקב בזמן אמת אחר פעילות המערכת.', nav_tools: 'כלים', nav_settings: 'הגדרות',
    sessions_title: 'חשבונות', sessions_desc: 'חיבור חשבונות באמצעות QR. הסשנים נשמרים ומתחברים מחדש אוטומטית.',
    btn_quick_connect: '+ חיבור חשבון', connect_title: 'חיבור חשבון', connect_hint: 'הזן מזהה, הפעל את החיבור וסרוק את קוד ה-QR באפליקציית WhatsApp.',
    lbl_session_name: 'שם לזיהוי (אנגלית)', lbl_session_label: 'תווית (אופציונלי)',
    btn_start_qr: 'התחל וסרוק QR', btn_cancel: 'ביטול',
    step1: 'לחץ «התחל וסרוק QR»', step2: 'בטלפון: WhatsApp ← מכשירים מקושרים ← קישור מכשיר', step3: 'סרוק את הקוד שמופיע כאן',
    qr_placeholder: 'ה-QR יופיע כאן',
    mailbox_title: 'תיבת דואר', mailbox_desc: 'כל השיחות מהחשבונות המחוברים — פרטיות וקבוצתיות.',
    lbl_account: 'חשבון', lbl_type: 'סוג', opt_all_accounts: 'כל החשבונות', opt_all: 'הכל', opt_private: 'פרטי', opt_group: 'קבוצה',
    btn_refresh: 'רענון', btn_clear: 'נקה', title_attach: 'צרף קובץ / תמונה / וידאו', title_emoji: 'אימוג׳ים', btn_choose_file: 'בחר קובץ', lbl_no_file: 'לא נבחר קובץ', mailbox_empty_list: 'אין שיחות להצגה', mailbox_empty_thread: 'בחר שיחה כדי להציג את ההתכתבות',
    ph_reply: 'כתוב הודעה…', btn_send: 'שלח',
    campaigns_title: 'קמפיינים', campaigns_desc: 'שליחה מתוזמנת עם הקלדה טבעית, מדיה ואימוג׳ים.',
    multi_send_hint: 'בחר כמה חשבונות מחוברים — ההודעות יתחלקו ביניהם להפחתת סיכון.',
    timeline_title: 'מרווחי זמן (Timeline)',
    pick_sessions: 'בחר לפחות חשבון אחד',
    btn_new_campaign: '+ קמפיין חדש', campaign_form_title: 'קמפיין חדש',
    lbl_camp_name: 'שם הקמפיין', lbl_sender: 'חשבון שולח', lbl_message: 'הודעה (תמיכה ב־{{name}})',
    btn_emoji: 'אימוג׳ים', lbl_media: 'תמונה / וידאו (אופציונלי)', lbl_numbers: 'מספרים (שורה לכל מספר)',
    lbl_delay_min: 'השהייה מינ׳ (שניות)', lbl_delay_max: 'השהייה מקס׳ (שניות)', lbl_skip_days: 'דילוג אם קיבל ב־X ימים',
    chk_typing: 'כתיבה אנושית', chk_emoji_var: 'וריאציית אימוג׳ים', chk_schedule: 'תזמון אוטומטי',
    schedule_title: 'תזמון', lbl_start_date: 'תאריך התחלה', lbl_start_time: 'שעת התחלה',
    lbl_stop_date: 'תאריך עצירה (אופציונלי)', lbl_stop_time: 'שעת עצירה',
    schedule_hint: 'הקמפיין יופעל בזמן ההתחלה. אם הוגדרה עצירה — ייעצר אוטומטית.',
    btn_save: 'שמור',
    warmer_title: 'חימום חשבונות', warmer_desc: 'פעילות הדדית בין החשבונות לשיפור יציבות השליחה.',
    status_off: 'כבוי', status_on: 'פעיל', lbl_pick_sessions: 'בחר לפחות שני חשבונות',
    lbl_mode: 'מצב', mode_gentle: 'עדין', mode_normal: 'רגיל', mode_active: 'פעיל',
    btn_start_warmer: 'הפעל חימום',
    lbl_safe_send: 'הגנת שליחה (אנטי־חסימה)',
    lbl_safe_profile: 'פרופיל בטיחות',
    profile_safe: 'בטוח (איטי)',
    profile_balanced: 'מאוזן',
    profile_fast: 'מהיר (סיכון גבוה)',
    lbl_max_hour: "מקס' לשעה / סשן",
    lbl_max_day: "מקס' ליום / סשן",
    lbl_quiet_start: 'שקט מ־',
    lbl_quiet_end: 'שקט עד',
    safe_send_hint: 'פרופיל בטוח = השהיות ארוכות, הגבלת קצב, הקלדה אנושית וסיבוב סשנים חכם.',
    warmer_live_title: 'מצב חימום לפי חשבון',
    warmer_ready: 'מוכן לשליחה',
    warmer_warming: 'מתחמם',
    stat_ready: 'מוכנים', btn_start_campaign: 'הפעל קמפיין', btn_stop: 'עצור', stat_sent: 'נשלחו', stat_errors: 'שגיאות', stat_last: 'אחרון',
    send_title: 'שליחה', send_desc: 'שליחה בודדת, לרשימה או מקובץ — כולל מדיה ואימוג׳ים.',
    seg_single: 'בודדת', seg_bulk: 'רשימה', seg_file: 'קובץ', lbl_number: 'מספר',
    btn_send_list: 'שלח לרשימה', send_options_title: 'אפשרויות שליחה', send_schedule_hint: 'השליחה תתחיל בזמן שנבחר.', btn_send_file: 'שלח מקובץ',
    groups_title: 'קבוצות', groups_desc: 'ניהול קבוצות, חילוץ אנשי קשר והוספת חברים.',
    btn_load_groups: 'טען קבוצות', extract_title: 'חילוץ מספרים', btn_extract: 'חלץ לקובץ',
    add_members_title: 'הוספת חברים', lbl_group_id: 'מזהה קבוצה', btn_add: 'הוסף',
    tools_title: 'כלים', tools_desc: 'אימות מספרים וסטטוס מערכת.', check_title: 'בדיקה ב־WhatsApp', btn_check: 'בדוק', sys_title: 'מצב מערכת',
    settings_title: 'הגדרות', settings_desc: 'שפה, ערכת נושא והעדפות תצוגה.',
    lbl_language: 'שפה', lbl_theme: 'ערכת נושא', theme_dark: 'כהה', theme_light: 'בהיר',
    lbl_density: 'צפיפות ממשק', density_comfy: 'נוח', density_compact: 'צפוף',
    chk_reduce_motion: 'הפחתת אנימציות', about_text: 'WASender — ניהול חשבונות, קמפיינים ותיבת דואר מאוחדת.',
    health_on: 'מחובר', health_off: 'מנותק', no_sessions: 'אין חשבון פעיל',
    type_group: 'קבוצה', type_private: 'פרטי',
    lbl_members: 'משתתפים', msg_media: '[מדיה]', msg_image: '[תמונה]', msg_video: '[וידאו]', msg_audio: '[אודיו]', msg_file: '[קובץ]', msg_sticker: '[סטיקר]', avatar_group: 'ק', status_connected: 'פעיל', status_qr: 'QR', status_connecting: 'מתחבר', status_disconnected: 'מנותק', status_stopped: 'עצור', confirm_delete: 'למחוק את החשבון?', lbl_session_id: 'מזהה',
    health_on: 'מחובר',
    health_off: 'מנותק',
    nav_stats: 'סטטיסטיקות'
  ,
    unit_sec: 'שנ׳',
    unit_min: 'דק׳',
    unit_hour: 'שע׳',
    stat_unread: 'לא נקרא',
    stats_no_breakdown: 'אין פירוט עדיין — בצע פעולה במערכת',
    type_private: 'פרטי',
    type_group: 'קבוצה',
    msg_media: '[מדיה]',
    msg_image: '[תמונה]',
    msg_video: '[וידאו]',
    msg_audio: '[אודיו]',
    msg_file: '[קובץ]',
    msg_sticker: '[סטיקר]',
    avatar_group: 'ק',
    status_connected: 'פעיל',
    status_qr: 'QR',
    status_connecting: 'מתחבר',
    status_disconnected: 'מנותק',
    status_stopped: 'עצור',
    confirm_delete: 'למחוק את החשבון?',
    lbl_session_id: 'מזהה',
    nav_contacts: 'אנשי קשר',
    contacts_title: 'אנשי קשר',
    contacts_desc: 'ייבוא וייצוא אנשי קשר ומספרים מהסשן — TXT או PDF.',
    lbl_contacts_source: 'מקור',
    contacts_mode_saved: 'אנשי קשר שמורים',
    contacts_mode_chats: 'ממספרי צ׳אטים',
    contacts_mode_all: 'הכל משולב',
    lbl_export_format: 'פורמט ייצוא',
    btn_contacts_load: 'טען רשימה',
    btn_contacts_export: 'ייצוא',
    contacts_import_title: 'ייבוא מספרים',
    contacts_import_hint: 'הדבק מספרים או העלה TXT. המספרים מנורמלים עם קידומת בינלאומית.',
    lbl_import_file: 'קובץ TXT',
    chk_contacts_wa: 'בדוק מי קיים ב־WhatsApp',
    btn_contacts_import: 'ייבוא',
    contacts_loaded: 'נטענו',
    contacts_exported: 'יוצא',
    contacts_imported: 'יובא',
    download_file: 'הורד קובץ'
  },
  en: {
    btn_logout: 'Logout',
    scheduled: 'Scheduled',
    btn_clear_log: 'Clear log',
    stat_uptime: 'Uptime',
    stat_messages: 'Messages (7d)',
    stat_ratio: 'Success / fail',
    lbl_category: 'Category',
    btn_filter: 'Filter',
    cat_all: 'All',
    cat_message: 'Messages',
    cat_campaign: 'Campaigns',
    cat_session: 'Sessions',
    cat_warmer: 'Warm-up',
    cat_mailbox: 'Inbox',
    cat_group: 'Groups',
    cat_system: 'System',
    stats_recent: 'Recent activity',
    stats_empty: 'No data yet',
    stat_online: 'Online',
    stat_today: 'Today',
    stat_events: 'Events',
    stat_running: 'Running',
    stats_desc: 'Real-time system activity tracking.',
    theme_system: 'System',
    lbl_font_scale: 'Text size',
    chk_high_contrast: 'High contrast',
    chk_sound: 'Notification sound',
    chk_desktop_notif: 'Browser notifications',
    set_section_display: 'Display',
    set_section_behavior: 'Behavior',
    set_section_about: 'About',
    lbl_default_tab: 'Startup screen',
    lbl_mailbox_poll: 'Mailbox refresh (sec)',
    chk_confirm_danger: 'Confirm before delete',
    chk_auto_reconnect: 'Auto-reconnect sessions',
    btn_reset_settings: 'Reset settings',
    settings_saved: 'Settings saved',
    settings_reset: 'Settings reset',
    about_text: 'WASender — sessions, campaigns, messaging and WhatsApp inbox.',
    status_connected: 'Connected',
    status_wait: 'Waiting',
    btn_refresh: 'Refresh',

    btn_clear: 'Clear',
    title_attach: 'Attach file / image / video',
    title_emoji: 'Emojis',
    btn_choose_file: 'Choose file',
    lbl_no_file: 'No file selected',
    pick_sessions: 'Select account',
    send_options_title: 'Send options',
    send_schedule_hint: 'Sending starts at the selected time. Stop time ends it automatically.',
    btn_start_campaign: 'Start campaign',
    status_on: 'Active',
    brand_sub: 'WhatsApp management platform',
    nav_sessions: 'Accounts',
    nav_mailbox: 'Inbox',
    nav_campaigns: 'Campaigns',
    nav_warmer: 'Warm-up',
    nav_send: 'Send',
    nav_groups: 'Groups',
    nav_stats: 'Statistics',
    nav_tools: 'Tools',
    nav_settings: 'Settings',
    stats_title: 'Statistics & reports',
    stats_desc: 'Real-time tracking of system activity.',
    settings_title: 'Interface settings',
    settings_desc: 'Language, theme and display options.',
    lbl_language: 'Language',
    lbl_theme: 'Theme',
    lbl_density: 'Density',
    theme_dark: 'Dark',
    theme_light: 'Light',
    density_comfy: 'Comfortable',
    density_compact: 'Compact',
    chk_reduce_motion: 'Reduce motion',
    sessions_title: 'Accounts',
    sessions_desc: 'Connect WhatsApp via QR. Sessions are saved and reopen automatically.',
    send_title: 'Send messages',
    send_desc: 'Single, list or file — with emoji and media.',
    mailbox_title: 'Inbox',
    brand_sub: 'WhatsApp operations platform',
    nav_sessions: 'Accounts', nav_mailbox: 'Inbox', nav_campaigns: 'Campaigns', nav_warmer: 'Warm-up',
    nav_send: 'Send', nav_groups: 'Groups', nav_stats: 'Statistics', stats_title: 'Statistics & reports', stats_desc: 'Real-time system activity tracking.', nav_tools: 'Tools', nav_settings: 'Settings',
    sessions_title: 'Connected accounts', sessions_desc: 'Connect accounts via QR. Sessions persist and reconnect automatically.',
    btn_quick_connect: '+ Connect account', connect_title: 'Connect account', connect_hint: 'Pick a name, start, and scan the QR from your phone.',
    lbl_session_name: 'ID name (English)', lbl_session_label: 'Label (optional)',
    btn_start_qr: 'Start & scan QR', btn_cancel: 'Cancel',
    step1: 'Click “Start & scan QR”', step2: 'On phone: WhatsApp → Linked devices → Link a device', step3: 'Scan the code shown here',
    qr_placeholder: 'QR will appear here',
    mailbox_title: 'Inbox', mailbox_desc: 'All conversations from connected accounts — private and group.',
    lbl_account: 'Account', lbl_type: 'Type', opt_all_accounts: 'All accounts', opt_all: 'All', opt_private: 'Private', opt_group: 'Group',
    btn_refresh: 'Refresh', btn_clear: 'Clear', title_attach: 'Attach file / image / video', title_emoji: 'Emojis', btn_choose_file: 'Choose file', lbl_no_file: 'No file selected', mailbox_empty_list: 'No conversations to show', mailbox_empty_thread: 'Select a conversation to view messages',
    ph_reply: 'Write a message…', btn_send: 'Send',
    campaigns_title: 'Campaigns', campaigns_desc: 'Scheduled outreach with natural typing, media and emojis.',
    multi_send_hint: 'Select multiple connected accounts — messages rotate between them to reduce risk.',
    timeline_title: 'Timeline delays',
    pick_sessions: 'Select at least one account',
    btn_new_campaign: '+ New campaign', campaign_form_title: 'New campaign',
    lbl_camp_name: 'Campaign name', lbl_sender: 'Sending account', lbl_message: 'Message (supports {{name}})',
    btn_emoji: 'Emojis', lbl_media: 'Image / video (optional)', lbl_numbers: 'Numbers (one per line)',
    lbl_delay_min: 'Min delay (sec)', lbl_delay_max: 'Max delay (sec)', lbl_skip_days: 'Skip if messaged in X days',
    chk_typing: 'Human typing', chk_emoji_var: 'Emoji variation', chk_schedule: 'Automatic schedule',
    schedule_title: 'Schedule', lbl_start_date: 'Start date', lbl_start_time: 'Start time',
    lbl_stop_date: 'Stop date (optional)', lbl_stop_time: 'Stop time',
    schedule_hint: 'Starts at the start time. Stops automatically if a stop time is set.',
    btn_save: 'Save',
    warmer_title: 'Account warm-up', warmer_desc: 'Mutual activity between accounts to improve delivery stability.',
    status_off: 'Off', status_on: 'On', lbl_pick_sessions: 'Select at least two accounts',
    lbl_mode: 'Mode', mode_gentle: 'Gentle', mode_normal: 'Normal', mode_active: 'Active',
    btn_start_warmer: 'Start warm-up',
    lbl_safe_send: 'Send protection (anti-ban)',
    lbl_safe_profile: 'Safety profile',
    profile_safe: 'Safe (slow)',
    profile_balanced: 'Balanced',
    profile_fast: 'Fast (higher risk)',
    lbl_max_hour: 'Max / hour / session',
    lbl_max_day: 'Max / day / session',
    lbl_quiet_start: 'Quiet from',
    lbl_quiet_end: 'Quiet until',
    safe_send_hint: 'Safe profile = longer delays, rate limits, human typing and smart session rotation.',
    warmer_live_title: 'Warm-up status by account',
    warmer_ready: 'Ready to send',
    warmer_warming: 'Warming up',
    stat_ready: 'Ready', btn_start_campaign: 'Start campaign', btn_stop: 'Stop', stat_sent: 'Sent', stat_errors: 'Errors', stat_last: 'Last',
    send_title: 'Send messages', send_desc: 'Single, list or file delivery — including media and emojis.',
    seg_single: 'Single', seg_bulk: 'List', seg_file: 'File', lbl_number: 'Number',
    btn_send_list: 'Send to list', send_options_title: 'Send options', send_schedule_hint: 'Sending starts at the selected time. Optional stop ends it automatically.', btn_send_file: 'Send from file',
    groups_title: 'Groups', groups_desc: 'Manage groups, extract contacts and add members.',
    btn_load_groups: 'Load groups', extract_title: 'Extract numbers', btn_extract: 'Extract to file',
    add_members_title: 'Add members', lbl_group_id: 'Group ID', btn_add: 'Add',
    tools_title: 'Tools', tools_desc: 'Number verification and system status.', check_title: 'Check on WhatsApp', btn_check: 'Check', sys_title: 'System status',
    settings_title: 'Interface settings', settings_desc: 'Language, theme and display preferences.',
    lbl_language: 'Language', lbl_theme: 'Theme', theme_dark: 'Dark', theme_light: 'Light',
    lbl_density: 'Density', density_comfy: 'Comfortable', density_compact: 'Compact',
    chk_reduce_motion: 'Reduce motion', about_text: 'WASender — accounts, campaigns and unified inbox.',
    health_on: 'Online', health_off: 'Offline', no_sessions: 'No active account',
    type_group: 'Group', type_private: 'Private',
    lbl_members: 'members', msg_media: '[Media]', msg_image: '[Image]', msg_video: '[Video]', msg_audio: '[Audio]', msg_file: '[File]', msg_sticker: '[Sticker]', avatar_group: 'G', status_connected: 'Active', status_qr: 'QR', status_connecting: 'Connecting', status_disconnected: 'Disconnected', status_stopped: 'Stopped', confirm_delete: 'Delete this account?', lbl_session_id: 'ID',
    nav_stats: 'Statistics',
    nav_sessions: 'Accounts',
    nav_mailbox: 'Inbox',
    nav_campaigns: 'Campaigns',
    nav_warmer: 'Warm-up',
    nav_send: 'Send',
    nav_groups: 'Groups',
    nav_tools: 'Tools',
    nav_settings: 'Settings',
    health_on: 'Online',
    health_off: 'Offline',
    status_on: 'Active',
    status_off: 'Off',
    stats_title: 'Statistics & reports',
    stats_desc: 'Real-time system activity tracking.',
    btn_refresh: 'Refresh',

    btn_clear: 'Clear',
    title_attach: 'Attach file / image / video',
    title_emoji: 'Emojis',
    btn_choose_file: 'Choose file',
    lbl_no_file: 'No file selected',
    btn_clear_log: 'Clear log',
    btn_filter: 'Filter',
    lbl_category: 'Category',
    cat_all: 'All',
    stats_recent: 'Recent activity',
    stats_empty: 'No data yet',
    stat_online: 'Online',
    stat_today: 'Today',
    stat_events: 'Events',
    stat_running: 'Running',
    stat_messages: 'Messages (7d)',
    stat_ratio: 'Success / fail',
    stat_uptime: 'Uptime',
    brand_sub: 'WhatsApp management platform'
  ,
    unit_sec: 's',
    unit_min: 'min',
    unit_hour: 'h',
    stat_unread: 'unread',
    stats_no_breakdown: 'No breakdown yet — perform an action in the system',
    type_private: 'Private',
    type_group: 'Group',
    msg_media: '[Media]',
    msg_image: '[Image]',
    msg_video: '[Video]',
    msg_audio: '[Audio]',
    msg_file: '[File]',
    msg_sticker: '[Sticker]',
    avatar_group: 'G',
    status_connected: 'Active',
    status_qr: 'QR',
    status_connecting: 'Connecting',
    status_disconnected: 'Disconnected',
    status_stopped: 'Stopped',
    confirm_delete: 'Delete this account?',
    lbl_session_id: 'ID',
    nav_contacts: 'Contacts',
    contacts_title: 'Contacts',
    contacts_desc: 'Import and export session contacts and chat numbers — TXT or PDF.',
    lbl_contacts_source: 'Source',
    contacts_mode_saved: 'Saved contacts',
    contacts_mode_chats: 'From chat numbers',
    contacts_mode_all: 'Combined',
    lbl_export_format: 'Export format',
    btn_contacts_load: 'Load list',
    btn_contacts_export: 'Export',
    contacts_import_title: 'Import numbers',
    contacts_import_hint: 'Paste numbers or upload a TXT file. Numbers are normalized with country code.',
    lbl_import_file: 'TXT file',
    chk_contacts_wa: 'Check who is on WhatsApp',
    btn_contacts_import: 'Import',
    contacts_loaded: 'Loaded',
    contacts_exported: 'Exported',
    contacts_imported: 'Imported',
    download_file: 'Download file'
  },
  ar: {
    btn_logout: 'تسجيل الخروج',
    scheduled: 'تمت الجدولة',
    btn_clear_log: 'مسح السجل',
    stat_uptime: 'Uptime',
    stat_messages: 'رسائل (7 أيام)',
    stat_ratio: 'نجاح / فشل',
    lbl_category: 'الفئة',
    btn_filter: 'تصفية',
    cat_all: 'الكل',
    cat_message: 'رسائل',
    cat_campaign: 'حملات',
    cat_session: 'جلسات',
    cat_warmer: 'تسخين',
    cat_mailbox: 'البريد',
    cat_group: 'مجموعات',
    cat_system: 'النظام',
    stats_recent: 'النشاط الأخير',
    stats_empty: 'لا توجد بيانات بعد',
    stat_online: 'متصل',
    stat_today: 'اليوم',
    stat_events: 'أحداث',
    stat_running: 'قيد التشغيل',
    stats_desc: 'متابعة نشاط النظام في الوقت الحقيقي.',
    theme_system: 'حسب النظام',
    lbl_font_scale: 'حجم النص',
    chk_high_contrast: 'تباين عالٍ',
    chk_sound: 'صوت الإشعارات',
    chk_desktop_notif: 'إشعارات المتصفح',
    set_section_display: 'العرض',
    set_section_behavior: 'السلوك',
    set_section_about: 'حول',
    lbl_default_tab: 'شاشة البداية',
    lbl_mailbox_poll: 'تحديث البريد (ث)',
    chk_confirm_danger: 'تأكيد قبل الحذف',
    chk_auto_reconnect: 'إعادة الاتصال تلقائياً',
    btn_reset_settings: 'إعادة ضبط الإعدادات',
    settings_saved: 'تم حفظ الإعدادات',
    settings_reset: 'تمت إعادة الضبط',
    about_text: 'WASender — إدارة الجلسات والحملات والرسائل وصندوق وارد واتساب.',
    status_connected: 'متصل',
    status_wait: 'بانتظار',
    btn_refresh: 'تحديث',

    btn_clear: 'مسح',
    title_attach: 'إرفاق ملف / صورة / فيديو',
    title_emoji: 'إيموجي',
    btn_choose_file: 'اختر ملف',
    lbl_no_file: 'لم يتم اختيار ملف',
    pick_sessions: 'اختر حساباً',
    send_options_title: 'خيارات الإرسال',
    send_schedule_hint: 'يبدأ الإرسال في الوقت المحدد. وقت الإيقاف ينهيه تلقائياً.',
    btn_start_campaign: 'تشغيل الحملة',
    status_on: 'نشط',
    brand_sub: 'منصة إدارة واتساب',
    nav_sessions: 'الحسابات',
    nav_mailbox: 'البريد',
    nav_campaigns: 'الحملات',
    nav_warmer: 'التسخين',
    nav_send: 'إرسال',
    nav_groups: 'المجموعات',
    nav_stats: 'الإحصائيات',
    nav_tools: 'أدوات',
    nav_settings: 'الإعدادات',
    stats_title: 'الإحصائيات والتقارير',
    stats_desc: 'تتبع فوري لنشاط النظام.',
    settings_title: 'إعدادات الواجهة',
    settings_desc: 'اللغة والمظهر وخيارات العرض.',
    lbl_language: 'اللغة',
    lbl_theme: 'المظهر',
    lbl_density: 'الكثافة',
    theme_dark: 'داكن',
    theme_light: 'فاتح',
    density_comfy: 'مريح',
    density_compact: 'مضغوط',
    chk_reduce_motion: 'تقليل الحركة',
    brand_sub: 'إدارة واتساب الذكية',
    nav_sessions: 'الحسابات', nav_mailbox: 'البريد', nav_campaigns: 'الحملات', nav_warmer: 'التسخين',
    nav_send: 'إرسال', nav_groups: 'المجموعات', nav_stats: 'الإحصائيات', stats_title: 'الإحصائيات والتقارير', stats_desc: 'متابعة نشاط النظام في الوقت الحقيقي.', nav_tools: 'أدوات', nav_settings: 'الإعدادات',
    sessions_title: 'الحسابات المتصلة', sessions_desc: 'اربط واتساب عبر رمز QR. تُحفظ الجلسات وتُستعاد تلقائياً.',
    btn_quick_connect: '+ ربط سريع', connect_title: 'ربط حساب', connect_hint: 'اختر اسماً، ابدأ، وامسح الرمز من الهاتف.',
    lbl_session_name: 'اسم المعرف (إنجليزي)', lbl_session_label: 'تسمية (اختياري)',
    btn_start_qr: 'ابدأ وامسح QR', btn_cancel: 'إلغاء',
    step1: 'اضغط «ابدأ وامسح QR»', step2: 'في الهاتف: واتساب ← الأجهزة المرتبطة ← ربط جهاز', step3: 'امسح الرمز الظاهر هنا',
    qr_placeholder: 'سيظهر رمز QR هنا',
    mailbox_title: 'البريد', mailbox_desc: 'محادثات من كل الحسابات — خاصة ومجموعات.',
    lbl_account: 'الحساب', lbl_type: 'النوع', opt_all_accounts: 'كل الحسابات', opt_all: 'الكل', opt_private: 'خاص', opt_group: 'مجموعة',
    btn_refresh: 'تحديث', btn_clear: 'مسح', title_attach: 'إرفاق ملف / صورة / فيديو', title_emoji: 'إيموجي', btn_choose_file: 'اختر ملف', lbl_no_file: 'لم يتم اختيار ملف', mailbox_empty_list: 'لا محادثات بعد', mailbox_empty_thread: 'اختر محادثة',
    ph_reply: 'اكتب رسالة…', btn_send: 'إرسال',
    campaigns_title: 'الحملات', campaigns_desc: 'كتابة بشرية، جدولة، وسائط وإيموجي.',
    multi_send_hint: 'اختر عدة حسابات — تُوزَّع الرسائل بينها لتقليل المخاطر.',
    timeline_title: 'الفواصل الزمنية',
    pick_sessions: 'اختر حساباً واحداً على الأقل',
    btn_new_campaign: '+ حملة جديدة', campaign_form_title: 'حملة جديدة',
    lbl_camp_name: 'اسم الحملة', lbl_sender: 'حساب الإرسال', lbl_message: 'الرسالة (يدعم {{name}})',
    btn_emoji: 'إيموجي', lbl_media: 'صورة / فيديو (اختياري)', lbl_numbers: 'الأرقام (سطر لكل رقم)',
    lbl_delay_min: 'تأخير أدنى (ث)', lbl_delay_max: 'تأخير أقصى (ث)', lbl_skip_days: 'تخطّي إن وصله خلال X أيام',
    chk_typing: 'كتابة بشرية', chk_emoji_var: 'تنويع إيموجي', chk_schedule: 'جدولة تلقائية',
    schedule_title: 'الجدولة', lbl_start_date: 'تاريخ البدء', lbl_start_time: 'وقت البدء',
    lbl_stop_date: 'تاريخ الإيقاف (اختياري)', lbl_stop_time: 'وقت الإيقاف',
    schedule_hint: 'تبدأ في وقت البدء. تتوقف تلقائياً إذا حُدد وقت إيقاف.',
    btn_save: 'حفظ',
    warmer_title: 'تسخين الحسابات', warmer_desc: 'ترسل حساباتك رسائل قصيرة لبعضها.',
    status_off: 'متوقف', status_on: 'يعمل', lbl_pick_sessions: 'اختر حسابين على الأقل',
    lbl_mode: 'الوضع', mode_gentle: 'لطيف', mode_normal: 'عادي', mode_active: 'نشط',
    btn_start_warmer: 'بدء التسخين',
    lbl_safe_send: 'حماية الإرسال',
    lbl_safe_profile: 'ملف الأمان',
    profile_safe: 'آمن (بطيء)',
    profile_balanced: 'متوازن',
    profile_fast: 'سريع (مخاطرة أعلى)',
    lbl_max_hour: 'الحد / ساعة / جلسة',
    lbl_max_day: 'الحد / يوم / جلسة',
    lbl_quiet_start: 'هدوء من',
    lbl_quiet_end: 'هدوء حتى',
    safe_send_hint: 'الملف الآمن = تأخير أطول وحدود معدل وكتابة بشرية.',
    warmer_live_title: 'حالة التسخين لكل حساب',
    warmer_ready: 'جاهز للإرسال',
    warmer_warming: 'قيد التسخين',
    stat_ready: 'جاهز', btn_start_campaign: 'بدء الحملة', btn_stop: 'إيقاف', stat_sent: 'أُرسل', stat_errors: 'أخطاء', stat_last: 'آخر',
    send_title: 'إرسال الرسائل', send_desc: 'فردي أو قائمة أو ملف — مع إيموجي ووسائط.',
    seg_single: 'فردي', seg_bulk: 'قائمة', seg_file: 'ملف', lbl_number: 'رقم',
    btn_send_list: 'إرسال للقائمة', send_options_title: 'خيارات الإرسال', send_schedule_hint: 'يبدأ الإرسال في الوقت المحدد. الإيقاف الاختياري ينهيه تلقائياً.', btn_send_file: 'إرسال من ملف',
    groups_title: 'المجموعات', groups_desc: 'تحميل، استخراج أرقام، إضافة أعضاء.',
    btn_load_groups: 'تحميل المجموعات', extract_title: 'استخراج الأرقام', btn_extract: 'استخراج لملف',
    add_members_title: 'إضافة أعضاء', lbl_group_id: 'معرّف المجموعة', btn_add: 'إضافة',
    tools_title: 'أدوات', tools_desc: 'فحص الأرقام وحالة النظام.', check_title: 'فحص على واتساب', btn_check: 'فحص', sys_title: 'حالة النظام',
    settings_title: 'إعدادات الواجهة', settings_desc: 'اللغة والمظهر وخيارات العرض.',
    lbl_language: 'اللغة', lbl_theme: 'المظهر', theme_dark: 'داكن', theme_light: 'فاتح',
    lbl_density: 'الكثافة', density_comfy: 'مريح', density_compact: 'مضغوط',
    chk_reduce_motion: 'تقليل الحركة', about_text: 'إدارة جلسات وحملات وبريد لواتساب.',
    health_on: 'النظام متصل', health_off: 'غير متصل', no_sessions: 'لا حساب متصل',
    type_group: 'مجموعة', type_private: 'خاص',
    lbl_members: 'أعضاء', msg_media: '[وسائط]', msg_image: '[صورة]', msg_video: '[فيديو]', msg_audio: '[صوت]', msg_file: '[ملف]', msg_sticker: '[ملصق]', avatar_group: 'م', status_connected: 'نشط', status_qr: 'QR', status_connecting: 'جارٍ الاتصال', status_disconnected: 'غير متصل', status_stopped: 'متوقف', confirm_delete: 'حذف هذا الحساب؟', lbl_session_id: 'المعرّف',
    nav_stats: 'الإحصائيات',
    nav_sessions: 'الحسابات',
    nav_mailbox: 'البريد',
    nav_campaigns: 'الحملات',
    nav_warmer: 'التسخين',
    nav_send: 'إرسال',
    nav_groups: 'المجموعات',
    nav_tools: 'أدوات',
    nav_settings: 'الإعدادات',
    health_on: 'متصل',
    health_off: 'غير متصل',
    status_on: 'نشط',
    status_off: 'متوقف',
    stats_title: 'إحصائيات وتقارير',
    stats_desc: 'تتبع فوري لنشاط النظام.',
    btn_refresh: 'تحديث',

    btn_clear: 'مسح',
    title_attach: 'إرفاق ملف / صورة / فيديو',
    title_emoji: 'إيموجي',
    btn_choose_file: 'اختر ملف',
    lbl_no_file: 'لم يتم اختيار ملف',
    btn_clear_log: 'مسح السجل',
    btn_filter: 'تصفية',
    lbl_category: 'الفئة',
    cat_all: 'الكل',
    stats_recent: 'النشاط الأخير',
    stats_empty: 'لا توجد بيانات بعد',
    stat_online: 'متصل',
    stat_today: 'اليوم',
    stat_events: 'أحداث',
    stat_running: 'قيد التشغيل',
    stat_messages: 'رسائل (7 أيام)',
    stat_ratio: 'نجاح / فشل',
    stat_uptime: 'Uptime',
    brand_sub: 'منصة إدارة واتساب'
  ,
    unit_sec: 'ث',
    unit_min: 'د',
    unit_hour: 'س',
    stat_unread: 'غير مقروء',
    stats_no_breakdown: 'لا يوجد تفصيل بعد — نفّذ إجراءً في النظام',
    type_private: 'خاص',
    type_group: 'مجموعة',
    msg_media: '[وسائط]',
    msg_image: '[صورة]',
    msg_video: '[فيديو]',
    msg_audio: '[صوت]',
    msg_file: '[ملف]',
    msg_sticker: '[ملصق]',
    avatar_group: 'م',
    status_connected: 'نشط',
    status_qr: 'QR',
    status_connecting: 'جارٍ الاتصال',
    status_disconnected: 'غير متصل',
    status_stopped: 'متوقف',
    confirm_delete: 'حذف هذا الحساب؟',
    lbl_session_id: 'المعرّف',
    nav_contacts: 'جهات الاتصال',
    contacts_title: 'جهات الاتصال',
    contacts_desc: 'استيراد وتصدير جهات اتصال الجلسة وأرقام المحادثات — TXT أو PDF.',
    lbl_contacts_source: 'المصدر',
    contacts_mode_saved: 'جهات محفوظة',
    contacts_mode_chats: 'من أرقام المحادثات',
    contacts_mode_all: 'الكل',
    lbl_export_format: 'صيغة التصدير',
    btn_contacts_load: 'تحميل القائمة',
    btn_contacts_export: 'تصدير',
    contacts_import_title: 'استيراد أرقام',
    contacts_import_hint: 'الصق أرقاماً أو ارفع ملف TXT. تُطبَّع الأرقام بمفتاح الدولة.',
    lbl_import_file: 'ملف TXT',
    chk_contacts_wa: 'تحقق من الموجودين على واتساب',
    btn_contacts_import: 'استيراد',
    contacts_loaded: 'تم التحميل',
    contacts_exported: 'تم التصدير',
    contacts_imported: 'تم الاستيراد',
    download_file: 'تنزيل الملف'
  }
};

function __bootSettings() {
  try {
    const raw = localStorage.getItem('wasender_settings_v2');
    if (raw) return JSON.parse(raw);
  } catch {}
  // migrate legacy keys once
  return {
    lang: localStorage.getItem('wl_lang') || 'he',
    theme: localStorage.getItem('wl_theme') || 'dark',
    density: localStorage.getItem('wl_density') || 'comfortable',
    reduceMotion: localStorage.getItem('wl_reduce') === '1'
  };
}
const __boot = __bootSettings();
let lang = __boot.lang || 'he';
let theme = __boot.theme || 'dark';
let density = __boot.density || 'comfortable';
let reduceMotion = !!__boot.reduceMotion;
window.__lang = lang;


let socket = null;
try { if (typeof io === 'function') socket = io({ transports: ['websocket', 'polling'] }); } catch (_) {}
function onSocket(ev, fn) { if (socket) socket.on(ev, fn); }

let sessions = [];
let selectedGroupId = null;
let selectedChatJid = null;
let selectedChatMeta = null;
let pendingQrSession = null;

function $(id) { return document.getElementById(id); }


function t(key) {
  const L = window.__lang || lang || 'he';
  if (I18N[L] && I18N[L][key] != null && I18N[L][key] !== '') return I18N[L][key];
  // English fallback before Hebrew when not Hebrew UI
  if (L !== 'he' && I18N.en && I18N.en[key] != null && I18N.en[key] !== '') return I18N.en[key];
  if (L === 'he' && I18N.he && I18N.he[key] != null) return I18N.he[key];
  if (I18N.he && I18N.he[key] != null) return I18N.he[key];
  return key;
}

function applyI18n(nextLang) {
  if (nextLang) {
    lang = nextLang;
    window.__lang = nextLang;
  }
  const L = window.__lang || lang || 'he';
  const dict = I18N[L] || I18N.he || {};
  document.documentElement.lang = L;
  document.documentElement.dir = (L === 'en') ? 'ltr' : 'rtl';

  const translate = (k) => {
    if (!k) return null;
    if (dict[k] != null && dict[k] !== '') return dict[k];
    if (I18N.en && I18N.en[k] != null && L === 'en') return I18N.en[k];
    if (I18N.ar && I18N.ar[k] != null && L === 'ar') return I18N.ar[k];
    // never fall back to Hebrew when non-he is selected
    if (L !== 'he' && I18N[L] && I18N[L][k] == null) return null;
    return (I18N.he && I18N.he[k]) || null;
  };

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.getAttribute('data-i18n');
    const val = translate(k);
    if (val == null) return;
    // Don't wipe nested interactive children (e.g. inputs inside labels)
    if (el.children.length && el.tagName !== 'OPTION' && el.tagName !== 'BUTTON' && el.tagName !== 'SPAN' && el.tagName !== 'A') {
      // update only pure text nodes; if a child span has data-i18n it will update itself
      return;
    }
    el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-placeholder],[data-i18n-placehold]').forEach(el => {
    const k = el.getAttribute('data-i18n-placeholder') || el.getAttribute('data-i18n-placehold');
    const val = translate(k);
    if (val != null) el.setAttribute('placeholder', val);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const k = el.getAttribute('data-i18n-title');
    const val = translate(k);
    if (val != null) el.setAttribute('title', val);
  });
}

async function softRefreshAfterLang() {
  try { await loadSessions({ silent: true }); } catch (_) {}
  try {
    if ($('tab-mailbox')?.classList.contains('active')) await loadMailbox();
  } catch (_) {}
  try {
    if ($('tab-campaigns')?.classList.contains('active')) await loadCampaigns();
  } catch (_) {}
  try {
    if ($('tab-warmer')?.classList.contains('active')) {
      refreshWarmerSessions();
      await pollWarmerStatus();
    }
  } catch (_) {}
  try {
    if ($('tab-stats')?.classList.contains('active')) await loadStats();
  } catch (_) {}
  try { fillSessionSelects(); } catch (_) {}
}

function applyTheme(nextTheme, nextDensity, nextReduce) {
  if (nextTheme != null) theme = nextTheme;
  if (nextDensity != null) density = nextDensity;
  if (nextReduce != null) reduceMotion = !!nextReduce;
  const resolved = (theme === 'system')
    ? ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark')
    : (theme === 'light' ? 'light' : 'dark');
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-density', density || 'comfortable');
  document.documentElement.setAttribute('data-reduce-motion', reduceMotion ? '1' : '0');
}

function toast(msg, type = '') {
  const el = $('toast');
  if (!el || !msg) return;
  el.textContent = msg;
  el.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(el._hide);
  el._hide = setTimeout(() => {
    el.className = 'toast';
    el.textContent = '';
  }, 2800);
}

async function api(method, url, body, isForm) {
  const opts = { method };
  if (isForm) {
    opts.body = body;
    opts.headers = authHeaders();
  } else if (body) {
    opts.headers = authHeaders({ 'Content-Type': 'application/json' });
    opts.body = JSON.stringify(body);
  } else {
    opts.headers = authHeaders();
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 120000);
  opts.signal = ctrl.signal;
  try {
    const res = await fetch(API + url, opts);
    if (res.status === 401 || res.status === 403) {
      const errBody = await res.clone().json().catch(() => ({}));
      if (['unauthorized', 'session_expired', 'account_disabled', 'account_expired', 'device_mismatch'].includes(errBody.error)) {
        clearAuthAndRedirect();
      }
    }
    clearTimeout(timer);
    const ct = res.headers.get('content-type') || '';
    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(res.ok ? 'invalid JSON' : ('HTTP ' + res.status + (ct.includes('html') ? ' — restart server-full / node server.js after update' : '')));
    }
    if (!res.ok || (data && data.success === false && data.error)) {
      throw new Error((data && data.error) || ('HTTP ' + res.status));
    }
    return data;
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('timeout');
    throw e;
  }
}

function statusBadge(status) {
  if (status === 'connected') return `<span class="badge badge-on"><span class="status-dot on"></span>${t('status_on') || t('status_connected')}</span>`;
  if (status === 'qr') return `<span class="badge badge-qr">${t('status_qr') || 'QR'}</span>`;
  if (status === 'connecting') return `<span class="badge badge-qr">${t('status_connecting') || '…'}</span>`;
  if (status === 'disconnected') return `<span class="badge badge-off"><span class="status-dot off"></span>${t('status_disconnected') || t('status_off')}</span>`;
  return `<span class="badge badge-off"><span class="status-dot wait"></span>${t('status_stopped') || status}</span>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildEmojiPopover(popId, targetInputId) {
  let pop = $(popId);
  if (!pop) return;
  if (pop.parentElement !== document.body) document.body.appendChild(pop);
  pop.classList.add('emoji-popover-portal');
  pop.innerHTML = EMOJIS.map(e => `<button type="button" data-e="${e}">${e}</button>`).join('');
  pop.hidden = true;
  pop.style.cssText = 'display:none';
  pop.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const ta = $(targetInputId);
      if (!ta) return;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? ta.value.length;
      ta.value = ta.value.slice(0, start) + btn.dataset.e + ta.value.slice(end);
      ta.focus();
      try { ta.selectionStart = ta.selectionEnd = start + [...btn.dataset.e].length; } catch {}
      closeAllEmojiPops();
    });
  });
}

function closeAllEmojiPops() {
  ['campEmojiPop', 'sendEmojiPop', 'replyEmojiPop'].forEach(id => {
    const el = $(id);
    if (!el) return;
    el.hidden = true;
    el.style.display = 'none';
  });
}

function positionEmojiPop(pop, anchorBtn) {
  if (!pop || !anchorBtn) return;
  const r = anchorBtn.getBoundingClientRect();
  const width = 320;
  const gap = 10;
  pop.hidden = false;
  pop.style.visibility = 'hidden';
  pop.style.display = 'grid';
  const h = Math.min(Math.max(pop.scrollHeight || 240, 180), 280);
  // center on the emoji button
  let left = r.left + r.width / 2 - width / 2;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  // prefer above the input bar
  let top = r.top - h - gap;
  if (top < 8) top = r.bottom + gap;
  if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - h - 8);
  pop.style.left = Math.round(left) + 'px';
  pop.style.top = Math.round(top) + 'px';
  pop.style.bottom = 'auto';
  pop.style.right = 'auto';
  pop.style.width = width + 'px';
  pop.style.maxHeight = '280px';
  pop.style.visibility = 'visible';
}

function togglePop(popId) {
  const pop = $(popId);
  if (!pop) return;
  const willOpen = pop.hidden || pop.style.display === 'none';
  closeAllEmojiPops();
  if (!willOpen) return;
  const anchor =
    popId === 'replyEmojiPop' ? $('btnReplyEmoji') :
    popId === 'campEmojiPop' ? $('btnCampEmoji') :
    popId === 'sendEmojiPop' ? $('btnSendEmoji') : null;
  if (pop.parentElement !== document.body) document.body.appendChild(pop);
  pop.classList.add('emoji-popover-portal');
  positionEmojiPop(pop, anchor);
  pop.hidden = false;
  pop.style.display = 'grid';
}

// Settings
function initSettings() {
  applyTheme();
  wireFileLabel('campMedia', 'campMediaName');
  wireFileLabel('sendMedia', 'sendMediaName');
  wireFileLabel('sendFile', 'sendFileName');
  wireFileLabel('contactsImportFile', 'contactsImportFileName');
  applyI18n();
  if ($('setLang')) $('setLang').value = lang;
  if ($('setTheme')) $('setTheme').value = theme;
  if ($('setDensity')) $('setDensity').value = density;
  if ($('setReduceMotion')) $('setReduceMotion').checked = reduceMotion;

  // Theme / density / motion only here — language is handled in wireSettings (single source)
  $('setTheme')?.addEventListener('change', () => {
    theme = $('setTheme').value;
    localStorage.setItem('wl_theme', theme);
    applyTheme();
  });
  $('setDensity')?.addEventListener('change', () => {
    density = $('setDensity').value;
    localStorage.setItem('wl_density', density);
    applyTheme();
  });
  $('setReduceMotion')?.addEventListener('change', () => {
    reduceMotion = $('setReduceMotion').checked;
    localStorage.setItem('wl_reduce', reduceMotion ? '1' : '0');
    applyTheme();
  });
  try { wireSettings(); } catch (e) { console.error(e); }
}

// Nav
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    $('tab-' + tab)?.classList.add('active');
    if (tab === 'mailbox') loadMailbox();
    if (tab === 'contacts') { fillContactsSessions(); }
    if (tab === 'stats') {
      loadStats();
      if (window.statsPollTimer) clearInterval(window.statsPollTimer);
      window.statsPollTimer = setInterval(() => {
        if ($('tab-stats')?.classList.contains('active')) loadStats();
      }, 4000);
    } else if (window.statsPollTimer) {
      clearInterval(window.statsPollTimer);
      window.statsPollTimer = null;
    }
    if (tab === 'campaigns') { fillSessionSelects(); loadCampaigns(); }
    if (tab === 'warmer') { refreshWarmerSessions(); pollWarmerStatus(); }
    if (['send', 'groups', 'tools'].includes(tab)) fillSessionSelects();
  });
});

document.querySelectorAll('.seg-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const parent = btn.closest('.panel');
    parent.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    parent.querySelectorAll('.inner').forEach(i => i.classList.remove('active'));
    btn.classList.add('active');
    $('inner-' + btn.dataset.inner)?.classList.add('active');
  });
});

// Sessions
async function loadSessions(opts = {}) {
  try {
    const data = await api('GET', '/api/sessions');
    sessions = data.sessions || [];
    renderSessions();
    fillSessionSelects();
    refreshWarmerSessions();
  } catch (e) { if (!opts.silent) toast(e.message, 'error'); }
}

function renderSessions() {
  const el = $('sessionsList');
  if (!sessions.length) {
    el.innerHTML = `<div class="empty-state">${t('btn_quick_connect')}</div>`;
    return;
  }
  el.innerHTML = sessions.map(s => {
    const name = s.label || s.name || s.id;
    const initial = String(name).trim().charAt(0).toUpperCase() || 'W';
    const phone = s.phone ? ('+' + String(s.phone).replace(/^\+/, '').replace(/\D/g, '')) : '';
    const on = s.status === 'connected';
    return `
    <div class="account-card ${on ? 'connected' : ''}">
      <div class="account-card-top">
        <div class="account-avatar" aria-hidden="true">${escapeHtml(initial)}</div>
        <div class="account-card-info">
          <div class="title">${escapeHtml(name)}</div>
          <div class="meta">${statusBadge(s.status)}</div>
          ${phone ? `<div class="phone-line">${escapeHtml(phone)}</div>` : ''}
          <div class="meta-id">${t('lbl_session_id')}: ${escapeHtml(s.id)}</div>
        </div>
      </div>
      <div class="actions">
        ${(s.status === 'stopped' || s.status === 'disconnected')
          ? `<button class="btn btn-primary btn-sm" data-act="start" data-id="${s.id}">${t('btn_start_qr')}</button>`
          : `<button class="btn btn-ghost btn-sm" data-act="stop" data-id="${s.id}">${t('btn_stop')}</button>`}
        ${(s.status === 'qr' || s.hasQR) ? `<button class="btn btn-primary btn-sm" data-act="qr" data-id="${s.id}">QR</button>` : ''}
        <button class="btn btn-danger btn-sm" data-act="del" data-id="${s.id}" title="${t('confirm_delete')}">×</button>
      </div>
    </div>`;
  }).join('');

  el.querySelectorAll('[data-act]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      try {
        if (btn.dataset.act === 'start') {
          await api('POST', `/api/sessions/${id}/start`);
          pendingQrSession = id;
          openConnectCard(false);
          pollQr(id);
        } else if (btn.dataset.act === 'stop') {
          await api('POST', `/api/sessions/${id}/stop`);
        } else if (btn.dataset.act === 'del') {
          if (!confirm(t('confirm_delete'))) return;
          await api('DELETE', `/api/sessions/${id}`);
        } else if (btn.dataset.act === 'qr') {
          pendingQrSession = id;
          openConnectCard(false);
          showQr(id);
        }
        loadSessions();
      } catch (e) { toast(e.message, 'error'); }
    };
  });
}

function fillSessionSelects() {
  const connected = sessions.filter(s => s.status === 'connected');
  const opts = connected.length
    ? connected.map(s => `<option value="${s.id}">${escapeHtml(s.label || s.name)}${s.phone ? ' · ' + s.phone : ''}</option>`).join('')
    : `<option value="">${t('no_sessions')}</option>`;
  ['sendSession', 'groupSession', 'checkSession', 'campSession'].forEach(id => {
    if ($(id)) $(id).innerHTML = opts;
  });
  if ($('mailboxSession')) {
    $('mailboxSession').innerHTML = `<option value="">${t('opt_all_accounts')}</option>` +
      connected.map(s => `<option value="${s.id}">${escapeHtml(s.label || s.name)}</option>`).join('');
  }
  const boxHtml = connected.length
    ? connected.map(s => `<label class="check"><input type="checkbox" class="multi-sess" value="${s.id}" checked /> ${escapeHtml(s.label || s.name)}${s.phone ? ' · ' + s.phone : ''}</label>`).join('')
    : `<span class="muted">${t('no_sessions')}</span>`;
  if ($('campSessions')) {
    $('campSessions').innerHTML = connected.length
      ? connected.map(s => `<label class="check"><input type="checkbox" class="camp-sess" value="${s.id}" checked /> ${escapeHtml(s.label || s.name)}${s.phone ? ' · ' + s.phone : ''}</label>`).join('')
      : `<span class="muted">${t('no_sessions')}</span>`;
  }
  if ($('sendSessions')) {
    $('sendSessions').innerHTML = connected.length
      ? connected.map(s => `<label class="check"><input type="checkbox" class="send-sess" value="${s.id}" checked /> ${escapeHtml(s.label || s.name)}${s.phone ? ' · ' + s.phone : ''}</label>`).join('')
      : `<span class="muted">${t('no_sessions')}</span>`;
  }
}

function selectedSessionIds(cls) {
  return [...document.querySelectorAll('.' + cls + ':checked')].map(c => c.value).filter(Boolean);
}

function openConnectCard(clear = true) {
  $('connectCard').hidden = false;
  if (clear) {
    $('sessionName').value = '';
    $('sessionLabel').value = '';
    $('qrImage').hidden = true;
    $('qrPlaceholder').hidden = false;
    $('qrStatus').textContent = '';
  }
}
$('btnQuickConnect').onclick = () => openConnectCard(true);
$('btnCancelCreate').onclick = () => { $('connectCard').hidden = true; pendingQrSession = null; };

$('btnDoCreate').onclick = async () => {
  const name = $('sessionName').value.trim();
  const label = $('sessionLabel').value.trim();
  if (!name) return toast(t('lbl_session_name'), 'error');
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return toast('English id only', 'error');
  try {
    await api('POST', '/api/sessions', { name, label: label || name });
    const id = name.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
    await api('POST', `/api/sessions/${id}/start`);
    pendingQrSession = id;
    $('qrStatus').textContent = 'QR…';
    pollQr(id);
    loadSessions();
  } catch (e) { toast(e.message, 'error'); }
};

async function showQr(id) {
  try {
    const data = await api('GET', `/api/sessions/${id}/qr`);
    if (data.qr) {
      $('qrImage').src = data.qr;
      $('qrImage').hidden = false;
      $('qrPlaceholder').hidden = true;
      $('qrStatus').textContent = 'WhatsApp QR';
      return true;
    }
  } catch (_) {}
  return false;
}

async function pollQr(id) {
  for (let i = 0; i < 40; i++) {
    if (pendingQrSession !== id) return;
    if (await showQr(id)) return;
    await new Promise(r => setTimeout(r, 1500));
    try {
      const data = await api('GET', '/api/sessions');
      sessions = data.sessions || [];
      const cur = sessions.find(s => s.id === id);
      if (cur?.status === 'connected') {
        $('connectCard').hidden = true;
        pendingQrSession = null;
        renderSessions();
        return;
      }
    } catch (_) {}
  }
}

// Mailbox

function formatPhoneTitle(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d || d.length < 8 || d.length > 13) return null; // reject LID-sized ids (14+)
  if (/^0+$/.test(d)) return null;
  if (/^0(5\d{8})$/.test(d)) return '+972' + d.slice(1);
  if (/^972\d{8,10}$/.test(d)) return '+' + d;
  if (/^[1-9]\d{7,12}$/.test(d)) return '+' + d;
  return null;
}

function isGenericChatTitle(title) {
  const s = String(title || '').trim();
  if (!s || s === '.' || s === '?' || s === '—') return true;
  if (/^(Group|קבוצה|שיחה|פרטי|Private|Group chat|مجموعة|خاص)\s*\d*$/i.test(s)) return true;
  if (/^(dor|חשבון|account)$/i.test(s)) return true;
  return false;
}

function formatChatTitle(c) {
  const jid = c.jid || c.id || '';
  const isGroup = c.type === 'group' || String(jid).endsWith('@g.us');
  let title = (c.name && String(c.name).trim()) ? String(c.name).trim() : '';
  // server-provided real phone only
  const serverPhone = c.phone || null;
  const raw = String(jid).split('@')[0].split(':')[0];
  const fromJid = String(jid).includes('@lid') ? null : formatPhoneTitle(raw);
  const phone = serverPhone || fromJid;

  if (isGroup) {
    if (!title || isGenericChatTitle(title) || /^\+?\d+$/.test(title)) {
      return { title: (typeof t === 'function' ? t('type_group') : null) || 'קבוצה', isGroup: true, phone: null };
    }
    return { title, isGroup: true, phone: null };
  }

  // private: real contact name preferred
  if (title && !isGenericChatTitle(title) && !/^\+?\d{8,15}$/.test(title.replace(/[\s\-]/g, ''))) {
    return { title, isGroup: false, phone };
  }
  if (phone) return { title: phone, isGroup: false, phone };
  return { title: (typeof t === 'function' ? t('type_private') : null) || 'שיחה', isGroup: false, phone: null };
}

function chatInitials(title, isGroup) {
  if (isGroup) return t('avatar_group') || 'G';
  const s = String(title || '').trim();
  if (s.startsWith('+')) return '#';
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (!s) return '?';
  return s[0].toUpperCase();
}




function localizeMsgBody(body) {
  const s = String(body || '');
  const map = {
    '[מדיה]': 'msg_media', '[media]': 'msg_media', '[Media]': 'msg_media',
    '[תמונה]': 'msg_image', '[image]': 'msg_image', '[Image]': 'msg_image',
    '[וידאו]': 'msg_video', '[video]': 'msg_video', '[Video]': 'msg_video',
    '[אודיו]': 'msg_audio', '[audio]': 'msg_audio', '[Audio]': 'msg_audio',
    '[קובץ]': 'msg_file', '[file]': 'msg_file', '[File]': 'msg_file',
    '[סטיקר]': 'msg_sticker', '[sticker]': 'msg_sticker', '[Sticker]': 'msg_sticker',
    '[وسائط]': 'msg_media', '[صورة]': 'msg_image', '[فيديو]': 'msg_video',
    '[صوت]': 'msg_audio', '[ملف]': 'msg_file', '[ملصق]': 'msg_sticker'
  };
  if (map[s]) {
    try { return t(map[s]); } catch (_) { return s; }
  }
  return s;
}

function wireFileLabel(inputId, labelId) {
  const input = $(inputId);
  const label = $(labelId);
  if (!input || !label) return;
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    label.textContent = f ? f.name : t('lbl_no_file');
  });
}

async function loadMailbox() {
  try {
    const q = new URLSearchParams();
    if ($('mailboxSession')?.value) q.set('sessionId', $('mailboxSession').value);
    if ($('mailboxType')?.value) q.set('type', $('mailboxType').value);
    const data = await api('GET', '/api/mailbox/chats?' + q.toString());
    const st = data.stats || {};
    $('mailboxStats').textContent = `${st.totalChats || 0} · ${st.privateChats || 0} ${t('type_private')} · ${st.groupChats || 0} ${t('type_group')}`;
    const el = $('mailboxChats');
    if (!data.chats?.length) {
      el.innerHTML = `<div class="empty-state">${t('mailbox_empty_list')}</div>`;
      return;
    }
    el.innerHTML = data.chats.filter(c => !c.isSelf).map(c => {
      const info = formatChatTitle(c);
      const tag = info.isGroup
        ? `<span class="type-tag type-group">${t('type_group')}</span>`
        : `<span class="type-tag type-private">${t('type_private')}</span>`;
      const unread = c.unread ? `<span class="unread">${c.unread}</span>` : '';
      const avClass = info.isGroup ? 'chat-avatar is-group' : 'chat-avatar';
      const initial = chatInitials(info.title, info.isGroup);
      const preview = escapeHtml(localizeMsgBody(String(c.lastMessage || '').slice(0, 80)));
      const when = c.lastAt ? new Date(c.lastAt).toLocaleString() : '';
      return `<div class="chat-item ${selectedChatJid === c.jid ? 'active' : ''}" data-jid="${escapeHtml(c.jid)}" data-type="${info.isGroup ? 'group' : 'private'}" data-name="${escapeHtml(info.title)}" data-sessions="${escapeHtml((c.sessionIds || []).join(','))}" data-pcount="${c.participantCount || ''}" data-phone="${escapeHtml(info.phone || '')}">
        <div class="${avClass}" aria-hidden="true">${escapeHtml(initial)}</div>
        <div class="chat-item-body">
          <div class="chat-name">${tag}<span class="chat-name-text">${escapeHtml(info.title)}</span>${unread}</div>
          <div class="chat-preview">${preview || '—'}</div>
          <div class="chat-meta">${when ? `<span>${escapeHtml(when)}</span>` : ''}${(c.sessionIds || []).length ? `<span>${escapeHtml((c.sessionIds || []).join(', '))}</span>` : ''}</div>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('.chat-item').forEach(node => {
      node.addEventListener('click', () => {
        const meta = {
          name: node.dataset.name,
          type: node.dataset.type,
          sessions: node.dataset.sessions,
          participantCount: node.dataset.pcount,
          phone: node.dataset.phone
        };
        openChat(node.dataset.jid, meta);
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function openChat(jid, meta = {}) {
  selectedChatJid = jid;
  selectedChatMeta = meta;
  try {
    await api('POST', '/api/mailbox/read', { chatJid: jid });
    const q = new URLSearchParams({ chatJid: jid, limit: '200' });
    if ($('mailboxSession')?.value) q.set('sessionId', $('mailboxSession').value);
    const data = await api('GET', `/api/mailbox/messages?` + q.toString());
    const el = $('mailboxMessages');
    el.innerHTML = (data.messages || []).map(m => `
      <div class="msg ${m.fromMe ? 'msg-out' : 'msg-in'}">
        ${escapeHtml(localizeMsgBody(m.body || ''))}
        <div class="msg-meta">${escapeHtml(m.sessionLabel || m.sessionId)} · ${new Date(m.timestamp).toLocaleString()}</div>
      </div>`).join('') || `<div class="empty-state">${t('mailbox_empty_thread')}</div>`;
    el.scrollTop = el.scrollHeight;

    // Header — WhatsApp-like: name on top, phone (or members) under it
    const isGroup = String(jid).endsWith('@g.us') || meta.type === 'group';
    $('threadHeader').hidden = false;
    const info = formatChatTitle({
      jid,
      name: meta.name || '',
      phone: meta.phone || null,
      type: isGroup ? 'group' : (meta.type || 'private'),
      participantCount: meta.participantCount
    });
    let ht = info.title;
    const groupish = info.isGroup;
    if ($('threadAvatar')) {
      $('threadAvatar').textContent = chatInitials(ht, groupish);
      $('threadAvatar').className = 'thread-avatar' + (groupish ? ' is-group' : '');
    }
    if ($('threadHeader')) $('threadHeader').hidden = false;
    $('threadTitle').textContent = ht;

    let sub = '';
    if (groupish) {
      const pc = meta.participantCount || '';
      sub = pc ? (pc + ' ' + (t('lbl_members') || 'משתתפים')) : (t('type_group') || 'קבוצה');
    } else {
      const ph = meta.phone || info.phone || null;
      if (ph && ph !== ht) sub = ph;
      else sub = t('type_private') || 'פרטי';
    }
    $('threadMeta').textContent = sub;
    $('threadMeta').className = 'thread-meta' + (groupish ? '' : ' is-phone');

    if ($('replyBox')) {
      $('replyBox').hidden = false;
      $('replyChatJid').value = jid;
      const msgs = data.messages || [];
      $('replySessionId').value = msgs[0]?.sessionId || $('mailboxSession')?.value || (meta.sessions || '').split(',')[0] || '';
    }
    loadMailbox();
  } catch (e) { toast(e.message, 'error'); }
}

$('btnMailboxRefresh')?.addEventListener('click', () => loadMailbox());

$('replyMedia')?.addEventListener('change', () => {
  const f = $('replyMedia')?.files?.[0];
  const label = $('replyFileName');
  if (!label) return;
  if (f) {
    label.hidden = false;
    label.textContent = f.name;
  } else {
    label.hidden = true;
    label.textContent = '';
  }
});

$('mailboxSession')?.addEventListener('change', () => loadMailbox());
$('mailboxType')?.addEventListener('change', () => loadMailbox());
$('btnReply')?.addEventListener('click', async () => {
  try {
    const sessionId = $('replySessionId').value;
    const chatJid = $('replyChatJid').value;
    const message = $('replyText').value.trim();
    const file = $('replyMedia')?.files?.[0];
    if (!sessionId || !chatJid) return toast('…', 'error');
    if (!message && !file) return toast('…', 'error');
    if (file) {
      const fd = new FormData();
      fd.append('sessionId', sessionId);
      fd.append('chatJid', chatJid);
      fd.append('message', message);
      fd.append('media', file);
      await api('POST', '/api/mailbox/reply', fd, true);
    } else {
      await api('POST', '/api/mailbox/reply', { sessionId, chatJid, message });
    }
    $('replyText').value = '';
    if ($('replyMedia')) $('replyMedia').value = '';
    if ($('replyFileName')) { $('replyFileName').hidden = true; $('replyFileName').textContent = ''; }
    toast(t('btn_send'), 'success');
    setTimeout(() => openChat(chatJid, selectedChatMeta || {}), 500);
  } catch (e) { toast(e.message, 'error'); }
});

// Campaigns
function toCronFromLocal(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  // cron: min hour day month *
  return `${mm} ${hh} ${d} ${m} *`;
}

$('btnNewCampaign').onclick = () => {
  $('campaignForm').hidden = false;
  $('campaignFormTitle').textContent = t('campaign_form_title');
  $('campId').value = '';
  fillSessionSelects();
};
$('btnCancelCampaign').onclick = () => { $('campaignForm').hidden = true; };
$('campScheduleEn').onchange = (e) => { $('scheduleBox').hidden = !e.target.checked; };

$('sendScheduleEn')?.addEventListener('change', (e) => {
  if ($('sendScheduleBox')) $('sendScheduleBox').hidden = !e.target.checked;
});


buildEmojiPopover('campEmojiPop', 'campMessage');
buildEmojiPopover('sendEmojiPop', 'sendMessage');
buildEmojiPopover('replyEmojiPop', 'replyText');
$('btnCampEmoji')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); togglePop('campEmojiPop'); });
$('btnSendEmoji')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); togglePop('sendEmojiPop'); });
$('btnReplyEmoji')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); togglePop('replyEmojiPop'); });
document.addEventListener('click', (e) => {
  if (e.target.closest('.emoji-toolbar') || e.target.closest('.emoji-popover-portal') || e.target.closest('.emoji-popover')) return;
  ['campEmojiPop', 'sendEmojiPop', 'replyEmojiPop'].forEach(id => {
    const el = $(id);
    if (el) { el.hidden = true; el.style.display = 'none'; }
  });
});

$('btnSaveCampaign').onclick = async () => {
  const sessionIds = selectedSessionIds('camp-sess');
  if (!sessionIds.length) return toast(t('pick_sessions') || 'Select accounts', 'error');
  const payload = {
    name: $('campName').value.trim(),
    sessionId: sessionIds[0],
    sessionIds,
    message: $('campMessage').value.trim(),
    numbers: $('campNumbers').value,
    delayMin: Number($('campDelayMin')?.value) || 12,
    delayMax: Number($('campDelayMax')?.value) || 40,
    skipDays: Number($('campSkipDays')?.value) || 0,
    humanTyping: $('campTyping') ? $('campTyping').checked : true,
    useEmojis: $('campEmojis') ? $('campEmojis').checked : true,
    safeProfile: $('campSafeProfile')?.value || 'balanced',
    maxPerHour: Number($('campMaxHour')?.value) || 25,
    maxPerDay: Number($('campMaxDay')?.value) || 120,
    quietStart: $('campQuietStart')?.value || '',
    quietEnd: $('campQuietEnd')?.value || '',
    scheduleEnabled: $('campScheduleEn') ? $('campScheduleEn').checked : false,
    schedule: null,
    stopAt: null
  };
  if (payload.scheduleEnabled) {
    payload.schedule = toCronFromLocal($('campStartDate').value, $('campStartTime').value);
    if ($('campStopDate').value && $('campStopTime').value) {
      payload.stopAt = `${$('campStopDate').value}T${$('campStopTime').value}:00`;
    }
  }
  if (!payload.name || !payload.message) return toast(t('lbl_camp_name'), 'error');
  try {
    // media: store filename note only for now if no multipart campaign endpoint
    const media = $('campMedia')?.files?.[0];
    if (media) payload.mediaName = media.name;

    const id = $('campId').value;
    if (id) await api('PUT', `/api/campaigns/${id}`, payload);
    else await api('POST', '/api/campaigns', payload);
    toast(t('btn_save'), 'success');
    $('campaignForm').hidden = true;
    loadCampaigns();
  } catch (e) { toast(e.message, 'error'); }
};

async function loadCampaigns() {
  try {
    const data = await api('GET', '/api/campaigns');
    const el = $('campaignsList');
    if (!data.campaigns?.length) {
      el.innerHTML = `<div class="empty-state">${t('btn_new_campaign')}</div>`;
      return;
    }
    el.innerHTML = data.campaigns.map(c => {
      const st = c.stats || {};
      return `<div class="campaign-card ${c.running ? 'running' : ''}" data-id="${escapeHtml(c.id)}">
        <div class="c-head">
          <div class="c-name">${escapeHtml(c.name || 'קמפיין')} ${c.running ? `<span class="badge badge-on">${t('status_on') || 'פעיל'}</span>` : ''}</div>
          <div class="c-actions">
            ${c.running
              ? `<button class="btn btn-danger btn-sm" data-cact="stop" data-id="${c.id}">${t('btn_stop')}</button>`
              : `<button class="btn btn-primary btn-sm" data-cact="start" data-id="${c.id}">${t('btn_start_campaign') || 'הפעל קמפיין'}</button>`}
            <button class="btn btn-ghost btn-sm" data-cact="del" data-id="${c.id}" title="מחק">×</button>
          </div>
        </div>
        <div class="c-meta">
          <span>${escapeHtml(String(c.sessionId || (c.sessionIds||[]).join(', ') || '—'))}</span>
          <span>· ${(c.numbers || []).length} מספרים</span>
          ${st.total ? `<span>· ${st.sent || 0}/${st.total}</span>` : ''}
        </div>
        <div class="c-progress"><div class="c-progress-bar" style="width:${st.total ? Math.min(100, Math.round(((st.sent||0)/st.total)*100)) : 0}%"></div></div>
        <div class="c-log" id="clog-${c.id}"></div>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-cact]').forEach(btn => {
      btn.onclick = async () => {
        try {
          if (btn.dataset.cact === 'start') {
            await api('POST', `/api/campaigns/${btn.dataset.id}/start`);
            $('campaignLog').hidden = false;
          } else if (btn.dataset.cact === 'stop') {
            await api('POST', `/api/campaigns/${btn.dataset.id}/stop`);
          } else {
            if (!confirm(t('confirm_delete'))) return;
            await api('DELETE', `/api/campaigns/${btn.dataset.id}`);
          }
          loadCampaigns();
        } catch (e) { toast(e.message, 'error'); }
      };
    });
  } catch (e) { toast(e.message, 'error'); }
}

// Warmer
function refreshWarmerSessions() {
  const el = $('warmerSessions');
  const connected = sessions.filter(s => s.status === 'connected');
  if (!connected.length) {
    el.innerHTML = `<span class="muted">${t('no_sessions')}</span>`;
    return;
  }
  el.innerHTML = connected.map(s =>
    `<label class="check"><input type="checkbox" class="warmer-cb" value="${s.id}" checked /> ${escapeHtml(s.label || s.name)}</label>`
  ).join('');
}
$('btnStartWarmer').onclick = async () => {
  const ids = [...document.querySelectorAll('.warmer-cb:checked')].map(c => c.value);
  if (ids.length < 2) return toast(t('lbl_pick_sessions'), 'error');
  try {
    await api('POST', '/api/warmer/start', {
      sessionIds: ids,
      mode: $('warmerMode').value,
      intervalMin: Number($('warmerMin').value) || 30,
      intervalMax: Number($('warmerMax').value) || 120
    });
    setWarmerBadge(true);
    setTimeout(pollWarmerStatus, 400);
  } catch (e) { toast(e.message, 'error'); }
};
$('btnStopWarmer').onclick = async () => {
  try { await api('POST', '/api/warmer/stop'); setWarmerBadge(false); }
  catch (e) { toast(e.message, 'error'); }
};
function setWarmerBadge(on) {
  const b = $('warmerBadge');
  b.textContent = on ? t('status_on') : t('status_off');
  b.className = 'chip ' + (on ? 'chip-on' : 'chip-off');
}

// Send

function collectSendOptions() {
  const startDate = $('sendStartDate')?.value;
  const startTime = $('sendStartTime')?.value || '10:00';
  const stopDate = $('sendStopDate')?.value;
  const stopTime = $('sendStopTime')?.value;
  const scheduleEnabled = !!$('sendScheduleEn')?.checked;
  let startAt = null, stopAt = null;
  if (scheduleEnabled && startDate) {
    startAt = new Date(startDate + 'T' + (startTime || '00:00') + ':00').toISOString();
  }
  if (scheduleEnabled && stopDate) {
    stopAt = new Date(stopDate + 'T' + (stopTime || '23:59') + ':00').toISOString();
  }
  return {
    humanTyping: $('sendTyping') ? !!$('sendTyping').checked : true,
    emojiVary: $('sendEmojis') ? !!$('sendEmojis').checked : false,
    delayMin: Number($('sendDelayMin')?.value || $('bulkMin')?.value || 12),
    delayMax: Number($('sendDelayMax')?.value || $('bulkMax')?.value || 40),
    safeProfile: $('sendSafeProfile')?.value || 'balanced',
    maxPerHour: Number($('sendMaxHour')?.value) || 25,
    maxPerDay: Number($('sendMaxDay')?.value) || 120,
    quietStart: $('sendQuietStart')?.value || '',
    quietEnd: $('sendQuietEnd')?.value || '',
    scheduleEnabled,
    startAt,
    stopAt
  };
}

$('btnSendSingle').onclick = async () => {
  try {
    const sessionIds = selectedSessionIds('send-sess');
    const opts = collectSendOptions();
    const body = {
      sessionId: sessionIds[0] || $('sendSession')?.value,
      sessionIds,
      to: $('sendTo').value.trim(),
      message: $('sendMessage').value.trim(),
      humanTyping: opts.humanTyping,
      emojiVary: opts.emojiVary,
      safeProfile: opts.safeProfile,
      delayMin: opts.delayMin,
      delayMax: opts.delayMax,
      maxPerHour: opts.maxPerHour,
      maxPerDay: opts.maxPerDay,
      quietStart: opts.quietStart,
      quietEnd: opts.quietEnd
    };
    if (!body.sessionId) return toast(t('pick_sessions') || 'Select account', 'error');
    if (!body.to || !body.message) return toast('…', 'error');
    if (opts.scheduleEnabled && opts.startAt) {
      // schedule as single-item bulk
      const data = await api('POST', '/api/send-bulk', {
        sessionIds: sessionIds.length ? sessionIds : [body.sessionId],
        numbers: [body.to],
        message: body.message,
        humanTyping: opts.humanTyping,
        emojiVary: opts.emojiVary,
        delayMin: opts.delayMin,
        delayMax: opts.delayMax,
        safeProfile: opts.safeProfile,
        maxPerHour: opts.maxPerHour,
        maxPerDay: opts.maxPerDay,
        quietStart: opts.quietStart,
        quietEnd: opts.quietEnd,
        scheduleEnabled: true,
        startAt: opts.startAt,
        stopAt: opts.stopAt
      });
      toast((t('scheduled') || 'Scheduled') + ' · ' + (data.startAt || ''), 'success');
      $('sendResult').hidden = false;
      $('sendResult').textContent = JSON.stringify(data, null, 2);
      return;
    }
    const data = await api('POST', '/api/send', body);
    toast(t('btn_send'), 'success');
    $('sendResult').hidden = false;
    $('sendResult').textContent = JSON.stringify(data, null, 2);
  } catch (e) { toast(e.message, 'error'); }
};
$('btnSendBulk').onclick = async () => {
  try {
    const sessionIds = selectedSessionIds('send-sess');
    if (!sessionIds.length) return toast(t('pick_sessions') || 'Select accounts', 'error');
    const opts = collectSendOptions();
    const numbers = $('sendBulkList').value;
    const message = $('sendMessage').value.trim();
    if (!message) return toast('…', 'error');
    const payload = {
      sessionIds,
      numbers,
      message,
      delayMin: opts.delayMin,
      delayMax: opts.delayMax,
      humanTyping: opts.humanTyping,
      emojiVary: opts.emojiVary,
      safeProfile: opts.safeProfile,
      maxPerHour: opts.maxPerHour,
      maxPerDay: opts.maxPerDay,
      quietStart: opts.quietStart,
      quietEnd: opts.quietEnd,
      scheduleEnabled: opts.scheduleEnabled,
      startAt: opts.startAt,
      stopAt: opts.stopAt
    };
    const data = await api('POST', '/api/send-bulk', payload);
    if (data.scheduled) toast((t('scheduled') || 'Scheduled') + ' · ' + (data.startAt || ''), 'success');
    else toast(t('btn_send_list'), 'success');
    $('sendResult').hidden = false;
    $('sendResult').textContent = JSON.stringify(data, null, 2);
  } catch (e) { toast(e.message, 'error'); }
};
$('btnSendFile').onclick = async () => {
  try {
    const sessionIds = selectedSessionIds('send-sess');
    if (!sessionIds.length) return toast(t('pick_sessions') || 'Select accounts', 'error');
    const file = $('sendFile')?.files?.[0];
    if (!file) return toast(t('btn_choose_file') || 'Choose file', 'error');
    const message = $('sendMessage').value.trim();
    if (!message) return toast(t('lbl_message') || 'Message required', 'error');
    const opts = collectSendOptions();
    const text = await file.text();
    const numbers = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    const payload = {
      sessionIds,
      numbers,
      message,
      delayMin: opts.delayMin,
      delayMax: opts.delayMax,
      humanTyping: opts.humanTyping,
      emojiVary: opts.emojiVary,
      safeProfile: opts.safeProfile,
      maxPerHour: opts.maxPerHour,
      maxPerDay: opts.maxPerDay,
      quietStart: opts.quietStart,
      quietEnd: opts.quietEnd,
      scheduleEnabled: opts.scheduleEnabled,
      startAt: opts.startAt,
      stopAt: opts.stopAt
    };
    const data = await api('POST', '/api/send-bulk', payload);
    if (data.scheduled) toast(t('scheduled') || 'Scheduled', 'success');
    else toast(t('btn_send_file') || 'נשלח', 'success');
    $('sendResult').hidden = false;
    $('sendResult').textContent = JSON.stringify(data, null, 2);
  } catch (e) { toast(e.message, 'error'); }
};

// Groups
$('btnLoadGroups').onclick = async () => {
  try {
    try { fillContactsSessions(); } catch (e) {}
    const data = await api('GET', `/api/sessions/${$('groupSession').value}/groups`);
    const el = $('groupsList');
    el.innerHTML = (data.groups || []).map(g => `
      <div class="group-item" data-id="${escapeHtml(g.id)}" data-name="${escapeHtml(g.subject || '')}">
        <div>
          <div style="font-weight:700">${escapeHtml(g.subject || '—')}</div>
          <div class="muted">${g.size || 0} · ${escapeHtml(g.id)}</div>
        </div>
        <button class="btn btn-sm btn-primary">${t('btn_extract')}</button>
      </div>`).join('') || `<div class="empty-state">—</div>`;
    el.querySelectorAll('.group-item').forEach(item => {
      item.onclick = () => {
        selectedGroupId = item.dataset.id;
        $('addGroupId').value = item.dataset.id;
        $('extractBox').hidden = false;
        $('extractGroupName').textContent = item.dataset.name + ' · ' + item.dataset.id;
      };
    });
  } catch (e) { toast(e.message, 'error'); }
};
$('btnExtract').onclick = async () => {
  try {
    const data = await api('POST', '/api/groups/extract', {
      sessionId: $('groupSession').value,
      groupId: selectedGroupId
    });
    $('extractResult').hidden = false;
    const files = [];
    if (data.file) files.push({ label: 'TXT', file: data.file });
    if (data.pdfFile) files.push({ label: 'PDF', file: data.pdfFile });
    if (data.debugFile) files.push({ label: 'DEBUG', file: data.debugFile });
    // fallback parse from URL path
    const fromUrl = (u) => {
      if (!u) return null;
      const m = String(u).match(/\/api\/downloads\/(.+)$/);
      return m ? decodeURIComponent(m[1]) : null;
    };
    if (!files.length) {
      const t1 = fromUrl(data.downloadUrl); if (t1) files.push({ label: 'TXT', file: t1 });
      const t2 = fromUrl(data.downloadUrlPdf); if (t2) files.push({ label: 'PDF', file: t2 });
      const t3 = fromUrl(data.downloadUrlDebug); if (t3) files.push({ label: 'DEBUG', file: t3 });
    }
    const linkHtml = files.map((f, i) =>
      `<button type="button" class="btn btn-ghost btn-sm" data-dl="${escapeHtml(f.file)}" style="margin:2px">${f.label}</button>`
    ).join(' ');
    $('extractResult').innerHTML = `<strong>${data.count}</strong> / ${data.totalParticipants || '?'} · unresolved ${data.unresolved || 0}<br>${escapeHtml(data.note || '')}<br>${linkHtml}`;
    $('extractResult').querySelectorAll('[data-dl]').forEach(btn => {
      btn.onclick = async () => {
        try { await downloadAuthFile(btn.getAttribute('data-dl')); } catch (e) { toast(e.message, 'error'); }
      };
    });
  } catch (e) { toast(e.message, 'error'); }
};
$('btnAddMembers').onclick = async () => {
  try {
    const data = await api('POST', '/api/groups/add-members', {
      sessionId: $('groupSession').value,
      groupId: $('addGroupId').value.trim(),
      numbers: $('addNumbers').value
    });
    $('addResult').hidden = false;
    $('addResult').textContent = JSON.stringify(data.result, null, 2);
  } catch (e) { toast(e.message, 'error'); }
};

// Tools
$('btnCheck').onclick = async () => {
  try {
    const data = await api('POST', '/api/check-numbers', {
      sessionId: $('checkSession').value,
      numbers: $('checkNumbers').value
    });
    $('checkResult').hidden = false;
    $('checkResult').textContent = JSON.stringify(data.result, null, 2);
  } catch (e) { toast(e.message, 'error'); }
};

async function refreshHealth() {
  try {
    const data = await api('GET', '/api/health');
    const b = $('healthBadge');
    b.textContent = t('health_on');
    b.className = 'status-pill status-on';
    if ($('sysUptime')) $('sysUptime').textContent = Math.floor(data.uptime / 60) + 'm';
    if ($('sysSessions')) $('sysSessions').textContent = data.sessions ?? 0;
    if ($('sysWarmer')) $('sysWarmer').textContent = data.warmer ? t('status_on') : t('status_off');
    if ($('sysMailbox')) $('sysMailbox').textContent = data.mailbox?.totalMessages ?? 0;
    
  } catch (_) {
    const b = $('healthBadge');
    b.textContent = t('health_off');
    b.className = 'status-pill status-off';
  }
}

onSocket('session-update', (data) => {
  loadSessions();
  if (data.event === 'qr' && data.data?.qr) {
    pendingQrSession = data.sessionId;
    openConnectCard(false);
    $('qrImage').src = data.data.qr;
    $('qrImage').hidden = false;
    $('qrPlaceholder').hidden = true;
  }
  if (data.event === 'status' && data.data?.status === 'connected') {
    $('connectCard').hidden = true;
    pendingQrSession = null;
  }
});
function renderWarmerStatus(st) {
  if (!st) return;
  setWarmerBadge(!!st.active);
  if ($('wSent')) $('wSent').textContent = st.stats?.sent || 0;
  if ($('wErrors')) $('wErrors').textContent = st.stats?.errors || 0;
  if ($('wLast')) $('wLast').textContent = st.stats?.last ? new Date(st.stats.last).toLocaleTimeString() : '—';
  if ($('wReady')) $('wReady').textContent = (st.readyCount || 0) + '/' + (st.total || 0);
  const box = $('warmerSessionStatus');
  if (!box) return;
  const rows = st.sessions || [];
  if (!rows.length) {
    box.innerHTML = '<div class="muted">—</div>';
    return;
  }
  box.innerHTML = rows.map(s => {
    const pct = Math.max(0, Math.min(100, s.score || 0));
    const stKey = s.ready ? 'ready' : (s.status || 'idle');
    const label = s.ready
      ? (t('warmer_ready') || 'מוכן לשליחה')
      : (stKey === 'warming' ? (t('warmer_warming') || 'מתחמם')
        : stKey === 'offline' ? (t('status_disconnected') || 'offline')
        : (t('status_off') || stKey));
    const badgeCls = s.ready ? 'badge badge-on' : (s.online ? 'badge badge-qr' : 'badge badge-off');
    return `<div class="warmer-card ${s.ready ? 'is-ready' : ''}">
      <div class="warmer-card-top">
        <div class="warmer-card-name">${escapeHtml(s.label || s.id)}</div>
        <span class="${badgeCls}">${escapeHtml(label)}</span>
      </div>
      <div class="warmer-card-meta">${s.phone ? ('+' + String(s.phone).replace(/\D/g,'')) : s.id}</div>
      <div class="warmer-bar"><div class="warmer-bar-fill" style="width:${pct}%"></div></div>
      <div class="warmer-card-stats">${pct}% · ↑${s.sent||0} ↓${s.received||0}</div>
    </div>`;
  }).join('');
}

onSocket('warmer-status', (st) => {
  renderWarmerStatus(st);
});

async function pollWarmerStatus() {
  try {
    const data = await api('GET', '/api/warmer/status');
    renderWarmerStatus(data.status || data);
  } catch {}
}

onSocket('warmer-message', (msg) => {
  const line = document.createElement('div');
  line.textContent = `${new Date(msg.at).toLocaleTimeString()} | ${msg.from} → ${msg.to}`;
  $('warmerLog')?.prepend(line);
});
onSocket('mailbox-message', () => {
  if ($('tab-mailbox')?.classList.contains('active')) loadMailbox();
});
onSocket('campaign-progress', (p) => {
  if ($('campaignLog')) {
    $('campaignLog').hidden = false;
    const line = document.createElement('div');
    line.textContent = `${p.phone} → ${p.status}`;
    $('campaignLog').prepend(line);
  }
});
onSocket('campaign-update', () => loadCampaigns());

(async () => {
  const user = await ensureLoggedIn();
  if (!user) return;
  try {
    if (user.role === 'admin') {
      const nav = document.querySelector('.sidebar-nav') || document.querySelector('.nav') || document.querySelector('aside nav') || document.querySelector('.sidebar');
      if (nav && !document.getElementById('btnAdminPanel')) {
        const a = document.createElement('button');
        a.id = 'btnAdminPanel';
        a.className = 'nav-item';
        a.type = 'button';
        a.innerHTML = '<span class="nav-ico" aria-hidden="true">★</span> <span>Admin</span>';
        a.onclick = () => { location.href = '/admin.html'; };
        nav.appendChild(a);
      }
    }
  } catch {}
  initSettings();
  loadSessions();
  refreshHealth();
  setInterval(refreshHealth, 12000);
  setInterval(loadSessions, 15000);
})();


if ($('btnMailboxClear')) {
  $('btnMailboxClear').onclick = async () => {
    if (!confirm('Clear inbox history on this server?')) return;
    try {
      await api('POST', '/api/mailbox/clear');
      selectedChatJid = null;
      if ($('threadHeader')) $('threadHeader').hidden = true;
      if ($('replyBox')) $('replyBox').hidden = true;
      if ($('mailboxMessages')) $('mailboxMessages').innerHTML = '<div class="empty-state">' + t('mailbox_empty_thread') + '</div>';
      loadMailbox();
    } catch (e) { toast(e.message, 'error'); }
  };
}

if ($('replyMedia')) {
  $('replyMedia').addEventListener('change', () => {
    const f = $('replyMedia').files?.[0];
    if ($('replyFileName')) {
      if (f) { $('replyFileName').hidden = false; $('replyFileName').textContent = f.name; }
      else { $('replyFileName').hidden = true; $('replyFileName').textContent = ''; }
    }
  });
}


async function loadStats() {
  try {
    let overview = null;
    try {
      overview = await api('GET', '/api/stats/overview');
    } catch (e) {
      console.error('stats overview', e);
      // fallback partial
      try {
        const h = await api('GET', '/api/health');
        overview = {
          uptime: h.uptime || 0,
          sessions: { total: h.sessions || 0, online: 0 },
          mailbox: h.mailbox || {},
          campaigns: { total: 0, running: 0 },
          analytics: { totalEvents: 0, success: 0, fail: 0, today: 0, byCategory: {}, byAction: {} }
        };
      } catch {
        overview = {
          uptime: 0,
          sessions: { total: 0, online: 0 },
          mailbox: {},
          campaigns: { total: 0, running: 0 },
          analytics: { totalEvents: 0, success: 0, fail: 0, today: 0, byCategory: {}, byAction: {} }
        };
      }
    }
    const up = Number(overview.uptime || 0);
    const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60);
    if ($('stUptime')) {
      if (up < 60) $('stUptime').textContent = Math.floor(up) + ' ' + (t('unit_sec') || 's');
      else if (h <= 0) $('stUptime').textContent = m + ' ' + (t('unit_min') || 'min');
      else $('stUptime').textContent = h + ' ' + (t('unit_hour') || 'h') + ' ' + m + ' ' + (t('unit_min') || 'min');
    }
    if ($('stSessions')) $('stSessions').textContent = overview.sessions?.total ?? 0;
    if ($('stSessionsSub')) $('stSessionsSub').textContent = (t('stat_online') || 'Online') + ': ' + (overview.sessions?.online ?? 0);
    if ($('stMailbox')) $('stMailbox').textContent = overview.mailbox?.totalChats ?? overview.mailbox?.totalMessages ?? 0;
    if ($('stMailboxSub')) {
      const mb = overview.mailbox || {};
      $('stMailboxSub').textContent =
        (mb.privateChats || 0) + ' ' + (t('type_private') || 'private') + ' · ' +
        (mb.groupChats || 0) + ' ' + (t('type_group') || 'group') + ' · ' +
        (mb.unread || 0) + ' ' + (t('stat_unread') || 'unread');
    }
    if ($('stCamps')) $('stCamps').textContent = overview.campaigns?.total ?? 0;
    if ($('stCampsSub')) $('stCampsSub').textContent = (t('stat_running') || 'Running') + ': ' + (overview.campaigns?.running ?? 0);
    const an = overview.analytics || {};
    const msgCount = (an.byCategory && an.byCategory.message) || 0;
    if ($('stMsg')) $('stMsg').textContent = msgCount;
    if ($('stMsgSub')) $('stMsgSub').textContent = (t('stat_events') || 'Events') + ': ' + (an.totalEvents || 0);
    if ($('stRatio')) $('stRatio').textContent = (an.success || 0) + ' / ' + (an.fail || 0);
    if ($('stToday')) $('stToday').textContent = (t('stat_today') || 'Today') + ': ' + (an.today || 0);

    const br = $('statsBreakdown');
    if (br) {
      const cats = an.byCategory || {};
      const actions = an.byAction || {};
      const chips = [
        ...Object.entries(cats).map(([k, v]) => '<span class="stat-chip"><span>' + escapeHtml(k) + '</span><strong>' + v + '</strong></span>'),
        ...Object.entries(actions).slice(0, 12).map(([k, v]) => '<span class="stat-chip"><span>' + escapeHtml(k) + '</span><strong>' + v + '</strong></span>')
      ];
      br.innerHTML = chips.join('') || '<span class="muted">' + (t('stats_no_breakdown') || 'No breakdown yet') + '</span>';
    }

    await loadStatsActivity();
  } catch (e) {
    console.error(e);
  }
}

async function loadStatsActivity() {
  try {
    const cat = $('statsCategory')?.value || '';
    const q = new URLSearchParams({ limit: '150' });
    if (cat) q.set('category', cat);
    let data = { events: [] };
    try {
      data = await api('GET', '/api/analytics/events?' + q.toString());
    } catch (e) {
      console.error('events', e);
    }
    const el = $('statsActivity');
    if (!el) return;
    let rows = data.events || data || [];
    if (!Array.isArray(rows)) rows = [];
    if (!rows.length && cat) {
      // fallback: show all so user sees something
      try {
        const all = await api('GET', '/api/analytics/events?limit=150');
        rows = all.events || [];
        if (rows.length) {
          el.innerHTML = '<div class="muted" style="padding:8px 12px">אין אירועים בקטגוריה זו — מציג הכל:</div>' +
            rows.map(e => activityRowHtml(e)).join('');
          return;
        }
      } catch {}
    }
    if (!rows.length) {
      el.innerHTML = '<div class="empty-state">' + (t('stats_empty') || 'No data') + '</div>';
      return;
    }
    el.innerHTML = rows.map(e => activityRowHtml(e)).join('');
  } catch (e) {
    console.error(e);
  }
}

function activityRowHtml(e) {
  const when = e.ts ? new Date(e.ts).toLocaleString('he-IL') : '';
  const cat = escapeHtml(e.category || 'system');
  const act = escapeHtml(e.action || '');
  const sid = e.sessionId ? ' · ' + escapeHtml(e.sessionId) : '';
  const ok = e.success !== false;
  return '<div class="activity-row">' +
    '<span class="act-time">' + when + '</span>' +
    '<span class="cat">' + cat + '</span>' +
    '<span class="act-name">' + act + sid + '</span>' +
    '<span class="' + (ok ? 'ok' : 'fail') + '">' + (ok ? 'OK' : 'FAIL') + '</span>' +
    '</div>';
}

$('btnStatsRefresh')?.addEventListener('click', () => loadStats());
$('btnStatsFilter')?.addEventListener('click', () => loadStatsActivity());
$('statsCategory')?.addEventListener('change', () => loadStatsActivity());
$('btnStatsClear')?.addEventListener('click', async () => {
  try {
    await api('POST', '/api/analytics/clear', {});
    toast('נוקה', 'success');
    loadStats();
  } catch (e) { toast(e.message, 'error'); }
});




/* ===== Settings engine ===== */
const SETTINGS_KEY = 'wasender_settings_v2';
const defaultSettings = {
  lang: 'he',
  theme: 'dark',
  density: 'comfortable',
  fontScale: '1',
  reduceMotion: false,
  sound: true,
  desktopNotif: false,
  defaultTab: 'sessions',
  mailboxPoll: 8,
  confirmDanger: true,
  autoReconnect: true
};

function loadSettings() {
  try {
    const s = { ...defaultSettings, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
    if (!s.theme || s.theme === 'light' && s.__forceDark) s.theme = 'dark';
    if (!s.theme) s.theme = 'dark';
    return s;
  } catch {
    return { ...defaultSettings };
  }
}

function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  // legacy mirrors for any leftover readers
  try {
    localStorage.setItem('wl_lang', s.lang || 'he');
    localStorage.setItem('wl_theme', s.theme || 'dark');
    localStorage.setItem('wl_density', s.density || 'comfortable');
    localStorage.setItem('wl_reduce', s.reduceMotion ? '1' : '0');
  } catch {}
}

function resolveTheme(themeVal) {
  if (themeVal === 'system') {
    return (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  return themeVal === 'light' ? 'light' : 'dark';
}

function applySettings(s) {
  if (!s) s = loadSettings();
  window.__settings = s;
  lang = s.lang || 'he';
  theme = s.theme || 'dark';
  density = s.density || 'comfortable';
  reduceMotion = !!s.reduceMotion;
  window.__lang = lang;

  const resolved = resolveTheme(theme);
  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.setAttribute('data-density', density);
  document.documentElement.setAttribute('data-reduce-motion', reduceMotion ? '1' : '0');
  document.documentElement.style.setProperty('--font-scale', String(s.fontScale || 1));
  document.documentElement.lang = lang;
  document.documentElement.dir = (lang === 'en') ? 'ltr' : 'rtl';

  try { applyI18n(lang); } catch (e) { console.error(e); }
  // live-update status pill without waiting for next health poll
  try {
    const b = document.getElementById('healthBadge');
    if (b) {
      const on = b.classList.contains('status-on');
      b.textContent = on ? t('health_on') : (b.classList.contains('status-wait') ? '…' : t('health_off'));
    }
  } catch {}

  const set = (id, val, type) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (type === 'check') el.checked = !!val;
    else el.value = val;
  };
  set('setLang', lang);
  set('setTheme', theme);
  set('setDensity', density);
  set('setFontScale', String(s.fontScale || '1'));
  set('setReduceMotion', s.reduceMotion, 'check');
  set('setSound', s.sound !== false, 'check');
  set('setDesktopNotif', s.desktopNotif, 'check');
  set('setDefaultTab', s.defaultTab || 'sessions');
  set('setMailboxPoll', s.mailboxPoll || 8);
  set('setConfirmDanger', s.confirmDanger !== false, 'check');
  set('setAutoReconnect', s.autoReconnect !== false, 'check');
}

function readSettingsFromForm() {
  const v = (id, def) => {
    const el = document.getElementById(id);
    return el ? el.value : def;
  };
  const c = (id, def) => {
    const el = document.getElementById(id);
    return el ? !!el.checked : def;
  };
  return {
    lang: v('setLang', 'he'),
    theme: v('setTheme', 'dark'),
    density: v('setDensity', 'comfortable'),
    fontScale: v('setFontScale', '1'),
    reduceMotion: c('setReduceMotion', false),
    sound: c('setSound', true),
    desktopNotif: c('setDesktopNotif', false),
    defaultTab: v('setDefaultTab', 'sessions'),
    mailboxPoll: Number(v('setMailboxPoll', 8)) || 8,
    confirmDanger: c('setConfirmDanger', true),
    autoReconnect: c('setAutoReconnect', true)
  };
}

function wireSettings() {
  const ids = ['setLang','setTheme','setDensity','setFontScale','setReduceMotion','setSound','setDesktopNotif','setDefaultTab','setMailboxPoll','setConfirmDanger','setAutoReconnect'];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (!el || el.__wired) return;
    el.__wired = true;
    el.addEventListener('change', () => {
      const s = readSettingsFromForm();
      saveSettings(s);
      applySettings(s);
      if (id === 'setLang') {
        softRefreshAfterLang();
      }
      if (s.desktopNotif && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().catch(() => {});
      }
      try { toast(t('settings_saved') || 'OK', 'success'); } catch {}
    });
  });
  const resetBtn = document.getElementById('btnResetSettings');
  if (resetBtn && !resetBtn.__wired) {
    resetBtn.__wired = true;
    resetBtn.addEventListener('click', () => {
      const s = { ...defaultSettings };
      saveSettings(s);
      applySettings(s);
      try { toast(t('settings_reset') || 'Reset', 'success'); } catch {}
    });
  }
}

// Apply on load (dark by default unless saved)
window.__settings = loadSettings();
try { applySettings(window.__settings); } catch (e) { console.error(e); }
try { wireSettings(); } catch (e) { console.error(e); }
document.addEventListener('DOMContentLoaded', () => {
  try { wireSettings(); applySettings(loadSettings()); } catch (e) { console.error(e); }
});


/* ===== Contacts ===== */
function fillContactsSessions() {
  const sel = $('contactsSession');
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '';
  (sessions || []).forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = (s.label || s.name || s.id) + (s.phone ? ' · +' + String(s.phone).replace(/\D/g,'') : '');
    sel.appendChild(opt);
  });
  if (cur) sel.value = cur;
}

async function contactsLoad() {
  try {
    const sessionId = $('contactsSession')?.value;
    if (!sessionId) return toast(t('pick_sessions') || 'Select account', 'error');
    const mode = $('contactsMode')?.value || 'all';
    // GET filtered by mode (accurate counts per source)
    const data = await api('GET', '/api/contacts/' + encodeURIComponent(sessionId) + '?mode=' + encodeURIComponent(mode));
    let rows = data.contacts || [];
    // If empty on first try, run harvest then GET again with SAME mode
    if (!rows.length) {
      try {
        await api('POST', '/api/contacts/harvest', { sessionId, mode });
        const data2 = await api('GET', '/api/contacts/' + encodeURIComponent(sessionId) + '?mode=' + encodeURIComponent(mode));
        rows = data2.contacts || [];
      } catch (e) {
        console.warn(e);
      }
    }
    const lines = rows.map(r => {
      const ph = r.formatted || (r.phone ? ('+' + String(r.phone).replace(/^\+/, '')) : '');
      const nm = (r.name && String(r.name).trim()) ? String(r.name).trim() : '';
      const src = r.source ? '  [' + r.source + ']' : '';
      return nm ? (nm + '\n' + ph + src) : (ph + src);
    });
    const pre = $('contactsPreview');
    if (pre) {
      pre.hidden = false;
      pre.textContent = lines.length
        ? lines.slice(0, 2000).join('\n') + (rows.length > 2000 ? '\n… +' + (rows.length - 2000) : '')
        : (t('contacts_empty') || 'No contacts for this source');
    }
    toast((t('contacts_loaded') || 'Loaded') + ': ' + rows.length, rows.length ? 'success' : 'info');
  } catch (e) {
    toast(e.message || String(e), 'error');
  }
}

async function contactsExport() {
  try {
    const sessionId = $('contactsSession')?.value;
    if (!sessionId) return toast(t('pick_sessions') || 'Select account', 'error');
    const mode = $('contactsMode')?.value || 'all';
    const format = $('contactsFormat')?.value || 'txt';
    const data = await api('POST', '/api/contacts/export', { sessionId, mode, format });
    toast((t('contacts_exported') || 'Exported') + ': ' + (data.count || 0), 'success');
    const box = $('contactsDownload');
    if (box && data.file) {
      box.innerHTML = '<button type="button" class="btn btn-ghost btn-sm" id="btnDlContacts">' +
        (t('download_file') || 'Download') + ' — ' + data.file + '</button>';
      const b = document.getElementById('btnDlContacts');
      if (b) b.onclick = async () => {
        try { await downloadAuthFile(data.file); } catch (e) { toast(e.message, 'error'); }
      };
    }
    if ($('contactsPreview') && data.rows) {
      $('contactsPreview').hidden = false;
      $('contactsPreview').textContent = (data.rows || []).map(r => {
        return r.formatted || (r.phone ? ('+' + String(r.phone).replace(/^\+/, '')) : '');
      }).filter(Boolean).join('\n');
    }
  } catch (e) { toast(e.message, 'error'); }
}

async function contactsImport() {
  try {
    const sessionId = $('contactsSession')?.value;
    if (!sessionId) return toast(t('pick_sessions') || 'Select account', 'error');
    let text = $('contactsImportText')?.value || '';
    const file = $('contactsImportFile')?.files?.[0];
    const check = !!$('contactsImportCheck')?.checked;
    let data;
    if (file) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sessionId', sessionId);
      if (check) fd.append('check', '1');
      data = await api('POST', '/api/contacts/import-file', fd, true);
    } else {
      if (!text.trim()) return toast('…', 'error');
      data = await api('POST', '/api/contacts/import', { sessionId, text, check });
    }
    toast((t('contacts_imported') || 'Imported') + ': ' + (data.count || 0), 'success');
    const pre = $('contactsImportResult');
    pre.hidden = false;
    pre.textContent = JSON.stringify(data, null, 2);
  } catch (e) { toast(e.message, 'error'); }
}

$('btnContactsLoad')?.addEventListener('click', contactsLoad);
$('btnContactsExport')?.addEventListener('click', contactsExport);
$('btnContactsImport')?.addEventListener('click', contactsImport);

document.getElementById('btnLogoutApp')?.addEventListener('click', async () => {
  try {
    await api('POST', '/api/auth/logout');
  } catch {}
  clearAuthAndRedirect();
});
