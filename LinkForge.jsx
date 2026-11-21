#target illustrator
#targetengine "main"
(function () {
    var version = "0.3.4", title = "Link Forge | 链接增强工具 [" + version + "]", existing = null;
    try { if ($.global.LinkForgeWindow && $.global.LinkForgeWindow._lfBuild === "slim-v1") { existing = $.global.LinkForgeWindow; } } catch (cachedError) {}
    if (existing) {
        try {
            if (existing._lfVersion === version && existing.lfRefresh) {
                $.global.LinkForgeWindow = existing;
                existing.onActivate = null;
                existing._lfHidden = false;
                existing.show(); existing.lfRefresh(); existing.active = true;
                return;
            }
        } catch (staleError) {}
        try { existing.onActivate = null; existing.hide(); } catch (hideError) {}
    }
    var root = new File($.fileName).parent;
    $.evalFile(new File(root.fsName + "/jsx/host.jsx"));
    var win = new Window("palette", title, undefined, {resizeable:true, closeButton:false});
    win._lfVersion = version;
    win._lfBuild = "slim-v1";
    var rows = [], rowCount = 0, busy = false, refreshing = false, lastScan = 0;
    var json = LF.json, pending = {}, requestId = 0;
    win.orientation = "column"; win.alignChildren = ["fill", "top"]; win.spacing = 8; win.margins = 14;
    var header = win.add("group"); header.add("statictext", undefined, "LINK FORGE  /  原生面板 · 精简版");
    var refreshButton = header.add("button", undefined, "刷新"); refreshButton.alignment = ["right", "center"];
    var closeButton = header.add("button", undefined, "关闭面板");
    var docInfo = win.add("statictext", undefined, "读取文档中…"); docInfo.characters = 46;
    var status = win.add("edittext", undefined, "", {multiline:true, readonly:true, scrolling:true}); status.preferredSize = [420, 86];
    win.add("statictext", undefined, "独立 ScriptUI 界面 · 不需要 Quicker 或 CEP");

    function notify(value) { status.text = String(value); }

    function request(command, payload, success, failure) {
        var id = ++requestId, bt = new BridgeTalk(); pending[id] = bt;
        bt.target = BridgeTalk.appSpecifier || "illustrator";
        // Avoid nested Windows backslash escapes across the ScriptUI BridgeTalk boundary.
        bt.body = 'if(typeof LF==="undefined"||LF.version!=="' + version + '"){$.evalFile(new File(decodeURIComponent("' + encodeURIComponent(root.fsName + "/jsx/host.jsx") + '")));}LF.run("' + command + '",decodeURIComponent("' + encodeURIComponent(json.stringify(payload || {})) + '"));';
        bt.onResult = function (message) {
            delete pending[id];
            try { var r = json.parse(message.body); if (!r.ok) { throw new Error(r.error); } success(r.data); }
            catch (e) { failure(e); }
        };
        bt.onError = function (message) { delete pending[id]; failure(new Error(message.body)); };
        try { bt.send(); } catch (e) { delete pending[id]; failure(e); }
    }

    function summary(data) {
        var s = data.message || "", i;
        if (data.cancelled) { return "已取消"; }
        if (typeof data.processed === "number") { s = "处理 " + data.processed + "；跳过 " + (data.skipped || 0) + "。 " + s; }
        if (typeof data.selected === "number") { s = "选中 " + data.selected + " 个。 " + s; }
        if (data.errors) { for (i = 0; i < data.errors.length; i++) { s += "\n" + (data.errors[i].name || "") + ": " + (data.errors[i].error || data.errors[i]); } }
        if (data.note) { s += "\n" + data.note; }
        return s || "完成；请检查 Illustrator 中的结果。";
    }

    function refresh(done) {
        if (refreshing) { if (done) { done(); } return; }
        refreshing = true; refreshButton.enabled = false;
        request("summary", {}, function (data) {
            rows = []; rowCount = data.linkCount || 0; // status line only needs counters
            docInfo.text = (data.documentName || "未打开文档") + "  |  链接 " + data.linkCount + " / 丢失 " + data.missingCount + " / 选中 " + data.selectionCount;
            refreshing = false; lastScan = new Date().getTime(); refreshButton.enabled = !busy; if (done) { done(); }
        }, function (e) {
            rows = []; rowCount = 0; notify("刷新失败：" + e.message);
            refreshing = false; refreshButton.enabled = !busy; if (done) { done(e); }
        });
    }

    function execute(command, payload, done) {
        if (busy) { return; }
        busy = true; refreshButton.enabled = false;
        notify("处理中…请完成 Illustrator 中可能出现的对话框。");
        function finish(error, result) { refreshButton.enabled = true; busy = false; if (done) { done(error, result); } }
        request(command, payload, function (result) {
            refresh(function () { notify(summary(result)); finish(null, result); });
        }, function (e) { notify("操作未完成：" + e.message); finish(e); });
    }

    function form(title, help, spec) {
        var d = new Window("dialog", title), i, f, row, input, values = {}, controls = [];
        d.orientation = "column"; d.alignChildren = "fill"; d.margins = 16;
        var message = d.add("statictext", undefined, help, {multiline:true}); message.preferredSize = [390, 55];
        for (i = 0; i < spec.length; i++) {
            f = spec[i]; row = d.add("group"); row.alignChildren = ["left", "center"];
            row.add("statictext", undefined, f.label).preferredSize.width = 165;
            if (f.options) { input = row.add("dropdownlist", undefined, f.options); input.selection = f.value || 0; }
            else { input = row.add("edittext", undefined, f.value === undefined ? "" : String(f.value)); input.characters = 24; }
            controls.push(input);
        }
        var error = d.add("statictext", undefined, ""); error.preferredSize.width = 390;
        var buttons = d.add("group"); buttons.alignment = "right";
        buttons.add("button", undefined, "取消", {name:"cancel"});
        var ok = buttons.add("button", undefined, "执行", {name:"ok"});
        ok.onClick = function () {
            for (var j = 0; j < spec.length; j++) {
                var field = spec[j], control = controls[j], value = field.options ? field.keys[control.selection.index] : control.text;
                if (field.number) {
                    value = Number(value);
                    if (control.text === "" || !isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max) || (field.integer && value !== Math.floor(value))) {
                        error.text = field.label + "：请输入范围内的有效数字"; return;
                    }
                }
                if (field.required && value === "") { error.text = field.label + "不能为空"; return; }
                values[field.key] = value;
            }
            d.close(1);
        };
        return d.show() === 1 ? values : null;
    }

    function action(command) {
        var p = null;
        if (command === "updatePdfPage") {
            p = form("更新 PDF 页码", "重新置入页面并保留变换；不会更改其他文档的导入偏好。", [
                {key:"page", label:"页码", value:1, number:true, min:1, max:100000, integer:true},
                {key:"crop", label:"置入边界", options:["媒体框","裁切框","成品框","出血框","作品框","内容边界"], keys:["media","crop","trim","bleed","art","bounding"]}
            ]);
        } else if (command === "setTransform") {
            p = form("指定缩放及角度", "以对象中心设置目标值。源密度未知时采用 72 PPI 基准；剪切矩阵拒绝。", [
                {key:"scaleX", label:"水平缩放 %", value:100, number:true, min:0.01, max:100000},
                {key:"scaleY", label:"垂直缩放 %", value:100, number:true, min:0.01, max:100000},
                {key:"rotation", label:"角度 °", value:0, number:true, min:-360, max:360}
            ]);
        } else if (command === "embed" || /^reset/.test(command)) {
            if (!confirm(command === "embed" ? "嵌入当前选中链接？请先保存文档。" : "修改当前选中链接的变换？不会恢复历史摆放位置。")) { return; }
            p = {};
        } else {
            p = {};
        }
        if (p !== null) { execute(command, p); }
    }

    function grid(parent, title, entries) {
        var panel = parent.add("panel", undefined, title), row = null, button;
        panel.orientation = "column"; panel.alignChildren = "fill"; panel.spacing = 4; panel.margins = 8;
        for (var i = 0; i < entries.length; i++) {
            if (i % 2 === 0) { row = panel.add("group"); row.alignChildren = ["fill", "center"]; row.spacing = 6; }
            button = row.add("button", undefined, entries[i][1]);
            button.preferredSize = [194, 25];
            button._command = entries[i][0];
            button.onClick = function () { action(this._command); };
        }
    }

    var body = win.add("group"); body.orientation = "column"; body.alignChildren = "fill"; body.spacing = 8;
    grid(body, "链接与文件", [["place","置入文件"],["reveal","定位路径"],["relink","重新链接"],["relinkFolder","更新所在文件夹"],["updatePdfPage","更新 PDF 页码"],["embed","嵌入链接对象"],["editAI","用 Illustrator 编辑"],["editPS","用 Photoshop 编辑"]]);
    grid(body, "变换", [["resetScale","取消缩放"],["resetRotation","取消旋转"],["resetTransform","恢复原始变换"],["setTransform","指定缩放及角度"]]);

    refreshButton.onClick = function () { refresh(); };
    win.lfRefresh = refresh;
    win.lfExecute = execute;
    win.lfStatus = function () { return {busy:busy, refreshing:refreshing, rows:rowCount, document:docInfo.text}; };
    function dismiss() { win._lfHidden = true; win.hide(); return false; }
    closeButton.onClick = dismiss;
    win.lfDismiss = dismiss;
    win.onClose = dismiss;
    win.onActivate = null;
    win.onResizing = win.onResize = function () { this.layout.resize(); };
    refresh(); win.layout.layout(true); win.center();
    $.global.LinkForgeWindow = win; win.show();
})();
