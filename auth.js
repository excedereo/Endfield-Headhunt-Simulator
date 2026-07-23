/* ENDFIELD // Аккаунты и облачная синхронизация (Supabase).
   Без сборки — клиент грузится с CDN. Всё завязано на публичный (anon) ключ,
   доступ к чужим данным закрыт RLS-политиками на стороне базы (см. supabase/schema.sql).
   Если юзер не залогинен — сайт работает как раньше, целиком на localStorage. */

const SUPABASE_URL = 'https://rxbjivwjkqluwlxbjaxr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_c4sS5xT2FIbQHse3uH-KGA_rqBMnJfK';

const Cloud = (() => {
  let sb = null;
  let user = null;
  let ready = false;
  const listeners = [];

  function notify() { listeners.forEach(fn => { try { fn(user); } catch (e) {} }); }

  async function init() {
    if (!window.supabase) { ready = true; notify(); return; } // CDN не загрузился — работаем офлайн
    sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sb.auth.getSession();
    user = data && data.session ? data.session.user : null;
    ready = true;
    notify();
    sb.auth.onAuthStateChange((_event, session) => {
      user = session ? session.user : null;
      notify();
    });
  }
  const initPromise = init();

  function onAuthChange(fn) { listeners.push(fn); if (ready) fn(user); }

  // ── оповещение о сбоях синхронизации ──
  // Молчаливый console.warn однажды уже стоил двух дней потерянных данных: запросы падали
  // с 403, а пользователь ничего не видел. Теперь любая ошибка облака поднимается в UI.
  const syncListeners = [];
  function onSyncError(fn) { syncListeners.push(fn); }
  function reportSync(op, error) {
    if (!error) { syncListeners.forEach(fn => { try { fn(null); } catch (e) {} }); return; }
    console.warn('[cloud] ' + op, error.message);
    syncListeners.forEach(fn => { try { fn({ op, message: error.message }); } catch (e) {} });
  }

  async function signUp(email, password) {
    if (!sb) throw new Error('Supabase недоступен');
    const { error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
  }
  async function signIn(email, password) {
    if (!sb) throw new Error('Supabase недоступен');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }
  async function signOut() {
    if (!sb) return;
    await sb.auth.signOut();
  }

  // ── история: облако как источник истины при входе, localStorage — офлайн-кэш ──
  async function pullHistory() {
    if (!sb || !user) return null;
    const { data, error } = await sb.from('history').select('*').eq('user_id', user.id).order('date');
    reportSync('загрузка истории', error);
    if (error) return null;
    return data.map(r => ({
      date: r.date, pulls: r.pulls, pullsDon: r.pulls_don, oro: r.oro, orig: r.orig,
      base: r.base, pass: r.pass,
    }));
  }
  // перезаписывает всю историю юзера в облаке (используется после локальных правок)
  async function pushHistory(hist) {
    if (!sb || !user) return false;
    const rows = hist.map(h => ({
      user_id: user.id, date: h.date, pulls: h.pulls || 0,
      pulls_don: h.pullsDon != null ? h.pullsDon : null,
      oro: h.oro || 0, orig: h.orig || 0, base: h.base || 0, pass: !!h.pass,
      updated_at: new Date().toISOString(),
    }));
    if (rows.length === 0) return true;
    const { error } = await sb.from('history').upsert(rows, { onConflict: 'user_id,date' });
    reportSync('сохранение истории', error);
    return !error;
  }
  async function deleteHistoryDay(date) {
    if (!sb || !user) return false;
    const { error } = await sb.from('history').delete().eq('user_id', user.id).eq('date', date);
    reportSync('удаление дня', error);
    return !error;
  }

  // ── состояние калькулятора: 1 строка на юзера ──
  async function pullState() {
    if (!sb || !user) return null;
    const { data, error } = await sb.from('calc_state').select('state').eq('user_id', user.id).maybeSingle();
    reportSync('загрузка настроек', error);
    if (error) return null;
    return data ? data.state : null;
  }
  async function pushState(state) {
    if (!sb || !user) return false;
    const { error } = await sb.from('calc_state')
      .upsert({ user_id: user.id, state, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    reportSync('сохранение настроек', error);
    return !error;
  }

  // ── ресурсы развития: 1 строка на юзера, без истории по дням ──
  async function pullMaterials() {
    if (!sb || !user) return null;
    const { data, error } = await sb.from('materials').select('items').eq('user_id', user.id).maybeSingle();
    reportSync('загрузка ресурсов', error);
    if (error) return null;
    return data ? data.items : null;
  }
  async function pushMaterials(items) {
    if (!sb || !user) return false;
    const { error } = await sb.from('materials')
      .upsert({ user_id: user.id, items, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
    reportSync('сохранение ресурсов', error);
    return !error;
  }

  return {
    get user() { return user; },
    get isReady() { return ready; },
    get isSignedIn() { return !!user; },
    whenReady: () => initPromise,
    onAuthChange, onSyncError, signUp, signIn, signOut,
    pullHistory, pushHistory, deleteHistoryDay,
    pullState, pushState,
    pullMaterials, pushMaterials,
  };
})();

window.Cloud = Cloud;
