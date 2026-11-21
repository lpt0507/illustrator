(function () {
    'use strict';

    var state = { connected: false, busy: false, modal: null, lastScan: 0, toastTimer: null };
    var cep = window.__adobe_cep__;

    function el(id) { return document.getElementById(id); }
    function each(selector, fn) { Array.prototype.forEach.call(document.querySelectorAll(selector), fn); }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function node(tag, className, text) {
        var item = document.createElement(tag);
        if (className) item.className = className;
        if (text !== undefined) item.textContent = String(text);
        return item;
    }
    function text(id, value) { var n = el(id); if (n) n.textContent = value == null ? '—' : String(value); }
    function toast(message) {
        clearTimeout(state.toastTimer);
        text('toast', message);
        el('toast').classList.add('visible');
        state.toastTimer = setTimeout(function () { el('toast').classList.remove('visible'); }, 3500);
    }

    function setConnection(connected, message) {
        state.connected = connected;
        el('connectionBanner').className = 'connection-banner' + (connected ? ' connected' : cep ? ' error' : '');
        text('connectionBanner', message || (cep ? '宿主脚本未就绪。请刷新，或关闭面板后重新打开。' : '离线预览 · 文档操作已禁用'));
        updateControls();
    }

    function updateControls() {
        each('[data-action]', function (button) { button.disabled = !state.connected || state.busy; });
    }

    function setBusy(busy, title) {
        state.busy = busy;
        el('busy').classList.toggle('hidden', !busy);
        document.body.setAttribute('aria-busy', busy ? 'true' : 'false');
        text('busyTitle', title || '正在读取文档');
        text('busyMessage', '请在 Illustrator 中完成可能出现的文件对话框。');
        updateControls();
    }

    var HOST_VERSION = '0.3.4';

    function buildScript(command, payload) {
        // Self-healing boot: the native panel reloads host.jsx when the engine
        // has no (or a stale) LF; the CEP panel must do the same, with an
        // explicit UTF-8 encoding so Chinese source strings survive evalFile.
        var boot = '';
        try {
            var extensionPath = decodeURI(cep.getSystemPath('Extension')).replace(/^file:\/\//, '').replace(/\\/g, '/');
            if (extensionPath) {
                boot = 'if(typeof LF==="undefined"||LF.version!=="' + HOST_VERSION + '"){var f=new File("' + extensionPath + '/jsx/host.jsx");f.encoding="UTF-8";$.evalFile(f);}';
            }
        } catch (ignore) {}
        return boot + 'LF.run(' + JSON.stringify(command) + ',' + JSON.stringify(JSON.stringify(payload || {})) + ')';
    }

    function rpc(command, payload) {
        return new Promise(function (resolve, reject) {
            if (!cep || typeof cep.evalScript !== 'function') { reject(new Error('当前为离线预览，无法执行 Illustrator 操作。')); return; }
            var script = buildScript(command, payload);
            // A native file dialog can keep evalScript pending; never unlock and submit a duplicate.
            var waitTimer = setTimeout(function () {
                text('busyMessage', '仍在等待宿主响应。请检查 Illustrator 的文件选择或确认窗口，不要重复执行。');
            }, 20000);
            try {
                cep.evalScript(script, function (raw) {
                    clearTimeout(waitTimer);
                    try {
                        if (!raw || /^EvalScript error/i.test(String(raw).trim())) throw new Error('宿主脚本无法执行：' + String(raw || '(空响应)').trim());
                        var result = JSON.parse(raw);
                        if (!result || typeof result.ok !== 'boolean') throw new Error('宿主返回格式不正确。');
                        if (!result.ok) {
                            var detail = result.error;
                            if (detail && typeof detail === 'object') detail = detail.message || detail.code || JSON.stringify(detail);
                            throw new Error(detail || result.message || '操作未完成。');
                        }
                        resolve(result);
                    } catch (error) { reject(error); }
                });
            } catch (error) { clearTimeout(waitTimer); reject(error); }
        });
    }

    function showResult(title, message, details, error) {
        var panel = el('resultPanel');
        panel.classList.remove('hidden');
        panel.classList.toggle('error', !!error);
        text('resultTitle', title);
        text('resultMessage', message || '');
        clear(el('resultDetails'));
        (details || []).forEach(function (item) { el('resultDetails').appendChild(node('li', '', item)); });
    }

    function resultSummary(title, response) {
        var data = response.data || {};
        var details = [];
        var errors = data.errors || [];
        if (data.cancelled) { toast('已取消，没有执行该操作。'); return; }
        if (data.supported === false) { showResult(title + ' · 未执行', data.reason || response.message || '此功能在当前宿主中不可用。', [], true); return; }
        (data.warnings || []).forEach(function (warning) { details.push(typeof warning === 'string' ? warning : JSON.stringify(warning)); });
        errors.forEach(function (item) { details.push((item.name ? item.name + '：' : '') + (item.error || item.message || String(item))); });
        var message = response.message || data.message || '';
        var countParts = [];
        if (typeof data.processed === 'number') countParts.push('处理 ' + data.processed + ' 个');
        if (typeof data.selected === 'number') countParts.push('选中 ' + data.selected + ' 个');
        if (typeof data.skipped === 'number' && data.skipped > 0) countParts.push('跳过 ' + data.skipped + ' 个');
        if (errors.length) countParts.push('失败 ' + errors.length + ' 个');
        if (data.note) details.push(data.note);
        if (data.paths && data.paths.length) {
            countParts = [];
            message = data.paths.length === 1
                ? (data.method === 'folder' ? '已打开所在文件夹：' : '已在资源管理器定位：') + data.paths[0]
                : '已在资源管理器定位 ' + data.paths.length + ' 个源文件';
        }
        if (countParts.length) message = countParts.join(' · ') + (message ? '\n' + message : '');
        if (!message) message = '宿主已响应。请在 Illustrator 中检查结果。';
        if (errors.length || details.length) { showResult(title + (errors.length ? ' · 部分失败' : ''), message, details, errors.length > 0); }
        else { toast(message); }
    }

    function refresh(quiet) {
        if (state.busy || state.modal) return Promise.resolve();
        if (!cep) { setConnection(false); return Promise.resolve(); }
        // Background refresh must never show the busy overlay or disable buttons:
        // the click that focuses the panel would otherwise be swallowed.
        if (!quiet) setBusy(true, '刷新文档');
        return rpc('ping', {}).then(function () {
            // ping is enough as a liveness probe. scan() walked every link and
            // read every image header, but no slim-panel view consumes its rows.
            setConnection(true);
            state.lastScan = Date.now();
        }).catch(function (error) {
            setConnection(false, '宿主连接失败，详情见下方。');
            if (quiet) toast('连接失败：' + error.message);
            else showResult('无法刷新', error.message, [], true);
        }).then(function () { if (!quiet) setBusy(false); });
    }

    function execute(command, payload, title) {
        if (state.busy || !state.connected) return;
        setBusy(true, title);
        rpc(command, payload).then(function (response) {
            resultSummary(title, response);
            // Slim build has no document strip to repaint: the follow-up scan
            // is dead work. Only the focus-refresh timestamp needs updating.
            state.lastScan = Date.now();
        }).catch(function (error) {
            showResult(title + ' · 未完成', error.message, [], true);
        }).then(function () { setBusy(false); });
    }

    function openModal(title, description, fields, onSubmit, submitLabel) {
        if (state.busy || state.modal) return;
        state.modal = { fields: fields || [], onSubmit: onSubmit, previousFocus: document.activeElement };
        text('modalTitle', title);
        text('modalDescription', description);
        text('modalError', '');
        text('confirmModal', submitLabel || '执行');
        var container = el('modalFields');
        clear(container);
        state.modal.fields.forEach(function (field) {
            var label = node('label', field.type === 'checkbox' ? 'check' : '', field.type === 'checkbox' ? undefined : field.label);
            var input;
            if (field.options) {
                input = node('select');
                field.options.forEach(function (option) { var element = node('option', '', option[1]); element.value = option[0]; input.appendChild(element); });
            } else { input = node('input'); input.type = field.type || 'text'; }
            input.id = 'action-' + field.key;
            input.name = field.key;
            if (field.type === 'checkbox') { input.checked = !!field.value; label.appendChild(input); label.appendChild(node('span', '', field.label)); }
            else { input.value = field.value == null ? '' : field.value; label.appendChild(input); }
            if (field.min != null) input.min = field.min;
            if (field.max != null) input.max = field.max;
            if (field.type === 'number') input.step = field.step == null ? 'any' : String(field.step);
            if (field.required) input.required = true;
            if (field.placeholder) input.placeholder = field.placeholder;
            if (field.help) label.appendChild(node('span', 'field-help', field.help));
            container.appendChild(label);
        });
        el('modalBackdrop').classList.remove('hidden');
        var first = container.querySelector('input,select');
        (first || el('cancelModal')).focus();
    }

    function closeModal() {
        var modal = state.modal;
        state.modal = null;
        el('modalBackdrop').classList.add('hidden');
        if (modal && modal.previousFocus && modal.previousFocus.focus) modal.previousFocus.focus();
    }

    function form(title, description, fields, command) {
        openModal(title, description, fields, function (payload) {
            closeModal();
            execute(command, payload, title);
        });
    }

    function confirmAction(command, payload, title, description) {
        openModal(title, description, [], function () {
            closeModal();
            payload.confirmed = true;
            execute(command, payload, title);
        }, '确认执行');
    }

    function handleAction(command, title) {
        if (state.busy || state.modal || !state.connected) return;
        if (command === 'updatePdfPage') {
            form(title, '对选中的 PDF 链接重新置入指定页面。请确认该页存在，置入框变化可能影响尺寸。', [
                { key: 'page', label: '页码', type: 'number', value: 1, min: 1, max: 100000, step: 1, required: true },
                { key: 'crop', label: '置入边界', value: 'media', options: [['media', '媒体框'], ['crop', '裁切框'], ['trim', '成品框'], ['bleed', '出血框'], ['art', '作品框'], ['bounding', '内容边界']] }
            ], command); return;
        }
        if (command === 'setTransform') {
            form(title, '设定目标缩放与旋转，非在当前值上叠加。复杂剪切或镜像对象可能被宿主拒绝，以避免破坏图稿。', [
                { key: 'scaleX', label: '水平缩放（%）', type: 'number', value: 100, min: 0.01, max: 100000, required: true },
                { key: 'scaleY', label: '垂直缩放（%）', type: 'number', value: 100, min: 0.01, max: 100000, required: true },
                { key: 'rotation', label: '旋转角度（°）', type: 'number', value: 0, min: -360, max: 360, required: true }
            ], command); return;
        }
        if (command === 'embed') { confirmAction(command, {}, title, '将当前选中的链接嵌入文档，解除外部文件引用。文档可能变大；请先保存。'); return; }
        if (command === 'resetTransform' || command === 'resetScale' || command === 'resetRotation') {
            confirmAction(command, {}, title, '修改当前选中链接的变换。复杂剪切或镜像可能无法恢复；建议先保存。'); return;
        }
        execute(command, {}, title);
    }

    function initialize() {
        each('[data-action]', function (button) { button.addEventListener('click', function () { handleAction(button.getAttribute('data-action'), button.textContent.trim()); }); });
        el('closeResult').addEventListener('click', function () { el('resultPanel').classList.add('hidden'); });
        el('closeModal').addEventListener('click', closeModal);
        el('cancelModal').addEventListener('click', closeModal);
        el('actionForm').addEventListener('submit', function (event) {
            event.preventDefault();
            if (!state.modal || state.busy) return;
            var payload = {};
            try {
                state.modal.fields.forEach(function (field) {
                    var input = el('action-' + field.key);
                    if (!input.checkValidity()) throw new Error('请检查“' + field.label + '”的值。');
                    if (field.type === 'number' && (!input.value || !isFinite(Number(input.value)))) throw new Error('请填写有效数值。');
                    payload[field.key] = field.type === 'checkbox' ? input.checked : field.type === 'number' ? Number(input.value) : input.value;
                });
                state.modal.onSubmit(payload);
            } catch (error) { text('modalError', error.message); }
        });
        document.addEventListener('keydown', function (event) {
            if (!state.modal) return;
            if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
            if (event.key === 'Tab') {
                var focusable = el('modalBackdrop').querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)');
                var first = focusable[0], last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
                if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
            }
        });
        window.addEventListener('focus', function () {
            if (state.connected && !state.busy && !state.modal && Date.now() - state.lastScan > 5000) refresh(true);
        });
        window.LinkForgePanel = { refresh: refresh, connect: refresh };
        updateControls();
        if (cep) refresh(); else setConnection(false);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
    else initialize();
}());
