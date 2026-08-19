window.__ModuleLoader__.load({
	id: "dsh-lan-manager",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let _slots = require("@deepseek-ai/dsh-client-ui-slots");
		let react = require("react");

		const h = react.createElement;

		// ── i18n dictionaries ──────────────────────────────────────────────
		const NS = "dsh-lan-manager";
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
			"error.status": "无法读取 /lan.status.json",
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
			"lan.certMissing": "缺失，点「一键配置」",
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
			"auth.funnelHintOn": "公网已开启，Basic Auth 已强制启用",
			"auth.funnelHintReady": "公网开启后将强制 Basic Auth",
			"auth.funnelHintMissing": "开启 Funnel 前请先生成访问凭据",
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
			"action.authMissing": "开启 Funnel 前请先生成访问凭据",
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
			"error.status": "Unable to read /lan.status.json",
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
			"lan.certMissing": "Missing — use one-click setup",
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
			"auth.funnelHintOn": "Public Funnel is on; Basic Auth is enforced",
			"auth.funnelHintReady": "Basic Auth will be enforced when Funnel is public",
			"auth.funnelHintMissing": "Generate credentials before enabling Funnel",
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
			"action.authMissing": "Generate Basic Auth credentials before enabling Funnel",
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
			".dslm-wrap{display:flex;flex-direction:column;gap:12px}",
			".dslm-card{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:8px}",
			".dslm-head{display:flex;align-items:center;gap:8px}",
			".dslm-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary,#222);flex:1}",
			".dslm-dot{width:8px;height:8px;border-radius:50%;flex:none}",
			".dslm-dot.ok{background:#22c55e}.dslm-dot.bad{background:#ef4444}.dslm-dot.na{background:#9ca3af}",
			".dslm-row{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222);min-height:20px}",
			".dslm-detail{color:var(--dsw-alias-label-secondary,#666);font-size:12px;word-break:break-all;flex:1;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dslm-actions{display:flex;flex-wrap:wrap;gap:8px}",
			".dslm-btn{cursor:pointer;border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.04));color:var(--dsw-alias-label-primary,#222);border-radius:8px;padding:5px 12px;font-size:13px;font-family:inherit}",
			".dslm-btn:hover{filter:brightness(.96)}",
			".dslm-btn.primary{background:var(--dsw-specific-accent,#3b82f6);border-color:transparent;color:#fff}",
			".dslm-btn:disabled{opacity:.55;cursor:not-allowed}",
			".dslm-msg{font-size:12px;color:var(--dsw-alias-label-secondary,#666);min-height:16px}",
			".dslm-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:rgba(128,128,128,.1);border-radius:6px;padding:2px 6px;word-break:break-all;max-width:70%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
			".dslm-copy{font-size:11px;cursor:pointer;border:none;background:none;color:var(--dsw-specific-accent,#3b82f6);text-decoration:underline;padding:0;flex:none}",
			".dslm-link{font-size:12px;color:var(--dsw-specific-accent,#3b82f6);text-decoration:none}",
			".dslm-mask{position:fixed;inset:0;background:var(--dsw-alias-bg-mask-1,rgba(0,0,0,.45));backdrop-filter:var(--dsw-mask-blur,blur(2px));z-index:2000;display:flex;align-items:center;justify-content:center;padding:20px}",
			".dslm-panel{background:var(--dsw-alias-bg-layer-2,#fff);border:1px solid var(--dsw-alias-border-weak,rgba(128,128,128,.22));border-radius:16px;box-shadow:var(--dsw-shadow-lv3,0 8px 30px rgba(0,0,0,.2));width:min(600px,100%);max-height:82vh;overflow:auto;padding:16px 18px;display:flex;flex-direction:column;gap:10px}",
			".dslm-panel h3{margin:0;font-size:15px;font-weight:600;color:var(--dsw-alias-label-primary,#222)}",
			".dslm-step{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222)}",
			".dslm-cmd{display:flex;align-items:center;gap:8px;background:rgba(128,128,128,.08);border-radius:8px;padding:6px 10px}",
			".dslm-cmd code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;flex:1;word-break:break-all;color:var(--dsw-alias-label-primary,#222)}",
			".dslm-switch{position:relative;width:36px;height:20px;border-radius:10px;border:none;cursor:pointer;background:rgba(128,128,128,.32);transition:background .15s;flex:none;padding:0}",
			".dslm-switch.on{background:var(--dsw-specific-accent,#3b82f6)}",
			".dslm-switch::after{content:\"\";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}",
			".dslm-switch.on::after{left:18px}",
			".dslm-switch:disabled{opacity:.5;cursor:not-allowed}",
			".dslm-togrow{display:flex;align-items:center;gap:8px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary,#222);min-height:24px}",
			".dslm-togrow .dslm-hint{flex:1;text-align:right;color:var(--dsw-alias-label-secondary,#666);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
		].join("\n");
		const tagId = "dsh-lan-manager/LanSection.css";
		if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${tagId}"]`) === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-lan-manager";
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
				const m = document.querySelector('meta[name="dsh-lan-token"]');
				return m ? m.content : "";
			} catch (e) {
				return "";
			}
		})();

		const Card = ({ title, ok, children }) =>
			h(
				"div",
				{ className: "dslm-card" },
				h(
					"div",
					{ className: "dslm-head" },
					h("span", { className: "dslm-dot " + (ok === null || ok === undefined ? "na" : ok ? "ok" : "bad") }),
					h("div", { className: "dslm-title" }, title),
				),
				children,
			);

		const Row = ({ t, label, ok, detail, okText }) =>
			h(
				"div",
				{ className: "dslm-row" },
				h("span", null, label),
				h(
					"span",
					{ className: "dslm-detail" },
					ok === null || ok === undefined ? t("status.checking") : ok ? okText || t("status.normal") : detail || t("status.abnormal"),
				),
			);

		/** Pill-shaped toggle switch. */
		const Switch = ({ t, on, disabled, onChange }) =>
			h("button", {
				className: "dslm-switch" + (on ? " on" : ""),
				disabled: disabled,
				onClick: onChange,
				role: "switch",
				"aria-checked": !!on,
				title: on ? t("status.on") : t("status.off"),
			});

		const ToggleRow = ({ t, label, on, disabled, onChange, hint }) =>
			h(
				"div",
				{ className: "dslm-togrow" },
				h("span", null, label),
				h("span", { className: "dslm-hint" }, hint || (on ? t("status.on") : t("status.off"))),
				h(Switch, { t, on, disabled, onChange }),
			);

		const UrlRow = ({ t, label, value }) =>
			h(
				"div",
				{ className: "dslm-row" },
				h("span", { className: "dslm-detail", style: { textAlign: "left", flex: "0 0 auto", maxWidth: "30%" } }, label),
				h("span", { className: "dslm-code" }, value || "—"),
				value ? h("button", { className: "dslm-copy", onClick: () => copy(value) }, t("copy")) : null,
			);

		const Actions = ({ busy, items }) =>
			h(
				"div",
				{ className: "dslm-actions" },
				items.map((it) =>
					h(
						"button",
						{
							key: it.label,
							className: "dslm-btn" + (it.primary ? " primary" : ""),
							disabled: busy,
							onClick: () => it.onClick(),
						},
						it.label,
					),
				),
			);

		const CmdRow = ({ t, cmd }) =>
			h(
				"div",
				{ className: "dslm-cmd" },
				h("code", null, cmd),
				h("button", { className: "dslm-copy", onClick: () => copy(cmd) }, t("copy")),
			);

		const Modal = ({ t, title, onClose, children }) =>
			h(
				"div",
				{ className: "dslm-mask", onClick: onClose },
				h(
					"div",
					{ className: "dslm-panel", onClick: (e) => e.stopPropagation() },
					h("div", { className: "dslm-head" }, h("div", { className: "dslm-title" }, title)),
					children,
					h(
						"div",
						{ className: "dslm-actions" },
						h("button", { className: "dslm-btn", onClick: onClose }, t("close")),
					),
				),
			);

		// ── section ─────────────────────────────────────────────────────────
		function LanSection({ t }) {
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
				fetch("/lan.status.json", { cache: "no-store", signal: controller.signal })
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
					if (payload && payload.code === "caddy.foreign") return t("lan.foreignCaddy");
					if (payload && payload.code === "tailscale.missing") return t("ts.missingAction");
					if (payload && payload.code === "funnel.foreign") return t("ts.funnelForeign");
					if (payload && payload.code === "serve.foreign") return t("ts.serveForeign");
					if (payload && payload.code === "auth.missing") return t("action.authMissing");
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
					default: return payload.message || t("action.done");
				}
			};

			const act = react.useCallback(
				(action, extra) => {
					setBusy(true);
					setMsg(t("action.running"));
					fetch("/lan.action", {
						method: "POST",
						headers: {
							"content-type": "application/json",
							...(actionToken ? { "x-lan-token": actionToken } : {}),
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

			if (!st) {
				// Render the page immediately — status arrives async and rows
				// show the checking state until then.
				return h(
					"div",
					{ className: "dslm-wrap" },
					h("div", { className: "dslm-msg" }, t("loading")),
					h(Card, { title: t("lan.title"), ok: null }, h(Row, { t, label: t("lan.proxy"), ok: null })),
					h(Card, { title: "Tailscale", ok: null }, h(Row, { t, label: t("ts.connected"), ok: null })),
					h(Card, { title: t("cert.title"), ok: null }, h(Row, { t, label: t("cert.pageNotice"), ok: null })),
				);
			}
			if (st.error) {
				return h(
					"div",
					{ className: "dslm-wrap" },
					h("div", { className: "dslm-msg" }, t("error.status")),
					h("div", { className: "dslm-actions" }, h("button", { className: "dslm-btn", onClick: refresh }, t("retry"))),
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
			const serveOn = Array.isArray(ts.serve) && ts.serve.length > 0;

			return h(
				"div",
				{ className: "dslm-wrap" },
				h(
					"div",
					{ className: "dslm-msg" },
					msg,
					h("button", { className: "dslm-copy", style: { marginLeft: 8 }, onClick: refresh }, t("refresh")),
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
								{ label: t("lan.regenCert"), onClick: () => act("regenCert") },
								{ label: t("lan.installFlow"), onClick: () => setModal("caddy") },
							],
						},
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
						on: ts.funnelOn === true,
						disabled: busy || ts.installed === false || (ts.funnelOn !== true && access.basicAuthConfigured !== true),
						onChange: () => act("tailscaleFunnel", { funnelOn: !(ts.funnelOn === true) }),
						hint: ts.funnelOn === true ? t("ts.funnelHint") : access.basicAuthConfigured ? t("ts.funnelHint") : t("auth.funnelHintMissing"),
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
						ok: ts.funnelOn !== true || access.basicAuthConfigured === true,
						detail: ts.funnelOn === true ? t("auth.funnelHintMissing") : access.basicAuthConfigured ? t("auth.funnelHintReady") : t("auth.funnelHintMissing"),
						okText: t("auth.funnelHintOn"),
					}),
					Row({ t, label: t("auth.user"), ok: access.basicAuthConfigured, detail: t("auth.notConfigured"), okText: access.basicAuthUser || t("auth.configured") }),
					h(
						"div",
						{ className: "dslm-actions" },
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => act("resetBasicAuth") }, t("auth.generate")),
					),
				),

				// ── Certificate install notice ─────────────────────────────
				h(
					Card,
					{ title: t("cert.title"), ok: notice.enabled === true },
					Row({ t, label: t("cert.check"), ok: cert.present && st.mdns, detail: t("cert.checkDetail"), okText: t("status.normal") }),
					ToggleRow({ t, label: t("cert.pageNotice"), on: notice.enabled === true, disabled: busy, onChange: () => act("setCertNotice", { on: !(notice.enabled === true) }), hint: t("cert.pageNoticeHint") }),
					h(
						"div",
						{ className: "dslm-actions" },
						h("button", { className: "dslm-btn", disabled: busy, onClick: () => setModal("ca") }, t("cert.installFlow")),
						h("a", { className: "dslm-link", href: "/ca.crt", target: "_blank", rel: "noreferrer" }, t("cert.download")),
					),
				),

				// ── Modals ─────────────────────────────────────────────────
				modal === "auth" && authSecret
					? h(
							Modal,
							{ t, title: t("auth.secretModalTitle"), onClose: () => { setModal(null); setAuthSecret(null); } },
							h("div", { className: "dslm-step" }, t("auth.secretIntro")),
							Row({ t, label: t("auth.secretUsername"), ok: true, okText: authSecret.username }),
							Row({ t, label: t("auth.secretPassword"), ok: true, okText: authSecret.password }),
							h(CmdRow, { t, cmd: authSecret.password }),
						)
					: null,
				modal === "caddy"
					? h(
							Modal,
							{ t, title: t("lan.modal.title"), onClose: () => setModal(null) },
							h("div", { className: "dslm-step" }, t("lan.modal.step1")),
							h(CmdRow, { t, cmd: "sudo apt install -y caddy" }),
							h("div", { className: "dslm-step" }, t("lan.modal.step2")),
							h("div", { className: "dslm-step" }, t("lan.modal.after")),
						)
					: null,
				modal === "ts"
					? h(
							Modal,
							{ t, title: t("ts.modal.title"), onClose: () => setModal(null) },
							h("div", { className: "dslm-step" }, t("ts.modal.step1")),
							h(CmdRow, { t, cmd: "curl -fsSL https://tailscale.com/install.sh | sh" }),
							h("div", { className: "dslm-step" }, t("ts.modal.step2")),
							h(CmdRow, { t, cmd: "sudo tailscale up --operator=$USER" }),
							h("div", { className: "dslm-step" }, t("ts.modal.step3")),
							h(CmdRow, { t, cmd: "tailscale serve --bg --https=443 " + (st.tailscalePort || 3082) }),
							h("div", { className: "dslm-step" }, t("ts.modal.step4")),
							h(CmdRow, { t, cmd: "tailscale funnel " + (st.tailscalePort || 3082) }),
							h("div", { className: "dslm-step" }, t("ts.modal.after")),
						)
					: null,
				modal === "ca"
					? h(
							Modal,
							{ t, title: t("ca.modal.title"), onClose: () => setModal(null) },
							h("div", { className: "dslm-step" }, t("ca.modal.step1")),
							h(CmdRow, { t, cmd: "https://" + (st.lanIp || "") + ":" + st.port + "/ca.crt" }),
							h("div", { className: "dslm-step" }, t("ca.modal.step2")),
							h("div", { className: "dslm-step" }, t("ca.modal.windows")),
							h("div", { className: "dslm-step" }, t("ca.modal.macos")),
							h("div", { className: "dslm-step" }, t("ca.modal.ios")),
							h("div", { className: "dslm-step" }, t("ca.modal.android")),
							h("div", { className: "dslm-step" }, t("ca.modal.linux")),
							h("div", { className: "dslm-step" }, t("ca.modal.after")),
						)
					: null,
			);
		}

		// ── cordis client entry ─────────────────────────────────────────────
		const inject = ["slots", "locale"];

		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-lan-manager: dictionaries");
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
					LanSection,
				),
			);
		}

		exports.name = "dsh-lan-manager";
		exports.inject = inject;
		exports.apply = apply;
		return module.exports;
	},
});
