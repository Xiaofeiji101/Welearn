// ==UserScript==
// @name         WeLearn
// @namespace    http://tampermonkey.net/
// @version      2026-06-13
// @description  自定义点击位置、自定义滚轮滚动、自定义步骤循环执行
// @author       You
// @match        https://welearn.sflep.com/Student/StudyCourse.aspx*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=sflep.com
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'tm_welearn_auto_click_scroll_v1';
    const DEFAULT_STEPS = [
        '# 支持命令：',
        '# wait 毫秒',
        '# scroll 总位移 次数 间隔毫秒',
        '# clickp 页面X 页面Y 次数 间隔毫秒   （页面绝对坐标）',
        '# clickv 视口X 视口Y 次数 间隔毫秒   （浏览器当前可视区域坐标）',
        '# bottom 底部预留像素 等待毫秒',
        '# top 等待毫秒',
        '',
        '# 一个默认示例：先滚动，再点“下一页”',
        'wait 1500',
        'scroll 900 12 80',
        'wait 800', 
        '# 用“取页面点”或“取视口点”按钮获取坐标后替换下一行',
        '# clickp 1200 1800 1 120',
        'wait 1500',
    ].join('\n');

    const saved = loadState();
    let running = false;
    let stopRequested = false;
    let currentRound = 0;

    const panel = createPanel();
    document.body.appendChild(panel.root);

    function loadState() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                return {
                    steps: DEFAULT_STEPS,
                    loop: true,
                    minimized: false,
                };
            }
            return Object.assign(
                {
                    steps: DEFAULT_STEPS,
                    loop: true,
                    minimized: false,
                },
                JSON.parse(raw)
            );
        } catch {
            return {
                steps: DEFAULT_STEPS,
                loop: true,
                minimized: false,
            };
        }
    }

    function saveState() {
        const state = {
            steps: panel.steps.value,
            loop: panel.loop.checked,
            minimized: panel.body.style.display === 'none',
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function createPanel() {
        const root = document.createElement('div');
        root.style.cssText = [
            'position:fixed',
            'top:12px',
            'right:12px',
            'width:360px',
            'z-index:2147483647',
            'background:rgba(20,22,28,0.96)',
            'color:#f4f7fb',
            'border:1px solid rgba(255,255,255,0.14)',
            'border-radius:12px',
            'box-shadow:0 12px 32px rgba(0,0,0,0.35)',
            'font:13px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Helvetica,Arial,sans-serif',
            'overflow:hidden',
        ].join(';');

        root.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:rgba(255,255,255,0.06);">
                <strong style="font-size:14px;">Welearn-auto click and scroll </strong>
                <button id="tm-toggle" style="${buttonStyle('small')}">${saved.minimized ? '展开' : '收起'}</button>
            </div>
            <div id="tm-body" style="padding:10px 12px;display:${saved.minimized ? 'none' : 'block'};">
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                    <button id="tm-start" style="${buttonStyle()}">开始</button>
                    <button id="tm-stop" style="${buttonStyle()}">停止</button>
                    <button id="tm-pick-page" style="${buttonStyle()}">取页面点</button>
                    <button id="tm-pick-view" style="${buttonStyle()}">取视口点</button>
                    <button id="tm-example" style="${buttonStyle()}">填入示例</button>
                </div>

                <label style="display:flex;align-items:center;gap:6px;margin-bottom:8px;">
                    <input id="tm-loop" type="checkbox" ${saved.loop ? 'checked' : ''}>
                    <span>循环执行</span>
                </label>

                <textarea id="tm-steps" spellcheck="false" style="
                    width:100%;
                    height:260px;
                    resize:vertical;
                    box-sizing:border-box;
                    border-radius:8px;
                    border:1px solid rgba(255,255,255,0.14);
                    background:#0f1117;
                    color:#d8e1ea;
                    padding:10px;
                    font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
                ">${escapeHtml(saved.steps)}</textarea>

                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">
                    <button id="tm-insert-wait" style="${buttonStyle()}">插入等待</button>
                    <button id="tm-insert-scroll" style="${buttonStyle()}">插入滚动</button>
                    <button id="tm-insert-bottom" style="${buttonStyle()}">插入到底</button>
                    <button id="tm-clear-log" style="${buttonStyle()}">清空日志</button>
                </div>

                <details style="margin-top:8px;">
                    <summary style="cursor:pointer;color:#9fb3c8;">命令说明</summary>
                    <div style="margin-top:6px;color:#c4d0dc;font-size:12px;white-space:pre-wrap;">wait 1000
scroll 900 12 80
clickp 1200 1800 1 120
clickv 1000 700 1 120
bottom 80 800
top 500</div>
                </details>

                <div id="tm-status" style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(255,255,255,0.06);color:#8fe388;">
                    空闲
                </div>

                <pre id="tm-log" style="
                    margin:8px 0 0;
                    max-height:150px;
                    overflow:auto;
                    white-space:pre-wrap;
                    word-break:break-word;
                    background:#0f1117;
                    border:1px solid rgba(255,255,255,0.08);
                    border-radius:8px;
                    padding:8px;
                    color:#c8d3df;
                    font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
                "></pre>
            </div>
        `;

        const body = root.querySelector('#tm-body');
        const toggle = root.querySelector('#tm-toggle');
        const start = root.querySelector('#tm-start');
        const stop = root.querySelector('#tm-stop');
        const pickPage = root.querySelector('#tm-pick-page');
        const pickView = root.querySelector('#tm-pick-view');
        const example = root.querySelector('#tm-example');
        const loop = root.querySelector('#tm-loop');
        const steps = root.querySelector('#tm-steps');
        const insertWait = root.querySelector('#tm-insert-wait');
        const insertScroll = root.querySelector('#tm-insert-scroll');
        const insertBottom = root.querySelector('#tm-insert-bottom');
        const clearLog = root.querySelector('#tm-clear-log');
        const status = root.querySelector('#tm-status');
        const logBox = root.querySelector('#tm-log');

        toggle.addEventListener('click', () => {
            const hidden = body.style.display !== 'none';
            body.style.display = hidden ? 'none' : 'block';
            toggle.textContent = hidden ? '展开' : '收起';
            saveState();
        });

        start.addEventListener('click', startRunner);
        stop.addEventListener('click', stopRunner);
        pickPage.addEventListener('click', () => beginPick('page'));
        pickView.addEventListener('click', () => beginPick('view'));
        example.addEventListener('click', () => {
            steps.value = DEFAULT_STEPS;
            saveState();
            log('已填入示例步骤');
        });
        insertWait.addEventListener('click', () => insertAtCursor('wait 1000'));
        insertScroll.addEventListener('click', () => insertAtCursor('scroll 900 12 80'));
        insertBottom.addEventListener('click', () => insertAtCursor('bottom 80 800'));
        clearLog.addEventListener('click', () => {
            logBox.textContent = '';
        });

        steps.addEventListener('input', saveState);
        loop.addEventListener('change', saveState);

        return {
            root,
            body,
            loop,
            steps,
            status,
            logBox,
        };
    }

    function buttonStyle(size = 'normal') {
        const padding = size === 'small' ? '4px 8px' : '6px 10px';
        return [
            'padding:' + padding,
            'border:none',
            'border-radius:8px',
            'background:#2f6fed',
            'color:#fff',
            'cursor:pointer',
            'font-size:12px',
        ].join(';');
    }

    function escapeHtml(text) {
        return text
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;');
    }

    function setStatus(text, isError = false) {
        panel.status.textContent = text;
        panel.status.style.color = isError ? '#ff8e8e' : '#8fe388';
    }

    function log(text) {
        const stamp = new Date().toLocaleTimeString();
        panel.logBox.textContent += `[${stamp}] ${text}\n`;
        panel.logBox.scrollTop = panel.logBox.scrollHeight;
    }

    function insertAtCursor(text) {
        const el = panel.steps;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const before = el.value.slice(0, start);
        const after = el.value.slice(end);
        const prefix = before && !before.endsWith('\n') ? '\n' : '';
        const suffix = after && !after.startsWith('\n') ? '\n' : '';
        el.value = before + prefix + text + suffix + after;
        el.focus();
        const pos = (before + prefix + text).length;
        el.selectionStart = pos;
        el.selectionEnd = pos;
        saveState();
    }

    function beginPick(mode) {
        if (running) {
            log('运行中不能取点，请先停止');
            return;
        }

        const overlay = document.createElement('div');
        overlay.style.cssText = [
            'position:fixed',
            'inset:0',
            'z-index:2147483647',
            'cursor:crosshair',
            'background:rgba(0,0,0,0.08)',
        ].join(';');

        const tip = document.createElement('div');
        tip.style.cssText = [
            'position:fixed',
            'left:16px',
            'top:16px',
            'padding:8px 10px',
            'background:#111827',
            'color:#fff',
            'border-radius:8px',
            'font:12px/1.4 sans-serif',
            'box-shadow:0 8px 20px rgba(0,0,0,0.3)',
        ].join(';');
        tip.textContent = mode === 'page'
            ? '点击页面任意位置，记录页面绝对坐标'
            : '点击页面任意位置，记录当前视口坐标';
        overlay.appendChild(tip);

        const moveHandler = (e) => {
            tip.textContent = mode === 'page'
                ? `页面点: x=${Math.round(e.pageX)}, y=${Math.round(e.pageY)}`
                : `视口点: x=${Math.round(e.clientX)}, y=${Math.round(e.clientY)}`;
        };

        const clickHandler = (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const x = mode === 'page' ? Math.round(e.pageX) : Math.round(e.clientX);
            const y = mode === 'page' ? Math.round(e.pageY) : Math.round(e.clientY);
            const command = `${mode === 'page' ? 'clickp' : 'clickv'} ${x} ${y} 1 120`;

            insertAtCursor(command);
            log(`已插入命令: ${command}`);
            document.removeEventListener('mousemove', moveHandler, true);
            document.removeEventListener('click', clickHandler, true);
            overlay.remove();
        };

        document.body.appendChild(overlay);
        document.addEventListener('mousemove', moveHandler, true);
        document.addEventListener('click', clickHandler, true);
    }

    function stopRunner() {
        stopRequested = true;
        running = false;
        setStatus('已停止');
        log('已停止');
    }

    async function startRunner() {
        if (running) {
            log('已经在运行中');
            return;
        }

        let steps;
        try {
            steps = parseSteps(panel.steps.value);
        } catch (err) {
            setStatus('步骤解析失败', true);
            log(String(err.message || err));
            return;
        }

        if (!steps.length) {
            setStatus('没有可执行步骤', true);
            log('请先填写步骤');
            return;
        }

        saveState();
        running = true;
        stopRequested = false;
        currentRound = 0;
        log('开始执行');

        try {
            do {
                currentRound += 1;
                setStatus(`执行中，第 ${currentRound} 轮`);
                log(`开始第 ${currentRound} 轮`);

                for (const step of steps) {
                    if (stopRequested || !running) {
                        break;
                    }
                    await executeStep(step);
                }
            } while (!stopRequested && running && panel.loop.checked);

            if (!stopRequested) {
                setStatus('执行完成');
                log('执行完成');
            }
        } catch (err) {
            setStatus('执行出错', true);
            log(`错误: ${String(err.message || err)}`);
        } finally {
            running = false;
            stopRequested = false;
        }
    }

    function parseSteps(text) {
        const lines = text.split('\n');
        const result = [];

        lines.forEach((rawLine, index) => {
            const line = rawLine.trim();
            if (!line || line.startsWith('#')) {
                return;
            }

            const parts = line.split(/\s+/);
            const cmd = parts[0].toLowerCase();
            const lineNo = index + 1;

            const num = (v, name) => {
                const n = Number(v);
                if (!Number.isFinite(n)) {
                    throw new Error(`第 ${lineNo} 行 ${name} 不是有效数字`);
                }
                return n;
            };

            if (cmd === 'wait') {
                result.push({ type: 'wait', ms: num(parts[1], '毫秒') });
                return;
            }

            if (cmd === 'scroll') {
                result.push({
                    type: 'scroll',
                    dy: num(parts[1], '总位移'),
                    times: num(parts[2] ?? 10, '次数'),
                    interval: num(parts[3] ?? 80, '间隔毫秒'),
                });
                return;
            }

            if (cmd === 'clickp' || cmd === 'clickv') {
                result.push({
                    type: cmd,
                    x: num(parts[1], 'x'),
                    y: num(parts[2], 'y'),
                    times: num(parts[3] ?? 1, '次数'),
                    gap: num(parts[4] ?? 120, '间隔毫秒'),
                });
                return;
            }

            if (cmd === 'bottom') {
                result.push({
                    type: 'bottom',
                    offset: num(parts[1] ?? 0, '底部预留像素'),
                    wait: num(parts[2] ?? 500, '等待毫秒'),
                });
                return;
            }

            if (cmd === 'top') {
                result.push({
                    type: 'top',
                    wait: num(parts[1] ?? 500, '等待毫秒'),
                });
                return;
            }

            throw new Error(`第 ${lineNo} 行命令无法识别: ${line}`);
        });

        return result;
    }

    async function executeStep(step) {
        if (step.type === 'wait') {
            log(`等待 ${step.ms}ms`);
            await sleep(step.ms);
            return;
        }

        if (step.type === 'scroll') {
            log(`滚动 ${step.dy}px，共 ${step.times} 次`);
            await simulateWheelScroll(step.dy, step.times, step.interval);
            return;
        }

        if (step.type === 'bottom') {
            const scrollEl = getScrollEl();
            const targetTop = Math.max(0, scrollEl.scrollHeight - window.innerHeight - step.offset);
            log(`滚动到底部，预留 ${step.offset}px`);
            window.scrollTo({ top: targetTop, behavior: 'smooth' });
            await sleep(step.wait);
            return;
        }

        if (step.type === 'top') {
            log('滚动到顶部');
            window.scrollTo({ top: 0, behavior: 'smooth' });
            await sleep(step.wait);
            return;
        }

        if (step.type === 'clickp') {
            log(`点击页面坐标 (${step.x}, ${step.y})`);
            await clickPagePoint(step.x, step.y, step.times, step.gap);
            return;
        }

        if (step.type === 'clickv') {
            log(`点击视口坐标 (${step.x}, ${step.y})`);
            await clickViewportPoint(step.x, step.y, step.times, step.gap);
            return;
        }
    }

    async function simulateWheelScroll(totalDy, times, interval) {
        const singleDy = totalDy / Math.max(1, times);

        for (let i = 0; i < times; i++) {
            if (stopRequested || !running) return;

            const x = Math.round(window.innerWidth / 2);
            const y = Math.round(window.innerHeight / 2);
            const target = document.elementFromPoint(x, y) || document.body;

            target.dispatchEvent(new WheelEvent('wheel', {
                deltaY: singleDy,
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: y,
            }));

            window.scrollBy(0, singleDy);
            await sleep(interval);
        }
    }

    async function clickPagePoint(pageX, pageY, times, gap) {
        const targetTop = Math.max(0, pageY - Math.round(window.innerHeight * 0.45));
        window.scrollTo({ top: targetTop, behavior: 'smooth' });
        await sleep(500);

        const vx = Math.round(pageX - window.scrollX);
        const vy = Math.round(pageY - window.scrollY);
        await clickViewportPoint(vx, vy, times, gap);
    }

    async function clickViewportPoint(clientX, clientY, times, gap) {
        for (let i = 0; i < times; i++) {
            if (stopRequested || !running) return;

            const el = document.elementFromPoint(clientX, clientY);
            if (!el) {
                throw new Error(`坐标 (${clientX}, ${clientY}) 没找到可点击元素`);
            }

            ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach((type) => {
                const event = new MouseEvent(type, {
                    view: window,
                    bubbles: true,
                    cancelable: true,
                    clientX,
                    clientY,
                });
                el.dispatchEvent(event);
            });

            if (typeof el.focus === 'function') {
                el.focus();
            }

            await sleep(gap);
        }
    }

    function getScrollEl() {
        return document.scrollingElement || document.documentElement || document.body;
    }

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
})();
