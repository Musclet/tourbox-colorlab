/* InkPick panel chip — injected into TourBox Console's color-pick renderer.
   The behaviour itself is patched at the setResidentMode call site; this file only
   renders a small toggle and persists the flag in localStorage. */
(function () {
  'use strict';
  if (window.__inkpickChip) return;
  window.__inkpickChip = true;

  var api = window.api && window.api.colorPick;
  var KEY = 'inkpick.residentLock';
  if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, '1');

  var cfg = null;
  function remember(c) {
    if (c && c.config) { cfg = c.config; render(); }
  }
  try { api && api.getConfig && api.getConfig().then(remember).catch(function () {}); } catch (e) {}
  try { api && api.onConfigChange && api.onConfigChange(remember); } catch (e) {}

  var host = null, label = null, knob = null, hint = null, swEl = null;

  function ensureUi() {
    if (host || !document.body) return;
    host = document.createElement('div');
    host.id = 'inkpick-chip';
    host.setAttribute('style', [
      'position:fixed', 'top:52px', 'left:50%', 'transform:translateX(-50%)',
      'z-index:2147483647', 'display:flex', 'align-items:center', 'gap:7px',
      'padding:4px 8px', 'border-radius:999px', 'background:rgba(12,14,19,.92)',
      'border:1px solid rgba(255,255,255,.14)', 'color:#cfd8e6',
      'font:11px/1.4 "Microsoft YaHei UI","Segoe UI",sans-serif',
      'box-shadow:0 4px 14px rgba(0,0,0,.35)', 'pointer-events:auto',
      'user-select:none', 'white-space:nowrap'
    ].join(';'));

    var dot = document.createElement('span');
    dot.setAttribute('style', 'width:5px;height:5px;border-radius:50%;background:#5b8cff;flex:none');
    host.appendChild(dot);

    label = document.createElement('span');
    label.textContent = '常驻锁定';
    host.appendChild(label);

    swEl = document.createElement('span');
    swEl.setAttribute('style', 'position:relative;width:26px;height:14px;border-radius:7px;background:#2a3240;flex:none;cursor:pointer;transition:background .15s');
    knob = document.createElement('span');
    knob.setAttribute('style', 'position:absolute;top:2px;left:2px;width:10px;height:10px;border-radius:50%;background:#fff;transition:left .15s');
    swEl.appendChild(knob);
    swEl.title = '常驻时不被取色按钮取消';
    swEl.addEventListener('click', function (e) {
      e.stopPropagation();
      var on = localStorage.getItem(KEY) !== '0';
      localStorage.setItem(KEY, on ? '0' : '1');
      render();
      flash(on ? '已关闭 · 恢复默认取消' : '已开启 · 常驻不会被取消');
    });
    host.appendChild(swEl);

    hint = document.createElement('span');
    hint.setAttribute('style', 'color:#7d8b9e;font-size:10px');
    hint.textContent = 'InkPick';
    host.appendChild(hint);

    var test = document.createElement('span');
    test.textContent = '测试';
    test.setAttribute('style', 'color:#8fb3ff;font-size:10px;cursor:pointer;margin-left:2px');
    test.title = '模拟取色按钮的临时取消请求';
    test.addEventListener('click', function (e) {
      e.stopPropagation();
      if (typeof handleJavaResidentModeChange !== 'function') { flash('测试钩子不可用'); return; }
      var on = localStorage.getItem(KEY) !== '0';
      try {
        handleJavaResidentModeChange({ isResident: false }, { isResident: true, mode: 'hsl' }, 'hsl');
        if (!on) setTimeout(function () {
          try { handleJavaResidentModeChange({ isResident: true }, { isResident: true, mode: 'hsl' }, 'hsl'); } catch (err) {}
        }, 1200);
        flash(on ? '已拦截 · 面板保持常驻' : '已放行 · 默认取消行为');
      } catch (err) { flash('测试失败'); }
    });
    host.appendChild(test);

    document.body.appendChild(host);
    render();
  }

  var flashTimer = 0;
  function flash(text) {
    if (!label) return;
    label.textContent = text;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(render, 2200);
  }

  function render() {
    ensureUi();
    if (!host) return;
    var on = localStorage.getItem(KEY) !== '0';
    knob.style.left = on ? '14px' : '2px';
    if (swEl) swEl.style.background = on ? '#4f7fe6' : '#2a3240';
    var resident = !!(cfg && cfg.isResident);
    hint.textContent = resident ? (on ? '常驻·锁定' : '常驻·默认') : (on ? '待常驻' : '默认');
    hint.style.color = resident && on ? '#7fd6a2' : '#7d8b9e';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureUi);
  else ensureUi();
  setInterval(render, 800);
})();
