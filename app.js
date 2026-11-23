(() => {
  'use strict';
  const $ = (selector, context = document) => context.querySelector(selector);
  const $$ = (selector, context = document) => [...context.querySelectorAll(selector)];
  const data = JSON.parse($('#media-data').textContent);
  let language = 'en';
  try { language = localStorage.getItem('robofate-language') === 'zh' ? 'zh' : 'en'; } catch {}
  const text = (en, zh) => language === 'zh' ? zh : en;
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };
  const notify = message => {
    const status = $('#app-status');
    status.textContent = message;
    status.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { status.hidden = true; }, 6000);
  };
  const translate = () => {
    document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
    $$('[data-en][data-zh]').forEach(el => { el.textContent = el.dataset[language]; });
    $('#lang-toggle').textContent = language === 'en' ? '中文' : 'EN';
    $('#lang-toggle').ariaLabel = language === 'en' ? 'Switch to Chinese' : 'Switch to English';
    themeState();
    document.dispatchEvent(new Event('languagechange'));
  };
  function themeState() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $('#theme-toggle').ariaLabel = dark ? text('Switch to light theme', '切换浅色主题') : text('Switch to dark theme', '切换深色主题');
    $('meta[name="theme-color"]').content = dark ? '#211b20' : '#fffcf8';
  }
  $('#lang-toggle').addEventListener('click', () => {
    language = language === 'en' ? 'zh' : 'en';
    save('robofate-language', language);
    translate();
  });
  $('#theme-toggle').addEventListener('click', () => {
    const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    save('robofate-theme', theme);
    themeState();
  });
  $('#menu-toggle').addEventListener('click', () => {
    const expanded = $('.nav').classList.toggle('open');
    $('#menu-toggle').setAttribute('aria-expanded', expanded);
  });
  function closeMenu(restoreFocus = false) {
    $('.nav').classList.remove('open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
    if (restoreFocus) $('#menu-toggle').focus();
  }
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && $('.nav').classList.contains('open')) closeMenu(true);
  });
  document.addEventListener('click', event => {
    if (!event.target.closest('.nav')) closeMenu();
  });
  matchMedia('(min-width:801px)').addEventListener('change', event => { if (event.matches) closeMenu(); });
  $$('#nav-links a').forEach(link => link.addEventListener('click', () => {
    $('.nav').classList.remove('open');
    $('#menu-toggle').setAttribute('aria-expanded', 'false');
  }));
  function initNavigation() {
    const sections = ['motivation', 'method', 'results', 'demos', 'resources'].map(id => $(`#${id}`));
    let pending = false;
    function update() {
      pending = false;
      const line = Math.max($('.nav').getBoundingClientRect().bottom + 24, innerHeight * .25);
      const current = sections.findLast(section => section.getBoundingClientRect().top <= line);
      $$('#nav-links a').forEach(link => {
        if (link.hash === `#${current?.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    function schedule() {
      if (!pending) { pending = true; requestAnimationFrame(update); }
    }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    document.addEventListener('languagechange', schedule);
    if ('ResizeObserver' in window) new ResizeObserver(schedule).observe(document.body);
    update();
  }

  function initMethod() {
    const player = $('.method-player'), dialog = $('#method-dialog');
    const chapters = $$('[data-step-jump]', player), body = $('.method-body', player);
    const steps = [
      ['Observe the present.', '观察当前状态。',
        'Three camera views, the instruction and robot state provide the current context. BAE executes before takeover; the Perceiver forms a compact latent summary.',
        '三路相机图像、指令与机器人状态提供当前上下文。接管前由 BAE 执行，Perceiver 生成紧凑的隐变量摘要。'],
      ['Anticipate a later incompatibility.', '预判后续操作的不相容性。',
        'The causal GRU accumulates latent summaries and predicts an intervention probability and a continuous risk embedding. Future observations are not available to this decision.',
        '因果 GRU 累积隐变量摘要，预测介入概率与连续风险嵌入。该决策不能读取未来观测。'],
      ['Take over once. Capture the risk.', '单次接管，固定风险条件。',
        'The first positive decision switches action generation from BAE to MoAE. The predicted risk c* is fixed at this boundary; there is no switch back to BAE.',
        '首次正向决策将动作生成从 BAE 切换到 MoAE。预测风险 c* 在该边界固定，之后不切回 BAE。'],
      ['Correct the scene. Finish the task.', '修正场景，完成任务。',
        'MoAE routes current action tokens using the fixed risk until termination. New observations still condition actions, but the Perceiver and controller are no longer called.',
        'MoAE 以固定风险对当前动作 token 进行路由，持续至终止。新观测仍指导动作，但不再调用 Perceiver 与控制器。']
    ];
    let time = 0, playing = false, previous = 0, frame = 0, lastStep = -1;
    let inView = false, userPaused = false, replayUntil = null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const packets = $$('[data-route-packet]', player).map(node => {
      const path = $(`[data-route="${node.dataset.routePacket}"]`, node.closest('svg'));
      return { node, path, length: path.getTotalLength(), group: node.closest('.flow-node') };
    });
    const scans = $$('[data-scan]', player);
    const tokens = $$('[data-token]', player);
    const cells = $$('.cell', player);
    const cues = [
      ['Image regions become tokens; the backbone forms the current context.', '图像区域转为 token，骨干网络形成当前上下文。'],
      ['Latent summaries accumulate causally, predicting when intervention is needed.', '隐变量摘要按因果顺序累积，预测何时需要介入。'],
      ['The first positive decision fixes c* and switches action generation once.', '首次正向决策固定 c*，并单次切换动作生成专家。'],
      ['Fresh observations and the fixed c* guide MoAE; the controller stays stopped.', '新观测与固定 c* 指导 MoAE，控制器保持停止。']
    ];
    const clock = seconds => `0:${String(Math.floor(seconds)).padStart(2, '0')}`;
    function render(force = false) {
      const step = Math.min(3, Math.floor(time / 6));
      const phase = (time % 6) / 6;
      player.dataset.step = step;
      player.dataset.playing = playing;
      // One deterministic clock drives the SVG, including paused scrubbing.
      packets.forEach(({ node, path, length, group }, index) => {
        const active = group.classList.contains('input-flow')
          || (step < 2 && group.classList.contains('base-flow'))
          || (step === 1 && group.classList.contains('control-flow'))
          || (step >= 2 && group.classList.contains('takeover-flow'));
        node.style.opacity = active ? '1' : '0';
        const point = path.getPointAtLength(((phase * 2 + index * .13) % 1) * length);
        node.setAttribute('transform', `translate(${point.x - 4} ${point.y - 4})`);
      });
      scans.forEach(node => node.setAttribute('transform', `translate(${Number(node.dataset.scanWidth) * phase} 0)`));
      tokens.forEach(node => {
        const lift = step >= 2 && node.closest('.base-flow') ? 0
          : Math.sin(phase * Math.PI * 2 - Number(node.dataset.token) * .5) * 3;
        node.setAttribute('transform', `translate(0 ${lift.toFixed(2)})`);
      });
      cells.forEach(node => {
        const index = Number(node.dataset.cell);
        const fixed = node.closest('.risk-cells') || step >= 2;
        node.style.opacity = String(.25 + .65 * (fixed
          ? ((index * 7 + 3) % 11) / 10
          : (.5 + .5 * Math.sin(phase * Math.PI * 2 + index * .7))));
      });
      chapters.forEach(button => {
        const chapter = Number(button.dataset.stepJump);
        button.style.setProperty('--chapter-progress', `${chapter < step ? 100 : chapter === step ? phase * 100 : 0}%`);
      });
      $('#method-scrub').value = time;
      $('#method-time').textContent = `${clock(time)} / 0:24`;
      const timelineLabel = text(
        `${clock(time)} of 0:24. Step ${step + 1} of 4: ${steps[step][0]}`,
        `${clock(time)} / 0:24。第 ${step + 1} 步，共 4 步：${steps[step][1]}`);
      if ($('#method-scrub').getAttribute('aria-valuetext') !== timelineLabel) $('#method-scrub').setAttribute('aria-valuetext', timelineLabel);
      setText($('#method-play'), playing ? text('Pause', '暂停') : text('Play', '播放'));
      setText($('#motion-status'), playing ? text('Playing illustration', '示意动画播放中') : text('Paused illustration', '示意动画已暂停'));
      setText($('#method-focus'), dialog.open ? text('Close focus view', '关闭专注视图') : text('Focus view', '专注视图'));
      if (force || lastStep !== step) {
        $('#method-count').textContent = `0${step + 1} / 04`;
        $('#method-title').textContent = steps[step][language === 'en' ? 0 : 1];
        $('#method-detail').textContent = steps[step][language === 'en' ? 2 : 3];
        $('#method-cue').textContent = cues[step][language === 'en' ? 0 : 1];
        chapters.forEach(button => button.setAttribute('aria-pressed', Number(button.dataset.stepJump) === step));
        $('#method-prev').disabled = step === 0;
        $('#method-next').disabled = step === 3;
        setText($('#method-action-state'), step < 2 ? text('Action expert / BAE', '动作专家／BAE') : text('Action expert / MoAE', '动作专家／MoAE'));
        setText($('#method-risk-state'), step < 2 ? text('Risk / not captured', '风险／尚未固定') : text('Risk c* / fixed', '风险 c*／固定'));
        setText($('#method-controller-state'), step < 2
          ? text('Controller / before takeover', '控制器／接管前')
          : text('Perceiver + controller / stopped', 'Perceiver + 控制器／停止'));
        lastStep = step;
      }
    }
    function pause() {
      playing = false;
      cancelAnimationFrame(frame);
      render();
    }
    function tick(now) {
      if (!playing) return;
      if (previous) time += Math.min((now - previous) / 1000, .15) * Number($('#method-speed').value);
      previous = now;
      if (replayUntil !== null && time >= replayUntil) {
        time = replayUntil - .001; replayUntil = null; userPaused = true; pause(); return;
      }
      if (time >= 24) {
        if ($('#method-loop').checked) time %= 24;
        else { time = 23.999; userPaused = true; pause(); return; }
      }
      render();
      frame = requestAnimationFrame(tick);
    }
    function start() {
      if (playing || document.hidden) return;
      if (time >= 23.999) time = 0;
      playing = true; previous = 0;
      render(); frame = requestAnimationFrame(tick);
    }
    function toggle() {
      replayUntil = null;
      userPaused = playing;
      if (playing) pause();
      else start();
    }
    function jump(step) { replayUntil = null; time = Math.max(0, Math.min(3, step)) * 6; previous = 0; render(); }
    function inspectStep(step) { userPaused = true; pause(); jump(step); }
    $('#method-play').addEventListener('click', toggle);
    $('#method-prev').addEventListener('click', () => inspectStep(Math.floor(time / 6) - 1));
    $('#method-next').addEventListener('click', () => inspectStep(Math.floor(time / 6) + 1));
    $('#method-restart').addEventListener('click', () => jump(0));
    $('#method-replay').addEventListener('click', () => {
      const step = Math.floor(time / 6);
      jump(step); replayUntil = (step + 1) * 6; userPaused = false; start();
    });
    $('#method-scrub').addEventListener('input', event => { replayUntil = null; time = Number(event.target.value); previous = 0; render(); });
    chapters.forEach(button => button.addEventListener('click', () => inspectStep(Number(button.dataset.stepJump))));
    $('#method-focus').addEventListener('click', () => {
      if (dialog.open) dialog.close();
      else {
        dialog.append(player);
        body.tabIndex = 0;
        dialog.showModal();
        $('#method-focus').setAttribute('aria-expanded', 'true');
        render(); $('#method-focus').focus();
      }
    });
    dialog.addEventListener('close', () => {
      $('#method-home').append(player);
      body.tabIndex = -1;
      body.scrollTop = 0;
      $('#method-focus').setAttribute('aria-expanded', 'false');
      render(); $('#method-focus').focus();
    });
    player.addEventListener('keydown', event => {
      if (event.target.closest('input, select, button, a, .method-art') || event.target === body) return;
      if (event.code === 'Space') { event.preventDefault(); toggle(); }
      if (event.key === 'ArrowRight') { event.preventDefault(); inspectStep(Math.floor(time / 6) + 1); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); inspectStep(Math.floor(time / 6) - 1); }
    });
    function syncVisibility() {
      if (document.hidden || (!inView && !dialog.open)) pause();
      else if (!userPaused && !reduced.matches && !navigator.connection?.saveData) start();
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => {
        inView = entries[0].isIntersecting;
        syncVisibility();
      }).observe(player);
    }
    reduced.addEventListener('change', () => { if (reduced.matches) pause(); else syncVisibility(); });
    document.addEventListener('visibilitychange', syncVisibility);
    document.addEventListener('languagechange', () => render(true));
    render(true);
  }

  function initRouting() {
    const player = $('.routing-player'), details = $('#routing-details');
    const stages = $$('[data-routing-stage]', player), experts = $$('[data-route-expert]', player);
    const blocks = $$('[data-routing-inspect]', player);
    const blockLabels = [
      ['Inspect condition inputs', '查看条件输入'],
      ['Inspect Top-2 routing', '查看 Top-2 路由'],
      ['Inspect output combination', '查看输出合并']
    ];
    const examples = { a: [2, 6], b: [3, 7] };
    const descriptions = [
      ['Keep the condition. Read the current token.', '保持风险条件，读取当前 token。',
        'The token changes with the action context. The risk c* was captured at takeover and is not predicted again.',
        '动作 token 随当前上下文变化。风险 c* 在接管时已保存，此后不再重新预测。'],
      ['Select two. Normalize only their scores.', '选择两个专家，仅归一化选中分数。',
        'The router adds the token and risk projections. Top-2 selects two of eight routed FFNs; softmax normalizes only those two logits.',
        '路由器将 token 投影与风险投影相加，从八个路由 FFN 中选择两个，仅对这两个分数执行 softmax。'],
      ['Combine expertise, not risk predictions.', '合并专家输出，不重新预测风险。',
        'The active FFNs all read x. Their normalized routed mixture is combined with the always-active shared FFN using beta. This is an FFN output, not a complete action chunk.',
        '被启用的 FFN 均读取 x。归一化后的路由混合输出与始终启用的共享 FFN 按 beta 合并。这是 FFN 输出，不是完整动作块。']
    ];
    let time = 0, playing = false, previous = 0, frame = 0, example = 'a', lastStage = -1;
    function render(force = false) {
      const stage = Math.min(2, Math.floor(time / 3));
      player.dataset.stage = stage;
      player.dataset.playing = playing;
      player.dataset.tokenExample = example;
      stages.forEach(button => {
        const n = Number(button.dataset.routingStage);
        button.setAttribute('aria-pressed', n === stage);
        button.style.setProperty('--routing-progress', `${n < stage ? 100 : n === stage ? (time % 3) / 3 * 100 : 0}%`);
      });
      blocks.forEach(block => {
        const n = Number(block.dataset.routingInspect);
        block.setAttribute('aria-pressed', n === stage);
        if (force) block.setAttribute('aria-label', blockLabels[n][language === 'en' ? 0 : 1]);
      });
      setText($('#routing-play'), playing ? text('Pause', '暂停') : time >= 8.999 ? text('Replay', '重播') : text('Play once', '播放一次'));
      if (force || stage !== lastStage) {
        $('#routing-count').textContent = `0${stage + 1} / 03`;
        setText($('#routing-title'), descriptions[stage][language === 'en' ? 0 : 1]);
        setText($('#routing-detail'), descriptions[stage][language === 'en' ? 2 : 3]);
        lastStage = stage;
      }
      setText($('#routing-selection'), text(
        `Illustrative token ${example.toUpperCase()} / E${examples[example][0]} + E${examples[example][1]} / same c*`,
        `示意 token ${example.toUpperCase()}／E${examples[example][0]} + E${examples[example][1]}／相同 c*`));
    }
    function pause() {
      playing = false; previous = 0; cancelAnimationFrame(frame); render();
    }
    function tick(now) {
      if (!playing) return;
      if (previous) time += Math.min((now - previous) / 1000, .15);
      previous = now;
      if (time >= 9) { time = 8.999; pause(); return; }
      render(); frame = requestAnimationFrame(tick);
    }
    $('#routing-play').addEventListener('click', () => {
      if (playing) return pause();
      if (document.hidden || !details.open) return;
      if (time >= 8.999) time = 0;
      playing = true; previous = 0; render(); frame = requestAnimationFrame(tick);
    });
    function inspectStage(stage) {
      pause(); time = stage * 3; render();
    }
    stages.forEach(button => button.addEventListener('click', () => inspectStage(Number(button.dataset.routingStage))));
    // Enhance inline SVG only; the no-JS diagrams remain static images.
    $$('.routing-svg', player).forEach(svg => {
      svg.setAttribute('role', 'group');
      const siblings = $$('[data-routing-inspect]', svg);
      siblings.forEach((block, index) => {
        block.setAttribute('role', 'button');
        block.setAttribute('tabindex', '0');
        block.setAttribute('aria-controls', 'routing-title routing-detail');
        block.setAttribute('aria-describedby', 'routing-hint');
        block.addEventListener('click', () => inspectStage(index));
        block.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!event.repeat) inspectStage(index);
            return;
          }
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2
            : ['ArrowRight', 'ArrowDown'].includes(event.key) ? (index + 1) % 3
              : ['ArrowLeft', 'ArrowUp'].includes(event.key) ? (index + 2) % 3 : -1;
          if (next < 0) return;
          event.preventDefault();
          siblings[next].focus();
        });
      });
    });
    $('#routing-hint').hidden = false;
    $$('[data-routing-token]', player).forEach(button => button.addEventListener('click', () => {
      pause(); example = button.dataset.routingToken;
      // These two authored cases demonstrate the boundary, not a live model router.
      experts.forEach(expert => expert.setAttribute('data-selected', examples[example].includes(Number(expert.dataset.routeExpert))));
      $$('[data-routing-token]', player).forEach(other => other.setAttribute('aria-pressed', other === button));
      render(true);
    }));
    details.addEventListener('toggle', () => { if (!details.open) pause(); });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) pause();
    }).observe(player);
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { if (event.matches) pause(); });
    document.addEventListener('languagechange', () => render(true));
    render(true);
  }

  function initResults() {
    const rows = $$('#results-table tbody tr'), table = $('#results-table'), explorer = $('#result-explorer');
    function sort() {
      const [key, direction] = $('#result-sort').value.split('-');
      const ordered = [...rows].sort((a, b) => {
        const compared = key === 'source' ? Number(a.dataset.order) - Number(b.dataset.order)
          : key === 'task' ? a.dataset.task.localeCompare(b.dataset.task, 'en')
            : Number(a.dataset[key]) - Number(b.dataset[key]);
        return (direction === 'desc' ? -compared : compared) || Number(a.dataset.order) - Number(b.dataset.order);
      });
      $('tbody', table).append(...ordered);
      $$('[data-sort-column]', table).forEach(header => {
        if (header.dataset.sortColumn === key) header.setAttribute('aria-sort', direction === 'desc' ? 'descending' : 'ascending');
        else header.removeAttribute('aria-sort');
      });
    }
    function view(mode) {
      explorer.dataset.view = mode;
      $$('[data-result-view]').forEach(button => button.setAttribute('aria-pressed', button.dataset.resultView === mode));
      $('.explorer-table').scrollLeft = 0;
      setText($('#result-view-hint'), mode === 'matched'
        ? text('Base+Mix vs RoboFATE / same reported rows.', 'Base+Mix 与 RoboFATE／相同的报告数据行。')
        : text('Scroll horizontally. Task names stay in view.', '横向滚动，任务名始终可见。'));
    }
    function filter() {
      const category = $('#result-category').value, variant = $('#result-variant').value;
      const query = $('#result-search').value.trim().toLowerCase().replaceAll('_', ' ');
      let visible = 0;
      const tasks = new Set();
      rows.forEach(row => {
        row.hidden = Boolean((category && row.dataset.category !== category)
          || (variant && row.dataset.variant !== variant) || !row.dataset.task.includes(query));
        if (!row.hidden) { visible++; tasks.add(row.dataset.task.replace(/ random$/, '')); }
      });
      $('#result-count').textContent = text(`${visible} configurations / ${tasks.size} tasks`, `${visible} 项配置／${tasks.size} 项任务`);
      $('#result-empty').hidden = visible !== 0;
    }
    ['result-category', 'result-variant', 'result-search'].forEach(id => $(`#${id}`).addEventListener('input', filter));
    $('#result-sort').addEventListener('change', sort);
    $$('[data-result-view]').forEach(button => button.addEventListener('click', () => view(button.dataset.resultView)));
    $('#result-reset').addEventListener('click', () => {
      $('#result-category').value = ''; $('#result-variant').value = ''; $('#result-search').value = '';
      $('#result-sort').value = 'source'; sort(); filter();
      $('.explorer-table').scrollTop = 0;
    });
    document.addEventListener('languagechange', () => { filter(); view(explorer.dataset.view); });
    filter();
  }

  function initPairs() {
    let pair = data.pairs.find(p => p.task === 'plug_in_charger');
    let videos = [$('#pair-baseline'), $('#pair-teacher')];
    const positions = new Map(), pendingPositions = new WeakMap();
    let subset = 'all';
    const matching = () => {
      const query = $('#pair-search').value.trim().toLowerCase().replaceAll('_', ' ');
      return data.pairs.filter(p => (subset !== 'paper' || p.selectedPaperTask)
        && `${p.label} ${p.task.replaceAll('_', ' ')}`.toLowerCase().includes(query));
    };
    function selectionStatus() {
      const list = matching(), index = list.indexOf(pair);
      $('#pair-position').textContent = index < 0
        ? text('Current clip / outside filter', '当前录像／不在筛选内')
        : text(`Example ${String(index + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`,
          `实例 ${String(index + 1).padStart(2, '0')}／${String(list.length).padStart(2, '0')}`);
      $('#pair-prev').disabled = index <= 0;
      $('#pair-next').disabled = !list.length || index >= list.length - 1;
      $('#pair-count').textContent = text(`${list.length} demonstrations`, `${list.length} 组演示`);
    }
    function error(message) { $('#pair-error').textContent = message; $('#pair-error').hidden = false; }
    function pause() { videos.forEach(video => video.pause()); }
    function labels() {
      videos.forEach((video, i) => {
        const panel = video.closest('figure');
        $('.pair-branch', panel).textContent = i ? text('Teacher continuation', '教师延续') : text('DM0.5 baseline', 'DM0.5 基线');
        $('.badge', panel).textContent = i ? text('Native success', '原生成功') : text('Native failure', '原生失败');
        video.ariaLabel = `${i ? text('Teacher success', '教师成功') : text('Baseline failure', '基线失败')}: ${pair.label}`;
      });
      $('#pair-prev').ariaLabel = text('Previous matching demonstration', '上一个匹配的演示');
      $('#pair-next').ariaLabel = text('Next matching demonstration', '下一个匹配的演示');
    }
    function remember() {
      positions.set(pair.task, videos.map(video => ({
        time: pendingPositions.get(video) ?? video.currentTime,
        rate: video.playbackRate, muted: video.muted, volume: video.volume
      })));
    }
    function restorePosition(video) {
      const time = pendingPositions.get(video);
      if (time === undefined || !videos.includes(video) || video.readyState < 1 || !Number.isFinite(video.duration)) return;
      video.currentTime = Math.min(Math.max(0, time), video.duration);
      pendingPositions.delete(video);
    }
    function bindVideos() {
      videos.forEach(video => {
        video.addEventListener('loadedmetadata', () => restorePosition(video), { once: true });
        restorePosition(video);
        video.addEventListener('play', () => {
          // A late media event must never revive a detached task.
          if (!videos.includes(video)) video.pause();
        });
        video.addEventListener('error', () => {
          if (videos.includes(video)) error(text('A recording could not be decoded. Reload the page to try again.', '录像无法解码，请刷新页面重试。'));
        });
      });
    }
    function revealSelection(button = $(`[data-pair="${pair.task}"]`)) {
      const strip = $('.task-tabs');
      if (button.hidden) return;
      const a = button.getBoundingClientRect(), b = strip.getBoundingClientRect();
      if (a.left < b.left || a.right > b.right) strip.scrollLeft += a.left - b.left - (b.width - a.width) / 2;
    }
    function select(task) {
      const selected = data.pairs.find(p => p.task === task);
      if (!selected) return;
      if (selected === pair) { selectionStatus(); revealSelection(); return; }
      pause(); remember();
      pair = selected;
      const box = $('#pair-videos'); box.replaceChildren();
      videos = pair.videos.map((source, i) => {
        const figure = document.createElement('figure'); figure.className = 'video-panel';
        const label = document.createElement('figcaption'); label.className = 'panel-label';
        const title = document.createElement('span'); title.className = 'pair-branch';
        const badge = document.createElement('span'); badge.className = `badge ${i ? 'success' : ''}`;
        badge.textContent = i ? 'Native success' : 'Native failure'; label.append(title, badge);
        const video = document.createElement('video');
        video.id = i ? 'pair-teacher' : 'pair-baseline'; video.controls = true; video.playsInline = true;
        video.muted = true; video.preload = 'metadata'; video.poster = pair.poster; video.src = source.src;
        const saved = positions.get(pair.task)?.[i];
        if (saved) {
          // Retain position even if another selection arrives before metadata.
          pendingPositions.set(video, saved.time);
          video.playbackRate = saved.rate; video.muted = saved.muted; video.volume = saved.volume;
        }
        video.setAttribute('aria-label', `${i ? 'Teacher success' : 'Baseline failure'}: ${pair.label}`);
        figure.append(label, video); box.append(figure);
        return video;
      });
      $('#pair-title').textContent = pair.label;
      $('#pair-player').dataset.task = pair.task;
      $('#pair-error').hidden = true;
      $$('[data-pair]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pair === task));
      bindVideos(); labels(); selectionStatus(); revealSelection();
    }
    function filter() {
      const list = matching();
      $$('[data-pair]').forEach(b => { b.hidden = !list.some(p => p.task === b.dataset.pair); });
      $$('[data-pair-filter]').forEach(b => b.setAttribute('aria-pressed', b.dataset.pairFilter === subset));
      $('#pair-empty').hidden = list.length !== 0;
      if (list.length && !list.includes(pair)) select(list[0].task);
      selectionStatus(); revealSelection();
    }
    $$('[data-pair]').forEach(button => button.addEventListener('click', () => select(button.dataset.pair)));
    $('.task-tabs').addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const button = event.target.closest('[data-pair]');
      if (!button || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const list = $$('[data-pair]:not([hidden])'), index = list.indexOf(button);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1
        : Math.max(0, Math.min(list.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)));
      event.preventDefault();
      list[next]?.focus({ preventScroll: true });
      if (list[next]) revealSelection(list[next]);
    });
    $$('[data-pair-filter]').forEach(button => button.addEventListener('click', () => {
      subset = button.dataset.pairFilter; filter();
    }));
    $('#pair-search').addEventListener('input', filter);
    $('#pair-filter-reset').addEventListener('click', () => { subset = 'all'; $('#pair-search').value = ''; filter(); });
    for (const [id, direction] of [['pair-prev', -1], ['pair-next', 1]]) {
      $(`#${id}`).addEventListener('click', () => {
        const list = matching(), next = list[list.indexOf(pair) + direction];
        if (next) select(next.task);
      });
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    document.addEventListener('pausepairs', pause);
    document.addEventListener('languagechange', () => { labels(); selectionStatus(); });
    if ('ResizeObserver' in window) new ResizeObserver(() => revealSelection()).observe($('.task-tabs'));
    $('#pair-player').dataset.task = pair.task;
    bindVideos(); labels(); selectionStatus(); revealSelection();
  }

  function initFilm() {
    const video = $('#overview');
    const captions = () => { for (const track of video.textTracks) track.mode = 'showing'; };
    video.addEventListener('loadedmetadata', captions, { once: true });
    captions();
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(entries => { if (!entries[0].isIntersecting) video.pause(); }).observe(video);
    }
    document.addEventListener('play', event => {
      const active = event.target;
      if (!(active instanceof HTMLVideoElement) || active.paused) return;
      $$('video').forEach(other => { if (other !== active) other.pause(); });
    }, true);
  }

  function initRealGallery() {
    const dialog = $('#real-dialog'), screen = $('#real-focus-screen');
    const entries = data.real.map(source => {
      const card = $(`[data-real-id="${source.id}"]`);
      return { source, card, home: $('.real-video-home', card), video: $('video', card) };
    });
    let selected = null, opener = null;
    const visible = () => entries.filter(entry => !entry.card.hidden);
    function restore() {
      if (!selected) return;
      selected.video.pause();
      selected.home.append(selected.video);
      selected = null;
    }
    function render() {
      const list = visible();
      $('#real-count').textContent = text(`${list.length} complete recordings`, `${list.length} 段完整录像`);
      if (!selected) return;
      const { source, card, video } = selected, index = list.indexOf(selected);
      $('#real-focus-title').textContent = $('.real-title', card).textContent;
      $('#real-focus-subtitle').textContent = `${$('.real-subtitle', card).textContent} / ${Math.floor(source.duration / 60)}:${String(Math.floor(source.duration % 60)).padStart(2, '0')} / ${source.width} × ${source.height}`;
      $('#real-focus-position').textContent = text(`Recording ${index + 1} / ${list.length}`, `录像 ${index + 1}／${list.length}`);
      $('#real-focus-prev').disabled = index <= 0;
      $('#real-focus-next').disabled = index >= list.length - 1;
      $('#real-focus-direct').href = source.src;
      $('#real-focus-evidence').textContent = text(
        `${source.sr}% manuscript-reported task SR. This individual recording does not determine the reported rate.`,
        `论文报告的任务成功率为 ${source.sr}%。该比率并非由本段展示录像计算。`);
      $('#real-focus-error').hidden = !video.error;
      dialog.dataset.recording = source.id;
    }
    function select(entry) {
      restore();
      selected = entry;
      // Keep the same media element and native time; never create a second player.
      selected.video.pause();
      screen.append(selected.video);
      render();
    }
    function finishClose() {
      if (dialog.open) return;
      restore();
      opener?.focus({ preventScroll: true });
    }
    entries.forEach(entry => {
      const button = $('[data-real-focus]', entry.card);
      button.addEventListener('click', () => {
        document.dispatchEvent(new Event('pausepairs'));
        $$('video').forEach(video => video.pause());
        opener = button;
        select(entry);
        if (!dialog.open) dialog.showModal();
        $('#real-focus-close').focus();
      });
      entry.video.addEventListener('error', () => {
        $('.real-error', entry.card).hidden = false;
        if (selected === entry) render();
      });
    });
    $$('[data-real-filter]').forEach(button => button.addEventListener('click', () => {
      if (dialog.open) { dialog.close(); finishClose(); }
      const group = button.dataset.realFilter;
      entries.forEach(entry => {
        entry.card.hidden = group !== 'all' && entry.card.dataset.realGroup !== group;
        if (entry.card.hidden) entry.video.pause();
      });
      $$('[data-real-filter]').forEach(other => other.setAttribute('aria-pressed', other === button));
      render();
    }));
    for (const [id, direction] of [['real-focus-prev', -1], ['real-focus-next', 1]]) {
      $(`#${id}`).addEventListener('click', () => {
        const list = visible(), next = list[list.indexOf(selected) + direction];
        if (next) select(next);
      });
    }
    $('#real-focus-close').addEventListener('click', () => { dialog.close(); finishClose(); });
    dialog.addEventListener('close', finishClose);
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom)) { dialog.close(); finishClose(); }
    });
    document.addEventListener('languagechange', render);
    render();
  }

  function initFigures() {
    const dialog = $('#figure-dialog'), viewport = $('#figure-viewport'), zoom = $('#figure-zoom');
    let opener;
    function resetZoom() {
      viewport.dataset.zoom = 'false'; zoom.setAttribute('aria-pressed', 'false');
      viewport.scrollTo(0, 0);
    }
    $$('.figure-open').forEach(link => link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); opener = link;
      const image = $('img', link).cloneNode();
      image.removeAttribute('width'); image.removeAttribute('height');
      image.loading = 'eager';
      viewport.replaceChildren(image);
      const figureNumber = $$('.figure-open').indexOf(link) + 1;
      $('#figure-dialog-title').textContent = text(`Paper / Figure ${figureNumber}`, `论文／图 ${figureNumber}`);
      resetZoom(); dialog.showModal(); $('#figure-close').focus();
    }));
    zoom.addEventListener('click', () => {
      const enlarged = viewport.dataset.zoom !== 'true';
      viewport.dataset.zoom = String(enlarged);
      zoom.setAttribute('aria-pressed', enlarged);
    });
    $('#figure-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { resetZoom(); opener?.focus({ preventScroll: true }); });
    dialog.addEventListener('click', event => {
      const rect = dialog.getBoundingClientRect();
      if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
    });
  }

  async function copy(selector, button) {
    try {
      await navigator.clipboard.writeText($(selector).textContent);
      const old = button.textContent; button.textContent = text('Copied', '已复制');
      setTimeout(() => { button.textContent = old; }, 1800);
    } catch {
      const range = document.createRange(); range.selectNodeContents($(selector));
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      notify(text('Text selected. Use your browser copy command.', '已选中文本，请使用浏览器的复制命令。'));
    }
  }
  $('#copy-citation').addEventListener('click', event => copy('#citation-text', event.currentTarget));
  for (const initialize of [initNavigation, initMethod, initRouting, initResults, initPairs, initFilm, initRealGallery, initFigures]) {
    try { initialize(); } catch (e) {
      console.error(e);
      notify(text('An interactive component could not start. Paper content and native videos remain available.', '一个交互组件未能启动，论文内容与原生视频仍可使用。'));
    }
  }
  translate();
  document.documentElement.dataset.appReady = 'true';
})();
