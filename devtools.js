/* ENDFIELD // Скрытые команды для консоли браузера.
   В интерфейсе никак не отображается. Открой DevTools (F12) → Console и пиши:
     vd.help()                       — список команд
     vd.gen(40)                      — сгенерировать 40 дней истории
     vd.set('2026-07-01', 40, 50)    — задать конкретный день (пуллы, с донатом)
     vd.list()                       — показать историю таблицей
     vd.wipe()                       — стереть историю                              */

(function () {
  const HKEY = 'endfield_history_v1';

  const read = () => { try { return JSON.parse(localStorage.getItem(HKEY) || '[]'); } catch (e) { return []; } };
  const write = hist => {
    hist.sort((a, b) => a.date.localeCompare(b.date));
    localStorage.setItem(HKEY, JSON.stringify(hist));
    if (typeof renderHistory === 'function') renderHistory();
    return hist.length;
  };
  const keyOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return keyOf(d); };

  const vd = {
    help() {
      console.log([
        '%cENDFIELD // debug',
        '',
        'vd.gen(days, opts)   сгенерировать историю за N дней назад',
        '                     opts: {gaps:.25, donate:.08, spend:.10, oro:6200, orig:8}',
        'vd.set(date, pulls, pullsDon, oro, orig)   задать/перезаписать один день',
        '                     date: "2026-07-01" или число (дней назад)',
        'vd.add(pulls, pullsDon)                     добавить запись на сегодня',
        'vd.list()            показать историю таблицей',
        'vd.wipe()            стереть всю историю',
        'vd.raw()             сырой массив (можно править и класть через vd.load)',
        'vd.load(arr)         записать свой массив истории',
      ].join('\n'), 'color:#ff7a1a;font-weight:700');
    },

    // случайная, но правдоподобная история: рост ороберила, редкие траты и донаты, пропуски дней
    gen(days = 40, opts = {}) {
      const o = Object.assign({ gaps: .25, donate: .08, spend: .10, oro: 6200, orig: 8 }, opts);
      const hist = [];
      let oro = o.oro, orig = o.orig, donBonus = 0;
      for (let i = days; i >= 0; i--) {
        if (i !== 0 && Math.random() < o.gaps) continue;         // пропущенный день → разрыв линии
        oro += Math.round(200 + Math.random() * 900);
        if (Math.random() < .15) orig += 12;
        if (Math.random() < o.spend) oro = Math.max(0, oro - 3000);
        if (Math.random() < o.donate) donBonus += 10;
        const pulls = Math.floor((oro + orig * 75) / 500);
        hist.push({ date: daysAgo(i), pulls, pullsDon: pulls + donBonus, oro, orig });
      }
      const n = write(hist);
      console.log(`%c✓ сгенерировано ${n} записей`, 'color:#3ecf6a');
      return vd.list();
    },

    // date: "YYYY-MM-DD" либо число = сколько дней назад
    set(date, pulls, pullsDon, oro, orig) {
      const key = typeof date === 'number' ? daysAgo(date) : date;
      const hist = read();
      const entry = {
        date: key,
        pulls: pulls | 0,
        pullsDon: pullsDon != null ? pullsDon | 0 : pulls | 0,
        oro: oro != null ? oro | 0 : (pulls | 0) * 500,
        orig: orig != null ? orig | 0 : 0,
      };
      const i = hist.findIndex(h => h.date === key);
      if (i >= 0) hist[i] = entry; else hist.push(entry);
      write(hist);
      console.log(`%c✓ ${key}: ${entry.pulls} пуллов (с донатом ${entry.pullsDon})`, 'color:#3ecf6a');
      return entry;
    },

    add(pulls, pullsDon) { return vd.set(0, pulls, pullsDon); },

    list() {
      const hist = read();
      if (!hist.length) { console.log('%cистория пуста', 'color:#888'); return; }
      console.table(hist.map(h => ({
        дата: h.date, пуллы: h.pulls,
        'с донатом': h.pullsDon != null ? h.pullsDon : h.pulls,
        ороберил: h.oro, ориджи: h.orig,
      })));
      return hist.length + ' записей';
    },

    wipe() {
      localStorage.removeItem(HKEY);
      if (typeof renderHistory === 'function') renderHistory();
      console.log('%c✓ история стёрта', 'color:#ff4d4d');
    },

    raw() { return read(); },
    load(arr) {
      if (!Array.isArray(arr)) { console.warn('нужен массив'); return; }
      const n = write(arr);
      console.log(`%c✓ загружено ${n} записей`, 'color:#3ecf6a');
    },
  };

  window.vd = vd;
})();
