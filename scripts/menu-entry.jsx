#target illustrator
#targetengine "main"
(function () {
    var entry = new File(Folder.userData.fsName + "/Adobe/CEP/extensions/com.aether.illustrator.linktoolkit/LinkForge.jsx");
    if (!entry.exists) {
        alert("Link Forge 尚未安装，请先运行安装程序。");
        return;
    }
    $.evalFile(entry);
})();
