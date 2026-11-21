/* Illustrator artwork actions kept by the slim build: opening linked sources. ES3; loaded after core.jsx. */
(function (LF) {
    var H = LF.helpers;
    var A = LF.actions;

    function visibleEditable(item) {
        var p = item;
        try {
            while (p && p.typename !== "Document" && p.typename !== "Application") {
                if (p.locked || p.hidden || (p.typename === "Layer" && !p.visible)) { return false; }
                p = p.parent;
            }
            return true;
        } catch (e) { return false; }
    }

    function selected(kinds) {
        var values = H.items(true, kinds), result = [], i;
        for (i = 0; i < values.length; i++) {
            if (visibleEditable(values[i])) { result.push(values[i]); }
        }
        if (!result.length) { throw new Error("请先选择可见且未锁定的图稿对象。"); }
        return result;
    }

    function quote(value) {
        return '"' + String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029") + '"';
    }

    function linkedFiles() {
        var items = selected(["PlacedItem"]), files = [], names = {}, i, file;
        for (i = 0; i < items.length; i++) {
            file = items[i].file;
            if (!file || !file.exists) { throw new Error("选中的链接文件已丢失。"); }
            if (!names[file.fsName]) { files.push(file); names[file.fsName] = true; }
        }
        return files;
    }

    A.editAI = function () {
        var files = linkedFiles(), count = 0, errors = [], i;
        for (i = 0; i < files.length; i++) {
            try { app.open(files[i]); count++; }
            catch (e) { errors.push({ name: files[i].name, error: String(e.message) }); }
        }
        return { changed: count, errors: errors, message: "已在 Illustrator 中打开 " + count + " 个链接源文件。请谨慎保存；源文件由所有链接共用。" };
    };

    A.editPS = function () {
        var files = linkedFiles(), target, message, lines = [], i;
        if (typeof BridgeTalk === "undefined") { throw new Error("当前 Illustrator 中 BridgeTalk 不可用。"); }
        target = BridgeTalk.getSpecifier("photoshop");
        if (!target) { throw new Error("未安装 Photoshop，或 Photoshop 未注册到 BridgeTalk。"); }
        for (i = 0; i < files.length; i++) { lines.push("app.open(new File(" + quote(files[i].fsName) + ")); "); }
        message = new BridgeTalk(); message.target = target; message.body = lines.join("\n");
        if (!LF._bridgeMessages) { LF._bridgeMessages = []; }
        LF._bridgeMessages.push(message);
        message.onResult = function () { LF._lastPhotoshopResult = { success: true, time: new Date().getTime() }; };
        message.onError = function (error) { LF._lastPhotoshopResult = { success: false, error: String(error.body) }; };
        if (!message.send()) { throw new Error("无法向 Photoshop 发送打开文件请求。"); }
        return { changed: 0, submitted: files.length, message: "已向 Photoshop 提交 " + files.length + " 个打开文件请求。该请求为异步发送，无法确认 Photoshop 是否已打开；请在 Photoshop 中保存修改后刷新 Illustrator 链接。" };
    };
}(LF));
