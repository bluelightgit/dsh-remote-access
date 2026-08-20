window.__ModuleLoader__.load({
	id: "@greenonion/dsh-remote-access",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react = require("react");

		const h = react.createElement;

		// ── i18n dictionaries ──────────────────────────────────────────────
		const NS = "dsh-remote-access";
		const zh = {
			"status.checking": "检测中…",
			"status.normal": "正常",
			"status.abnormal": "异常",
			"status.on": "已开启",
			"status.off": "已关闭",
			"status.running": "运行中",
			"status.stopped": "未运行",
			"status.reachable": "可达",
			"status.unreachable": "不可达",
			"copy": "复制",
			"close": "关闭",
			"refresh": "刷新",
			"retry": "重试",
			"updatedAt": "更新于 {time}",
			"loading": "正在检测…",
			"error.status": "无法读取 /remote-access.status.json",
			"action.running": "执行中…",
			"action.done": "完成",
			"action.failed": "失败",
			"action.requestFailed": "请求失败：{message}",
			"action.unauthorized": "未授权：页面令牌缺失或已过期，请刷新页面",
			"action.proxyStarted": "反代已启动",
			"action.proxyStopped": "反代已停止",
			"action.proxyRestarted": "反代已重启",
			"action.autoConfigDone": "一键配置完成",
			"action.certRegenerated": "证书已重新生成，反代已重启",
			"action.certUpToDate": "证书已是最新，无需重新生成",
			"action.tailscaleUp": "Tailscale 连接请求已发送",
			"action.tailscaleDown": "Tailscale 已断开",
			"action.serveOn": "Tailscale Serve 已开启",
			"action.serveOff": "Tailscale Serve 已关闭",
			"action.funnelOn": "Tailscale Funnel 已开启",
			"action.funnelOff": "Tailscale Funnel 已关闭，Serve 保留为 tailnet 访问",
			"action.autoStartOn": "反代自启动已开启（下次启动 dsh 生效）",
			"action.autoStartOff": "反代自启动已关闭",
			"action.tailscaleAutoStartOn": "Tailscale 自启动已开启（下次启动 dsh 生效）",
			"action.tailscaleAutoStartOff": "Tailscale 自启动已关闭",
			"action.noticeOn": "证书安装提示已开启",
			"action.noticeOff": "证书安装提示已关闭",
			"section.title": "远程访问",
			"lan.title": "局域网（反代）",
			"lan.proxy": "反代",
			"lan.caddyMissing": "未安装 Caddy，点「一键配置」",
			"lan.autoStart": "反代自启动",
			"lan.autoStartHint": "dsh 启动时自动拉起反代",
			"lan.port": "局域网端口",
			"lan.cert": "证书",
			"lan.certMissing": "缺失，启动时会自动生成",
			"lan.certSanCovered": "SAN 已覆盖本机 IP",
			"lan.certSanMissing": "SAN 未覆盖当前 IP",
			"lan.ca": "本地 CA",
			"lan.caMissing": "未生成",
			"lan.caPresent": "已生成",
			"lan.url": "访问地址",
			"lan.setup": "一键配置并启动",
			"lan.restart": "重启",
			"lan.regenCert": "重新生成证书",
			"lan.installFlow": "安装流程",
			"lan.caddyMissingAction": "未检测到 Caddy，请先安装后再启动反代",
			"lan.caddyInvalid": "生成的 Caddy 配置校验失败",
			"lan.certGenerationFailed": "本地 TLS 证书生成失败",
			"lan.foreignCaddy": "端口被另一个 Caddy 占用，已保持其运行",
			"lan.modal.title": "Caddy 安装",
			"lan.modal.step1": "1. 安装 Caddy（Debian/Ubuntu）：",
			"lan.modal.step2": "2. 其他系统请访问 caddyserver.com/download 安装；完成后执行 caddy version 验证。",
			"lan.modal.after": "安装后回到本页，使用反代开关或「一键配置并启动」。",
			"ts.installed": "已安装",
			"ts.notInstalled": "未安装，见安装流程",
			"ts.connected": "Tailscale 连接",
			"ts.autoStart": "Tailscale 自启动",
			"ts.autoStartHint": "dsh 启动时自动连接",
			"ts.serve": "Serve",
			"ts.serveHint": "域名免证书访问",
			"ts.funnel": "Funnel",
			"ts.funnelHint": "公网公开访问",
			"ts.funnelStatusUnknown": "无法确认 Funnel 公网状态，请刷新或检查 Tailscale",
			"ts.tailnetPort": "tailnet 端口",
			"ts.tailnetPortDetail": "不可达（需 CA 或走 Serve）",
			"ts.domain": "域名地址",
			"ts.ip": "IP 地址",
			"ts.setupFlow": "安装/授权流程",
			"ts.missingAction": "未检测到 Tailscale，请先安装并完成授权",
			"ts.funnelForeign": "Funnel 不是由本插件开启的，未做改动",
			"ts.serveForeign": "已有非本插件管理的 Serve 配置，未做改动",
			"ts.modal.title": "Tailscale 安装与授权",
			"ts.modal.step1": "1. 安装（需要 sudo）：",
			"ts.modal.step2": "2. 登录并授权当前用户（会打印登录链接，浏览器认证一次，之后无需 sudo）：",
			"ts.modal.step3": "3. 开放 dsh（Serve 模式：公网受信证书，设备零安装零警告）：",
			"ts.modal.step4": "4. （可选）公开到公网：",
			"ts.modal.after": "完成后切换「Tailscale 连接」刷新状态；访问地址见上方「域名地址」。",
			"auth.title": "访问控制",
			"auth.lan": "局域网 Basic Auth",
			"auth.lanHint": "开启后，局域网访问需输入用户名和密码",
			"auth.serve": "Tailscale Serve Basic Auth",
			"auth.serveHint": "开启后，tailnet 内访问也需输入用户名和密码",
			"auth.funnel": "Funnel 保护",
			"auth.funnelHintOn": "Funnel 下强制启用 Basic Auth",
			"auth.funnelHintMissing": "开启 Funnel 前请先生成访问凭据",
			"auth.funnelUnknown": "公网状态未知，请刷新或检查 Tailscale",
			"auth.user": "用户名",
			"auth.generate": "生成 / 重置访问凭据",
			"auth.configured": "已配置",
			"auth.notConfigured": "未配置",
			"auth.secretModalTitle": "Basic Auth 访问凭据",
			"auth.secretIntro": "密码只显示这一次，请立即保存。之后只能重新生成。",
			"auth.secretUsername": "用户名",
			"auth.secretPassword": "密码",
			"action.lanAuthOn": "局域网 Basic Auth 已开启",
			"action.lanAuthOff": "局域网 Basic Auth 已关闭",
			"action.serveAuthOn": "Tailscale Serve Basic Auth 已开启",
			"action.serveAuthOff": "Tailscale Serve Basic Auth 已关闭",
			"action.authGenerated": "Basic Auth 凭据已生成并应用",
			"api.policy.lan": "局域网 API 白名单",
			"api.policy.serve": "Serve API 白名单",
			"api.policy.funnel": "Funnel API 白名单",
			"api.policy.open": "配置 API 白名单",
			"api.policy.modalTitle": "{name}",
			"api.policy.intro": "仅本机设置页可以修改此策略；未勾选的接口会被远程访问拒绝。",
			"api.policy.selectAll": "全选",
			"api.policy.selectNone": "全不选",
			"api.policy.events": "事件流（WebSocket）",
			"api.policy.eventsHint": "关闭后，远程页面不会接收实时事件更新。",
			"api.policy.allApis": "允许全部 API",
			"api.policy.allApisHint": "放行当前及未来插件的所有 DSH API；包括可能的高权限接口。LAN/Serve 不强制 Basic Auth，请仅在可信网络开启。",
			"api.policy.trustedRemoteSettings": "可信远程设置",
			"api.policy.trustedRemoteSettingsHint": "让远程 Models/设置页按本机设置模式运行，可能读取或修改配置与凭据。",
			"api.policy.funnelRestricted": "Funnel 仅允许基础 API，不支持全部 API或可信远程设置。",
			"api.policy.privileged": "特权接口",
			"api.policy.basic": "基础接口",
			"api.policy.save": "保存",
			"api.policy.saved": "API 白名单已更新",
			"api.policy.empty": "当前没有可配置的接口",
			"action.authMissing": "请先生成 Basic Auth 访问凭据",
			"action.funnelRestricted": "Funnel 不允许全部 API、可信远程设置或特权接口",
			"action.funnelUnknown": "无法确认 Funnel 状态，为安全起见未修改 Tailscale 配置",
			"action.localOnly": "远程访问只提供 DSH 基础功能；插件管理操作请在本机 127.0.0.1:3080 执行",
			"cert.unsupported": "当前平台不支持自动生成证书",
			"mdns.unsupported": "当前平台不支持 mDNS 检测，页面提示功能不可用",
			"ts.modal.step2.win": "2. 打开 Tailscale 客户端登录后执行：",
			"cert.title": "证书安装提示",
			"cert.check": "检测（SAN/mDNS）",
			"cert.checkDetail": "mDNS 未运行或证书缺失",
			"cert.pageNotice": "页面提示开关",
			"cert.pageNoticeHint": "设备未装 CA 时页面底部提示",
			"cert.installFlow": "安装流程",
			"cert.download": "下载 CA 证书",
			"ca.modal.title": "CA 证书安装流程",
			"ca.modal.step1": "① 先下载证书（或让设备直接访问本页的 /ca.crt）：",
			"ca.modal.step2": "② 按设备安装：",
			"ca.modal.windows": "Windows：双击 ca.crt → 安装证书 → 本地计算机 → 受信任的根证书颁发机构",
			"ca.modal.macos": "macOS：双击 → 钥匙串「系统」→ 信任设为「始终信任」",
			"ca.modal.ios": "iPhone/iPad：Safari 打开上方链接 → 设置 → VPN 与设备管理 → 安装 → 证书信任设置里打开开关",
			"ca.modal.android": "Android：设置 → 安全 → 加密与凭据 → 安装证书 → CA 证书",
			"ca.modal.linux": "Linux：复制到 /usr/local/share/ca-certificates/ 后 update-ca-certificates（Firefox 需另导入）",
			"ca.modal.after": "装完后刷新页面，提示自动消失（也可在下方直接关掉提示功能）。",
		};
		const en = {
			"status.checking": "Checking…",
			"status.normal": "Normal",
			"status.abnormal": "Error",
			"status.on": "On",
			"status.off": "Off",
			"status.running": "Running",
			"status.stopped": "Stopped",
			"status.reachable": "Reachable",
			"status.unreachable": "Unreachable",
			"copy": "Copy",
			"close": "Close",
			"refresh": "Refresh",
			"retry": "Retry",
			"updatedAt": "Updated {time}",
			"loading": "Checking…",
			"error.status": "Unable to read /remote-access.status.json",
			"action.running": "Working…",
			"action.done": "Done",
			"action.failed": "Failed",
			"action.requestFailed": "Request failed: {message}",
			"action.unauthorized": "Unauthorized: page token is missing or expired. Refresh the page.",
			"action.proxyStarted": "Reverse proxy started",
			"action.proxyStopped": "Reverse proxy stopped",
			"action.proxyRestarted": "Reverse proxy restarted",
			"action.autoConfigDone": "One-click setup complete",
			"action.certRegenerated": "Certificate regenerated and proxy restarted",
			"action.certUpToDate": "Certificate is already up to date",
			"action.tailscaleUp": "Tailscale connection requested",
			"action.tailscaleDown": "Tailscale disconnected",
			"action.serveOn": "Tailscale Serve enabled",
			"action.serveOff": "Tailscale Serve disabled",
			"action.funnelOn": "Tailscale Funnel enabled",
			"action.funnelOff": "Tailscale Funnel disabled; Serve remains available on your tailnet",
			"action.autoStartOn": "Proxy auto-start enabled (takes effect on next dsh start)",
			"action.autoStartOff": "Proxy auto-start disabled",
			"action.tailscaleAutoStartOn": "Tailscale auto-start enabled (takes effect on next dsh start)",
			"action.tailscaleAutoStartOff": "Tailscale auto-start disabled",
			"action.noticeOn": "Certificate install notice enabled",
			"action.noticeOff": "Certificate install notice disabled",
			"section.title": "Remote access",
			"lan.title": "LAN (Reverse Proxy)",
			"lan.proxy": "Reverse proxy",
			"lan.caddyMissing": "Caddy not installed — use one-click setup",
			"lan.autoStart": "Proxy auto-start",
			"lan.autoStartHint": "Start the proxy automatically with dsh",
			"lan.port": "LAN port",
			"lan.cert": "Certificate",
			"lan.certMissing": "Missing — it will be generated when starting",
			"lan.certSanCovered": "SAN covers this machine's IP",
			"lan.certSanMissing": "SAN does not cover the current IP",
			"lan.ca": "Local CA",
			"lan.caMissing": "Not generated",
			"lan.caPresent": "Generated",
			"lan.url": "Access URL",
			"lan.setup": "One-click setup & start",
			"lan.restart": "Restart",
			"lan.regenCert": "Regenerate certificate",
			"lan.installFlow": "Setup flow",
			"lan.caddyMissingAction": "Caddy was not found. Install it before starting the proxy.",
			"lan.caddyInvalid": "The generated Caddy configuration failed validation",
			"lan.certGenerationFailed": "The local TLS certificate could not be generated",
			"lan.foreignCaddy": "The port is served by another Caddy; it was left running",
			"lan.modal.title": "Caddy install",
			"lan.modal.step1": "1. Install Caddy (Debian/Ubuntu):",
			"lan.modal.step2": "2. On other systems install from caddyserver.com/download, then verify with caddy version.",
			"lan.modal.after": "Return to this page and use the proxy switch or one-click setup & start.",
			"ts.installed": "Installed",
			"ts.notInstalled": "Not installed — see setup flow",
			"ts.connected": "Tailscale connection",
			"ts.autoStart": "Tailscale auto-start",
			"ts.autoStartHint": "Connect automatically with dsh",
			"ts.serve": "Serve",
			"ts.serveHint": "Domain access without installing a certificate",
			"ts.funnel": "Funnel",
			"ts.funnelHint": "Public internet access",
			"ts.funnelStatusUnknown": "Unable to verify Funnel's public status. Refresh or check Tailscale.",
			"ts.tailnetPort": "Tailnet port",
			"ts.tailnetPortDetail": "Unreachable (install the CA or use Serve)",
			"ts.domain": "Domain URL",
			"ts.ip": "IP address",
			"ts.setupFlow": "Install / authorize",
			"ts.missingAction": "Tailscale was not found. Install and authorize it first.",
			"ts.funnelForeign": "Funnel was not enabled by this plugin; it was left unchanged",
			"ts.serveForeign": "An existing Serve configuration not managed by this plugin was left unchanged",
			"ts.modal.title": "Tailscale install & authorization",
			"ts.modal.step1": "1. Install (requires sudo):",
			"ts.modal.step2": "2. Log in and authorize the current user (prints a login link; authenticate once in the browser, then no sudo needed):",
			"ts.modal.step3": "3. Expose dsh (Serve mode: trusted public certificate, zero device setup and warnings):",
			"ts.modal.step4": "4. (Optional) Publish to the public internet:",
			"ts.modal.after": "When done, use the Tailscale connection switch to refresh; see the domain URL above.",
			"auth.title": "Access control",
			"auth.lan": "LAN Basic Auth",
			"auth.lanHint": "Require a username and password for LAN access",
			"auth.serve": "Tailscale Serve Basic Auth",
			"auth.serveHint": "Also require a username and password inside your tailnet",
			"auth.funnel": "Funnel protection",
			"auth.funnelHintOn": "Basic Auth is always required for Funnel",
			"auth.funnelHintMissing": "Generate credentials before enabling Funnel",
			"auth.funnelUnknown": "Public Funnel status is unknown. Refresh or check Tailscale.",
			"auth.user": "Username",
			"auth.generate": "Generate / reset credentials",
			"auth.configured": "Configured",
			"auth.notConfigured": "Not configured",
			"auth.secretModalTitle": "Basic Auth credentials",
			"auth.secretIntro": "This password is shown only once. Save it now; you can only generate a new one later.",
			"auth.secretUsername": "Username",
			"auth.secretPassword": "Password",
			"action.lanAuthOn": "LAN Basic Auth enabled",
			"action.lanAuthOff": "LAN Basic Auth disabled",
			"action.serveAuthOn": "Tailscale Serve Basic Auth enabled",
			"action.serveAuthOff": "Tailscale Serve Basic Auth disabled",
			"action.authGenerated": "Basic Auth credentials generated and applied",
			"api.policy.lan": "LAN API allowlist",
			"api.policy.serve": "Serve API allowlist",
			"api.policy.funnel": "Funnel API allowlist",
			"api.policy.open": "Configure API allowlist",
			"api.policy.modalTitle": "{name}",
			"api.policy.intro": "Only the local settings page can change this policy. Unchecked methods are denied to remote access.",
			"api.policy.selectAll": "Select all",
			"api.policy.selectNone": "Select none",
			"api.policy.events": "Event streams (WebSocket)",
			"api.policy.eventsHint": "When disabled, remote pages will not receive live event updates.",
			"api.policy.allApis": "Allow all APIs",
			"api.policy.allApisHint": "Allows all current and future DSH/plugin APIs, including potentially privileged endpoints. Basic Auth is not required for LAN/Serve; enable only on a trusted network.",
			"api.policy.trustedRemoteSettings": "Trusted remote settings",
			"api.policy.trustedRemoteSettingsHint": "Makes the remote Models/settings pages use host-settings mode; it may read or change configuration and credentials.",
			"api.policy.funnelRestricted": "Funnel allows basic APIs only; all APIs and trusted remote settings are unavailable.",
			"api.policy.privileged": "Privileged",
			"api.policy.basic": "Basic",
			"api.policy.save": "Save",
			"api.policy.saved": "API allowlist updated",
			"api.policy.empty": "No configurable methods are available",
			"action.authMissing": "Generate Basic Auth credentials first",
			"action.funnelRestricted": "Funnel does not allow all APIs, trusted remote settings, or privileged APIs",
			"action.funnelUnknown": "Funnel state could not be verified; Tailscale configuration was left unchanged",
			"action.localOnly": "Remote access exposes basic DSH functions only; manage this plugin at local 127.0.0.1:3080",
			"cert.unsupported": "Certificate generation is not supported on this platform",
			"mdns.unsupported": "mDNS detection is unsupported on this platform; the page notice is unavailable",
			"ts.modal.step2.win": "2. Open the Tailscale client, log in, then run:",
			"cert.title": "Certificate install notice",
			"cert.check": "Check (SAN/mDNS)",
			"cert.checkDetail": "mDNS is not running or certificate is missing",
			"cert.pageNotice": "Page notice",
			"cert.pageNoticeHint": "Show a banner for devices without the CA",
			"cert.installFlow": "Setup flow",
			"cert.download": "Download CA certificate",
			"ca.modal.title": "CA certificate setup",
			"ca.modal.step1": "① Download the certificate first (or visit /ca.crt from the device):",
			"ca.modal.step2": "② Install per device:",
			"ca.modal.windows": "Windows: double-click ca.crt → Install Certificate → Local Machine → Trusted Root Certification Authorities",
			"ca.modal.macos": "macOS: double-click → Keychain \"System\" → Trust → \"Always Trust\"",
			"ca.modal.ios": "iPhone/iPad: open the link above in Safari → Settings → VPN & Device Management → install → enable full trust in Certificate Trust Settings",
			"ca.modal.android": "Android: Settings → Security → Encryption & credentials → Install a certificate → CA certificate",
			"ca.modal.linux": "Linux: copy to /usr/local/share/ca-certificates/ then run update-ca-certificates (Firefox needs a separate import)",
			"ca.modal.after": "Refresh after installing — the notice disappears automatically (or turn the notice off below).",
		};

		// ── styles ──────────────────────────────────────────────────────────
		const css = [
			".dsra-wrap{display:flex;flex-direction:column;gap:12px}",
			".dsra-card{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}",
			".dsra-head{display:flex;align-items:center;gap:8px}",
			".dsra-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary,#222);flex:1}",
			".dsra-dot{width:8px;height:8px;border-radius:50%;flex:none}",
			".dsra-dot.ok{background:#22c55e}.dsra-dot.bad{background:#ef4444}.dsra-dot.na{background:#9ca3af}",
			".dsra-row{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222);min-height:20px}",
			".dsra-detail{color:var(--dsw-alias-label-secondary,#666);font-size:12px;word-break:break-all;flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsra-actions{display:flex;flex-wrap:wrap;gap:8px}",
			".dsra-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));color:var(--dsw-alias-label-primary,#222);border-radius:8px;padding:5px 12px;font-size:13px;font-family:inherit}",
			".dsra-btn:hover{filter:brightness(.96)}",
			".dsra-btn.primary{background:var(--dsw-specific-accent,#3b82f6);border-color:transparent;color:#fff}",
			".dsra-btn:disabled{opacity:.55;cursor:not-allowed}",
			".dsra-msg{font-size:12px;color:var(--dsw-alias-label-secondary,#666);min-height:16px}",
			".dsra-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:rgba(128,128,128,.1);border-radius:6px;padding:2px 6px;word-break:break-all;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsra-copy{font-size:11px;cursor:pointer;border:none;background:none;color:var(--dsw-specific-accent,#3b82f6);text-decoration:underline;padding:0;flex:none}",
			".dsra-link{font-size:12px;color:var(--dsw-specific-accent,#3b82f6);text-decoration:none}",
			".dsra-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:var(--dsw-mask-blur,blur(2px));z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px}",
			".dsra-panel{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));border-radius:16px;box-shadow:var(--dsw-shadow-lv3,0 8px 30px rgba(0,0,0,.2));width:min(600px,100%);max-height:82vh;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px}",
			".dsra-panel h3{margin:0;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#222)}",
			".dsra-modal-close{width:28px;height:28px;display:flex;align-items:center;justify-content:center;flex:none;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-secondary,#666);cursor:pointer;padding:0}",
			".dsra-modal-close:hover{background:rgba(128,128,128,.12);color:var(--dsw-alias-label-primary,#222)}",
			".dsra-modal-close svg{width:18px;height:18px;display:block}",
			".dsra-step{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222)}",
			".dsra-cmd{display:flex;align-items:center;gap:8px;background:rgba(128,128,128,.08);border-radius:8px;padding:6px 10px}",
			".dsra-cmd code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;flex:1;word-break:break-all;color:var(--dsw-alias-label-primary,#222)}",
			".dsra-switch{position:relative;width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;background:rgba(128,128,128,.32);transition:background .15s;flex:none;padding:0}",
			".dsra-switch.on{background:var(--dsw-specific-accent,#3b82f6)}",
			".dsra-switch::after{content:\"\";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}",
			".dsra-switch.on::after{left:18px}",
			".dsra-switch:disabled{opacity:.5;cursor:not-allowed}",
			".dsra-togrow{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222);min-height:24px}",
			".dsra-togrow .dsra-hint{flex:1;text-align:right;color:var(--dsw-alias-label-secondary,#666);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dsra-policy-actions{display:flex;flex-wrap:wrap;gap:8px;border-top:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.16));padding-top:8px}",
			".dsra-policy-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:1 1 180px}",
			".dsra-policy-count{color:var(--dsw-alias-label-secondary,#666);font-size:11px;white-space:nowrap}",
			".dsra-policy-toolbar{display:flex;align-items:center;gap:8px;flex-wrap:wrap}",
			".dsra-policy-toolbar .dsra-msg{flex:1 1 180px}",
			".dsra-policy-list{display:flex;flex-direction:column;gap:8px;max-height:48vh;overflow:auto;padding:2px}",
			".dsra-policy-group{display:flex;flex-direction:column;gap:3px}",
			".dsra-policy-group-title{font-size:12px;font-weight:600;color:var(--dsw-alias-label-secondary,#666);padding:4px 2px 1px;text-transform:capitalize}",
			".dsra-policy-item{display:flex;align-items:center;gap:8px;min-height:28px;padding:4px 7px;border-radius:7px;background:rgba(128,128,128,.06);cursor:pointer}",
			".dsra-policy-item:hover{background:rgba(128,128,128,.12)}",
			".dsra-policy-item input{width:15px;height:15px;accent-color:var(--dsw-specific-accent,#3b82f6);flex:none}",
			".dsra-policy-method{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;word-break:break-all;flex:1;color:var(--dsw-alias-label-primary,#222)}",
			".dsra-policy-risk{font-size:10px;border-radius:5px;padding:1px 5px;color:#9a3412;background:#ffedd5;white-space:nowrap}",
			".dsra-policy-events{display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-top:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.16));border-bottom:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.16));font-size:13px}",
			".dsra-policy-events input{margin-top:2px;accent-color:var(--dsw-specific-accent,#3b82f6)}",
			".dsra-policy-events small{display:block;color:var(--dsw-alias-label-secondary,#666);font-size:11px;margin-top:2px}",
			".dsra-policy-risk-toggle{margin:0 -2px;padding:8px 10px;border:1px solid #fed7aa;border-radius:8px;background:#fffaf0}",
			".dsra-policy-risk-toggle.active{background:#fff7ed;border-color:#f59e0b;color:#9a3412}",
			".dsra-policy-risk-toggle.active small{color:#9a3412}",
			".dsra-modal-footer{justify-content:flex-end}",
			".dsra-policy-warning{font-size:12px;line-height:18px;color:#9a3412;background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 10px}",
			".dsra-policy-warning.danger{color:#991b1b;background:#fef2f2;border-color:#fecaca}",
		].join("\n");
		const tagId = "dsh-remote-access/RemoteAccessSection.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tagId}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-remote-access";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}

		// ── helpers ─────────────────────────────────────────────────────────
		const copy = (text) => {
			try {
				if (navigator.clipboard && navigator.clipboard.writeText) {
					navigator.clipboard.writeText(text).catch(() => {});
				} else {
					const ta = document.createElement("textarea");
					ta.value = text;
					document.body.appendChild(ta);
					ta.select();
					document.execCommand("copy");
					ta.remove();
				}
			} catch (e) {
				/* ignore */
			}
		};

		/** Per-boot action token injected into the served index page. */
		const actionToken = (() => {
			try {
				const m = document.querySelector('meta[name="dsh-remote-access-token"]');
				return m ? m.content : "";
			} catch (e) {
				return "";
			}
		})();

		function readAccessModeCookie() {
			try {
				const match = document.cookie.match(/(?:^|;\s*)dsh-remote-access-mode=([^;]+)/);
				const mode = match ? decodeURIComponent(match[1]) : "";
				return mode === "lan" || mode === "serve" || mode === "funnel" ? mode : "";
			} catch (e) {
				return "";
			}
		}

		function readRemoteCapabilities() {
			try {
				const meta = document.querySelector('meta[name="dsh-remote-access-capabilities"]');
				if (!meta || typeof atob !== "function") return {};
				const text = atob(meta.content || "");
				return JSON.parse(text) || {};
			} catch (e) {
				return {};
			}
		}

		// DSH intentionally treats non-loopback pages as settings-memory-only.
		// When the local dsh-remote-access policy explicitly enables trusted remote settings,
		// promote only that page's settings mirror. The meta/cookie values are a
		// client hint; API authorization remains enforced by the host gateway.
		function enableTrustedRemoteSettings(ctx) {
			const mode = readAccessModeCookie();
			const capabilities = readRemoteCapabilities();
			if ((mode !== "lan" && mode !== "serve") || capabilities[mode]?.trustedRemoteSettings !== true) return;
			const connection = ctx.get("connection");
			if (!connection) return;
			let mirror;
			try {
				mirror = ctx.get("settingsScope").describe();
			} catch (e) {
				return;
			}
			if (!mirror || typeof mirror.ensure !== "function") return;
			const originalLoopback = connection.isLoopback;
			connection.isLoopback = true;
			const originalPersistence = mirror.persistence;
			if (mirror.persistence === "memory") {
				mirror.persistence = "host";
				const snapshot = mirror.getSnapshot?.();
				if (snapshot && snapshot.view === void 0 && mirror.store && typeof mirror.store.set === "function") {
					mirror.store.set({ status: "idle", view: void 0, error: null });
				}
			}
			void mirror.ensure();
			ctx.effect(() => () => {
				connection.isLoopback = originalLoopback;
				mirror.persistence = originalPersistence;
			}, "dsh-remote-access: trusted remote settings bridge");
		}

		const Card = ({ title, ok, children }) =>
			h(
				"div",
				{ className: "dsra-card" },
				h(
					"div",
					{ className: "dsra-head" },
					h("span", { className: "dsra-dot " + (ok === null || ok === undefined ? "na" : ok ? "ok" : "bad") }),
					h("div", { className: "dsra-title" }, title),
				),
				children,
			);

		const Row = ({ t, label, ok, detail, okText, status }) =>
			h(
				"div",
				{ className: "dsra-row" },
				h("span", null, label),
				h(
					"span",
					{ className: "dsra-detail" },
					status !== undefined ? status : ok === null || ok === undefined ? t("status.checking") : ok ? okText || t("status.normal") : detail || t("status.abnormal"),
				),
			);

		/** Pill-shaped toggle switch. */
		const Switch = ({ t, on, disabled, onChange }) =>
			h("button", {
				className: "dsra-switch" + (on ? " on" : ""),
				disabled: disabled,
				onClick: onChange,
				role: "switch",
				"aria-checked": !!on,
				title: on ? t("status.on") : t("status.off"),
			});

		const ToggleRow = ({ t, label, on, disabled, onChange, hint }) =>
			h(
				"div",
				{ className: "dsra-togrow" },
				h("span", null, label),
				h("span", { className: "dsra-hint" }, hint || (on ? t("status.on") : t("status.off"))),
				h(Switch, { t, on, disabled, onChange }),
			);

		const UrlRow = ({ t, label, value }) =>
			h(
				"div",
				{ className: "dsra-row" },
				h("span", { className: "dsra-detail", style: { textAlign: "left", flex: "0 0 auto", maxWidth: "30%" } }, label),
				h("span", { className: "dsra-code" }, value || "—"),
				value ? h("button", { className: "dsra-copy", onClick: () => copy(value) }, t("copy")) : null,
			);

		const Actions = ({ busy, items }) =>
			h(
				"div",
				{ className: "dsra-actions" },
				items.map((it) =>
					h(
						"button",
						{
							key: it.label,
							className: "dsra-btn" + (it.primary ? " primary" : ""),
							disabled: busy || it.disabled === true,
							title: it.title || "",
							onClick: () => it.onClick(),
						},
						it.label,
					),
				),
			);

		const CmdRow = ({ t, cmd }) =>
			h(
				"div",
				{ className: "dsra-cmd" },
				h("code", null, cmd),
				h("button", { className: "dsra-copy", onClick: () => copy(cmd) }, t("copy")),
			);

		const CloseIcon = () =>
			h(
				"svg",
				{ viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" },
				h("path", { d: "M6 6l12 12M18 6L6 18", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round" }),
			);

		const Modal = ({ t, title, onClose, children, closeTop = false }) =>
			h(
				"div",
				{ className: "dsra-mask", onClick: onClose },
				h(
					"div",
					{ className: "dsra-panel", onClick: (e) => e.stopPropagation() },
					h(
						"div",
						{ className: "dsra-head" },
						h("div", { className: "dsra-title" }, title),
						closeTop
							? h("button", { className: "dsra-modal-close", type: "button", title: t("close"), "aria-label": t("close"), onClick: onClose }, h(CloseIcon))
							: null,
				),
					children,
					closeTop
						? null
						: h(
							"div",
							{ className: "dsra-actions" },
							h("button", { className: "dsra-btn", onClick: onClose }, t("close")),
						),
				),
			);

		const ApiPolicyButton = ({ t, mode, policy, total, disabled, onClick }) => {
			const allow = policy && Array.isArray(policy.allow) ? policy.allow : [];
			const allApis = policy?.allApis === true || allow.includes("*");
			const selected = allApis ? "ALL" : allow.length + "/" + total;
			return h(
				"button",
				{
					className: "dsra-btn dsra-policy-btn",
					disabled: disabled,
					onClick,
					type: "button",
				},
				h("span", null, t("api.policy." + mode)),
				h("span", { className: "dsra-policy-count" }, selected),
			);
		};

		const ApiPolicyModal = ({ t, mode, policy, methods, busy, onClose, onSave }) => {
			const funnel = mode === "funnel";
			const entries = (Array.isArray(methods) ? methods : [])
				.map((entry) => (typeof entry === "string" ? { method: entry, privileged: false } : entry))
				.filter((entry) => entry && typeof entry.method === "string" && entry.method.length > 0 && (!funnel || entry.privileged !== true));
			const names = entries.map((entry) => entry.method);
			const initialAllow = policy && Array.isArray(policy.allow) ? policy.allow : [];
			const [allApis, setAllApis] = react.useState(() => !funnel && (policy?.allApis === true || initialAllow.includes("*")));
			const [trustedRemoteSettings, setTrustedRemoteSettings] = react.useState(() => !funnel && policy?.trustedRemoteSettings === true);
			const [selected, setSelected] = react.useState(() => new Set(initialAllow.includes("*") ? names : initialAllow.filter((method) => names.includes(method))));
			const [events, setEvents] = react.useState(() => !policy || policy.events !== false);
			const groups = [];
			const groupMap = new Map();
			for (const entry of entries) {
				const group = entry.method.includes(".") ? entry.method.split(".")[0] : "other";
				if (!groupMap.has(group)) {
					const list = [];
					groupMap.set(group, list);
					groups.push([group, list]);
				}
				groupMap.get(group).push(entry);
			}

			return h(
				Modal,
				{ t, title: t("api.policy.modalTitle", { name: t("api.policy." + mode) }), onClose, closeTop: true },
				h("div", { className: "dsra-step" }, t("api.policy.intro")),
				funnel
					? h("div", { className: "dsra-policy-warning danger" }, t("api.policy.funnelRestricted"))
					: null,
				h(
					"div",
					{ className: "dsra-policy-toolbar" },
					h("div", { className: "dsra-msg" }, allApis ? "ALL" : selected.size + "/" + names.length),
					h("button", { className: "dsra-btn", type: "button", disabled: busy || names.length === 0 || allApis, onClick: () => setSelected(new Set(names)) }, t("api.policy.selectAll")),
					h("button", { className: "dsra-btn", type: "button", disabled: busy || names.length === 0 || allApis, onClick: () => setSelected(new Set()) }, t("api.policy.selectNone")),
				),
				h(
					"label",
					{ className: "dsra-policy-events dsra-policy-risk-toggle" + (allApis ? " active" : "") },
					h("input", { type: "checkbox", checked: allApis, disabled: busy || funnel, onChange: (event) => setAllApis(event.target.checked) }),
					h("span", null, t("api.policy.allApis"), h("small", null, t("api.policy.allApisHint"))),
				),
				h(
					"label",
					{ className: "dsra-policy-events dsra-policy-risk-toggle" + (trustedRemoteSettings ? " active" : "") },
					h("input", { type: "checkbox", checked: trustedRemoteSettings, disabled: busy || funnel, onChange: (event) => setTrustedRemoteSettings(event.target.checked) }),
					h("span", null, t("api.policy.trustedRemoteSettings"), h("small", null, t("api.policy.trustedRemoteSettingsHint"))),
				),
				h(
					"label",
					{ className: "dsra-policy-events" },
					h("input", { type: "checkbox", checked: events, disabled: busy, onChange: (event) => setEvents(event.target.checked) }),
					h("span", null, t("api.policy.events"), h("small", null, t("api.policy.eventsHint"))),
				),
				entries.length === 0
					? h("div", { className: "dsra-msg" }, t("api.policy.empty"))
					: h(
						"div",
						{ className: "dsra-policy-list" },
						groups.map(([group, groupEntries]) =>
							h(
								"div",
								{ className: "dsra-policy-group", key: group },
								h("div", { className: "dsra-policy-group-title" }, group),
								groupEntries.map((entry) =>
									h(
										"label",
										{ className: "dsra-policy-item", key: entry.method },
												h("input", {
													type: "checkbox",
													checked: selected.has(entry.method),
													disabled: busy || allApis,
											onChange: (event) => setSelected((previous) => {
												const next = new Set(previous);
												if (event.target.checked) next.add(entry.method);
												else next.delete(entry.method);
												return next;
											}),
									}),
									h("span", { className: "dsra-policy-method" }, entry.method),
									entry.privileged === true ? h("span", { className: "dsra-policy-risk" }, t("api.policy.privileged")) : null,
								),
								),
							),
						),
					),
				h(
					"div",
					{ className: "dsra-actions dsra-modal-footer" },
					h(
						"button",
						{
							className: "dsra-btn primary",
							type: "button",
							disabled: busy,
							onClick: () => onSave(allApis ? ["*"] : names.filter((method) => selected.has(method)), events, allApis, trustedRemoteSettings),
						},
						 t("api.policy.save"),
					),
				),
			);
		};

		// ── section ─────────────────────────────────────────────────────────
		function RemoteAccessSection({ t }) {
			t = t || ((key) => key);
			const [st, setSt] = react.useState(null);
			const [busy, setBusy] = react.useState(false);
			const [msg, setMsg] = react.useState("");
			const [modal, setModal] = react.useState(null);
			const [authSecret, setAuthSecret] = react.useState(null);

			const [updated, setUpdated] = react.useState("");
			const refresh = react.useCallback(() => {
				const controller = new AbortController();
				const timer = setTimeout(() => controller.abort(), 10000);
				fetch("/remote-access.status.json", { cache: "no-store", signal: controller.signal })
					.then((r) => r.json())
					.then((d) => {
						clearTimeout(timer);
						setSt(d);
						try {
							setUpdated(new Date().toLocaleTimeString());
						} catch (e) {
							/* ignore */
						}
					})
					.catch(() => {
						clearTimeout(timer);
						setSt({ error: true });
					});
			}, []);

			react.useEffect(() => {
				refresh();
				// Async refresh — the page never blocks on detection.
				const timer = setInterval(refresh, 10000);
				return () => clearInterval(timer);
			}, [refresh]);

			const actionMessage = (action, extra, payload, httpStatus) => {
				if (httpStatus === 401) return t("action.unauthorized");
				if (!payload || payload.ok !== true) {
					if (payload && payload.code === "caddy.missing") return t("lan.caddyMissingAction");
					if (payload && payload.code === "caddy.invalid-config") return payload.message ? t("lan.caddyInvalid") + ": " + payload.message : t("lan.caddyInvalid");
					if (payload && payload.code === "cert.generation-failed") return payload.message ? t("lan.certGenerationFailed") + ": " + payload.message : t("lan.certGenerationFailed");
					if (payload && payload.code === "caddy.foreign") return t("lan.foreignCaddy");
					if (payload && payload.code === "tailscale.missing") return t("ts.missingAction");
					if (payload && payload.code === "funnel.foreign") return t("ts.funnelForeign");
					if (payload && payload.code === "serve.foreign") return t("ts.serveForeign");
					if (payload && payload.code === "auth.missing") return t("action.authMissing");
					if (payload && payload.code === "funnel.status-unknown") return t("action.funnelUnknown");
					if (payload && payload.code === "api-access.funnel-restricted") return t("action.funnelRestricted");
					if (payload && payload.code === "remote-access.local-only") return t("action.localOnly");
					if (payload && payload.code === "cert.unsupported") return t("cert.unsupported");
					if (payload && payload.code === "mdns.unsupported") return t("mdns.unsupported");
					return (payload && payload.message) || t("action.failed");
				}
				switch (action) {
					case "start": return t("action.proxyStarted");
					case "stop": return t("action.proxyStopped");
					case "restart": return t("action.proxyRestarted");
					case "autoConfig": return t("action.autoConfigDone");
					case "regenCert": return payload.regenerated === true ? t("action.certRegenerated") : t("action.certUpToDate");
					case "tailscaleUp": return t("action.tailscaleUp");
					case "tailscaleDown": return t("action.tailscaleDown");
					case "tailscaleServe": return extra && extra.serveOn === true ? t("action.serveOn") : t("action.serveOff");
					case "tailscaleFunnel": return extra && extra.funnelOn === true ? t("action.funnelOn") : t("action.funnelOff");
					case "setAutoStart": return extra && extra.on === true ? t("action.autoStartOn") : t("action.autoStartOff");
					case "setTailscaleAutoStart": return extra && extra.on === true ? t("action.tailscaleAutoStartOn") : t("action.tailscaleAutoStartOff");
					case "setCertNotice": return extra && extra.on === true ? t("action.noticeOn") : t("action.noticeOff");
					case "setLanAuth": return extra && extra.on === true ? t("action.lanAuthOn") : t("action.lanAuthOff");
					case "setServeAuth": return extra && extra.on === true ? t("action.serveAuthOn") : t("action.serveAuthOff");
					case "resetBasicAuth": return t("action.authGenerated");
					case "setApiAccess": return t("api.policy.saved");
					default: return payload.message || t("action.done");
				}
			};

			const act = react.useCallback(
				(action, extra, onSuccess) => {
					setBusy(true);
					setMsg(t("action.running"));
					fetch("/remote-access.action", {
						method: "POST",
						headers: {
							"content-type": "application/json",
							...(actionToken ? { "x-remote-access-token": actionToken } : {}),
						},
						body: JSON.stringify(Object.assign({ action }, extra || {})),
					})
						.then(async (r) => {
							let payload = null;
							try {
								payload = await r.json();
							} catch (e) {
								/* non-JSON response */
							}
							setMsg(actionMessage(action, extra, payload, r.status));
							if (payload && typeof payload.basicAuthPassword === "string") {
								setAuthSecret({ username: payload.basicAuthUser, password: payload.basicAuthPassword });
								setModal("auth");
							}
							if (payload && payload.ok === true && typeof onSuccess === "function") onSuccess(payload);
							setBusy(false);
							refresh();
						})
						.catch((e) => {
							setMsg(t("action.requestFailed", { message: e.message }));
							setBusy(false);
						});
				},
				[refresh, t],
			);

			const saveApiPolicy = react.useCallback(
				(mode, allow, events, allApis, trustedRemoteSettings) => act("setApiAccess", { mode, allow, events, allApis, trustedRemoteSettings }, () => setModal(null)),
				[act],
			);

			if (!st) {
				// Render the page immediately — status arrives async and rows
				// show the checking state until then.
				return h(
					"div",
					{ className: "dsra-wrap" },
					h("div", { className: "dsra-msg" }, t("loading")),
					h(Card, { title: t("lan.title"), ok: null }, h(Row, { t, label: t("lan.proxy"), ok: null })),
					h(Card, { title: "Tailscale", ok: null }, h(Row, { t, label: t("ts.connected"), ok: null })),
					h(Card, { title: t("cert.title"), ok: null }, h(Row, { t, label: t("cert.pageNotice"), ok: null })),
				);
			}
			if (st.error) {
				return h(
					"div",
					{ className: "dsra-wrap" },
					h("div", { className: "dsra-msg" }, t("error.status")),
					h("div", { className: "dsra-actions" }, h("button", { className: "dsra-btn", onClick: refresh }, t("retry"))),
				);
			}

			const c = st.checks || {};
			const cert = st.cert || {};
			const ts = c.tailscale || {};
			const notice = st.certNotice || {};
			const caddy = c.caddy || {};
			const caddyRunning = caddy.running === true;
			const caddyInstalled = caddy.installed === true;
			const access = st.access || {};
			const apiAccess = access.apiAccess || {};
			const apiMethods = Array.isArray(access.apiMethods) ? access.apiMethods : [];
			const managementLocal = st.managementLocal !== false;
			const certSupported = st.certSupported !== false;
			const mdnsSupported = st.mdnsSupported !== false;
			const serveOn = Array.isArray(ts.serve) && ts.serve.length > 0;
			const funnelState = ts.funnelState === "on" || ts.funnelState === "off" || ts.funnelState === "unknown" ? ts.funnelState : ts.funnelOn === true ? "on" : "off";
			const funnelOn = funnelState === "on";
			const funnelUnknown = funnelState === "unknown";
			const apiModalMode = typeof modal === "string" && modal.indexOf("api-") === 0 ? modal.slice(4) : "";

			return h(
				"div",
				{ className: "dsra-wrap" },
				h(
					"div",
					{ className: "dsra-msg" },
					msg,
					h("button", { className: "dsra-copy", style: { marginLeft: 8 }, onClick: refresh }, t("refresh")),
					updated ? h("span", { style: { marginLeft: 8 } }, t("updatedAt", { time: updated })) : null,
				),

				// ── LAN reverse proxy ─────────────────────────────────────
				h(
					Card,
					{ title: t("lan.title"), ok: caddyRunning },
					ToggleRow({
						t,
						label: t("lan.proxy"),
						on: caddyRunning,
						disabled: busy || !caddyInstalled,
						onChange: () => act(caddyRunning ? "stop" : "start"),
						hint: !caddyInstalled ? t("lan.caddyMissing") : caddyRunning ? t("status.running") : t("status.stopped"),
					}),
					ToggleRow({ t, label: t("lan.autoStart"), on: st.autoStart === true, disabled: busy, onChange: () => act("setAutoStart", { on: !(st.autoStart === true) }), hint: t("lan.autoStartHint") }),
					Row({ t, label: t("lan.port"), ok: c.port && c.port.lan, detail: t("status.unreachable"), okText: t("status.reachable") }),
					Row({ t, label: t("lan.cert"), ok: cert.present, detail: t("lan.certMissing"), okText: cert.coversLanIp ? t("lan.certSanCovered") : t("lan.certSanMissing") }),
					Row({ t, label: t("lan.ca"), ok: cert.ca === "present", detail: t("lan.caMissing"), okText: t("lan.caPresent") }),
					UrlRow({ t, label: t("lan.url"), value: st.url }),
					h(
						Actions,
						{
							busy,
							items: [
								{ label: t("lan.setup"), primary: true, onClick: () => act("autoConfig") },
								{ label: t("lan.restart"), onClick: () => act("restart") },
								{ label: t("lan.regenCert"), disabled: !certSupported, title: !certSupported ? t("cert.unsupported") : "", onClick: () => act("regenCert") },
								{ label: t("lan.installFlow"), onClick: () => setModal("caddy") },
							],
						},
					),
					h(
						"div",
						{ className: "dsra-policy-actions" },
						h(ApiPolicyButton, {
							t,
							mode: "lan",
							policy: apiAccess.lan,
							total: apiMethods.length,
							disabled: busy || !managementLocal,
							onClick: () => setModal("api-lan"),
						}),
					),
				),

				// ── Tailscale ─────────────────────────────────────────────
				h(
					Card,
					{ title: "Tailscale", ok: ts.running === true },
					Row({ t, label: t("ts.installed"), ok: ts.installed, detail: t("ts.notInstalled"), okText: t("ts.installed") }),
					ToggleRow({ t, label: t("ts.connected"), on: ts.running === true, disabled: busy || ts.installed === false, onChange: () => act(ts.running === true ? "tailscaleDown" : "tailscaleUp") }),
					ToggleRow({ t, label: t("ts.autoStart"), on: st.tailscaleAutoStart === true, disabled: busy, onChange: () => act("setTailscaleAutoStart", { on: !(st.tailscaleAutoStart === true) }), hint: t("ts.autoStartHint") }),
					ToggleRow({ t, label: t("ts.serve"), on: serveOn, disabled: busy || ts.installed === false, onChange: () => act("tailscaleServe", { serveOn: !serveOn }), hint: t("ts.serveHint") }),
					ToggleRow({
						t,
						label: t("ts.funnel"),
						on: funnelOn,
						disabled: busy || ts.installed === false || funnelUnknown || (!funnelOn && access.basicAuthConfigured !== true),
						onChange: () => act("tailscaleFunnel", { funnelOn: !funnelOn }),
						hint: funnelUnknown ? t("ts.funnelStatusUnknown") : funnelOn ? t("ts.funnelHint") : access.basicAuthConfigured ? t("ts.funnelHint") : t("auth.funnelHintMissing"),
					}),
					Row({ t, label: t("ts.tailnetPort"), ok: c.port && c.port.tailnet, detail: t("ts.tailnetPortDetail"), okText: t("status.reachable") }),
					UrlRow({ t, label: t("ts.domain"), value: ts.serveUrl || (ts.dnsName ? "https://" + ts.dnsName + "/" : "") }),
					UrlRow({ t, label: t("ts.ip"), value: ts.tailnetIPs && ts.tailnetIPs[0] ? "https://" + ts.tailnetIPs[0] + ":" + st.port + "/" : "" }),
					h(
						Actions,
						{
							busy,
							items: [{ label: t("ts.setupFlow"), onClick: () => setModal("ts") }],
						},
					),
					h(
						"div",
						{ className: "dsra-policy-actions" },
						h(ApiPolicyButton, {
							t,
							mode: "serve",
							policy: apiAccess.serve,
							total: apiMethods.length,
							disabled: busy || !managementLocal,
							onClick: () => setModal("api-serve"),
						}),
						h(ApiPolicyButton, {
							t,
							mode: "funnel",
							policy: apiAccess.funnel,
							total: apiMethods.length,
							disabled: busy || !managementLocal,
							onClick: () => setModal("api-funnel"),
						}),
					),
				),

				// ── Access control ─────────────────────────────────────────
				h(
					Card,
					{ title: t("auth.title"), ok: access.basicAuthConfigured },
					ToggleRow({ t, label: t("auth.lan"), on: access.lanAuth === true, disabled: busy, onChange: () => act("setLanAuth", { on: !(access.lanAuth === true) }), hint: t("auth.lanHint") }),
					ToggleRow({ t, label: t("auth.serve"), on: access.serveAuth === true, disabled: busy, onChange: () => act("setServeAuth", { on: !(access.serveAuth === true) }), hint: t("auth.serveHint") }),
					Row({
						t,
						label: t("auth.funnel"),
						ok: funnelUnknown ? null : !funnelOn || access.basicAuthConfigured === true,
						detail: funnelUnknown ? t("auth.funnelUnknown") : funnelOn && !access.basicAuthConfigured ? t("auth.funnelHintMissing") : t("auth.funnelHintOn"),
						okText: t("auth.funnelHintOn"),
						status: funnelUnknown ? t("auth.funnelUnknown") : undefined,
					}),
					Row({ t, label: t("auth.user"), ok: access.basicAuthConfigured, detail: t("auth.notConfigured"), okText: access.basicAuthUser || t("auth.configured") }),
					h(
						"div",
						{ className: "dsra-actions" },
						h("button", { className: "dsra-btn", disabled: busy, onClick: () => act("resetBasicAuth") }, t("auth.generate")),
					),
				),

				// ── Certificate install notice ─────────────────────────────
				h(
					Card,
					{ title: t("cert.title"), ok: notice.enabled === true },
					Row({ t, label: t("cert.check"), ok: cert.present && st.mdns, detail: t("cert.checkDetail"), okText: t("status.normal") }),
					ToggleRow({ t, label: t("cert.pageNotice"), on: notice.enabled === true, disabled: busy || !mdnsSupported, onChange: () => act("setCertNotice", { on: !(notice.enabled === true) }), hint: mdnsSupported ? t("cert.pageNoticeHint") : t("mdns.unsupported") }),
					h(
						"div",
						{ className: "dsra-actions" },
						h("button", { className: "dsra-btn", disabled: busy, onClick: () => setModal("ca") }, t("cert.installFlow")),
						h("a", { className: "dsra-link", href: "/ca.crt", target: "_blank", rel: "noreferrer" }, t("cert.download")),
					),
				),

				// ── Modals ─────────────────────────────────────────────────
				modal === "auth" && authSecret
					? h(
							Modal,
							{ t, title: t("auth.secretModalTitle"), onClose: () => { setModal(null); setAuthSecret(null); } },
							h("div", { className: "dsra-step" }, t("auth.secretIntro")),
							Row({ t, label: t("auth.secretUsername"), ok: true, okText: authSecret.username }),
							Row({ t, label: t("auth.secretPassword"), ok: true, okText: authSecret.password }),
							h(CmdRow, { t, cmd: authSecret.password }),
						)
					: null,
				apiModalMode
					? h(ApiPolicyModal, {
							t,
							mode: apiModalMode,
							policy: apiAccess[apiModalMode],
							methods: apiMethods,
							busy,
							onClose: () => setModal(null),
							onSave: (allow, events, allApis, trustedRemoteSettings) => saveApiPolicy(apiModalMode, allow, events, allApis, trustedRemoteSettings),
						})
					: null,
				modal === "caddy"
					? h(
							Modal,
							{ t, title: t("lan.modal.title"), onClose: () => setModal(null) },
							h("div", { className: "dsra-step" }, t("lan.modal.step1")),
							h(CmdRow, { t, cmd: st.platform === "win32" ? "winget install caddy" : st.platform === "darwin" ? "brew install caddy" : "sudo apt install -y caddy" }),
							h("div", { className: "dsra-step" }, t("lan.modal.step2")),
							h("div", { className: "dsra-step" }, t("lan.modal.after")),
						)
					: null,
				modal === "ts"
					? h(
							Modal,
							{ t, title: t("ts.modal.title"), onClose: () => setModal(null) },
							h("div", { className: "dsra-step" }, t("ts.modal.step1")),
							h(CmdRow, { t, cmd: st.platform === "win32" ? "winget install tailscale" : st.platform === "darwin" ? "brew install --cask tailscale" : "curl -fsSL https://tailscale.com/install.sh | sh" }),
							h("div", { className: "dsra-step" }, t(st.platform === "win32" ? "ts.modal.step2.win" : "ts.modal.step2")),
							h(CmdRow, { t, cmd: st.platform === "win32" ? "tailscale up" : "sudo tailscale up --operator=$USER" }),
							h("div", { className: "dsra-step" }, t("ts.modal.step3")),
							h(CmdRow, { t, cmd: "tailscale serve --bg --https=443 " + (st.tailscalePort || 3082) }),
							h("div", { className: "dsra-step" }, t("ts.modal.step4")),
							h(CmdRow, { t, cmd: "tailscale funnel " + (st.tailscalePort || 3082) }),
							h("div", { className: "dsra-step" }, t("ts.modal.after")),
						)
					: null,
				modal === "ca"
					? h(
							Modal,
							{ t, title: t("ca.modal.title"), onClose: () => setModal(null) },
							h("div", { className: "dsra-step" }, t("ca.modal.step1")),
							h(CmdRow, { t, cmd: "https://" + (st.lanIp || "") + ":" + st.port + "/ca.crt" }),
							h("div", { className: "dsra-step" }, t("ca.modal.step2")),
							h("div", { className: "dsra-step" }, t("ca.modal.windows")),
							h("div", { className: "dsra-step" }, t("ca.modal.macos")),
							h("div", { className: "dsra-step" }, t("ca.modal.ios")),
							h("div", { className: "dsra-step" }, t("ca.modal.android")),
							h("div", { className: "dsra-step" }, t("ca.modal.linux")),
							h("div", { className: "dsra-step" }, t("ca.modal.after")),
						)
					: null,
			);
		}

		// ── cordis client entry ─────────────────────────────────────────────
		const inject = ["slots", "locale", "connection", "settingsScope"];

		function apply(ctx) {
			enableTrustedRemoteSettings(ctx);
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-remote-access: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () =>
				ctx.slots.register(
					{
						name: "settings.section",
						id: "lan",
						order: 100,
						label: () => t("section.title"),
						locale: NS,
						children: { "settings.lan.item": { kind: "list", scope: "root" } },
					},
					RemoteAccessSection,
				),
			);
		}

		exports.name = "dsh-remote-access";
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
